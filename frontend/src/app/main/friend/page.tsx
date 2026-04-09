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

      <Link href="/main" className={`${styles.profileArrowLeft} ${styles.profileArrowLeftProfile}`} aria-label="Назад в меню">
        <Image src="/стрелканазад.PNG" alt="Назад" width={52} height={26} className={styles.profileArrow} />
      </Link>

      <Link href="/main/profile" className={`${styles.profileArrowRight} ${styles.profileArrowRightProfile}`} aria-label="Вперёд">
        <Image src="/стрелканазад.PNG" alt="Вперёд" width={52} height={26} className={styles.profileArrow} />
      </Link>

      <div className={`${styles.profileStack} ${styles.friendProfileStack}`}>

        <button type="button" className={styles.profileInviteButtonOverlay}>
          <Image
            src="/пригласить-trim.png"
            alt="Пригласить"
            width={240}
            height={72}
            className={styles.profileInviteImageOverlay}
            sizes="240px"
            quality={90}
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

        <Image
          src="/пригласитьвверх.png"
          alt=""
          width={720}
          height={1280}
          className={styles.profileOverlayImage}
          sizes="(max-width: 520px) 100vw, 520px"
          quality={90}
        />
        <Image
          src="/IMG_2234.PNG"
          alt="Стильный профиль"
          width={720}
          height={1280}
          className={styles.profileBottomImage}
          priority
          sizes="(max-width: 520px) 100vw, 520px"
          quality={90}
        />
      </div>
    </div>
  );
}
