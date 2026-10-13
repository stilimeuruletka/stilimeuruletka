"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
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
    WebApp?: TelegramWebApp & {
      initData?: string;
      showAlert?: (message: string) => void;
    };
  };
};

function getBackendBase() {
  const raw = process.env.NEXT_PUBLIC_BACKEND_URL;
  return raw ? raw.replace(/\/+$/, "") : "";
}

function getReferralLinkApiUrl() {
  const base = getBackendBase();
  return base ? `${base}/api/referral/link` : "/api/referral/link";
}

function getInitData() {
  const w = window as TelegramSdkWindow;
  const initData = w.Telegram?.WebApp?.initData;
  return typeof initData === "string" && initData.length > 10 ? initData : null;
}

export default function FriendPage() {
  const router = useRouter();

  let displayName = "@username";
  let avatarSrc: string | null = null;

  if (typeof window !== "undefined") {
    const w = window as TelegramSdkWindow;
    const tgUser = w.Telegram?.WebApp?.initDataUnsafe?.user;

    if (tgUser?.username) {
      displayName = `@${tgUser.username}`;
    }

    if (tgUser?.photo_url) {
      avatarSrc = tgUser.photo_url;
    }
  }

  const [referralLink, setReferralLink] = useState<string>("");
  const [isLoadingReferralLink, setIsLoadingReferralLink] = useState(false);

  const loadReferralLink = useCallback(async () => {
    const initData = getInitData();
    if (!initData) return null;

    setIsLoadingReferralLink(true);
    try {
      const res = await fetch(getReferralLinkApiUrl(), {
        headers: { "x-telegram-init-data": initData }
      });
      if (!res.ok) return null;
      const json = (await res.json().catch(() => null)) as { link?: string } | null;
      const link = typeof json?.link === "string" ? json.link : null;
      if (link) setReferralLink(link);
      return link;
    } catch (e) {
      console.error("[friend] referral link fetch failed", e);
      return null;
    } finally {
      setIsLoadingReferralLink(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadReferralLink().then((link) => {
      if (cancelled || !link) return;
      setReferralLink(link);
    });
    return () => {
      cancelled = true;
    };
  }, [loadReferralLink]);

  const handleCopyReferral = async () => {
    const link = referralLink || (await loadReferralLink());
    if (!link || typeof window === "undefined") {
      const w = window as TelegramSdkWindow;
      w.Telegram?.WebApp?.showAlert?.("Не удалось получить ссылку");
      return;
    }

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(link);
      }

      const w = window as TelegramSdkWindow;
      w.Telegram?.WebApp?.showAlert?.("Реферальная ссылка скопирована");
    } catch {
      const w = window as TelegramSdkWindow;
      w.Telegram?.WebApp?.showAlert?.("Не удалось скопировать ссылку");
    }
  };

  return (
    <div className={styles.placeholderPage}>
      <div className={styles.placeholderFrame}>
        <div className={`${styles.profileStack} ${styles.friendProfileStack}`}>
        <Link href="/main" className={`${styles.profileArrow} ${styles.profileArrowLeft}`} aria-label="Назад">
          <Image
            src="/стрелканазад.PNG"
            alt="Назад"
            width={104}
            height={52}
            className={styles.profileArrow}
            priority
            sizes="52px"
            quality={80}
          />
        </Link>

        <div className={`${styles.profileAvatarBlock} ${styles.profileAvatarBlockOverlay}`}>
          <div className={styles.profileAvatarCircle}>
            {avatarSrc ? (
              <Image
                src={avatarSrc}
                alt="Аватар"
                width={120}
                height={120}
                className={styles.profileAvatarImage}
              />
            ) : null}
          </div>
          <div className={styles.profileUsername}>{displayName}</div>
        </div>

        <button type="button" className={styles.profileInviteButtonOverlay}>
          <Image
            src="/пригласить-trim.png"
            alt="Пригласить"
            width={600}
            height={180}
            className={styles.profileInviteImageOverlay}
            priority
          />
        </button>

        <div className={styles.profileCenterIcons}>
          <Image
            src="/рефссылка.PNG"
            alt="Реферальная ссылка"
            width={144}
            height={144}
            className={`${styles.profileCenterIcon} ${styles.profileCenterIconRight}`}
            onClick={handleCopyReferral}
            aria-disabled={isLoadingReferralLink}
          />
          <Image
            src="/стильныедрущья.PNG"
            alt="Стильные друзья"
            width={144}
            height={144}
            className={`${styles.profileCenterIcon} ${styles.profileCenterIconLeft}`}
            onClick={() => router.push("/main/friends")}
          />
        </div>

        <Link href="/main/how-to-play" className={`${styles.profileArrow} ${styles.profileArrowRight}`} aria-label="Вперёд">
          <Image
            src="/стрелканазад.PNG"
            alt="Вперёд"
            width={104}
            height={52}
            className={styles.profileArrow}
            priority
            sizes="52px"
            quality={80}
          />
        </Link>

        <Image
          src="/IMG_2236.PNG"
          alt="Навигация профиля"
          width={1440}
          height={2560}
          className={styles.profileOverlayImage}
          priority
        />
        <Image
          src="/IMG_2234.PNG"
          alt="Стильный профиль"
          width={1440}
          height={2560}
          className={styles.profileBottomImage}
          priority
        />
      </div>
      </div>
    </div>
  );
}
