import crypto from "crypto";

type TelegramInitDataUser = {
  id?: number;
  username?: string;
};

export type TelegramInitData = {
  userId: number;
  username: string | null;
  startParam: string | null;
};

function parseTelegramInitDataQuery(initData: string) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) {
    return null;
  }

  const pairs: Array<[string, string]> = [];
  for (const [key, value] of params.entries()) {
    if (key === "hash") continue;
    pairs.push([key, value]);
  }

  pairs.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const dataCheckString = pairs.map(([k, v]) => `${k}=${v}`).join("\n");

  return { params, hash, dataCheckString };
}

function safeEqualHex(a: string, b: string) {
  try {
    const aa = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (aa.length !== bb.length) return false;
    return crypto.timingSafeEqual(aa, bb);
  } catch {
    return false;
  }
}

export function verifyTelegramInitData(initData: string, botToken: string) {
  const parsed = parseTelegramInitDataQuery(initData);
  if (!parsed) return false;

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const expectedHash = crypto.createHmac("sha256", secretKey).update(parsed.dataCheckString).digest("hex");
  return safeEqualHex(expectedHash, parsed.hash);
}

export function extractTelegramInitData(initData: string): TelegramInitData | null {
  const params = new URLSearchParams(initData);
  const userRaw = params.get("user");
  if (!userRaw) return null;

  let user: TelegramInitDataUser;
  try {
    user = JSON.parse(userRaw) as TelegramInitDataUser;
  } catch {
    return null;
  }

  const userId = user?.id;
  if (typeof userId !== "number" || !Number.isFinite(userId)) return null;

  return {
    userId,
    username: typeof user.username === "string" && user.username.length > 0 ? user.username : null,
    startParam: (() => {
      const raw = params.get("start_param");
      return typeof raw === "string" && raw.length > 0 ? raw : null;
    })()
  };
}

