import { describe, expect, it, vi } from "vitest";
import { getReferralCode, getTicketBalance, grantSubscriptionTicket, handleStart, spinWheel, writeAuditEvent } from "./db.js";

describe("db helpers", () => {
  it("calls RPC functions and parses results", async () => {
    const rpc = vi.fn(async (fn: string) => {
      if (fn === "handle_start") {
        return { data: { is_new_user: true, referral_processed: false, inviter_user_id: null }, error: null };
      }
      if (fn === "get_ticket_balance") {
        return { data: { balance: 3 }, error: null };
      }
      if (fn === "grant_subscription_ticket") {
        return { data: { balance: 4 }, error: null };
      }
      if (fn === "spin_wheel") {
        return {
          data: {
            spin_id: "00000000-0000-0000-0000-000000000000",
            prize_id: null,
            prize_title: "Ничего",
            prize_value: 0,
            win: false,
            balance_after: 2
          },
          error: null
        };
      }
      return { data: null, error: { message: "unknown fn" } };
    });

    const supabase = { rpc } as any;

    expect(await handleStart(supabase, { tg_user_id: 1 })).toEqual({
      is_new_user: true,
      referral_processed: false,
      inviter_user_id: null
    });
    expect(await getTicketBalance(supabase, 1)).toEqual({ balance: 3 });
    expect(await grantSubscriptionTicket(supabase, 1, "@c")).toEqual({ balance: 4 });
    expect(await spinWheel(supabase, 1)).toEqual({
      spin_id: "00000000-0000-0000-0000-000000000000",
      prize_id: null,
      prize_title: "Ничего",
      prize_value: 0,
      win: false,
      balance_after: 2
    });
  });

  it("writes audit event", async () => {
    const insert = vi.fn(async () => ({ error: null }));
    const from = vi.fn(() => ({ insert }));
    const supabase = { from } as any;

    await writeAuditEvent(supabase, { tg_user_id: 1, event_type: "x", payload: { a: 1 } });
    expect(from).toHaveBeenCalledWith("audit_events");
    expect(insert).toHaveBeenCalled();
  });

  it("reads referral code", async () => {
    const maybeSingle = vi.fn(async () => ({ data: { referral_code: "abc" }, error: null }));
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const supabase = { from } as any;

    await expect(getReferralCode(supabase, 1)).resolves.toBe("abc");
  });
});

