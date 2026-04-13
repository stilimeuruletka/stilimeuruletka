"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import styles from "../../page.module.css";

type TelegramWebApp = {
  initData?: string;
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

function getBackendBase() {
  const raw = process.env.NEXT_PUBLIC_BACKEND_URL;
  return raw ? raw.replace(/\/+$/, "") : "";
}

function getInitData() {
  const w = window as TelegramSdkWindow;
  const initData = w.Telegram?.WebApp?.initData;
  return typeof initData === "string" && initData.length > 10 ? initData : null;
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

function PointerCapArt() {
  return (
    <svg className={styles.roulettePointerCapSvg} viewBox="0 0 146 96" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M52.9832 75.0388C68.3973 86.3772 89.7746 83.3701 100.731 68.3222C111.687 53.2743 108.073 31.8839 92.6586 20.5455C77.2445 9.20717 55.8672 12.2144 44.9111 27.2623C33.9551 42.3102 37.5691 63.7005 52.9832 75.0388Z"
        fill="#333333"
      />
      <path
        d="M55.7985 71.2631C71.2234 82.6223 91.9748 80.4858 102.148 66.4909C112.321 52.4961 108.064 31.9425 92.6391 20.5833C77.2142 9.22407 56.4627 11.3607 46.2895 25.3556C36.1162 39.3504 40.3736 59.9039 55.7985 71.2631Z"
        fill="white"
      />
      <path
        d="M59.3263 66.3432C70.2459 74.3761 85.3552 72.2929 93.0739 61.6902C100.793 51.0874 98.198 35.9802 87.2784 27.9472C76.3588 19.9143 61.2494 21.9976 53.5306 32.6004C45.8118 43.2032 48.4067 58.3103 59.3263 66.3432Z"
        fill="#333333"
      />
      <path
        d="M61.1785 63.8725C72.1051 71.9191 86.805 70.4056 94.0115 60.4919C101.218 50.5783 98.2022 36.0186 87.2756 27.972C76.3489 19.9254 61.649 21.4389 54.4425 31.3526C47.236 41.2662 50.2518 55.8259 61.1785 63.8725Z"
        fill="white"
      />
      <path
        d="M85.5619 53.7304C90.9169 49.1995 90.9994 40.974 85.7462 35.3583C80.4931 29.7425 71.8935 28.8629 66.5386 33.3938C61.1836 37.9247 61.1012 46.1502 66.3544 51.766C71.6075 57.3818 80.207 58.2613 85.5619 53.7304Z"
        fill="white"
      />
    </svg>
  );
}

function WheelArt() {
  return (
    <div className={styles.rouletteWheelArt} aria-hidden="true">
      <img src="/колесорулетка.svg" alt="" className={styles.rouletteWheelComposite} draggable={false} />
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

  const modalTitle = useMemo(() => {
    if (!result) return null;
    return result.win ? "ВЫ ВЫИГРАЛИ" : "ВЫ ПРОИГРАЛИ";
  }, [result]);

  const modalSubtitle = useMemo(() => {
    if (!result) return null;
    if (result.win) {
      const prize = result.prize_title ? result.prize_title : "Приз";
      const value = typeof result.prize_value === "number" ? ` · ${result.prize_value}` : "";
      return `${prize}${value}`;
    }
    return "Попробуйте ещё раз завтра";
  }, [result]);

  const startSpin = useCallback(async () => {
    if (spinning) return;
    setError(null);
    setModalOpen(false);
    setWonSegmentIndex(null);

    const initData = getInitData();
    const base = getBackendBase();

    setSpinning(true);
    try {
      const segCount = 10;
      let data: SpinResult;
      let sectorIndex: number;

      if (!initData || !base) {
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

      setResult(data);
      setWonSegmentIndex(sectorIndex);
      setDurationMs(ms);
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

  return (
    <div className={styles.fullScreenPage}>
      <div className={styles.fullScreenFrame}>
        <button type="button" className={styles.aboutNavArrowLeft} onClick={() => router.push("/main")} aria-label="Назад">
          <Image src="/стрелканазад.PNG" alt="" width={52} height={26} className={styles.aboutNavArrowImage} priority />
        </button>
        <div className={`${styles.commonTopHeader} ${styles.rouletteTopHeader}`} aria-hidden="true">
          <Image
            src="/белоеглавноеменюрулетка.png"
            alt=""
            width={4052}
            height={1312}
            className={`${styles.commonTopHeaderImage} ${styles.rouletteHeaderImage}`}
            priority
            sizes="(max-width: 520px) 100vw, 520px"
            quality={90}
          />
        </div>

        <div className={styles.rouletteStage}>
          <div className={styles.roulettePointerCap} aria-hidden="true">
            <PointerCapArt />
          </div>
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
          <div className={styles.rouletteHud} aria-live="polite">
            <div className={styles.rouletteHudLine}>Нажмите на колесо</div>
            {error && <div className={styles.rouletteHudError}>{error}</div>}
          </div>
        </div>

        {modalOpen && result && (
          <div className={styles.rouletteResultOverlay} role="dialog" aria-modal="true" onClick={() => setModalOpen(false)}>
            <div className={styles.rouletteResultCard} onClick={(e) => e.stopPropagation()}>
              <div className={styles.rouletteResultTitle}>{modalTitle}</div>
              <div className={styles.rouletteResultSubtitle}>{modalSubtitle}</div>
              {typeof wonSegmentIndex === "number" && (
                <div className={styles.rouletteResultPrizeWrap} aria-hidden="true">
                  <img src={getSegmentImageByIndex(wonSegmentIndex)} alt="" className={styles.rouletteResultPrizeImg} draggable={false} />
                </div>
              )}
              {result.next_spin_at && (
                <div className={styles.rouletteResultMeta}>Следующий спин: {formatRuDateTime(result.next_spin_at)}</div>
              )}
              <div className={styles.rouletteResultActions}>
                <button type="button" className={`${styles.rouletteResultButton} ${styles.rouletteResultButtonPrimary}`} onClick={() => setModalOpen(false)}>
                  Закрыть
                </button>
                <button type="button" className={styles.rouletteResultButton} onClick={() => router.push("/main/profile")}>
                  История
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
