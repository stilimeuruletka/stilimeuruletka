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
      <img src="/колесо4к.png" alt="" className={styles.rouletteWheelComposite} draggable={false} />
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
  const [error, setError] = useState<string | null>(null);
  const [wonSegmentIndex, setWonSegmentIndex] = useState<number | null>(null);
  const [spinAtIso, setSpinAtIso] = useState<string | null>(null);

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

  const startSpin = useCallback(async () => {
    if (spinning) return;
    setError(null);
    setModalOpen(false);
    setWonSegmentIndex(null);
    setSpinAtIso(null);

    const initData = getInitData();
    const base = getBackendBase();

    setSpinning(true);
    try {
      const segCount = 10;
      let data: SpinResult;
      let sectorIndex: number;

      if (!initData) {
        if (!isLocalDevHost()) {
          throw new Error("Откройте приложение через Telegram");
        }
        data = {
          spin_id: `local-${Date.now()}`,
          win: Math.random() < 0.5,
          prize_title: null,
          prize_value: null,
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
        const json = (await res.json().catch(() => null)) as SpinResult | { message?: string } | null;
        if (!res.ok || !json || typeof json !== "object" || !("win" in json)) {
          const msg = (json && "message" in json && typeof json.message === "string" && json.message) || "Спин недоступен";
          throw new Error(msg);
        }
        data = json as SpinResult;
        sectorIndex = typeof data.sector_index === "number" && data.sector_index >= 0 ? data.sector_index : Math.floor(Math.random() * segCount);
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
  }, [spinning]);

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

  const nextAttemptIso = useMemo(() => {
    if (result?.next_spin_at) return result.next_spin_at;
    if (!spinAtIso) return null;
    const ms = Date.parse(spinAtIso);
    if (!Number.isFinite(ms)) return null;
    return new Date(ms + 24 * 60 * 60 * 1000).toISOString();
  }, [result?.next_spin_at, spinAtIso]);

  const claimPrize = useCallback(async () => {
    const initData = getInitData();
    const base = getBackendBase();
    if (initData && result?.spin_id) {
      await fetch(`${base}/api/prize/claim`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-telegram-init-data": initData },
        body: JSON.stringify({
          spin_id: result.spin_id,
          prize_title: result.prize_title,
          prize_value: result.prize_value
        })
      }).catch(() => {});
    }

    const w = window as TelegramSdkWindow;
    const link = "https://t.me/stilimeuruletkasos";
    if (typeof w.Telegram?.WebApp?.openTelegramLink === "function") {
      w.Telegram.WebApp.openTelegramLink(link);
      return;
    }
    window.open(link, "_blank", "noopener,noreferrer");
  }, [result?.prize_title, result?.prize_value, result?.spin_id]);

  return (
    <div className={styles.placeholderPage}>
      <div className={styles.placeholderFrame}>
        <button type="button" className={styles.aboutNavArrowLeft} onClick={() => router.push("/main")} aria-label="Назад">
          <Image
            src="/стрелканазад.PNG"
            alt=""
            width={52}
            height={26}
            className={`${styles.aboutNavArrowImage} ${styles.rouletteBackArrowImage}`}
            priority
          />
        </button>
        <div className={styles.rouletteTopMenuLink}>
          <Link href="/main" className={styles.rouletteTopMenuMainLink} aria-label="В главное меню">
            <Image
              src="/чернымглавноеменюистория.png"
              alt=""
              width={6900}
              height={1416}
              className={styles.rouletteTopMenuImg}
              priority
              sizes="220px"
              quality={90}
            />
          </Link>
          <Link href="/main/prizes" className={styles.rouletteTopMenuPrizesLink} aria-label="Мои выигрыши">
            <Image
              src="/стрелканазад.PNG"
              alt=""
              width={52}
              height={26}
              className={styles.rouletteTopMenuArrow}
              priority
            />
          </Link>
        </div>

        <div className={styles.rouletteStage}>
          <button
            type="button"
            className={styles.rouletteWheelButton}
            onClick={startSpin}
            disabled={spinning}
            aria-label={spinning ? "Крутится" : "Крутить"}
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
          <div className={styles.rouletteResultOverlay} role="dialog" aria-modal="true" onClick={() => setModalOpen(false)}>
            <div className={styles.rouletteResultCard} onClick={(e) => e.stopPropagation()}>
              {!result.win ? (
                <>
                  <div className={styles.rouletteResultTitle}>Oops… Попытайте удачу еще раз!</div>
                  {nextAttemptIso && <div className={styles.rouletteResultMeta}>{formatRuDateTime(nextAttemptIso)}</div>}
                  <div className={styles.rouletteResultPrizeWrap} aria-hidden="true">
                    <img src="/проигрыш.PNG" alt="" className={styles.rouletteResultPrizeImg} draggable={false} />
                  </div>
                  <div className={styles.rouletteResultActions}>
                    <button
                      type="button"
                      className={`${styles.rouletteResultButton} ${styles.rouletteResultButtonPrimary}`}
                      onClick={() => router.push("/main")}
                    >
                      В главное меню
                    </button>
                    <button type="button" className={styles.rouletteResultButton} onClick={() => router.push("/main/prizes")}>
                      Мои выигрыши
                    </button>
                    <button type="button" className={styles.rouletteResultButton} onClick={() => router.push("/main/profile")}>
                      История стильных спинов
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.rouletteResultTitle}>Wow! Сегодня вам крупно повезло 💗</div>
                  {spinAtIso && <div className={styles.rouletteResultMeta}>{formatRuDateTime(spinAtIso)}</div>}
                  {typeof wonSegmentIndex === "number" && (
                    <Link href="/main/prizes" className={styles.roulettePrizeLink} aria-label="Открыть выигранные призы">
                      <div className={styles.rouletteResultPrizeWrap}>
                        <img src={getSegmentImageByIndex(wonSegmentIndex)} alt="" className={styles.rouletteResultPrizeImg} draggable={false} />
                        <div className={styles.rouletteResultPrizeLabel}>{result.prize_title || "Приз"}</div>
                      </div>
                    </Link>
                  )}
                  <div className={styles.rouletteResultActions}>
                    {isBonusSpinPrize ? (
                      <button
                        type="button"
                        className={`${styles.rouletteResultButton} ${styles.rouletteResultButtonPrimary}`}
                        onClick={() => {
                          setModalOpen(false);
                          void startSpin();
                        }}
                      >
                        Повторный спин
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={`${styles.rouletteResultButton} ${styles.rouletteResultButtonPrimary}`}
                        onClick={() => void claimPrize()}
                      >
                        Забрать приз
                      </button>
                    )}
                    <button type="button" className={styles.rouletteResultButton} onClick={() => router.push("/main/prizes")}>
                      Мои выигрыши
                    </button>
                    <button type="button" className={styles.rouletteResultButton} onClick={() => router.push("/main/profile")}>
                      История стильных спинов
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
