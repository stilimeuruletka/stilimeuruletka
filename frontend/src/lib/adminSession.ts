type AdminSessionPayload = {
  admin_id: string;
  email: string;
  exp: number;
};

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i] ?? 0);
  return btoa(binary);
}

function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlEncode(input: Uint8Array) {
  const str = bytesToBase64(input);
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlEncodeJson(value: unknown) {
  const json = JSON.stringify(value);
  return base64UrlEncode(new TextEncoder().encode(json));
}

function base64UrlDecode(input: string) {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  return base64ToBytes(padded);
}

async function hmacSign(secret: string, data: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}

async function hmacVerify(secret: string, data: string, sig: Uint8Array) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const sigBuf = sig.buffer.slice(sig.byteOffset, sig.byteOffset + sig.byteLength) as ArrayBuffer;
  return crypto.subtle.verify("HMAC", key, sigBuf, new TextEncoder().encode(data));
}

export async function signAdminSession(payload: { admin_id: string; email: string }, maxAgeSeconds: number) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("ADMIN_SESSION_SECRET is not configured");

  const full: AdminSessionPayload = {
    admin_id: payload.admin_id,
    email: payload.email,
    exp: Math.floor(Date.now() / 1000) + maxAgeSeconds
  };

  const body = base64UrlEncodeJson(full);
  const sig = await hmacSign(secret, body);
  return `${body}.${base64UrlEncode(sig)}`;
}

export async function verifyAdminSession(token: string | null) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || !token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sigB64] = parts;
  if (!body || !sigB64) return null;

  const sig = base64UrlDecode(sigB64);
  const ok = await hmacVerify(secret, body, sig);
  if (!ok) return null;

  const decoded = new TextDecoder().decode(base64UrlDecode(body));
  const parsed = JSON.parse(decoded) as Partial<AdminSessionPayload> | null;
  if (!parsed || typeof parsed.admin_id !== "string" || typeof parsed.email !== "string" || typeof parsed.exp !== "number") return null;
  if (parsed.exp < Math.floor(Date.now() / 1000)) return null;

  return { admin_id: parsed.admin_id, email: parsed.email };
}
