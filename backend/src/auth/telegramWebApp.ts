import crypto from "node:crypto";
import { z } from "zod";

const TelegramUserSchema = z.object({
  id: z.number().int().positive(),
  username: z.string().min(1).optional(),
  photo_url: z.string().optional(),
  first_name: z.string().min(1),
  last_name: z.string().min(1).optional()
});

export type TelegramWebAppAuth = {
  user: z.infer<typeof TelegramUserSchema>;
  authDate: number;
};

export class TelegramWebAppAuthError extends Error {}

function timingSafeEqualHex(aHex: string, bHex: string): boolean {
  const a = Buffer.from(aHex, "hex");
  const b = Buffer.from(bHex, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function verifyTelegramWebAppInitData(initData: string, botToken: string): TelegramWebAppAuth {
  const params = new URLSearchParams(initData);
  const providedHash = params.get("hash");
  if (!providedHash) throw new TelegramWebAppAuthError("Missing hash");

  const pairs: string[] = [];
  for (const [key, value] of params.entries()) {
    if (key === "hash") continue;
    pairs.push(`${key}=${value}`);
  }
  pairs.sort((a, b) => a.localeCompare(b));
  const dataCheckString = pairs.join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const computed = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (!timingSafeEqualHex(computed, providedHash)) {
    throw new TelegramWebAppAuthError("Invalid initData signature");
  }

  const authDate = Number(params.get("auth_date") || "0");
  if (!Number.isFinite(authDate) || authDate <= 0) {
    throw new TelegramWebAppAuthError("Invalid auth_date");
  }
  const now = Math.floor(Date.now() / 1000);
  if (now - authDate > 60 * 60 * 24) {
    throw new TelegramWebAppAuthError("initData expired");
  }

  const userJson = params.get("user");
  if (!userJson) throw new TelegramWebAppAuthError("Missing user");
  const userParsed = TelegramUserSchema.safeParse(JSON.parse(userJson));
  if (!userParsed.success) {
    throw new TelegramWebAppAuthError("Invalid user payload");
  }

  return { user: userParsed.data, authDate };
}
