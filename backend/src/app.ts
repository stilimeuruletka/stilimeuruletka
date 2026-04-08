import Fastify from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { LRUCache } from "lru-cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Env } from "./env.js";
import { createSupabase } from "./supabase.js";
import { createTelegramApi, TelegramError } from "./telegram/telegramApi.js";
import { checkChannelSubscription } from "./telegram/subscription.js";
import { verifyTelegramWebAppInitData, TelegramWebAppAuthError } from "./auth/telegramWebApp.js";
import { getReferralCode, getTicketBalance, grantSubscriptionTicket, handleStart, spinWheel, writeAuditEvent } from "./db.js";

const TelegramWebhookSchema = z.object({
  update_id: z.number(),
  message: z
    .object({
      message_id: z.number(),
      chat: z.object({ id: z.number() }),
      from: z.object({ id: z.number(), username: z.string().optional() }),
      text: z.string().optional()
    })
    .optional(),
  callback_query: z
    .object({
      id: z.string(),
      from: z.object({ id: z.number(), username: z.string().optional() }),
      message: z.object({ chat: z.object({ id: z.number() }) }).optional(),
      data: z.string().optional()
    })
    .optional()
});

type TelegramApi = ReturnType<typeof createTelegramApi>;

type DbApi = {
  handleStart: (input: { tg_user_id: number; username?: string; ref_code?: string | null }) => Promise<{
    is_new_user: boolean;
    referral_processed: boolean;
    inviter_user_id: number | null;
  }>;
  getTicketBalance: (tgUserId: number) => Promise<{ balance: number }>;
  grantSubscriptionTicket: (tgUserId: number, channelId: string) => Promise<{ balance: number }>;
  spinWheel: (tgUserId: number) => Promise<{
    spin_id: string;
    prize_id: string | null;
    prize_title: string | null;
    prize_value: number | null;
    win: boolean;
    balance_after: number;
  }>;
  writeAuditEvent: (event: { tg_user_id: number; event_type: string; payload?: Record<string, unknown> }) => Promise<void>;
  getReferralCode: (tgUserId: number) => Promise<string>;
};

