"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
      showAlert?: (message: string) => void;
    };
  };
};

export default function FriendPage() {
  const router = useRouter();

  let displayName = "@username";
  let avatarSrc: string | null = null;
  let referralLink = "";

  if (typeof window !== "undefined") {
    const w = window as TelegramSdkWindow;
    const tgUser = w.Telegram?.WebApp?.initDataUnsafe?.user;

    if (tgUser?.username) {
      displayName = `@${tgUser.username}`;
    }

    if (tgUser?.photo_url) {
      avatarSrc = tgUser.photo_url;
    }

    const userIdPart = tgUser?.id ? String(tgUser.id) : tgUser?.username ?? "";
    if (userIdPart) {
      referralLink = `${window.location.origin}/?ref=${encodeURIComponent(userIdPart)}`;
    }
  }

  const handleCopyReferral = async () => {
    if (!referralLink || typeof window === "undefined") {
      return;
    }

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(referralLink);
      }

      const w = window as TelegramSdkWindow;
      w.Telegram?.WebApp?.showAlert?.("Реферальная ссылка скопирована");
    } catch {
      const w = window as TelegramSdkWindow;
      w.Telegram?.WebApp?.showAlert?.("Не удалось скопировать ссылку");
    }
  };

  return (
    <div className={styles.profileScreen}>
      <div className={`${styles.profileStack} ${styles.friendProfileStack}`}>
        <Link href="/main/profile" className={`${styles.friendNavArrow} ${styles.friendNavArrowLeft}`} aria-label="Назад">
          <Image
            src="/стрелканазад.PNG"
            alt="Назад"
            width={104}
            height={52}
            className={`${styles.profileArrow} ${styles.friendNavArrowImg}`}
            priority
            sizes="52px"
            quality={80}
          />
        </Link>

        <div className={`${styles.profileAvatarBlock} ${styles.friendAvatarBlock}`}>
          <div className={`${styles.profileAvatarCircle} ${styles.friendAvatarCircle}`}>
            {avatarSrc ? (
              <Image
                src={avatarSrc}
                alt="Аватар"
                width={120}
                height={120}
                className={`${styles.profileAvatarImage} ${styles.friendAvatarImg}`}
              />
            ) : null}
          </div>
          <div className={`${styles.profileUsername} ${styles.friendUsername}`}>{displayName}</div>
        </div>

        <button type="button" className={`${styles.profileInviteButtonOverlay} ${styles.friendInviteButton}`}>
          <Image
            src="/пригласить-trim.png"
            alt="Пригласить"
            width={600}
            height={180}
            className={`${styles.profileInviteImageOverlay} ${styles.friendInviteImg}`}
            priority
          />
        </button>

        <Link href="/main/how-to-play" className={`${styles.friendNavArrow} ${styles.friendNavArrowRight}`} aria-label="Вперёд">
          <Image
            src="/стрелканазад.PNG"
            alt="Вперёд"
            width={104}
            height={52}
            className={`${styles.profileArrow} ${styles.friendNavArrowImg} ${styles.friendNavArrowImgFlip}`}
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
          className={`${styles.profileOverlayImage} ${styles.friendOverlayImg}`}
          priority
        />
        <Image
          src="/IMG_2234.PNG"
          alt="Стильный профиль"
          width={1440}
          height={2560}
          className={`${styles.profileBottomImage} ${styles.friendBottomImg}`}
          priority
        />
      </div>
    </div>
  );
}
