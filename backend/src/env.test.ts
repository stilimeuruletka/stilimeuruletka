import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

describe("loadEnv", () => {
  it("parses required environment variables", () => {
    const prev = process.env;
    process.env = {
      ...prev,
      NODE_ENV: "test",
      PORT: "3001",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "x".repeat(40),
      TELEGRAM_BOT_TOKEN: "1234567890:abcdefghijklmnopqrstuvwxyz",
      TELEGRAM_WEBHOOK_SECRET: "secret-token",
      TELEGRAM_BOT_USERNAME: "my_bot",
      TELEGRAM_CHANNEL_ID: "@my_channel",
      PUBLIC_WEBAPP_URL: "https://example.com"
    };

    const env = loadEnv();
    expect(env.PORT).toBe(3001);
    expect(env.NODE_ENV).toBe("test");
  });

  it("fails fast on missing variables", () => {
    const prev = process.env;
    process.env = { ...prev };
    delete process.env.SUPABASE_URL;

    expect(() => loadEnv()).toThrow();
  });
});
