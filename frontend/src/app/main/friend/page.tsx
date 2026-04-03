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
      <div className={styles.profileStack}>
        <div className={styles.profileAvatarBlockOverlay}>
          <div className={`${styles.profileAvatarCircle} ${styles.profileAvatarCircleOverlay}`}>
            {avatarSrc && (
              <Image
                src={avatarSrc}
                alt="Аватар"
                width={88}
                height={88}
                className={styles.profileAvatarImage}
              />
            )}
          </div>
          <div className={styles.profileUsername}>{displayName}</div>
        </div>

        <button type="button" className={styles.profileInviteButtonOverlay}>
          <Image
            src="/пригласить-trim.png"
            alt="Пригласить"
            width={240}
            height={72}
            className={styles.profileInviteImageOverlay}
            sizes="240px"
            quality={70}
          />
        </button>

        <div className={styles.profileCenterIcons}>
          <Image
            src="/рефссылка.PNG"
            alt="Реферальная ссылка"
            width={72}
            height={72}
            className={`${styles.profileCenterIcon} ${styles.profileCenterIconRight}`}
            onClick={handleCopyReferral}
          />
          <Image
            src="/стильныедрущья.PNG"
            alt="Стильные друзья"
            width={72}
            height={72}
            className={`${styles.profileCenterIcon} ${styles.profileCenterIconLeft}`}
            onClick={() => router.push("/main/friend")}
          />
        </div>

        <Link href="/main" className={styles.profileArrowLeft}>
          <Image
            src="/стрелканазад.PNG"
            alt="Назад"
            width={52}
            height={26}
            className={styles.profileArrow}
          />
        </Link>

        <Link href="/main/profile" className={styles.profileArrowRight}>
          <Image
            src="/стрелканазад.PNG"
            alt="Вперёд"
            width={52}
            height={26}
            className={styles.profileArrow}
          />
        </Link>

        <Image
          src="/IMG_2236.PNG"
          alt="Навигация профиля"
          width={720}
          height={1280}
          className={styles.profileOverlayImage}
          sizes="(max-width: 520px) 100vw, 520px"
          quality={70}
        />
        <Image
          src="/IMG_2234.PNG"
          alt="Стильный профиль"
          width={720}
          height={1280}
          className={styles.profileBottomImage}
          priority
          sizes="(max-width: 520px) 100vw, 520px"
          quality={70}
        />
      </div>
    </div>
  );
}
