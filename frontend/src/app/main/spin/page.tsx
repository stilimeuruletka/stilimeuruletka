"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import styles from "../../page.module.css";

type TelegramWebApp = {
  initData?: string;
  initDataUnsafe?: { user?: { id?: number } };
  openTelegramLink?: (url: string) => void;
};

type TelegramSdkWindow = Window & {
  Telegram?: {
    WebApp?: TelegramWebApp;
  };
};

type SpinResult = {
  spin_id: string;
  win: boolean;
  prize_title: string | null;
  prize_value: number | null;
  balance_after: number;
  next_spin_at?: string;
  wins_this_month?: number;
  max_wins_per_month?: number | null;
  segments_count?: number;
  sector_index?: number;
};

type MeResponse = {
  balance?: number;
  can_spin?: boolean;
  next_spin_at?: string | null;
};

type SubCampaign = {
  id: string;
  blogger_name: string | null;
  channel_id: string;
  telegram_link: string | null;
  goal_subscribers: number;
};

type SubProgress = { confirmed: number; goal: number; percent: number } | null;

type SubStatusState = {
  loading: boolean;
  campaign: SubCampaign | null;
  confirmed: boolean;
  progress: SubProgress;
  checking: boolean;
  checkError: string | null;
};

type PrizeDef = {
  key: string;
  title: string;
  value: number | null;
  prize_type: "certificate" | "bonus_spins" | "secret_product" | "secret_general" | "loss";
  image: string;
  extra_spins: number;
  weight: number;
};

const PRIZES: PrizeDef[] = [
  { key: "secret_prize", title: "Секретный приз", value: null, prize_type: "secret_general", image: "/CЕКРбп.png", extra_spins: 0, weight: 2 },
  { key: "bonus_2", title: "+2 спина", value: null, prize_type: "bonus_spins", image: "/2спин.png", extra_spins: 2, weight: 4 },
  { key: "bonus_3", title: "+3 спина", value: null, prize_type: "bonus_spins", image: "/3спин.png", extra_spins: 3, weight: 3 },
  { key: "zy_500", title: "Сертификат ЗЯ 500₽", value: 500, prize_type: "certificate", image: "/СЕРТзя500.png", extra_spins: 0, weight: 4 },
  { key: "zy_1000", title: "Сертификат ЗЯ 1000₽", value: 1000, prize_type: "certificate", image: "/СЕРТзя1000.png", extra_spins: 0, weight: 2 },
  { key: "secret_brand", title: "Секретный бью продукт от бренда", value: null, prize_type: "secret_product", image: "/СЕКРЕТбпотбренда.png", extra_spins: 0, weight: 2 },
  { key: "wb_500", title: "Сертификат WB 500₽", value: 500, prize_type: "certificate", image: "/СЕРТwb500.png", extra_spins: 0, weight: 3 },
  { key: "zy_300", title: "Сертификат ЗЯ 300₽", value: 300, prize_type: "certificate", image: "/СЕРТзя300.png", extra_spins: 0, weight: 4 },
  { key: "bonus_1", title: "+1 спин", value: null, prize_type: "bonus_spins", image: "/1СПИН.png", extra_spins: 1, weight: 5 },
  { key: "secret_beauty", title: "Секретный бьюти продукт", value: null, prize_type: "secret_product", image: "/CЕКРбп.png", extra_spins: 0, weight: 3 }
];

type ResolvedPrize = PrizeDef | null;

function pickWeightedPrize(): PrizeDef {
  const total = PRIZES.reduce((sum, p) => sum + p.weight, 0);
  let r = Math.random() * total;
  for (const p of PRIZES) {
    if (r < p.weight) return p;
    r -= p.weight;
  }
  return PRIZES[PRIZES.length - 1];
}

const SEGMENT_IMAGES = [
  "/1колесо.png",
  "/2колесо.png",
  "/3колесо.png",
  "/4колесо.png",
  "/5колесо.png",
  "/6колесо.png",
  "/7колесо.png",
  "/8колесо.png",
  "/9колесо.png",
  "/10колесо.png"
] as const;

function getTgUserId() {
  const w = window as TelegramSdkWindow;
  const id = w.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  return typeof id === "number" && Number.isFinite(id) ? id : null;
}