export function buildApp(
  env: Env,
  overrides?: { supabase?: SupabaseClient; telegram?: TelegramApi; db?: DbApi }
) {
  const supabase = overrides?.supabase ?? createSupabase(env);
  const telegram = overrides?.telegram ?? createTelegramApi(env.TELEGRAM_BOT_TOKEN);
  const db: DbApi =
    overrides?.db ??
    ({
      handleStart: (input) => handleStart(supabase, input),
      getTicketBalance: (tgUserId) => getTicketBalance(supabase, tgUserId),
      grantSubscriptionTicket: (tgUserId, channelId) => grantSubscriptionTicket(supabase, tgUserId, channelId),
      spinWheel: (tgUserId) => spinWheel(supabase, tgUserId),
      writeAuditEvent: (event) => writeAuditEvent(supabase, event),
      getReferralCode: (tgUserId) => getReferralCode(supabase, tgUserId)
    } satisfies DbApi);

  const membershipCache = new LRUCache<string, boolean>({
    max: 50_000,
    ttl: 60_000
  });

  const subscriptionClickCache = new LRUCache<number, number>({
    max: 50_000,
    ttl: 60_000
  });

  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "production" ? "info" : "debug",
      redact: {
        paths: ["req.headers.authorization", "req.headers.cookie", "req.headers['x-telegram-init-data']"],
        remove: true
      }
    },
    trustProxy: true
  });

  app.register(helmet, { global: true });
  app.register(cors, {
    origin: [env.PUBLIC_WEBAPP_URL],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["content-type", "x-telegram-init-data"]
  });
  app.register(sensible);
  app.register(rateLimit, { global: true, max: 120, timeWindow: "1 minute" });
  app.register(swagger, {
    openapi: {
      info: {
        title: "Telegram Lottery Backend",
        version: "1.0.0"
      }
    }
  });
  app.register(swaggerUi, { routePrefix: "/docs" });

  app.get("/health", async () => ({ ok: true }));

  app.post("/telegram/webhook", async (req: FastifyRequest, reply: FastifyReply) => {
    const providedSecret = req.headers["x-telegram-bot-api-secret-token"];
    if (providedSecret !== env.TELEGRAM_WEBHOOK_SECRET) {
      req.log.warn({ providedSecret: typeof providedSecret }, "telegram_webhook_invalid_secret");
      return reply.code(401).send({ ok: false });
    }

    const parsed = TelegramWebhookSchema.safeParse(req.body);
    if (!parsed.success) {
      req.log.warn({ issues: parsed.error.issues }, "telegram_webhook_invalid_body");
      return reply.code(400).send({ ok: false });
    }

    const update = parsed.data;

    const buildWebAppUrl = (path?: string) => {
      if (!path) return env.PUBLIC_WEBAPP_URL;
      return new URL(path, env.PUBLIC_WEBAPP_URL.endsWith("/") ? env.PUBLIC_WEBAPP_URL : `${env.PUBLIC_WEBAPP_URL}/`).toString();
    };

    const welcomeText =
      "Приветствую, стилевые! Готовы позволить себе щепотку элегантной эстетики?\n\nПроверьте подписку на наше сообщество, мы начинаем! 💔";

    const sendWelcome = async (chatId: number | string) => {
      await telegram.sendMessage(chatId, welcomeText, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "СТИЛЬНАЯ РУЛЕТКА | СООБЩЕСТВО", url: "https://t.me/stilimeuruletka" }],
            [{ text: "Проверить подписку", callback_data: "check_sub" }]
          ]
        }
      });
    };

    const sendSubscribedMenu = async (chatId: number | string) => {
      await telegram.sendMessage(chatId, "Подписка подтверждена. Выберите действие:", {
        reply_markup: {
          inline_keyboard: [
            [{ text: "РАЗДАТЬ СТИЛЯ | ЗАПУСТИТЬ ПРИЛОЖЕНИЕ TG", web_app: { url: buildWebAppUrl() } }],
            [{ text: "Стильная поддержка", url: "https://t.me/stilimeuruletkasos" }],
            [{ text: "Канал сообщества", url: "https://t.me/stilimeuruletka" }],
            [{ text: "Как играть", web_app: { url: buildWebAppUrl("main/how-to-play") } }]
          ]
        }
      });
    };

    const handleStartCommand = async (chatId: number, userId: number, username?: string, payload?: string) => {
      const refCode = payload?.startsWith("ref_") ? payload.slice(4) : null;
      const result = await db
        .handleStart({
        tg_user_id: userId,
        ...(username ? { username } : {}),
        ref_code: refCode
        })
        .catch((e) => {
          req.log.error({ err: e }, "handle_start_failed");
          throw e;
        });

      await db
        .writeAuditEvent({
        tg_user_id: userId,
        event_type: "bot_start",
        payload: { ref_code: refCode, is_new_user: result.is_new_user, referral_processed: result.referral_processed }
        })
        .catch((e) => req.log.warn({ err: e }, "audit_write_failed"));

      await sendWelcome(chatId);
    };

    const checkSubscription = async (userId: number) => {
      const cacheKey = `${env.TELEGRAM_CHANNEL_ID}:${userId}`;
      const cached = membershipCache.get(cacheKey);
      if (cached !== undefined) return cached;

      try {
        const { ok } = await checkChannelSubscription({
          telegram: telegram as unknown as { getChatMember: (chatId: number | string, userId: number) => Promise<{ status: string }> },
          channelId: env.TELEGRAM_CHANNEL_ID,
          userId,
          log: req.log
        });
        membershipCache.set(cacheKey, ok);
        return ok;
      } catch (e) {
        if (e instanceof TelegramError) {
          req.log.warn({ code: e.code, message: e.message }, "telegram_getChatMember_failed");
          return false;
        }
        throw e;
      }
    };

    const onCallback = async (data: string, chatId: number, userId: number) => {
      if (data === "balance") {
        const balance = await db.getTicketBalance(userId);
        await db
          .writeAuditEvent({ tg_user_id: userId, event_type: "balance_view", payload: { balance: balance.balance } })
          .catch((e) => req.log.warn({ err: e }, "audit_write_failed"));
        await telegram.sendMessage(chatId, `Текущий баланс: ${balance.balance} билет(ов).`);
        return;
      }

      if (data === "check_sub") {
        const lastClick = subscriptionClickCache.get(userId);
        const now = Date.now();
        if (lastClick !== undefined && now - lastClick < 2000) {
          req.log.info({ userId }, "subscription_check_rate_limited");
          await telegram.sendMessage(chatId, "Подождите 2 секунды и попробуйте ещё раз.");
          return;
        }
        subscriptionClickCache.set(userId, now);

        const isSubscribed = await checkSubscription(userId);
        await db
          .writeAuditEvent({ tg_user_id: userId, event_type: "subscription_check", payload: { ok: isSubscribed } })
          .catch((e) => req.log.warn({ err: e }, "audit_write_failed"));
        if (!isSubscribed) {
          await telegram.sendMessage(
            chatId,
            "Face control не пройден…💔\n\nПроверьте подписку на наше сообщество и попробуйте нажать на кнопку ещё раз.",
            {
              reply_markup: {
                inline_keyboard: [
                  [{ text: "СТИЛЬНАЯ РУЛЕТКА | СООБЩЕСТВО", url: "https://t.me/stilimeuruletka" }],
                  [{ text: "Проверить подписку", callback_data: "check_sub" }]
                ]
              }
            }
          );
          return;
        }
        await sendSubscribedMenu(chatId);
        return;
      }

      if (data === "spin") {
        const result = await db.spinWheel(userId).catch((e) => {
          req.log.warn({ err: e }, "spin_failed");
          return null;
        });
        if (!result) {
          await telegram.sendMessage(chatId, "Недостаточно билетов или произошла ошибка. Попробуйте позже.");
          return;
        }
        await db
          .writeAuditEvent({
          tg_user_id: userId,
          event_type: "spin",
          payload: {
            spin_id: result.spin_id,
            win: result.win,
            prize_id: result.prize_id,
            prize_title: result.prize_title,
            prize_value: result.prize_value,
            balance_after: result.balance_after
          }
        })
          .catch((e) => req.log.warn({ err: e }, "audit_write_failed"));
        const text = result.win
          ? `Вы выиграли: ${result.prize_title} (${result.prize_value}).\nБаланс: ${result.balance_after} билет(ов).`
          : `Не повезло в этот раз.\nБаланс: ${result.balance_after} билет(ов).`;
        await telegram.sendMessage(chatId, text);
        return;
      }
    };

    if (update.message?.text) {
      const chatId = update.message.chat.id;
      const userId = update.message.from.id;
      const username = update.message.from.username;

      if (update.message.text.startsWith("/start")) {
        const payload = update.message.text.split(" ")[1];
        await handleStartCommand(chatId, userId, username, payload);
      }
      if (update.message.text === "/balance") {
        const balance = await db.getTicketBalance(userId);
        await db
          .writeAuditEvent({ tg_user_id: userId, event_type: "balance_view", payload: { balance: balance.balance } })
          .catch((e) => req.log.warn({ err: e }, "audit_write_failed"));
        await telegram.sendMessage(chatId, `Текущий баланс: ${balance.balance} билет(ов).`);
      }
      if (update.message.text === "/spin") {
        const result = await db.spinWheel(userId).catch((e) => {
          req.log.warn({ err: e }, "spin_failed");
          return null;
        });
        if (!result) {
          await telegram.sendMessage(chatId, "Недостаточно билетов или произошла ошибка. Попробуйте позже.");
        }
        if (!result) return;
        await db
          .writeAuditEvent({
          tg_user_id: userId,
          event_type: "spin",
          payload: {
            spin_id: result.spin_id,
            win: result.win,
            prize_id: result.prize_id,
            prize_title: result.prize_title,
            prize_value: result.prize_value,
            balance_after: result.balance_after
          }
        })
          .catch((e) => req.log.warn({ err: e }, "audit_write_failed"));
        const text = result.win
          ? `Вы выиграли: ${result.prize_title} (${result.prize_value}).\nБаланс: ${result.balance_after} билет(ов).`
          : `Не повезло в этот раз.\nБаланс: ${result.balance_after} билет(ов).`;
        await telegram.sendMessage(chatId, text);
      }
      if (update.message.text === "/check_sub") {
        const lastClick = subscriptionClickCache.get(userId);
        const now = Date.now();
        if (lastClick !== undefined && now - lastClick < 2000) {
          req.log.info({ userId }, "subscription_check_rate_limited");
          await telegram.sendMessage(chatId, "Подождите 2 секунды и попробуйте ещё раз.");
          return;
        }
        subscriptionClickCache.set(userId, now);

        const isSubscribed = await checkSubscription(userId);
        await db
          .writeAuditEvent({ tg_user_id: userId, event_type: "subscription_check", payload: { ok: isSubscribed } })
          .catch((e) => req.log.warn({ err: e }, "audit_write_failed"));
        if (!isSubscribed) {
          await telegram.sendMessage(
            chatId,
            "Face control не пройден…💔\n\nПроверьте подписку на наше сообщество и попробуйте нажать на кнопку ещё раз.",
            {
              reply_markup: {
                inline_keyboard: [
                  [{ text: "СТИЛЬНАЯ РУЛЕТКА | СООБЩЕСТВО", url: "https://t.me/stilimeuruletka" }],
                  [{ text: "Проверить подписку", callback_data: "check_sub" }]
                ]
              }
            }
          );
        } else {
          await sendSubscribedMenu(chatId);
        }
      }
    }

    if (update.callback_query?.data) {
      const chatId = update.callback_query.message?.chat.id ?? update.callback_query.from.id;
      const userId = update.callback_query.from.id;

      await telegram.answerCallbackQuery(update.callback_query.id);
      await onCallback(update.callback_query.data, chatId, userId);
    }

    return reply.send({ ok: true });
  });

  app.addHook("onRequest", async (req: FastifyRequest) => {
    if (req.url.startsWith("/api/")) {
      const initData = req.headers["x-telegram-init-data"];
      if (typeof initData !== "string" || initData.length < 10) {
        throw app.httpErrors.unauthorized("Missing Telegram initData");
      }
      try {
        const auth = verifyTelegramWebAppInitData(initData, env.TELEGRAM_BOT_TOKEN);
        (req as unknown as { auth: { tgUserId: number; username?: string } }).auth = {
          tgUserId: auth.user.id,
          ...(auth.user.username ? { username: auth.user.username } : {})
        };
      } catch (e) {
        if (e instanceof TelegramWebAppAuthError) {
          throw app.httpErrors.unauthorized("Invalid Telegram initData");
        }
        throw e;
      }
    }
  });

  app.get("/api/me", async (req: FastifyRequest) => {
    const auth = (req as unknown as { auth: { tgUserId: number } }).auth;
    const balance = await db.getTicketBalance(auth.tgUserId);
    return { tg_user_id: auth.tgUserId, balance: balance.balance };
  });

  app.post("/api/spin", async (req: FastifyRequest) => {
    const auth = (req as unknown as { auth: { tgUserId: number } }).auth;
    try {
      return await db.spinWheel(auth.tgUserId);
    } catch (e) {
      req.log.warn({ err: e }, "api_spin_failed");
      throw app.httpErrors.badRequest("Spin failed");
    }
  });

  app.get("/api/referral/link", async (req: FastifyRequest) => {
    const auth = (req as unknown as { auth: { tgUserId: number } }).auth;
    const botUsername = env.TELEGRAM_BOT_USERNAME.replace("@", "");
    const refCode = await db.getReferralCode(auth.tgUserId);
    const link = `https://t.me/${botUsername}?start=ref_${refCode}`;
    return { link };
  });

  return app;
}
