"use client";

import Image from "next/image";
import Link from "next/link";
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
    WebApp?: TelegramWebApp;
  };
};

export default function HowToPlayPlaceholderPage() {
  const storageKey = "how_to_play_seen_v1";
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const overlayCardRef = useRef<HTMLDivElement | null>(null);
  const [{ displayName, avatarSrc }] = useState(() => {
    if (typeof window === "undefined") {
      return { displayName: "@username", avatarSrc: null as string | null };
    }

    const w = window as TelegramSdkWindow;
    const tgUser = w.Telegram?.WebApp?.initDataUnsafe?.user;

    return {
      displayName: tgUser?.username ? `@${tgUser.username}` : "@username",
      avatarSrc: tgUser?.photo_url ?? null
    };
  });
  const [seen, setSeen] = useState<[boolean, boolean, boolean]>(() => {
    if (typeof window === "undefined") {
      return [false, false, false];
    }

    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        return [false, false, false];
      }

      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed) || parsed.length !== 3) {
        return [false, false, false];
      }

      return [Boolean(parsed[0]), Boolean(parsed[1]), Boolean(parsed[2])];
    } catch {
      return [false, false, false];
    }
  });

  const overlaySrc = useMemo(() => {
    if (activeIndex === 0) {
      return "/блюр1.jpg";
    }
    if (activeIndex === 1) {
      return "/IMG_2086.PNG";
    }
    if (activeIndex === 2) {
      return "/IMG_2105.PNG";
    }
    return null;
  }, [activeIndex]);

  const closeOverlay = useCallback(() => {
    if (activeIndex == null) {
      return;
    }

    setSeen((prev) => {
      const next: [boolean, boolean, boolean] = [...prev] as [boolean, boolean, boolean];
      next[activeIndex] = true;
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {}
      return next;
    });
    setActiveIndex(null);
  }, [activeIndex]);

  useEffect(() => {
    if (activeIndex == null) {
      return;
    }

    const handlePointerDown = () => {
      closeOverlay();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeOverlay();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeIndex, closeOverlay]);

  return (
    <div className={styles.placeholderPage}>
      <div className={styles.placeholderFrame}>
        <div className={styles.commonTopHeader} aria-hidden="true">
          <Image
            src="/главноеменюрулеткакрасный.png"
            alt=""
            width={4052}
            height={1312}
            className={styles.commonTopHeaderImage}
            priority
            sizes="(max-width: 520px) 100vw, 520px"
            quality={90}
          />
          <div className={styles.commonTopHeaderUser}>
            <div className={styles.commonTopHeaderAvatar}>
              {avatarSrc && <img src={avatarSrc} alt="" width={44} height={44} loading="lazy" draggable="false" />}
            </div>
            <div className={styles.commonTopHeaderName}>{displayName}</div>
          </div>
        </div>
        <Link href="/main" className={`${styles.placeholderBackLink} ${styles.howToPlayNavLeft}`} aria-label="Назад в меню">
          <Image
            src="/стрелканазад.PNG"
            alt="Назад"
            width={52}
            height={26}
            className={`${styles.placeholderBackIcon} ${styles.placeholderBackIconSmall}`}
            priority
          />
        </Link>
        <Link href="/main/profile" className={`${styles.placeholderBackLink} ${styles.howToPlayNavRight}`} aria-label="Вперёд">
          <Image
            src="/стрелканазад.PNG"
            alt="Вперёд"
            width={52}
            height={26}
            className={`${styles.placeholderBackIcon} ${styles.placeholderBackIconSmall} ${styles.howToPlayNavRightIcon}`}
            priority
          />
        </Link>
        <Image
          src="/IMG_2381.PNG"
          alt="Как играть"
          fill
          className={`${styles.howToPlayCompositeImage} ${activeIndex == null ? "" : styles.howToPlayCompositeImageBlur}`}
          priority
        />
        <div className={styles.howToPlayRulesRow}>
          <button type="button" className={styles.howToPlayRuleButton} onClick={() => setActiveIndex(0)} aria-label="Открыть описание 1">
            <Image
              src={seen[0] ? "/telegram-cloud-document-2-5355247322399807662 1.svg" : "/правилакруг.png"}
              alt=""
              width={22}
              height={22}
              className={styles.howToPlayRuleIcon}
              sizes="24px"
              quality={100}
            />
          </button>
          <button type="button" className={styles.howToPlayRuleButton} onClick={() => setActiveIndex(1)} aria-label="Открыть описание 2">
            <Image
              src={seen[1] ? "/telegram-cloud-document-2-5355247322399807662 1.svg" : "/правилакруг.png"}
              alt=""
              width={22}
              height={22}
              className={styles.howToPlayRuleIcon}
              sizes="24px"
              quality={100}
            />
          </button>
          <button type="button" className={styles.howToPlayRuleButton} onClick={() => setActiveIndex(2)} aria-label="Открыть описание 3">
            <Image
              src={seen[2] ? "/telegram-cloud-document-2-5355247322399807662 1.svg" : "/правилакруг.png"}
              alt=""
              width={22}
              height={22}
              className={styles.howToPlayRuleIcon}
              sizes="24px"
              quality={100}
            />
          </button>
        </div>

        {overlaySrc && (
          <div className={styles.howToPlayOverlay} role="dialog" aria-modal="true">
            <div
              className={styles.howToPlayOverlayCard}
              ref={overlayCardRef}
            >
              <Image src={overlaySrc} alt="" fill className={styles.howToPlayOverlayImage} priority />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
