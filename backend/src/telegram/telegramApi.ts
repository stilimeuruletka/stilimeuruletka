import { z } from "zod";

const TelegramApiResponseSchema = z.object({
  ok: z.boolean(),
  result: z.unknown().optional(),
  description: z.string().optional(),
  error_code: z.number().optional()
});

export type TelegramApiError = {
  code?: number;
  description?: string;
};

export class TelegramError extends Error {
  public readonly code?: number;
  constructor(message: string, code?: number) {
    super(message);
    if (code !== undefined) this.code = code;
  }
}

export function createTelegramApi(botToken: string) {
  const baseUrl = `https://api.telegram.org/bot${botToken}`;

  async function call<T>(method: string, body: unknown): Promise<T> {
    const res = await fetch(`${baseUrl}/${method}`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const json = await res.json().catch(() => null);
    const parsed = TelegramApiResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new TelegramError(`Telegram API invalid response for ${method}`);
    }
    if (!parsed.data.ok) {
      throw new TelegramError(
        parsed.data.description || `Telegram API error for ${method}`,
        parsed.data.error_code
      );
    }
    return parsed.data.result as T;
  }

  return {
    sendMessage: (chatId: number | string, text: string, extra?: Record<string, unknown>) =>
      call("sendMessage", { chat_id: chatId, text, ...extra }),
    answerCallbackQuery: (callbackQueryId: string, extra?: Record<string, unknown>) =>
      call("answerCallbackQuery", { callback_query_id: callbackQueryId, ...extra }),
    getChatMember: (chatId: number | string, userId: number) =>
      call("getChatMember", { chat_id: chatId, user_id: userId })
  };
}
