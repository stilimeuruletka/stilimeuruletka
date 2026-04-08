import { TelegramError } from "./telegramApi.js";

export type TelegramChatMemberStatus = string;

type LoggerLike = {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
};

export function isSubscribedStatus(status: TelegramChatMemberStatus): boolean {
  return status === "member" || status === "administrator" || status === "creator";
}

export async function checkChannelSubscription(args: {
  telegram: { getChatMember: (chatId: number | string, userId: number) => Promise<{ status: string }> };
  channelId: number | string;
  userId: number;
  log?: LoggerLike;
}): Promise<{ ok: boolean; status?: string }> {
  const { telegram, channelId, userId, log } = args;

  try {
    const member = await telegram.getChatMember(channelId, userId);
    const status = member?.status;
    const ok = isSubscribedStatus(status);
    log?.info({ channelId, userId, status, ok }, "telegram_subscription_check");
    return { ok, status };
  } catch (e) {
    if (e instanceof TelegramError) {
      log?.warn({ channelId, userId, code: e.code, message: e.message }, "telegram_subscription_check_failed");
      return { ok: false };
    }
    throw e;
  }
}