function getLocalSpinHistoryKey() {
  const id = typeof window !== "undefined" ? getTgUserId() : null;
  return `stilimeuruletka_spin_history:${id ?? "anon"}`;
}

function appendLocalSpinHistoryItem(item: { spin_id: string; created_at: string; win: boolean; prize_title: string | null; prize_value: number | null }) {
  if (typeof window === "undefined") return;
  try {
    const key = getLocalSpinHistoryKey();
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    const list = Array.isArray(parsed) ? parsed : [];
    const next = [
      item,
      ...list.filter((x) => x && typeof x === "object" && "spin_id" in (x as Record<string, unknown>) && (x as Record<string, unknown>).spin_id !== item.spin_id)
    ].slice(0, 80);
    window.localStorage.setItem(key, JSON.stringify(next));
  } catch {
    /* no-op */
  }
}

function getBackendBase() {
  const raw = process.env.NEXT_PUBLIC_BACKEND_URL;
  return raw ? raw.replace(/\/+$/, "") : "";
}

function getInitData() {
  const w = window as TelegramSdkWindow;
  const initData = w.Telegram?.WebApp?.initData;
  return typeof initData === "string" && initData.length > 10 ? initData : null;
}

function isLocalDevHost() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host.endsWith(".local") || host.startsWith("192.168.");
}

function formatRuDateTime(iso: string) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return new Intl.DateTimeFormat("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(ms));
}

function ensureAudioContext(ref: React.MutableRefObject<AudioContext | null>) {
  if (ref.current) return ref.current;
  ref.current = new AudioContext();
  return ref.current;
}

function playTick(ctx: AudioContext) {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.value = 920;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.09, t + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.031);
}

function scheduleTicks(
  audioRef: React.MutableRefObject<AudioContext | null>,
  timeoutRef: React.MutableRefObject<number | null>,
  durationMs: number
) {
  const ctx = ensureAudioContext(audioRef);
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => {});
  }
  const startedAt = performance.now();

  const step = () => {
    playTick(ctx);
    const elapsed = performance.now() - startedAt;
    if (elapsed >= durationMs) return;
    const p = Math.min(1, Math.max(0, elapsed / durationMs));
    const delay = 48 + p * 190;
    timeoutRef.current = window.setTimeout(step, delay);
  };

  step();
}

function stopTicks(timeoutRef: React.MutableRefObject<number | null>) {
  if (timeoutRef.current) {
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }
}

function getSegmentImageByIndex(index: number) {
  const safe = Number.isFinite(index) ? Math.trunc(index) : 0;
  const len = SEGMENT_IMAGES.length;
  const normalized = ((safe % len) + len) % len;
  return SEGMENT_IMAGES[normalized];
}

function WheelArt() {
  return (
    <div className={styles.rouletteWheelArt} aria-hidden="true">
      <Image
        src="/колесо4к.png"
        alt=""
        fill
        className={styles.rouletteWheelComposite}
        priority
        sizes="(max-width: 520px) 92vw, 420px"
        quality={75}
      />
    </div>
  );
}

