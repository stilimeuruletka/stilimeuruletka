import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

const HandleStartResultSchema = z.object({
  is_new_user: z.boolean(),
  referral_processed: z.boolean(),
  inviter_user_id: z.number().int().positive().nullable()
});

const TicketBalanceSchema = z.object({
  balance: z.number().int().min(0)
});

const SpinResultSchema = z.object({
  spin_id: z.string().uuid(),
  prize_id: z.string().uuid().nullable(),
  prize_title: z.string().nullable(),
  prize_value: z.number().nullable(),
  win: z.boolean(),
  balance_after: z.number().int().min(0)
});

const FreeSpinStateSchema = z.object({
  balance: z.number().int().min(0),
  can_spin: z.boolean(),
  next_spin_at: z.string().nullable(),
  granted: z.boolean()
});

export type SpinResult = z.infer<typeof SpinResultSchema>;
export type FreeSpinState = z.infer<typeof FreeSpinStateSchema>;

async function rpc<T>(supabase: SupabaseClient, fn: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

export async function handleStart(
  supabase: SupabaseClient,
  input: { tg_user_id: number; username?: string; ref_code?: string | null }
) {
  const data = await rpc<unknown>(supabase, "handle_start", {
    p_tg_user_id: input.tg_user_id,
    p_username: input.username ?? null,
    p_ref_code: input.ref_code ?? null
  });
  return HandleStartResultSchema.parse(data);
}

export async function getTicketBalance(supabase: SupabaseClient, tgUserId: number) {
  const data = await rpc<unknown>(supabase, "get_ticket_balance", { p_tg_user_id: tgUserId });
  return TicketBalanceSchema.parse(data);
}

export async function grantSubscriptionTicket(supabase: SupabaseClient, tgUserId: number, channelId: string) {
  const data = await rpc<unknown>(supabase, "grant_subscription_ticket", { p_tg_user_id: tgUserId, p_channel_id: channelId });
  return TicketBalanceSchema.parse(data);
}

export async function spinWheel(supabase: SupabaseClient, tgUserId: number) {
  const data = await rpc<unknown>(supabase, "spin_wheel", { p_tg_user_id: tgUserId });
  return SpinResultSchema.parse(data);
}

export async function ensureFreeSpin(supabase: SupabaseClient, tgUserId: number) {
  const data = await rpc<unknown>(supabase, "ensure_free_spin", { p_tg_user_id: tgUserId });
  return FreeSpinStateSchema.parse(data);
}

export async function upsertUserProfile(
  supabase: SupabaseClient,
  tgUserId: number,
  input: { username?: string; photo_url?: string | null }
) {
  await rpc<unknown>(supabase, "upsert_user_profile", {
    p_tg_user_id: tgUserId,
    p_username: input.username ?? null,
    p_photo_url: input.photo_url ?? null
  });
}

export async function setUserTzOffset(supabase: SupabaseClient, tgUserId: number, tzOffsetMinutes: number) {
  await rpc<unknown>(supabase, "set_user_tz_offset", { p_tg_user_id: tgUserId, p_tz_offset_minutes: tzOffsetMinutes });
}

export async function setNextSpinAfterSpin(supabase: SupabaseClient, tgUserId: number, nextSpinAtIso: string) {
  const data = await rpc<unknown>(supabase, "set_next_spin_after_spin", {
    p_tg_user_id: tgUserId,
    p_next_spin_at: nextSpinAtIso
  });
  return z.object({ next_spin_at: z.string() }).parse(data);
}

export async function setNextSpinAfterSpinMidnight(supabase: SupabaseClient, tgUserId: number) {
  const data = await rpc<unknown>(supabase, "set_next_spin_after_spin_midnight", { p_tg_user_id: tgUserId });
  return z.object({ next_spin_at: z.string() }).parse(data);
}

export async function listDueSpinUsers(supabase: SupabaseClient, nowIso: string) {
  const data = await rpc<unknown>(supabase, "list_due_spin_users", { p_now: nowIso });
  return z.array(z.object({ tg_user_id: z.number().int().positive() })).parse(data).map((r) => r.tg_user_id);
}

export async function listReferrals(supabase: SupabaseClient, tgUserId: number) {
  const data = await rpc<unknown>(supabase, "list_referrals", { p_tg_user_id: tgUserId });
  return z
    .array(
      z.object({
        tg_user_id: z.number().int().positive(),
        username: z.string().nullable(),
        photo_url: z.string().nullable(),
        created_at: z.string()
      })
    )
    .parse(data);
}

export async function writeAuditEvent(
  supabase: SupabaseClient,
  event: { tg_user_id: number; event_type: string; payload?: Record<string, unknown> }
) {
  const { error } = await supabase.from("audit_events").insert({
    tg_user_id: event.tg_user_id,
    event_type: event.event_type,
    payload: event.payload ?? {}
  });
  if (error) throw new Error(`audit_events: ${error.message}`);
}

export async function getReferralCode(supabase: SupabaseClient, tgUserId: number) {
  const { data, error } = await supabase
    .from("users")
    .select("referral_code")
    .eq("tg_user_id", tgUserId)
    .maybeSingle();
  if (error) throw new Error(`users: ${error.message}`);
  if (!data?.referral_code) throw new Error("Referral code not found");
  return data.referral_code as string;
}
