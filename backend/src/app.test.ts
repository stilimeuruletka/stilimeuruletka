import crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "./app.js";
import { TelegramError } from "./telegram/telegramApi.js";

function createInitData(botToken: string, user: { id: number; first_name: string; username?: string }) {
  const authDate = Math.floor(Date.now() / 1000);
  const params = new URLSearchParams();
  params.set("auth_date", String(authDate));
  params.set("query_id", "AAHb3QAAAAAA");
  params.set("user", JSON.stringify(user));

  const pairs: string[] = [];
  for (const [k, v] of params.entries()) pairs.push(`${k}=${v}`);
  pairs.sort((a, b) => a.localeCompare(b));
  const dataCheckString = pairs.join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  params.set("hash", hash);
  return params.toString();
}

describe("buildApp", () => {
  it("serves /health", async () => {
    const env = {
      NODE_ENV: "test",
      PORT: 0,
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "x".repeat(40),
      TELEGRAM_BOT_TOKEN: "1234567890:abcdefghijklmnopqrstuvwxyz",
      TELEGRAM_WEBHOOK_SECRET: "secret-token",
      TELEGRAM_BOT_USERNAME: "my_bot",
      TELEGRAM_CHANNEL_ID: "@my_channel",
      PUBLIC_WEBAPP_URL: "https://example.com"
    } as const;

    const db = {
      handleStart: vi.fn(async () => ({ is_new_user: true, referral_processed: false, inviter_user_id: null })),
      getTicketBalance: vi.fn(async () => ({ balance: 2 })),
      grantSubscriptionTicket: vi.fn(async () => ({ balance: 3 })),
      spinWheel: vi.fn(async () => ({
        spin_id: "00000000-0000-0000-0000-000000000000",
        prize_id: null,
        prize_title: "Ничего",
        prize_value: 0,
        win: false,
        balance_after: 1
      })),
      writeAuditEvent: vi.fn(async () => {}),
      getReferralCode: vi.fn(async () => "refcode")
    };

    const telegram = {
      sendMessage: vi.fn(async () => ({})),
      answerCallbackQuery: vi.fn(async () => ({})),
      getChatMember: vi.fn(async () => ({ status: "member" }))
    };

    const app = buildApp(env, { db: db as any, telegram: telegram as any });
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    await app.close();
  });

  it("rejects /api/me without initData", async () => {
    const env = {
      NODE_ENV: "test",
      PORT: 0,
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "x".repeat(40),
      TELEGRAM_BOT_TOKEN: "1234567890:abcdefghijklmnopqrstuvwxyz",
      TELEGRAM_WEBHOOK_SECRET: "secret-token",
      TELEGRAM_BOT_USERNAME: "my_bot",
      TELEGRAM_CHANNEL_ID: "@my_channel",
      PUBLIC_WEBAPP_URL: "https://example.com"
    } as const;

    const app = buildApp(env, {
      db: {
        handleStart: vi.fn(async () => ({ is_new_user: true, referral_processed: false, inviter_user_id: null })),
        getTicketBalance: vi.fn(async () => ({ balance: 0 })),
        grantSubscriptionTicket: vi.fn(async () => ({ balance: 0 })),
        spinWheel: vi.fn(async () => ({
          spin_id: "00000000-0000-0000-0000-000000000000",
          prize_id: null,
          prize_title: "Ничего",
          prize_value: 0,
          win: false,
          balance_after: 0
        })),
        writeAuditEvent: vi.fn(async () => {}),
        getReferralCode: vi.fn(async () => "refcode")
      } as any
    });

    const res = await app.inject({ method: "GET", url: "/api/me" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("serves /api/me with valid initData", async () => {
    const env = {
      NODE_ENV: "test",
      PORT: 0,
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "x".repeat(40),
      TELEGRAM_BOT_TOKEN: "1234567890:abcdefghijklmnopqrstuvwxyz",
      TELEGRAM_WEBHOOK_SECRET: "secret-token",
      TELEGRAM_BOT_USERNAME: "my_bot",
      TELEGRAM_CHANNEL_ID: "@my_channel",
      PUBLIC_WEBAPP_URL: "https://example.com"
    } as const;

    const initData = createInitData(env.TELEGRAM_BOT_TOKEN, { id: 42, first_name: "A", username: "u" });

    const app = buildApp(env, {
      db: {
        handleStart: vi.fn(async () => ({ is_new_user: true, referral_processed: false, inviter_user_id: null })),
        getTicketBalance: vi.fn(async () => ({ balance: 7 })),
        grantSubscriptionTicket: vi.fn(async () => ({ balance: 0 })),
        spinWheel: vi.fn(async () => ({
          spin_id: "00000000-0000-0000-0000-000000000000",
          prize_id: null,
          prize_title: "Ничего",
          prize_value: 0,
          win: false,
          balance_after: 0
        })),
        writeAuditEvent: vi.fn(async () => {}),
        getReferralCode: vi.fn(async () => "refcode")
      } as any
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/me",
      headers: { "x-telegram-init-data": initData }
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ tg_user_id: 42, balance: 7 });
    await app.close();
  });

  it("serves /api/referral/link with valid initData", async () => {
    const env = {
      NODE_ENV: "test",
      PORT: 0,
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "x".repeat(40),
      TELEGRAM_BOT_TOKEN: "1234567890:abcdefghijklmnopqrstuvwxyz",
      TELEGRAM_WEBHOOK_SECRET: "secret-token",
      TELEGRAM_BOT_USERNAME: "@my_bot",
      TELEGRAM_CHANNEL_ID: "@my_channel",
      PUBLIC_WEBAPP_URL: "https://example.com"
    } as const;

    const initData = createInitData(env.TELEGRAM_BOT_TOKEN, { id: 42, first_name: "A" });

    const app = buildApp(env, {
      db: {
        handleStart: vi.fn(async () => ({ is_new_user: true, referral_processed: false, inviter_user_id: null })),
        getTicketBalance: vi.fn(async () => ({ balance: 0 })),
        grantSubscriptionTicket: vi.fn(async () => ({ balance: 0 })),
        spinWheel: vi.fn(async () => ({
          spin_id: "00000000-0000-0000-0000-000000000000",
          prize_id: null,
          prize_title: "Ничего",
          prize_value: 0,
          win: false,
          balance_after: 0
        })),
        writeAuditEvent: vi.fn(async () => {}),
        getReferralCode: vi.fn(async () => "abc123")
      } as any
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/referral/link",
      headers: { "x-telegram-init-data": initData }
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ link: "https://t.me/my_bot?start=ref_abc123" });
    await app.close();
  });

  it("rejects telegram webhook with invalid secret", async () => {
    const env = {
      NODE_ENV: "test",
      PORT: 0,
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "x".repeat(40),
      TELEGRAM_BOT_TOKEN: "1234567890:abcdefghijklmnopqrstuvwxyz",
      TELEGRAM_WEBHOOK_SECRET: "secret-token",
      TELEGRAM_BOT_USERNAME: "my_bot",
      TELEGRAM_CHANNEL_ID: "@my_channel",
      PUBLIC_WEBAPP_URL: "https://example.com"
    } as const;

    const app = buildApp(env, {
      db: {
        handleStart: vi.fn(async () => ({ is_new_user: true, referral_processed: false, inviter_user_id: null })),
        getTicketBalance: vi.fn(async () => ({ balance: 0 })),
        grantSubscriptionTicket: vi.fn(async () => ({ balance: 0 })),
        spinWheel: vi.fn(async () => ({
          spin_id: "00000000-0000-0000-0000-000000000000",
          prize_id: null,
          prize_title: "Ничего",
          prize_value: 0,
          win: false,
          balance_after: 0
        })),
        writeAuditEvent: vi.fn(async () => {}),
        getReferralCode: vi.fn(async () => "refcode")
      } as any,
      telegram: {
        sendMessage: vi.fn(async () => ({})),
        answerCallbackQuery: vi.fn(async () => ({})),
        getChatMember: vi.fn(async () => ({ status: "member" }))
      } as any
    });

    const res = await app.inject({
      method: "POST",
      url: "/telegram/webhook",
      headers: { "x-telegram-bot-api-secret-token": "bad" },
      payload: { update_id: 1 }
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("processes /start in telegram webhook", async () => {
    const env = {
      NODE_ENV: "test",
      PORT: 0,
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "x".repeat(40),
      TELEGRAM_BOT_TOKEN: "1234567890:abcdefghijklmnopqrstuvwxyz",
      TELEGRAM_WEBHOOK_SECRET: "secret-token",
      TELEGRAM_BOT_USERNAME: "my_bot",
      TELEGRAM_CHANNEL_ID: "@my_channel",
      PUBLIC_WEBAPP_URL: "https://example.com"
    } as const;

    const db = {
      handleStart: vi.fn(async () => ({ is_new_user: true, referral_processed: true, inviter_user_id: 11 })),
      getTicketBalance: vi.fn(async () => ({ balance: 0 })),
      grantSubscriptionTicket: vi.fn(async () => ({ balance: 1 })),
      spinWheel: vi.fn(async () => ({
        spin_id: "00000000-0000-0000-0000-000000000000",
        prize_id: null,
        prize_title: "Ничего",
        prize_value: 0,
        win: false,
        balance_after: 0
      })),
      writeAuditEvent: vi.fn(async () => {}),
      getReferralCode: vi.fn(async () => "refcode")
    };

    const telegram = {
      sendMessage: vi.fn(async () => ({})),
      answerCallbackQuery: vi.fn(async () => ({})),
      getChatMember: vi.fn(async () => ({ status: "member" }))
    };

    const app = buildApp(env, { db: db as any, telegram: telegram as any });
    const res = await app.inject({
      method: "POST",
      url: "/telegram/webhook",
      headers: { "x-telegram-bot-api-secret-token": env.TELEGRAM_WEBHOOK_SECRET },
      payload: {
        update_id: 1,
        message: { message_id: 1, chat: { id: 100 }, from: { id: 42, username: "u" }, text: "/start ref_x" }
      }
    });

    expect(res.statusCode).toBe(200);
    expect(db.handleStart).toHaveBeenCalled();
    expect(telegram.sendMessage).toHaveBeenCalled();
    await app.close();
  });

  it("processes callback spin in telegram webhook", async () => {
    const env = {
      NODE_ENV: "test",
      PORT: 0,
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "x".repeat(40),
      TELEGRAM_BOT_TOKEN: "1234567890:abcdefghijklmnopqrstuvwxyz",
      TELEGRAM_WEBHOOK_SECRET: "secret-token",
      TELEGRAM_BOT_USERNAME: "my_bot",
      TELEGRAM_CHANNEL_ID: "@my_channel",
      PUBLIC_WEBAPP_URL: "https://example.com"
    } as const;

    const db = {
      handleStart: vi.fn(async () => ({ is_new_user: false, referral_processed: false, inviter_user_id: null })),
      getTicketBalance: vi.fn(async () => ({ balance: 0 })),
      grantSubscriptionTicket: vi.fn(async () => ({ balance: 1 })),
      spinWheel: vi.fn(async () => ({
        spin_id: "00000000-0000-0000-0000-000000000000",
        prize_id: "00000000-0000-0000-0000-000000000000",
        prize_title: "Малый приз",
        prize_value: 10,
        win: true,
        balance_after: 0
      })),
      writeAuditEvent: vi.fn(async () => {}),
      getReferralCode: vi.fn(async () => "refcode")
    };

    const telegram = {
      sendMessage: vi.fn(async () => ({})),
      answerCallbackQuery: vi.fn(async () => ({})),
      getChatMember: vi.fn(async () => ({ status: "member" }))
    };

    const app = buildApp(env, { db: db as any, telegram: telegram as any });
    const res = await app.inject({
      method: "POST",
      url: "/telegram/webhook",
      headers: { "x-telegram-bot-api-secret-token": env.TELEGRAM_WEBHOOK_SECRET },
      payload: {
        update_id: 2,
        callback_query: {
          id: "cbq",
          from: { id: 42, username: "u" },
          message: { chat: { id: 100 } },
          data: "spin"
        }
      }
    });

    expect(res.statusCode).toBe(200);
    expect(db.spinWheel).toHaveBeenCalledWith(42);
    expect(telegram.sendMessage).toHaveBeenCalled();
    await app.close();
  });

  it("rejects /api/me with invalid initData signature", async () => {
    const env = {
      NODE_ENV: "test",
      PORT: 0,
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "x".repeat(40),
      TELEGRAM_BOT_TOKEN: "1234567890:abcdefghijklmnopqrstuvwxyz",
      TELEGRAM_WEBHOOK_SECRET: "secret-token",
      TELEGRAM_BOT_USERNAME: "my_bot",
      TELEGRAM_CHANNEL_ID: "@my_channel",
      PUBLIC_WEBAPP_URL: "https://example.com"
    } as const;

    const good = createInitData(env.TELEGRAM_BOT_TOKEN, { id: 42, first_name: "A" });
    const params = new URLSearchParams(good);
    params.set("hash", "00");
    const bad = params.toString();

    const app = buildApp(env, {
      db: {
        handleStart: vi.fn(async () => ({ is_new_user: true, referral_processed: false, inviter_user_id: null })),
        getTicketBalance: vi.fn(async () => ({ balance: 0 })),
        grantSubscriptionTicket: vi.fn(async () => ({ balance: 0 })),
        spinWheel: vi.fn(async () => ({
          spin_id: "00000000-0000-0000-0000-000000000000",
          prize_id: null,
          prize_title: "Ничего",
          prize_value: 0,
          win: false,
          balance_after: 0
        })),
        writeAuditEvent: vi.fn(async () => {}),
        getReferralCode: vi.fn(async () => "refcode")
      } as any
    });

    const res = await app.inject({ method: "GET", url: "/api/me", headers: { "x-telegram-init-data": bad } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("serves /api/spin and handles errors", async () => {
    const env = {
      NODE_ENV: "test",
      PORT: 0,
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "x".repeat(40),
      TELEGRAM_BOT_TOKEN: "1234567890:abcdefghijklmnopqrstuvwxyz",
      TELEGRAM_WEBHOOK_SECRET: "secret-token",
      TELEGRAM_BOT_USERNAME: "my_bot",
      TELEGRAM_CHANNEL_ID: "@my_channel",
      PUBLIC_WEBAPP_URL: "https://example.com"
    } as const;

    const initData = createInitData(env.TELEGRAM_BOT_TOKEN, { id: 42, first_name: "A" });

    const spinOk = {
      spin_id: "00000000-0000-0000-0000-000000000000",
      prize_id: null,
      prize_title: "Ничего",
      prize_value: 0,
      win: false,
      balance_after: 0
    };

    const app = buildApp(env, {
      db: {
        handleStart: vi.fn(async () => ({ is_new_user: true, referral_processed: false, inviter_user_id: null })),
        getTicketBalance: vi.fn(async () => ({ balance: 0 })),
        grantSubscriptionTicket: vi.fn(async () => ({ balance: 0 })),
        spinWheel: vi.fn(async () => spinOk),
        writeAuditEvent: vi.fn(async () => {}),
        getReferralCode: vi.fn(async () => "refcode")
      } as any
    });

    const ok = await app.inject({ method: "POST", url: "/api/spin", headers: { "x-telegram-init-data": initData } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual(spinOk);

    const app2 = buildApp(env, {
      db: {
        handleStart: vi.fn(async () => ({ is_new_user: true, referral_processed: false, inviter_user_id: null })),
        getTicketBalance: vi.fn(async () => ({ balance: 0 })),
        grantSubscriptionTicket: vi.fn(async () => ({ balance: 0 })),
        spinWheel: vi.fn(async () => {
          throw new Error("no tickets");
        }),
        writeAuditEvent: vi.fn(async () => {}),
        getReferralCode: vi.fn(async () => "refcode")
      } as any
    });

    const bad = await app2.inject({ method: "POST", url: "/api/spin", headers: { "x-telegram-init-data": initData } });
    expect(bad.statusCode).toBe(400);

    await app.close();
    await app2.close();
  });

  it("rejects telegram webhook with invalid body", async () => {
    const env = {
      NODE_ENV: "test",
      PORT: 0,
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "x".repeat(40),
      TELEGRAM_BOT_TOKEN: "1234567890:abcdefghijklmnopqrstuvwxyz",
      TELEGRAM_WEBHOOK_SECRET: "secret-token",
      TELEGRAM_BOT_USERNAME: "my_bot",
      TELEGRAM_CHANNEL_ID: "@my_channel",
      PUBLIC_WEBAPP_URL: "https://example.com"
    } as const;

    const app = buildApp(env, {
      db: {
        handleStart: vi.fn(async () => ({ is_new_user: true, referral_processed: false, inviter_user_id: null })),
        getTicketBalance: vi.fn(async () => ({ balance: 0 })),
        grantSubscriptionTicket: vi.fn(async () => ({ balance: 0 })),
        spinWheel: vi.fn(async () => ({
          spin_id: "00000000-0000-0000-0000-000000000000",
          prize_id: null,
          prize_title: "Ничего",
          prize_value: 0,
          win: false,
          balance_after: 0
        })),
        writeAuditEvent: vi.fn(async () => {}),
        getReferralCode: vi.fn(async () => "refcode")
      } as any,
      telegram: {
        sendMessage: vi.fn(async () => ({})),
        answerCallbackQuery: vi.fn(async () => ({})),
        getChatMember: vi.fn(async () => ({ status: "member" }))
      } as any
    });

    const res = await app.inject({
      method: "POST",
      url: "/telegram/webhook",
      headers: { "x-telegram-bot-api-secret-token": env.TELEGRAM_WEBHOOK_SECRET },
      payload: { foo: "bar" }
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("handles /check_sub subscribed and not subscribed", async () => {
    const env = {
      NODE_ENV: "test",
      PORT: 0,
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "x".repeat(40),
      TELEGRAM_BOT_TOKEN: "1234567890:abcdefghijklmnopqrstuvwxyz",
      TELEGRAM_WEBHOOK_SECRET: "secret-token",
      TELEGRAM_BOT_USERNAME: "my_bot",
      TELEGRAM_CHANNEL_ID: "@my_channel",
      PUBLIC_WEBAPP_URL: "https://example.com"
    } as const;

    const baseDb = {
      handleStart: vi.fn(async () => ({ is_new_user: false, referral_processed: false, inviter_user_id: null })),
      getTicketBalance: vi.fn(async () => ({ balance: 0 })),
      grantSubscriptionTicket: vi.fn(async () => ({ balance: 1 })),
      spinWheel: vi.fn(async () => ({
        spin_id: "00000000-0000-0000-0000-000000000000",
        prize_id: null,
        prize_title: "Ничего",
        prize_value: 0,
        win: false,
        balance_after: 0
      })),
      writeAuditEvent: vi.fn(async () => {}),
      getReferralCode: vi.fn(async () => "refcode")
    };

    const telegram1 = {
      sendMessage: vi.fn(async () => ({})),
      answerCallbackQuery: vi.fn(async () => ({})),
      getChatMember: vi.fn(async () => ({ status: "left" }))
    };

    const app1 = buildApp(env, { db: baseDb as any, telegram: telegram1 as any });
    const res1 = await app1.inject({
      method: "POST",
      url: "/telegram/webhook",
      headers: { "x-telegram-bot-api-secret-token": env.TELEGRAM_WEBHOOK_SECRET },
      payload: {
        update_id: 10,
        message: { message_id: 1, chat: { id: 100 }, from: { id: 42 }, text: "/check_sub" }
      }
    });
    expect(res1.statusCode).toBe(200);
    expect(baseDb.grantSubscriptionTicket).not.toHaveBeenCalled();

    const telegram2 = {
      sendMessage: vi.fn(async () => ({})),
      answerCallbackQuery: vi.fn(async () => ({})),
      getChatMember: vi.fn(async () => ({ status: "member" }))
    };
    const app2 = buildApp(env, { db: baseDb as any, telegram: telegram2 as any });
    const res2 = await app2.inject({
      method: "POST",
      url: "/telegram/webhook",
      headers: { "x-telegram-bot-api-secret-token": env.TELEGRAM_WEBHOOK_SECRET },
      payload: {
        update_id: 11,
        message: { message_id: 1, chat: { id: 100 }, from: { id: 42 }, text: "/check_sub" }
      }
    });
    expect(res2.statusCode).toBe(200);
    expect(baseDb.grantSubscriptionTicket).not.toHaveBeenCalled();

    await app1.close();
    await app2.close();
  });

  it("processes /balance and /spin commands in telegram webhook", async () => {
    const env = {
      NODE_ENV: "test",
      PORT: 0,
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "x".repeat(40),
      TELEGRAM_BOT_TOKEN: "1234567890:abcdefghijklmnopqrstuvwxyz",
      TELEGRAM_WEBHOOK_SECRET: "secret-token",
      TELEGRAM_BOT_USERNAME: "my_bot",
      TELEGRAM_CHANNEL_ID: "@my_channel",
      PUBLIC_WEBAPP_URL: "https://example.com"
    } as const;

    const db = {
      handleStart: vi.fn(async () => ({ is_new_user: false, referral_processed: false, inviter_user_id: null })),
      getTicketBalance: vi.fn(async () => ({ balance: 9 })),
      grantSubscriptionTicket: vi.fn(async () => ({ balance: 0 })),
      spinWheel: vi.fn(async () => ({
        spin_id: "00000000-0000-0000-0000-000000000000",
        prize_id: null,
        prize_title: "Ничего",
        prize_value: 0,
        win: false,
        balance_after: 8
      })),
      writeAuditEvent: vi.fn(async () => {}),
      getReferralCode: vi.fn(async () => "refcode")
    };

    const telegram = {
      sendMessage: vi.fn(async () => ({})),
      answerCallbackQuery: vi.fn(async () => ({})),
      getChatMember: vi.fn(async () => ({ status: "member" }))
    };

    const app = buildApp(env, { db: db as any, telegram: telegram as any });
    const balanceRes = await app.inject({
      method: "POST",
      url: "/telegram/webhook",
      headers: { "x-telegram-bot-api-secret-token": env.TELEGRAM_WEBHOOK_SECRET },
      payload: { update_id: 20, message: { message_id: 1, chat: { id: 100 }, from: { id: 42 }, text: "/balance" } }
    });
    expect(balanceRes.statusCode).toBe(200);
    expect(db.getTicketBalance).toHaveBeenCalledWith(42);

    const spinRes = await app.inject({
      method: "POST",
      url: "/telegram/webhook",
      headers: { "x-telegram-bot-api-secret-token": env.TELEGRAM_WEBHOOK_SECRET },
      payload: { update_id: 21, message: { message_id: 1, chat: { id: 100 }, from: { id: 42 }, text: "/spin" } }
    });
    expect(spinRes.statusCode).toBe(200);
    expect(db.spinWheel).toHaveBeenCalledWith(42);
    expect(telegram.sendMessage).toHaveBeenCalled();

    await app.close();
  });

  it("processes callback balance and check_sub without message", async () => {
    const env = {
      NODE_ENV: "test",
      PORT: 0,
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "x".repeat(40),
      TELEGRAM_BOT_TOKEN: "1234567890:abcdefghijklmnopqrstuvwxyz",
      TELEGRAM_WEBHOOK_SECRET: "secret-token",
      TELEGRAM_BOT_USERNAME: "my_bot",
      TELEGRAM_CHANNEL_ID: "@my_channel",
      PUBLIC_WEBAPP_URL: "https://example.com"
    } as const;

    const db = {
      handleStart: vi.fn(async () => ({ is_new_user: false, referral_processed: false, inviter_user_id: null })),
      getTicketBalance: vi.fn(async () => ({ balance: 1 })),
      grantSubscriptionTicket: vi.fn(async () => ({ balance: 2 })),
      spinWheel: vi.fn(async () => ({
        spin_id: "00000000-0000-0000-0000-000000000000",
        prize_id: null,
        prize_title: "Ничего",
        prize_value: 0,
        win: false,
        balance_after: 0
      })),
      writeAuditEvent: vi.fn(async () => {}),
      getReferralCode: vi.fn(async () => "refcode")
    };

    const telegram = {
      sendMessage: vi.fn(async () => ({})),
      answerCallbackQuery: vi.fn(async () => ({})),
      getChatMember: vi.fn(async () => ({ status: "member" }))
    };

    const app = buildApp(env, { db: db as any, telegram: telegram as any });
    const balance = await app.inject({
      method: "POST",
      url: "/telegram/webhook",
      headers: { "x-telegram-bot-api-secret-token": env.TELEGRAM_WEBHOOK_SECRET },
      payload: { update_id: 30, callback_query: { id: "c1", from: { id: 42 }, data: "balance" } }
    });
    expect(balance.statusCode).toBe(200);
    expect(db.getTicketBalance).toHaveBeenCalledWith(42);

    const check = await app.inject({
      method: "POST",
      url: "/telegram/webhook",
      headers: { "x-telegram-bot-api-secret-token": env.TELEGRAM_WEBHOOK_SECRET },
      payload: { update_id: 31, callback_query: { id: "c2", from: { id: 42 }, data: "check_sub" } }
    });
    expect(check.statusCode).toBe(200);
    expect(db.grantSubscriptionTicket).not.toHaveBeenCalled();

    await app.close();
  });

  it("treats Telegram API errors during subscription check as not subscribed", async () => {
    const env = {
      NODE_ENV: "test",
      PORT: 0,
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "x".repeat(40),
      TELEGRAM_BOT_TOKEN: "1234567890:abcdefghijklmnopqrstuvwxyz",
      TELEGRAM_WEBHOOK_SECRET: "secret-token",
      TELEGRAM_BOT_USERNAME: "my_bot",
      TELEGRAM_CHANNEL_ID: "@my_channel",
      PUBLIC_WEBAPP_URL: "https://example.com"
    } as const;

    const db = {
      handleStart: vi.fn(async () => ({ is_new_user: false, referral_processed: false, inviter_user_id: null })),
      getTicketBalance: vi.fn(async () => ({ balance: 0 })),
      grantSubscriptionTicket: vi.fn(async () => ({ balance: 1 })),
      spinWheel: vi.fn(async () => ({
        spin_id: "00000000-0000-0000-0000-000000000000",
        prize_id: null,
        prize_title: "Ничего",
        prize_value: 0,
        win: false,
        balance_after: 0
      })),
      writeAuditEvent: vi.fn(async () => {}),
      getReferralCode: vi.fn(async () => "refcode")
    };

    const telegram = {
      sendMessage: vi.fn(async () => ({})),
      answerCallbackQuery: vi.fn(async () => ({})),
      getChatMember: vi.fn(async () => {
        throw new TelegramError("forbidden", 403);
      })
    };

    const app = buildApp(env, { db: db as any, telegram: telegram as any });
    const res = await app.inject({
      method: "POST",
      url: "/telegram/webhook",
      headers: { "x-telegram-bot-api-secret-token": env.TELEGRAM_WEBHOOK_SECRET },
      payload: { update_id: 40, callback_query: { id: "c3", from: { id: 42 }, data: "check_sub" } }
    });
    expect(res.statusCode).toBe(200);
    expect(db.grantSubscriptionTicket).not.toHaveBeenCalled();
    await app.close();
  });

  it("covers default DB adapter when injecting supabase client", async () => {
    const env = {
      NODE_ENV: "test",
      PORT: 0,
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "x".repeat(40),
      TELEGRAM_BOT_TOKEN: "1234567890:abcdefghijklmnopqrstuvwxyz",
      TELEGRAM_WEBHOOK_SECRET: "secret-token",
      TELEGRAM_BOT_USERNAME: "my_bot",
      TELEGRAM_CHANNEL_ID: "@my_channel",
      PUBLIC_WEBAPP_URL: "https://example.com"
    } as const;

    const rpc = vi.fn(async (fn: string) => {
      if (fn === "handle_start") {
        return { data: { is_new_user: true, referral_processed: false, inviter_user_id: null }, error: null };
      }
      if (fn === "get_ticket_balance") {
        return { data: { balance: 5 }, error: null };
      }
      if (fn === "spin_wheel") {
        return {
          data: {
            spin_id: "00000000-0000-0000-0000-000000000000",
            prize_id: null,
            prize_title: "Ничего",
            prize_value: 0,
            win: false,
            balance_after: 4
          },
          error: null
        };
      }
      if (fn === "grant_subscription_ticket") {
        return { data: { balance: 6 }, error: null };
      }
      return { data: null, error: { message: "unknown fn" } };
    });

    const auditInsert = vi.fn(async () => ({ error: null }));
    const maybeSingle = vi.fn(async () => ({ data: { referral_code: "abc123" }, error: null }));
    const supabase = {
      rpc,
      from: (table: string) => {
        if (table === "audit_events") return { insert: auditInsert };
        if (table === "users") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle
              })
            })
          };
        }
        return { insert: auditInsert };
      }
    } as any;

    const telegram = {
      sendMessage: vi.fn(async () => ({})),
      answerCallbackQuery: vi.fn(async () => ({})),
      getChatMember: vi.fn(async () => ({ status: "member" }))
    };

    const app = buildApp(env, { supabase, telegram: telegram as any });

    const initData = createInitData(env.TELEGRAM_BOT_TOKEN, { id: 42, first_name: "A" });
    const me = await app.inject({ method: "GET", url: "/api/me", headers: { "x-telegram-init-data": initData } });
    expect(me.statusCode).toBe(200);

    const ref = await app.inject({
      method: "GET",
      url: "/api/referral/link",
      headers: { "x-telegram-init-data": initData }
    });
    expect(ref.statusCode).toBe(200);

    const start = await app.inject({
      method: "POST",
      url: "/telegram/webhook",
      headers: { "x-telegram-bot-api-secret-token": env.TELEGRAM_WEBHOOK_SECRET },
      payload: { update_id: 50, message: { message_id: 1, chat: { id: 100 }, from: { id: 42 }, text: "/start" } }
    });
    expect(start.statusCode).toBe(200);
    expect(auditInsert).toHaveBeenCalled();
    await app.close();
  });
});