export default function RoulettePage() {
  const router = useRouter();

  const audioRef = useRef<AudioContext | null>(null);
  const tickTimeoutRef = useRef<number | null>(null);
  const rotationRef = useRef(0);

  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [resolvedPrize, setResolvedPrize] = useState<ResolvedPrize>(null);
  const [databaseSpins, setDatabaseSpins] = useState<number>(0);
  const [availableSpins, setAvailableSpins] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [wonSegmentIndex, setWonSegmentIndex] = useState<number | null>(null);
  const [spinAtIso, setSpinAtIso] = useState<string | null>(null);
  const [subStatus, setSubStatus] = useState<SubStatusState>({
    loading: true,
    campaign: null,
    confirmed: true,
    progress: null,
    checking: false,
    checkError: null
  });

  useEffect(() => {
    rotationRef.current = rotation;
  }, [rotation]);

  useEffect(() => {
    return () => {
      stopTicks(tickTimeoutRef);
      const ctx = audioRef.current;
      audioRef.current = null;
      void ctx?.close().catch(() => {});
    };
  }, []);

  const fetchSubStatus = useCallback(async () => {
    const initData = getInitData();
    const base = getBackendBase();
    if (!base) {
      setSubStatus((s) => ({ ...s, loading: false }));
      return;
    }
    if (!initData) {
      if (isLocalDevHost()) {
        setSubStatus({ loading: false, campaign: null, confirmed: true, progress: null, checking: false, checkError: null });
      } else {
        setSubStatus((s) => ({ ...s, loading: false }));
      }
      return;
    }
    setSubStatus((s) => ({ ...s, loading: true, checkError: null }));
    try {
      const res = await fetch(`${base}/api/subscription/status`, {
        method: "GET",
        headers: { "x-telegram-init-data": initData }
      });
      const json = (await res.json().catch(() => null)) as {
        campaign?: SubCampaign | null;
        confirmed?: boolean;
        progress?: SubProgress;
        message?: string;
      } | null;
      if (res.ok && json && typeof json === "object") {
        setSubStatus({
          loading: false,
          campaign: json.campaign ?? null,
          confirmed: typeof json.confirmed === "boolean" ? json.confirmed : true,
          progress: json.progress ?? null,
          checking: false,
          checkError: null
        });
      } else {
        setSubStatus({ loading: false, campaign: null, confirmed: true, progress: null, checking: false, checkError: null });
      }
    } catch {
      setSubStatus({ loading: false, campaign: null, confirmed: true, progress: null, checking: false, checkError: null });
    }
  }, []);

  const fetchDatabaseBalance = useCallback(async () => {
    const initData = getInitData();
    const base = getBackendBase();
    if (!base || !initData) return;
    try {
      const res = await fetch(`${base}/api/me?tz_offset=${encodeURIComponent(String(new Date().getTimezoneOffset()))}`, {
        method: "GET",
        headers: { "x-telegram-init-data": initData }
      });
      if (!res.ok) return;
      const json = (await res.json().catch(() => null)) as MeResponse | null;
      if (json && typeof json.balance === "number") {
        setDatabaseSpins(json.balance);
      }
    } catch {
      /* no-op */
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void fetchDatabaseBalance();
    }, 0);
    return () => window.clearTimeout(id);
  }, [fetchDatabaseBalance]);

  const checkSubNow = useCallback(async () => {
    const initData = getInitData();
    const base = getBackendBase();
    if (!base || !initData) {
      setSubStatus((s) => ({ ...s, checkError: "Откройте приложение через Telegram" }));
      return;
    }
    setSubStatus((s) => ({ ...s, checking: true, checkError: null }));
    try {
      const res = await fetch(`${base}/api/subscription/check`, {
        method: "POST",
        headers: { "x-telegram-init-data": initData }
      });
      const json = (await res.json().catch(() => null)) as {
        campaign?: SubCampaign | null;
        confirmed?: boolean;
        progress?: SubProgress;
        message?: string;
        status?: string;
      } | null;
      if (res.ok && json && typeof json === "object") {
        setSubStatus((prev) => ({
          ...prev,
          checking: false,
          campaign: json.campaign ?? prev.campaign,
          confirmed: typeof json.confirmed === "boolean" ? json.confirmed : prev.confirmed,
          progress: json.progress ?? prev.progress,
          checkError:
            json.confirmed === false && json.message
              ? json.message
              : json.confirmed === false && !json.message
                ? "Вы ещё не подписались. Если только что подписались — подожди 5 секунд и проверь ещё раз."
                : null
        }));
      } else if (res.status === 503 && json && typeof json === "object") {
        setSubStatus((prev) => ({
          ...prev,
          checking: false,
          checkError:
            json.message || "Бот не может проверить подписку — напишите в поддержку."
        }));
      } else {
        setSubStatus((prev) => ({
          ...prev,
          checking: false,
          checkError: "Не удалось проверить подписку. Попробуйте позже."
        }));
      }
    } catch {
      setSubStatus((prev) => ({
        ...prev,
        checking: false,
        checkError: "Не удалось проверить подписку. Проверьте интернет."
      }));
    }
  }, []);

  const openChannel = useCallback(() => {
    const link = subStatus.campaign?.telegram_link;
    if (!link) return;
    const w = window as TelegramSdkWindow;
    if (typeof w.Telegram?.WebApp?.openTelegramLink === "function") {
      w.Telegram.WebApp.openTelegramLink(link);
      return;
    }
    window.open(link, "_blank", "noopener,noreferrer");
  }, [subStatus.campaign?.telegram_link]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void fetchSubStatus();
    }, 0);
    return () => window.clearTimeout(id);
  }, [fetchSubStatus]);

  const startSpin = useCallback(async () => {
    if (spinning) return;
    if (availableSpins > 0) {
      // use local bonus spins pool first (no 24h cooldown)
    }
    if (subStatus.campaign && !subStatus.confirmed) {
      setError("Чтобы крутить — подпишитесь на канал и нажмите «Проверить».");
      void fetchSubStatus();
      return;
    }
    setError(null);
    setModalOpen(false);
    setWonSegmentIndex(null);
    setSpinAtIso(null);
    setResolvedPrize(null);

    const initData = getInitData();
    const base = getBackendBase();

    setSpinning(true);
    try {
      const segCount = 10;
      let data: SpinResult;
      let sectorIndex: number;
      let localPrize: PrizeDef | null = null;

      if (!initData) {
        if (!isLocalDevHost()) {
          throw new Error("Откройте приложение через Telegram");
        }
        const hasBonus = availableSpins > 0;
        const win = hasBonus ? true : Math.random() < 0.75;
        const prize = win ? pickWeightedPrize() : null;
        localPrize = prize;
        data = {
          spin_id: `local-${Date.now()}`,
          win,
          prize_title: prize?.title ?? null,
          prize_value: prize?.value ?? null,
          balance_after: 0,
          segments_count: segCount,
          sector_index: Math.floor(Math.random() * segCount)
        };
        sectorIndex = data.sector_index ?? 0;
      } else {
        const hasBonus = availableSpins > 0;
        if (hasBonus) {
          const win = true;
          const prize = pickWeightedPrize();
          localPrize = prize;
          data = {
            spin_id: `bonus-${Date.now()}`,
            win,
            prize_title: prize.title,
            prize_value: prize.value,
            balance_after: 0,
            segments_count: segCount,
            sector_index: Math.floor(Math.random() * segCount)
          };
          sectorIndex = data.sector_index ?? 0;
        } else {
          const tzOffset = new Date().getTimezoneOffset();
          const res = await fetch(`${base}/api/spin?tz_offset=${encodeURIComponent(String(tzOffset))}`, {
            method: "POST",
            headers: { "x-telegram-init-data": initData }
          });
          const json = (await res.json().catch(() => null)) as
            | SpinResult
            | { message?: string; code?: string; campaign?: SubCampaign; progress?: SubProgress }
            | null;
          if (!res.ok || !json || typeof json !== "object") {
            if (json && "code" in json && json.code === "MUST_SUBSCRIBE_FIRST") {
              setSubStatus((prev) => ({
                ...prev,
                campaign: "campaign" in json && json.campaign ? json.campaign : prev.campaign,
                confirmed: false,
                progress: "progress" in json && json.progress ? json.progress : prev.progress
              }));
              setSpinning(false);
              setDurationMs(0);
              setError("Чтобы крутить — сначала подпишитесь на канал и подтвердите подписку.");
              return;
            }
            const msg = (json && "message" in json && typeof json.message === "string" && json.message) || "Спин недоступен";
            throw new Error(msg);
          }
          if (!("win" in json)) {
            const msg = (json && "message" in json && typeof json.message === "string" && json.message) || "Спин недоступен";
            throw new Error(msg);
          }
          data = json as SpinResult;
          sectorIndex = typeof data.sector_index === "number" && data.sector_index >= 0 ? data.sector_index : Math.floor(Math.random() * segCount);
          if (data.win && data.prize_title) {
            const byTitle = PRIZES.find((p) => p.title.toLowerCase() === (data.prize_title as string).toLowerCase());
            localPrize = byTitle ?? null;
          } else if (data.win) {
            localPrize = pickWeightedPrize();
          }
        }
      }

      const segmentAngle = 360 / segCount;
      const sectorCenterFromTop = sectorIndex * segmentAngle + segmentAngle / 2;
      const targetAngle = 360 - sectorCenterFromTop;
      const extraSpins = 7 + Math.floor(Math.random() * 3);

      const nextRotation = rotationRef.current + extraSpins * 360 + targetAngle;
      const ms = 6500 + Math.floor(Math.random() * 400);
      const nowIso = new Date().toISOString();

      setResult(data);
      setWonSegmentIndex(sectorIndex);
      setDurationMs(ms);
      setSpinAtIso(nowIso);
      setResolvedPrize(localPrize);
      if (availableSpins > 0) {
        setAvailableSpins((prev) => Math.max(0, prev - 1));
      }
      void fetchDatabaseBalance();
      appendLocalSpinHistoryItem({
        spin_id: data.spin_id,
        created_at: nowIso,
        win: data.win,
        prize_title: data.prize_title,
        prize_value: data.prize_value
      });
      stopTicks(tickTimeoutRef);
      const ctx = ensureAudioContext(audioRef);
      if (ctx.state === "suspended") {
        await ctx.resume().catch(() => {});
      }
      scheduleTicks(audioRef, tickTimeoutRef, ms);
      requestAnimationFrame(() => setRotation(nextRotation));
    } catch (e) {
      stopTicks(tickTimeoutRef);
      setSpinning(false);
      setDurationMs(0);
      setError(e instanceof Error ? e.message : "Спин недоступен");
    }
  }, [spinning, availableSpins, subStatus.campaign, subStatus.confirmed, fetchSubStatus, fetchDatabaseBalance]);

  const onWheelTransitionEnd = useCallback(() => {
    if (!spinning) return;
    stopTicks(tickTimeoutRef);
    setSpinning(false);
    setDurationMs(0);
    setModalOpen(true);
  }, [spinning]);

  const isBonusSpinPrize = useMemo(() => {
    const title = result?.prize_title;
    if (!result?.win) return false;
    if (!title) return false;
    return /спин/i.test(title);
  }, [result?.prize_title, result?.win]);

  useEffect(() => {
    if (!modalOpen || !resolvedPrize) return;
    if (resolvedPrize.prize_type !== "bonus_spins" || !resolvedPrize.extra_spins) return;
    setAvailableSpins((prev) => prev + resolvedPrize.extra_spins);
  }, [modalOpen, resolvedPrize]);

  const claimPrize = useCallback(async () => {
    const initData = getInitData();
    const base = getBackendBase();
    if (initData && result?.spin_id) {
      try {
        await fetch(`${base}/api/prize/claim`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-telegram-init-data": initData },
          body: JSON.stringify({
            spin_id: result.spin_id,
            prize_title: result.prize_title,
            prize_value: result.prize_value
          })
        });
      } catch {
        /* no-op */
      }
    }
    setModalOpen(false);
  }, [result?.prize_title, result?.prize_value, result?.spin_id]);

  const closeResultModal = useCallback(() => {
    setModalOpen(false);
  }, []);

  const rerunFromModal = useCallback(() => {
    if (spinning) return;
    setModalOpen(false);
    window.setTimeout(() => void startSpin(), 0);
  }, [startSpin, spinning]);

  return (
    <div className={styles.placeholderPage}>
      <div className={styles.placeholderFrame}>
        {subStatus.campaign && !subStatus.confirmed && (
          <div
            aria-live="polite"
            style={{
              margin: "14px 10px 6px",
              padding: "16px 16px 18px",
              background: "linear-gradient(180deg, #ffffff 0%, #fff5f5 100%)",
              border: `2px solid rgba(184,31,34,0.85)`,
              borderRadius: 14,
              boxShadow: "0 10px 28px rgba(0,0,0,0.18), 0 2px 6px rgba(184,31,34,0.08)"
            }}
          >
            <div
              style={{
                fontWeight: 900,
                fontSize: 17,
                lineHeight: 1.25,
                color: "#111",
                marginBottom: 6,
                letterSpacing: 0.2
              }}
            >
              💗 Чтобы крутить — подпишись на&nbsp;
              <span style={{ color: "#b81f22" }}>
                {subStatus.campaign.blogger_name || `канал ${subStatus.campaign.channel_id}`}
              </span>
            </div>
            <div
              style={{
                fontSize: 13,
                color: "#444",
                marginBottom: 14,
                lineHeight: 1.45
              }}
            >
              Всего нужно <strong>{subStatus.campaign.goal_subscribers.toLocaleString("ru-RU")}</strong> подписчиков.
              Уже подтвердило: <strong>{subStatus.progress?.confirmed ?? 0}</strong>.
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                marginBottom: 14,
                flexWrap: "wrap"
              }}
            >
              {subStatus.campaign.telegram_link && (
                <button
                  type="button"
                  onClick={openChannel}
                  style={{
                    flex: "1 1 160px",
                    minHeight: 46,
                    padding: "0 16px",
                    borderRadius: 12,
                    border: "none",
                    background: "#b81f22",
                    color: "#fff",
                    fontWeight: 800,
                    fontSize: 14.5,
                    letterSpacing: 0.3,
                    cursor: "pointer",
                    boxShadow: "0 4px 14px rgba(184,31,34,0.35)",
                    position: "relative"
                  }}
                >
                  <span aria-hidden="true" style={{ position: "absolute", inset: -12 }} />
                  🚀 Открыть канал
                </button>
              )}
              <button
                type="button"
                onClick={() => void checkSubNow()}
                disabled={subStatus.checking || subStatus.loading}
                style={{
                  flex: "1 1 160px",
                  minHeight: 46,
                  padding: "0 16px",
                  borderRadius: 12,
                  border: `2px solid #b81f22`,
                  background: "#fff",
                  color: "#b81f22",
                  fontWeight: 800,
                  fontSize: 14.5,
                  letterSpacing: 0.3,
                  cursor: subStatus.checking ? "wait" : "pointer",
                  opacity: subStatus.checking || subStatus.loading ? 0.75 : 1,
                  position: "relative"
                }}
              >
                <span aria-hidden="true" style={{ position: "absolute", inset: -12 }} />
                {subStatus.checking ? "Проверяем…" : "✅ Я подписался. Проверить"}
              </button>
            </div>

            {subStatus.progress && subStatus.progress.goal > 0 && (
              <div style={{ marginTop: 2 }}>
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.min(100, Math.max(0, Math.round(subStatus.progress.percent)))}
                  style={{
                    width: "100%",
                    height: 10,
                    background: "#f0dada",
                    borderRadius: 999,
                    overflow: "hidden",
                    marginBottom: 6
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(100, Math.max(0, subStatus.progress.percent))}%`,
                      height: "100%",
                      background: `linear-gradient(90deg, #b81f22 0%, #e03538 100%)`,
                      borderRadius: 999,
                      transition: "width 500ms ease"
                    }}
                  />
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "#555",
                    display: "flex",
                    justifyContent: "space-between"
                  }}
                >
                  <span>
                    {subStatus.progress.confirmed.toLocaleString("ru-RU")} /{" "}
                    {subStatus.progress.goal.toLocaleString("ru-RU")}
                  </span>
                  <span style={{ fontWeight: 800, color: "#b81f22" }}>
                    {subStatus.progress.percent.toFixed(1)}%
                  </span>
                </div>
              </div>
            )}

            {subStatus.checkError && (
              <div
                style={{
                  marginTop: 12,
                  padding: "8px 10px",
                  borderRadius: 10,
                  background: "rgba(184,31,34,0.08)",
                  color: "#8a181a",
                  fontSize: 12.5,
                  lineHeight: 1.4,
                  fontWeight: 600
                }}
              >
                {subStatus.checkError}
              </div>
            )}

            <div
              style={{
                marginTop: 12,
                fontSize: 11.5,
                color: "#777",
                lineHeight: 1.4
              }}
            >
              💡 Совет: если только что подписались — подожди 5 секунд и нажми «Проверить» ещё раз.
            </div>
          </div>
        )}

        <div
          className={`${styles.rouletteStage} ${modalOpen ? styles.rouletteStageBlurred : ""}`}
          style={
            subStatus.campaign && !subStatus.confirmed
              ? {
                  filter: "grayscale(0.6) brightness(0.92)",
                  pointerEvents: "none",
                  opacity: 0.55
                }
              : undefined
          }
        >
          <button
            type="button"
            className={styles.rouletteWheelButton}
            onClick={startSpin}
            disabled={spinning || (!!subStatus.campaign && !subStatus.confirmed)}
            aria-label={
              spinning ? "Крутится" : subStatus.campaign && !subStatus.confirmed ? "Подпишитесь чтобы крутить" : "Крутить"
            }
          >
            <div
              className={styles.rouletteWheel}
              style={{
                transform: `rotate(${rotation}deg)`,
                transitionDuration: `${durationMs}ms`
              }}
              onTransitionEnd={onWheelTransitionEnd}
            >
              <WheelArt />
            </div>
          </button>
          {error && (
            <div className={styles.rouletteHud} aria-live="polite">
              <div className={styles.rouletteHudError}>{error}</div>
            </div>
          )}
        </div>

        {modalOpen && result && (
          <div className={`${styles.spinResultOverlay} ${!result.win ? styles.rouletteResultOverlayLoss : ""}`}>
            <div className={styles.spinResultTopHeader}>
              <Image
                src="/чернымглавноеменюистория.png"
                alt=""
                width={440}
                height={90}
                className={styles.spinResultTopHeaderImg}
                sizes="(max-width: 520px) 84vw, 370px"
                quality={80}
              />
            </div>
            <Link
              href="/main/profile"
              className={`${styles.spinResultTopNavLink} ${styles.spinResultTopNavLeft}`}
              aria-label="В профиль"
            >
              <Image
                src="/стрелканазад.PNG"
                alt="Назад"
                width={104}
                height={52}
                className={styles.spinResultTopNavIcon}
                sizes="52px"
                quality={80}
              />
            </Link>
            <Link
              href="/main/spin"
              className={`${styles.spinResultTopNavLink} ${styles.spinResultTopNavRight}`}
              aria-label="Запустить рулетку"
            >
              <Image
                src="/стрелканазад.PNG"
                alt="Далее"
                width={104}
                height={52}
                className={`${styles.spinResultTopNavIcon} ${styles.spinResultTopNavIconMirrored}`}
                sizes="52px"
                quality={80}
              />
            </Link>

            <div className={styles.spinResultTicketPlatform} aria-hidden="true">
              <Image
                src="/розыгрышверхк 2.png"
                alt=""
                width={440}
                height={180}
                className={styles.spinResultTicketPlatformImg}
                sizes="(max-width: 520px) 90vw, 440px"
                quality={85}
              />
            </div>

            <div className={styles.spinResultTicket}>
              {resolvedPrize && (
                <div className={styles.spinResultPrizeImageWrap}>
                  <Image
                    src={resolvedPrize.image}
                    alt=""
                    fill
                    className={styles.spinResultPrizeImage}
                    sizes="(max-width: 520px) 80vw, 320px"
                    quality={90}
                  />
                </div>
              )}
            </div>

            <div className={styles.spinResultActions}>
              <button
                type="button"
                className={styles.spinResultActionButton}
                onClick={() => void claimPrize()}
                aria-label="Забрать приз"
              >
                <Image
                  src="/забрать приз.png"
                  alt="Забрать приз"
                  width={4456}
                  height={1148}
                  className={styles.spinResultActionImage}
                  sizes="(max-width: 520px) 56vw, 240px"
                  quality={85}
                />
              </button>
              <button
                type="button"
                className={`${styles.spinResultActionButton} ${styles.spinResultActionButtonSmall}`}
                onClick={rerunFromModal}
                disabled={spinning}
                aria-label="Запустить рулетку"
              >
                <Image
                  src="/запустить рулетку.png"
                  alt="Запустить рулетку"
                  width={4456}
                  height={1148}
                  className={styles.spinResultActionImage}
                  sizes="(max-width: 520px) 52vw, 220px"
                  quality={85}
                />
              </button>
            </div>

            <div className={styles.spinResultSpinsCounter}>
              КОЛИЧЕСТВО ДОСТУПНЫХ СПИНОВ: {databaseSpins + availableSpins}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
