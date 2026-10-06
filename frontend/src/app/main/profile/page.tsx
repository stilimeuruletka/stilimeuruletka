"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import styles from "../../page.module.css";

type TelegramWebAppUser = {
  id?: number;
  username?: string;
  photo_url?: string;
};

type TelegramWebApp = {
  initDataUnsafe?: {
    user?: TelegramWebAppUser;
  };
};

type TelegramSdkWindow = Window & {
  Telegram?: {
    WebApp?: TelegramWebApp & { initData?: string };
  };
};

function formatRemaining(ms: number | null) {
  if (ms == null) {
    return "--:--:--";
  }

  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");

  return `${hours}:${minutes}:${seconds}`;
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

function getTgUserId() {
  const w = window as TelegramSdkWindow;
  const id = w.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  return typeof id === "number" && Number.isFinite(id) ? id : null;
}

function getLocalSpinHistoryKey() {
  const id = typeof window !== "undefined" ? getTgUserId() : null;
  return `stilimeuruletka_spin_history:${id ?? "anon"}`;
}

function readLocalSpinHistory() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(getLocalSpinHistoryKey());
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    const list = Array.isArray(parsed) ? parsed : [];
    return list
      .filter(
        (x): x is { spin_id: string; created_at: string; win: boolean; prize_title: string | null; prize_value: number | null } =>
          !!x &&
          typeof x === "object" &&
          typeof (x as Record<string, unknown>).spin_id === "string" &&
          typeof (x as Record<string, unknown>).created_at === "string" &&
          typeof (x as Record<string, unknown>).win === "boolean"
      )
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, 80);
  } catch {
    return [];
  }
}

