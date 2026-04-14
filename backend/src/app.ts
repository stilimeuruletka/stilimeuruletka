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
import {
  ensureFreeSpin,
  getReferralCode,
  getSpinHistory,
  getTicketBalance,
  grantSubscriptionTicket,
  handleStart,
  listDueSpinUsers,
  listReferrals,
  setNextSpinAfterSpin,
  setNextSpinAfterSpinMidnight,
  setUserTzOffset,
  upsertUserProfile,
  spinWheel,
  spinWheelLimited,
  trackBloggerClick,
  writeAuditEvent
} from "./db.js";

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

function getTzOffsetMinutesFromQuery(req: FastifyRequest) {
  const query = req.query as unknown;
  if (!query || typeof query !== "object") return null;
  const tz = (query as Record<string, unknown>).tz_offset;
  if (typeof tz !== "string") return null;
  const n = Number(tz);
  return Number.isFinite(n) ? n : null;
}

type DbApi = {
  handleStart: (input: { tg_user_id: number; username?: string; ref_code?: string | null }) => Promise<{
    is_new_user: boolean;
    referral_processed: boolean;
    inviter_user_id: number | null;
  }>;
  trackBloggerClick: (input: { tg_user_id: number; blogger_code: string; meta?: Record<string, unknown> }) => Promise<void>;
  getTicketBalance: (tgUserId: number) => Promise<{ balance: number }>;
  grantSubscriptionTicket: (tgUserId: number, channelId: string) => Promise<{ balance: number }>;
  spinWheel: (tgUserId: number) => Promise<{
    spin_id: string;
    prize_id: string | null;
    prize_title: string | null;
    prize_value: number | null;
    win: boolean;
    balance_after: number;
    wins_this_month?: number | undefined;
    max_wins_per_month?: number | null | undefined;
    segments_count?: number | undefined;
    sector_index?: number | undefined;
  }>;
  spinWheelLimited: (input: {
    tgUserId: number;
    maxWinsPerMonth: number | null;
    testMode: boolean;
    segmentsCount: number;
  }) => Promise<{
    spin_id: string;
    prize_id: string | null;
    prize_title: string | null;
    prize_value: number | null;
    win: boolean;
    balance_after: number;
    wins_this_month?: number | undefined;
    max_wins_per_month?: number | null | undefined;
    segments_count?: number | undefined;
    sector_index?: number | undefined;
  }>;
  ensureFreeSpin: (tgUserId: number) => Promise<{ balance: number; can_spin: boolean; next_spin_at: string | null; granted: boolean }>;
  setUserTzOffset: (tgUserId: number, tzOffsetMinutes: number) => Promise<void>;
  upsertUserProfile: (tgUserId: number, input: { username?: string; photo_url?: string | null }) => Promise<void>;
  setNextSpinAfterSpin: (tgUserId: number, nextSpinAtIso: string) => Promise<{ next_spin_at: string }>;
  setNextSpinAfterSpinMidnight: (tgUserId: number) => Promise<{ next_spin_at: string }>;
  listDueSpinUsers: (nowIso: string) => Promise<number[]>;
  listReferrals: (tgUserId: number) => Promise<Array<{ tg_user_id: number; username: string | null; photo_url: string | null; created_at: string }>>;
  getSpinHistory: (input: { tgUserId: number; limit?: number; offset?: number }) => Promise<
    Array<{ spin_id: string; created_at: string; win: boolean; prize_title: string | null; prize_value: number | null }>
  >;
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
      trackBloggerClick: (input) => trackBloggerClick(supabase, input),
      getTicketBalance: (tgUserId) => getTicketBalance(supabase, tgUserId),
      grantSubscriptionTicket: (tgUserId, channelId) => grantSubscriptionTicket(supabase, tgUserId, channelId),
      spinWheel: (tgUserId) => spinWheel(supabase, tgUserId),
      spinWheelLimited: (input) => spinWheelLimited(supabase, input),
      ensureFreeSpin: (tgUserId) => ensureFreeSpin(supabase, tgUserId),
      setUserTzOffset: (tgUserId, tzOffsetMinutes) => setUserTzOffset(supabase, tgUserId, tzOffsetMinutes),
      upsertUserProfile: (tgUserId, input) => upsertUserProfile(supabase, tgUserId, input),
      setNextSpinAfterSpin: (tgUserId, nextSpinAtIso) => setNextSpinAfterSpin(supabase, tgUserId, nextSpinAtIso),
      setNextSpinAfterSpinMidnight: (tgUserId) => setNextSpinAfterSpinMidnight(supabase, tgUserId),
      listDueSpinUsers: (nowIso) => listDueSpinUsers(supabase, nowIso),
      listReferrals: (tgUserId) => listReferrals(supabase, tgUserId),
      getSpinHistory: (input) => getSpinHistory(supabase, input),
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
    const buildTmeAppUrl = (startapp?: string) => {
      if (!env.TELEGRAM_BOT_USERNAME || !env.TELEGRAM_APP_SLUG) return null;
      const bot = env.TELEGRAM_BOT_USERNAME.replace(/^@/, "");
      const u = new URL(`https://t.me/${bot}/${env.TELEGRAM_APP_SLUG}`);
      if (startapp) u.searchParams.set("startapp", startapp);
      u.searchParams.set("mode", "fullscreen");
      return u.toString();
    };

    const welcomeText =
      "Приветствую, стилевые! Готовы позволить себе щепотку элегантной эстетики?\n\nПроверьте подписку на наше сообщество, мы начинаем! 💔";

    const sendWelcome = async (chatId: number | string) => {
      const base = env.PUBLIC_WEBAPP_URL.replace(/\/+$/, "");
      await telegram.sendMediaGroup(chatId, [
        { type: "photo", media: `${base}/IMG_3162.JPEG`, caption: welcomeText },
        { type: "photo", media: `${base}/IMG_3178.JPEG` }
      ]);
      await telegram.sendMessage(chatId, "⠀", {
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
            (() => {
              const tme = buildTmeAppUrl();
              return [{ text: "ЗАПУСТИТЬ ПРИЛОЖЕНИЕ (FULLSCREEN)", ...(tme ? { url: tme } : { web_app: { url: buildWebAppUrl() } }) }];
            })(),
            [{ text: "Стильная поддержка", url: "https://t.me/stilimeuruletkasos" }],
            [{ text: "Канал сообщества", url: "https://t.me/stilimeuruletka" }],
            (() => {
              const tme = buildTmeAppUrl();
              return [{ text: "Как играть", ...(tme ? { url: tme } : { web_app: { url: buildWebAppUrl("main/how-to-play") } }) }];
            })()
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
        (req as unknown as { auth: { tgUserId: number; username?: string; photoUrl?: string; startParam?: string } }).auth = {
          tgUserId: auth.user.id,
          ...(auth.user.username ? { username: auth.user.username } : {}),
          ...(auth.user.photo_url ? { photoUrl: auth.user.photo_url } : {}),
          ...(auth.startParam ? { startParam: auth.startParam } : {})
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
    const auth = (req as unknown as { auth: { tgUserId: number; username?: string; photoUrl?: string; startParam?: string } }).auth;
    const tzOffsetMinutes = getTzOffsetMinutesFromQuery(req);
    if (tzOffsetMinutes !== null) {
      await db.setUserTzOffset(auth.tgUserId, tzOffsetMinutes);
    }
    const startRes = await db.handleStart({
      tg_user_id: auth.tgUserId,
      ...(auth.username ? { username: auth.username } : {}),
      ref_code: auth.startParam?.startsWith("ref_") ? auth.startParam.slice(4) : null
    });
    if (auth.startParam?.startsWith("blog_")) {
      await db.trackBloggerClick({
        tg_user_id: auth.tgUserId,
        blogger_code: auth.startParam.slice(5),
        meta: { via: "start_param" }
      });
    }
    await db.upsertUserProfile(auth.tgUserId, {
      ...(auth.username ? { username: auth.username } : {}),
      ...(auth.photoUrl ? { photo_url: auth.photoUrl } : {})
    });
    const state = await db.ensureFreeSpin(auth.tgUserId);
    if (!startRes.is_new_user && state.granted) {
      try {
        await telegram.sendMessage(
          auth.tgUserId,
          "It’s time to spin & win!\n\nЕжедневный бесплатный спин снова доступен! Ловите +1 на баланс! Переходите в Стильную Рулетку , чтобы испытать удачу.",
          {
            reply_markup: {
              inline_keyboard: [[{ text: "РАЗДАТЬ СТИЛЯ | ЗАПУСТИТЬ ПРИЛОЖЕНИЕ TG", web_app: { url: env.PUBLIC_WEBAPP_URL } }]]
            }
          }
        );
      } catch (e) {
        req.log.warn({ err: e }, "daily_spin_notify_failed");
      }
    }
    return {
      tg_user_id: auth.tgUserId,
      balance: state.balance,
      can_spin: state.can_spin,
      next_spin_at: state.next_spin_at
    };
  });

  app.post("/api/spin", async (req: FastifyRequest) => {
    const auth = (req as unknown as { auth: { tgUserId: number; username?: string; photoUrl?: string; startParam?: string } }).auth;
    try {
      const tzOffsetMinutes = getTzOffsetMinutesFromQuery(req);
      if (tzOffsetMinutes !== null) {
        await db.setUserTzOffset(auth.tgUserId, tzOffsetMinutes);
      }
      await db.handleStart({
        tg_user_id: auth.tgUserId,
        ...(auth.username ? { username: auth.username } : {}),
        ref_code: auth.startParam?.startsWith("ref_") ? auth.startParam.slice(4) : null
      });
      if (auth.startParam?.startsWith("blog_")) {
        await db.trackBloggerClick({
          tg_user_id: auth.tgUserId,
          blogger_code: auth.startParam.slice(5),
          meta: { via: "start_param" }
        });
      }
      await db.upsertUserProfile(auth.tgUserId, {
        ...(auth.username ? { username: auth.username } : {}),
        ...(auth.photoUrl ? { photo_url: auth.photoUrl } : {})
      });

      const state = await db.ensureFreeSpin(auth.tgUserId);
      if (!state.can_spin) {
        throw app.httpErrors.badRequest("Spin not available yet");
      }

      const limited = (db as unknown as { spinWheelLimited?: unknown }).spinWheelLimited;
      const result =
        typeof limited === "function"
          ? await (limited as (input: {
              tgUserId: number;
              maxWinsPerMonth: number | null;
              testMode: boolean;
              segmentsCount: number;
            }) => Promise<unknown>)({
              tgUserId: auth.tgUserId,
              maxWinsPerMonth: typeof env.SPIN_MAX_WINS_PER_MONTH === "number" ? env.SPIN_MAX_WINS_PER_MONTH : 3,
              testMode: env.SPIN_TEST_MODE === undefined ? true : env.SPIN_TEST_MODE !== 0,
              segmentsCount: typeof env.SPIN_SEGMENTS_COUNT === "number" ? env.SPIN_SEGMENTS_COUNT : 10
            })
          : await db.spinWheel(auth.tgUserId);
      const prizeTitleRaw = (result as Record<string, unknown>).prize_title;
      const isBonusSpin = typeof prizeTitleRaw === "string" && /спин/i.test(prizeTitleRaw);
      const next = isBonusSpin ? { next_spin_at: null } : await db.setNextSpinAfterSpinMidnight(auth.tgUserId);

      return { ...(result as Record<string, unknown>), next_spin_at: next.next_spin_at };
    } catch (e) {
      req.log.warn({ err: e }, "api_spin_failed");
      if (typeof e === "object" && e && "statusCode" in e) {
        throw e;
      }
      throw app.httpErrors.badRequest("Spin failed");
    }
  });

  const PrizeClaimBodySchema = z.object({
    spin_id: z.string().uuid().optional(),
    prize_title: z.string().nullable().optional(),
    prize_value: z.number().nullable().optional()
  });

  app.post("/api/prize/claim", async (req: FastifyRequest) => {
    const auth = (req as unknown as { auth: { tgUserId: number; username?: string } }).auth;
    const parsed = PrizeClaimBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw app.httpErrors.badRequest("Invalid payload");
    }

    const payload = parsed.data;
    await db
      .writeAuditEvent({
        tg_user_id: auth.tgUserId,
        event_type: "prize_claim",
        payload: {
          spin_id: payload.spin_id ?? null,
          prize_title: payload.prize_title ?? null,
          prize_value: payload.prize_value ?? null
        }
      })
      .catch((e) => req.log.warn({ err: e }, "audit_write_failed"));

    const text = [
      "ЗАЯВКА НА ПРИЗ",
      `tg_user_id: ${auth.tgUserId}`,
      auth.username ? `username: @${auth.username}` : null,
      payload.spin_id ? `spin_id: ${payload.spin_id}` : null,
      payload.prize_title ? `prize: ${payload.prize_title}` : "prize: (не указано)",
      payload.prize_value !== undefined && payload.prize_value !== null ? `value: ${payload.prize_value}` : null,
      `at: ${new Date().toISOString()}`
    ]
      .filter((x): x is string => typeof x === "string" && x.length > 0)
      .join("\n");

    await telegram.sendMessage("@stilimeuruletkasos", text).catch((e) => req.log.warn({ err: e }, "support_notify_failed"));
    return { ok: true };
  });

  app.get("/api/spins/history", async (req: FastifyRequest) => {
    const auth = (req as unknown as { auth: { tgUserId: number } }).auth;
    const query = req.query as unknown;
    const limitRaw = query && typeof query === "object" ? (query as Record<string, unknown>).limit : undefined;
    const offsetRaw = query && typeof query === "object" ? (query as Record<string, unknown>).offset : undefined;
    const limit = typeof limitRaw === "string" ? Number(limitRaw) : typeof limitRaw === "number" ? limitRaw : 50;
    const offset = typeof offsetRaw === "string" ? Number(offsetRaw) : typeof offsetRaw === "number" ? offsetRaw : 0;

    const history = await db.getSpinHistory({
      tgUserId: auth.tgUserId,
      limit: Number.isFinite(limit) ? Math.min(200, Math.max(0, Math.floor(limit))) : 50,
      offset: Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0
    });
    return { items: history };
  });

  app.post("/api/test/spin-reminder", async (req: FastifyRequest) => {
    const auth = (req as unknown as { auth: { tgUserId: number } }).auth;
    await telegram.sendMessage(
      auth.tgUserId,
      "It’s time to spin & win!\n\nЕжедневный бесплатный спин снова доступен! Ловите +1 на баланс! Переходите в Стильную Рулетку , чтобы испытать удачу.",
      {
        reply_markup: {
          inline_keyboard: [[{ text: "РАЗДАТЬ СТИЛЯ | ЗАПУСТИТЬ ПРИЛОЖЕНИЕ TG", web_app: { url: env.PUBLIC_WEBAPP_URL } }]]
        }
      }
    );
    return { ok: true };
  });

  app.get("/api/referrals", async (req: FastifyRequest) => {
    const auth = (req as unknown as { auth: { tgUserId: number } }).auth;
    const referrals = await db.listReferrals(auth.tgUserId);
    return {
      count: referrals.length,
      friends: referrals
    };
  });

  const handleSpinReminderCron = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!env.CRON_SECRET) {
      throw app.httpErrors.internalServerError("Cron secret is not configured");
    }
    const headerSecret = req.headers["x-cron-secret"];
    const query = req.query as unknown;
    const querySecret =
      query && typeof query === "object" ? (query as Record<string, unknown>).secret : undefined;
    const secret =
      typeof headerSecret === "string" ? headerSecret : typeof querySecret === "string" ? querySecret : null;
    if (!secret || secret !== env.CRON_SECRET) {
      throw app.httpErrors.unauthorized("Unauthorized");
    }

    const nowIso = new Date().toISOString();
    const users = await db.listDueSpinUsers(nowIso);
    let notified = 0;

    for (const tgUserId of users) {
      try {
        const state = await db.ensureFreeSpin(tgUserId);
        if (!state.granted) continue;
        notified += 1;
        await telegram.sendMessage(
          tgUserId,
          "It’s time to spin & win!\n\nЕжедневный бесплатный спин снова доступен! Ловите +1 на баланс! Переходите в Стильную Рулетку , чтобы испытать удачу.",
          {
            reply_markup: {
              inline_keyboard: [[{ text: "РАЗДАТЬ СТИЛЯ | ЗАПУСТИТЬ ПРИЛОЖЕНИЕ TG", web_app: { url: env.PUBLIC_WEBAPP_URL } }]]
            }
          }
        );
      } catch (e) {
        req.log.warn({ err: e, tgUserId }, "cron_spin_notify_failed");
      }
    }

    return reply.send({ ok: true, processed: users.length, notified });
  };

  app.post("/cron/spin-reminder", handleSpinReminderCron);
  app.get("/cron/spin-reminder", handleSpinReminderCron);

  app.get("/api/referral/link", async (req: FastifyRequest) => {
    const auth = (req as unknown as { auth: { tgUserId: number } }).auth;
    const botUsername = env.TELEGRAM_BOT_USERNAME.replace("@", "");
    const refCode = await db.getReferralCode(auth.tgUserId);
    const link = env.TELEGRAM_APP_SLUG
      ? `https://t.me/${botUsername}/${env.TELEGRAM_APP_SLUG}?startapp=ref_${refCode}&mode=fullscreen`
      : `https://t.me/${botUsername}?startapp=ref_${refCode}`;
    return { link };
  });

  return app;
}
