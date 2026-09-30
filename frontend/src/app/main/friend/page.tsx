"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

async function copyToClipboardFallback(text: string): Promise<boolean> {
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    textarea.style.left = "-1000px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export default function FriendPage() {
  const router = useRouter();

  const [referralLink, setReferralLink] = useState("");
  const [toast, setToast] = useState<{ message: string; variant: "ok" | "error" } | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const { displayName, avatarSrc, initData } = useMemo(() => {
    if (typeof window === "undefined") {
      return { displayName: "@username", avatarSrc: null as string | null, initData: null as string | null };
    }
    const w = window as TelegramSdkWindow;
    const tgUser = w.Telegram?.WebApp?.initDataUnsafe?.user;
    const initDataRaw = w.Telegram?.WebApp?.initData;
    return {
      displayName: tgUser?.username ? `@${tgUser.username}` : "@username",
      avatarSrc: tgUser?.photo_url ?? null,
      initData: typeof initDataRaw === "string" && initDataRaw.length > 10 ? initDataRaw : null
    };
  }, []);

  const showToast = useCallback((message: string, variant: "ok" | "error" = "ok") => {
    if (toastTimerRef.current != null) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToast({ message, variant });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 2500);
  }, []);

  const handleCopyReferral = useCallback(async () => {
    if (!referralLink || typeof window === "undefined") {
      showToast("Ссылка ещё не готова", "error");
      return;
    }

    let copied = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(referralLink);
        copied = true;
      }
    } catch {
      copied = false;
    }

    if (!copied) {
      copied = await copyToClipboardFallback(referralLink);
    }

    if (copied) {
      showToast("Ссылка скопирована 👍", "ok");
      try {
        const w = window as TelegramSdkWindow;
        w.Telegram?.WebApp?.showAlert?.("Реферальная ссылка скопирована");
      } catch {
        /* ignore */
      }
    } else {
      showToast("Не удалось скопировать ссылку", "error");
      try {
        const w = window as TelegramSdkWindow;
        w.Telegram?.WebApp?.showAlert?.("Не удалось скопировать ссылку");
      } catch {
        /* ignore */
      }
    }
  }, [referralLink, showToast]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      if (!initData) return;
      const base = getBackendBase();
      void fetch(`${base}/api/referral/link`, { headers: { "x-telegram-init-data": initData } })
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => {
          const link = (json as { link?: string } | null)?.link;
          if (typeof link === "string" && link.length > 0) {
            setReferralLink(link);
          }
        })
        .catch(() => {});
    }, 0);
    return () => window.clearTimeout(id);
  }, [initData]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current != null) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  return (
    <div className={styles.profileScreen}>
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
        <Image src="/стрелканазад.PNG" alt="Назад" width={104} height={52} className={styles.profileArrow} sizes="52px" quality={80} />
      </Link>

      <Link href="/main/profile" className={`${styles.profileArrowRight} ${styles.profileArrowRightProfile}`} aria-label="Вперёд">
        <Image src="/стрелканазад.PNG" alt="Вперёд" width={104} height={52} className={styles.profileArrow} sizes="52px" quality={80} />
      </Link>

      <div className={`${styles.profileStack} ${styles.friendProfileStack}`}>

        <button
          type="button"
          className={styles.profileInviteButtonOverlay}
          onClick={handleCopyReferral}
          aria-label="Пригласить — скопировать реферальную ссылку"
        >
          <Image
            src="/пригласить-trim.png"
            alt="Пригласить"
            width={440}
            height={132}
            className={styles.profileInviteImageOverlay}
            sizes="240px"
            quality={80}
          />
        </button>

        <div className={styles.profileCenterIcons}>
          <span
            className={`${styles.profileCenterIconWrapper} ${styles.profileCenterIconWrapperRight}`}
            onClick={handleCopyReferral}
            role="button"
            aria-label="Копировать реферальную ссылку"
          >
            <Image
              src="/рефссылка.PNG"
              alt="Реферальная ссылка"
              width={72}
              height={72}
              className={`${styles.profileCenterIcon} ${styles.profileCenterIconRight}`}
              sizes="72px"
              quality={80}
            />
          </span>
          <span
            className={`${styles.profileCenterIconWrapper} ${styles.profileCenterIconWrapperLeft}`}
            onClick={() => router.push("/main/friends")}
            role="button"
            aria-label="Открыть список приглашённых"
          >
            <Image
              src="/стильныедрущья.PNG"
              alt="Стильные друзья"
              width={72}
              height={72}
              className={`${styles.profileCenterIcon} ${styles.profileCenterIconLeft}`}
              sizes="72px"
              quality={80}
            />
          </span>
        </div>

        <Image
          src="/пригласитьвверх.png"
          alt=""
          width={720}
          height={1280}
          className={styles.profileOverlayImage}
          sizes="(max-width: 520px) 100vw, 520px"
          quality={80}
        />
        <span
          className={styles.profileBottomImageWrapper}
          onClick={handleCopyReferral}
          role="button"
          aria-label="Нажмите, чтобы скопировать реферальную ссылку"
        >
          <Image
            src="/IMG_2234.PNG"
            alt="Стильный профиль"
            width={720}
            height={1280}
            className={styles.profileBottomImage}
            priority
            sizes="(max-width: 520px) 100vw, 520px"
            quality={80}
          />
        </span>
      </div>

      {toast && (
        <div
          className={`${styles.copyToast} ${styles.show} ${toast.variant === "error" ? styles.error : ""}`}
          role="status"
          aria-live="polite"
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
