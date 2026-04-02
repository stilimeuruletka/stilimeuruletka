"use client";

import Image from "next/image";
import styles from "../../page.module.css";

type TelegramWebAppUser = {
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

export default function ProfilePage() {
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

  return (
    <div className={styles.friendVideoScreen}>
      <div className={styles.profileAvatarBlockOverlay}>
        <div
          className={`${styles.profileAvatarCircle} ${styles.profileAvatarCircleOverlay}`}
        >
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

      <video
        className={styles.friendVideo}
        src="/IMG_2304.MP4"
        autoPlay
        muted
        loop
        playsInline
      />
    </div>
  );
}