function SpinTimer() {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [canSpin, setCanSpin] = useState<boolean>(false);
  const [nextSpinAtMs, setNextSpinAtMs] = useState<number | null>(null);

  const remainingText = useMemo(() => formatRemaining(remainingMs), [remainingMs]);

  const refresh = useCallback(async () => {
    const initData = getInitData();
    if (!initData) {
      setRemainingMs(null);
      setCanSpin(false);
      setNextSpinAtMs(null);
      return;
    }

    const base = getBackendBase();
    const tzOffset = new Date().getTimezoneOffset();
    const res = await fetch(`${base}/api/me?tz_offset=${encodeURIComponent(String(tzOffset))}`, {
      headers: { "x-telegram-init-data": initData }
    });
    if (!res.ok) return;
    const json = (await res.json().catch(() => null)) as
      | { can_spin: boolean; next_spin_at: string | null }
      | null;
    if (!json) return;
    setCanSpin(Boolean(json.can_spin));
    setNextSpinAtMs(json.next_spin_at ? Date.parse(json.next_spin_at) : null);
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(id);
  }, [refresh]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refresh();
    }, 30_000);
    return () => window.clearInterval(intervalId);
  }, [refresh]);

  useEffect(() => {
    const update = () => {
      if (canSpin || !nextSpinAtMs) {
        setRemainingMs(null);
        return;
      }
      const diff = nextSpinAtMs - Date.now();
      if (diff <= 0) {
        setRemainingMs(null);
        void refresh();
        return;
      }
      setRemainingMs(diff);
    };

    const timeoutId = window.setTimeout(update, 0);
    const intervalId = window.setInterval(update, 1000);
    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [canSpin, nextSpinAtMs, refresh]);

  return (
    <div className={styles.profileSpinTimer}>
      <Image
        src="/круг5к.png"
        alt="До следующего спина"
        width={640}
        height={284}
        className={styles.profileSpinTimerImage}
        sizes="320px"
        quality={80}
      />
      <div className={styles.profileSpinTimerText}>
        <span>{canSpin ? "МОЖНО КРУТИТЬ" : "ДО СЛЕДУЮЩЕГО СПИНА"}</span>
        <span className={styles.profileSpinTimerValue}>{remainingText}</span>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const backgroundVideoRef = useRef<HTMLVideoElement | null>(null);

  const { displayName, avatarSrc } = useMemo(() => {
    if (!isClient) {
      return { displayName: "@username", avatarSrc: null as string | null };
    }

    const w = window as TelegramSdkWindow;
    const tgUser = w.Telegram?.WebApp?.initDataUnsafe?.user;
    return {
      displayName: tgUser?.username ? `@${tgUser.username}` : "@username",
      avatarSrc: tgUser?.photo_url ?? null
    };
  }, [isClient]);

  useEffect(() => {
    const v = backgroundVideoRef.current;
    if (!v) return;

    const sync = () => {
      if (document.visibilityState === "hidden") {
        v.pause();
        return;
      }
      void v.play().catch(() => {});
    };

    document.addEventListener("visibilitychange", sync);
    sync();
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  return (
    <div className={styles.placeholderPage}>
      <div className={styles.placeholderFrame}>
        <div className={styles.profileBackgroundLayer} aria-hidden="true">
          <video
            ref={backgroundVideoRef}
            className={styles.profileBackgroundLayerVideo}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            poster="/IMG_1294.PNG"
            disablePictureInPicture
            disableRemotePlayback
          >
            <source src="/IMG_2304.MP4" type="video/mp4" />
          </video>
        </div>

        <div className={styles.commonTopHeader} aria-hidden="true">
          <Image
            src="/главноеменюрулеткакрасный.png"
            alt=""
            width={1040}
            height={336}
            className={styles.commonTopHeaderImage}
            priority
            sizes="(max-width: 520px) 100vw, 520px"
            quality={80}
          />
          <div className={styles.commonTopHeaderUser}>
            <div className={styles.commonTopHeaderAvatar}>
              {avatarSrc && (
                <Image
                  src={avatarSrc}
                  alt=""
                  fill
                  sizes="66px"
                  quality={80}
                  style={{ objectFit: "cover", objectPosition: "center" }}
                />
              )}
            </div>
            <div className={styles.commonTopHeaderName}>{displayName}</div>
          </div>
        </div>

        <Link href="/main" className={`${styles.profileArrowLeft} ${styles.profileArrowLeftProfile}`} aria-label="Назад в меню">
          <Image
            src="/стрелканазад.PNG"
            alt="Назад"
            width={104}
            height={52}
            className={styles.profileArrow}
            sizes="52px"
            quality={80}
          />
        </Link>
        <Link href="/main/spin" className={`${styles.profileArrowRightNoFlip} ${styles.profileArrowRightProfile}`} aria-label="Вперёд">
          <Image
            src="/стрелканазад.PNG"
            alt="Вперёд"
            width={104}
            height={52}
            className={`${styles.profileArrow} ${styles.profileArrowIconRight}`}
            sizes="52px"
            quality={80}
          />
        </Link>

        <div className={styles.profileActionsOverlay}>
          <div className={styles.profileQuickButtons}>
            <div className={styles.profileQuickButtonsCenter}>
              <Link href="/main/history" className={styles.profileQuickButtonLink} aria-label="История стильных спинов">
                <Image
                  src="/историястильныхпинов.png"
                  alt="История стильных спинов"
                  width={410}
                  height={68}
                  className={styles.profileQuickButtonImg}
                  sizes="(max-width: 520px) 44vw, 180px"
                  quality={80}
                />
              </Link>
            </div>

            <div className={styles.profileQuickButtonsRow}>
              <Link href="/main/friend" className={styles.profileQuickButtonLink}>
                <Image
                  src="/пригласитьстильныхдрузей2.png"
                  alt="Пригласить стильных друзей"
                  width={420}
                  height={70}
                  className={`${styles.profileQuickButtonImg} ${styles.profileQuickButtonImgLift} ${styles.profileQuickButtonImgLarge}`}
                  sizes="(max-width: 520px) 46vw, 186px"
                  quality={80}
                />
              </Link>
              <a
                href="https://t.me/stilimeuruletkamanager"
                target="_blank"
                rel="noreferrer"
                className={styles.profileQuickButtonLink}
                aria-label="@stilimeuruletkamanager"
              >
                <Image
                  src="/рекламаисотрудничество.png"
                  alt="Реклама и сотрудничество"
                  width={410}
                  height={68}
                  className={`${styles.profileQuickButtonImg} ${styles.profileQuickButtonImgLift} ${styles.profileQuickButtonImgAdTweak}`}
                  sizes="(max-width: 520px) 44vw, 180px"
                  quality={80}
                />
              </a>
            </div>

            <div className={styles.profileQuickButtonsRow}>
              <a
                href="https://t.me/stilimeuruletka"
                target="_blank"
                rel="noreferrer"
                className={styles.profileQuickButtonLink}
                aria-label="Канал сообщества"
              >
                <Image
                  src="/каналсообщество.png"
                  alt="Канал сообщества"
                  width={410}
                  height={68}
                  className={`${styles.profileQuickButtonImg} ${styles.profileQuickButtonImgLift} ${styles.profileQuickButtonImgChannelTweak}`}
                  sizes="(max-width: 520px) 44vw, 180px"
                  quality={80}
                />
              </a>
              <Link href="/main/about" className={styles.profileQuickButtonLink}>
                <Image
                  src="/обренда.png"
                  alt="О бренде"
                  width={420}
                  height={70}
                  className={`${styles.profileQuickButtonImg} ${styles.profileQuickButtonImgBrandShiftLeft} ${styles.profileQuickButtonImgLift} ${styles.profileQuickButtonImgLarge}`}
                  sizes="(max-width: 520px) 46vw, 186px"
                  quality={80}
                />
              </Link>
            </div>
          </div>

          <SpinTimer />
        </div>
      </div>
    </div>
  );
}
