"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
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
    WebApp?: TelegramWebApp;
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

function useTelegramProfile() {
  return useSyncExternalStore(
    () => () => {},
    () => {
      const w = window as TelegramSdkWindow;
      const tgUser = w.Telegram?.WebApp?.initDataUnsafe?.user;

      return {
        displayName: tgUser?.username ? `@${tgUser.username}` : "@username",
        avatarSrc: tgUser?.photo_url ?? null
      };
    },
    () => ({ displayName: "@username", avatarSrc: null })
  );
}

function SpinTimer() {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  const remainingText = useMemo(() => formatRemaining(remainingMs), [remainingMs]);

  useEffect(() => {
    const storageKey = "spin_next_at";
    const stored = window.localStorage.getItem(storageKey);
    const now = Date.now();
    let nextAt = stored ? Number(stored) : Number.NaN;

    if (!nextAt || Number.isNaN(nextAt) || nextAt <= now) {
      nextAt = now + 24 * 60 * 60 * 1000;
      window.localStorage.setItem(storageKey, String(nextAt));
    }

    const update = () => {
      const diff = nextAt - Date.now();
      setRemainingMs(diff > 0 ? diff : 0);
    };

    const timeoutId = window.setTimeout(update, 0);
    const intervalId = window.setInterval(update, 1000);
    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <div className={styles.profileSpinTimer}>
      <Image
        src="/овальчик.png"
        alt="До следующего спина"
        width={720}
        height={320}
        className={styles.profileSpinTimerImage}
      />
      <div className={styles.profileSpinTimerText}>
        <span>ДО СЛЕДУЮЩЕГО СПИНА</span>
        <span className={styles.profileSpinTimerValue}>{remainingText}</span>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { displayName, avatarSrc } = useTelegramProfile();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [hasUserGesture, setHasUserGesture] = useState(false);
  const hasUserGestureRef = useRef(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      v.play().catch(() => {});
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) {
      return;
    }

    v.play().catch(() => {});
  }, [hasUserGesture]);

  const handleUserGesture = () => {
    const v = videoRef.current;
    v?.play().catch(() => {});

    if (!hasUserGestureRef.current) {
      hasUserGestureRef.current = true;
      setHasUserGesture(true);
    }
  };

  return (
    <div
      className={styles.friendVideoScreen}
      onPointerDown={handleUserGesture}
      onTouchStart={handleUserGesture}
      onClick={handleUserGesture}
    >
      <div className={styles.profileAvatarBlockOverlay}>
        <div
          className={`${styles.profileAvatarCircle} ${styles.profileAvatarCircleOverlay}`}
        >
          {avatarSrc && <img src={avatarSrc} alt="Аватар" width={88} height={88} className={styles.profileAvatarImage} loading="lazy" />}
        </div>
        <div className={styles.profileUsername}>{displayName}</div>
      </div>

      <Link href="/main" className={styles.profileArrowLeft} aria-label="Назад в меню">
        <Image
          src="/стрелканазад.PNG"
          alt="Назад"
          width={52}
          height={26}
          className={styles.profileArrow}
        />
      </Link>

      <div className={styles.profileActionsOverlay}>
        <div className={styles.profileQuickButtons}>
          <div className={styles.profileQuickButtonsCenter}>
            <Image
              src="/telegram-cloud-document-2-5364327192501197087 1.png"
              alt="История стильных спинов"
              width={3882}
              height={608}
              className={styles.profileQuickButtonImg}
            />
          </div>

          <div className={styles.profileQuickButtonsRow}>
            <Link href="/main/friend" className={styles.profileQuickButtonLink}>
              <Image
                src="/telegram-cloud-document-2-5364327192501197088 1.png"
                alt="Пригласить стильных друзей"
                width={3882}
                height={608}
                className={`${styles.profileQuickButtonImg} ${styles.profileQuickButtonImgLift} ${styles.profileQuickButtonImgLarge}`}
              />
            </Link>
            <Image
              src="/telegram-cloud-document-2-5364327192501197089 1.png"
              alt="Реклама и сотрудничество"
              width={3882}
              height={608}
              className={`${styles.profileQuickButtonImg} ${styles.profileQuickButtonImgLift}`}
            />
          </div>

          <div className={styles.profileQuickButtonsRow}>
            <Image
              src="/telegram-cloud-document-2-5364327192501197090 1.png"
              alt="Канал сообщества"
              width={3882}
              height={608}
              className={`${styles.profileQuickButtonImg} ${styles.profileQuickButtonImgLift}`}
            />
            <Link href="/main/about" className={styles.profileQuickButtonLink}>
              <Image
                src="/telegram-cloud-document-2-5364327192501197096 1.png"
                alt="О бренде"
                width={3882}
                height={608}
                className={`${styles.profileQuickButtonImg} ${styles.profileQuickButtonImgBrandShiftLeft} ${styles.profileQuickButtonImgLift} ${styles.profileQuickButtonImgLarge}`}
              />
            </Link>
          </div>
        </div>

        <SpinTimer />
      </div>

      <video
        ref={videoRef}
        className={styles.friendVideo}
        src="/IMG_2304.MP4"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
      />
    </div>
  );
}
