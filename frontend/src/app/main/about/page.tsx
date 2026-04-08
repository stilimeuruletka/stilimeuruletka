 "use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
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

export default function AboutPage() {
  const router = useRouter();
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
  const [isAlt, setIsAlt] = useState(false);

  const backgroundSrc = isAlt ? "/IMG_2343.PNG" : "/IMG_2342.PNG";
  const textSrc = isAlt ? "/IMG_2339.PNG" : "/IMG_2338.PNG";
  const buttonSrc = isAlt ? "/IMG_2122.PNG" : "/IMG_2121.PNG";

  return (
    <div className={styles.fullScreenPage}>
      <button
        type="button"
        className={styles.fullScreenBackButton}
        onClick={() => router.push("/main/profile")}
        aria-label="Назад"
      />

      <div className={styles.fullScreenFrame}>
        <div className={styles.aboutTopLeftHeader} aria-hidden="true">
          <Image
            src="/белоеглавноеменюрулетка.png"
            alt=""
            width={4052}
            height={1312}
            className={styles.aboutTopLeftHeaderImage}
            priority
            sizes="(max-width: 520px) 100vw, 520px"
            quality={90}
          />
          <div className={styles.aboutTopLeftHeaderUser}>
            <div className={styles.commonTopHeaderAvatar}>
              {avatarSrc && <img src={avatarSrc} alt="" width={44} height={44} loading="lazy" draggable="false" />}
            </div>
            <div className={styles.commonTopHeaderName}>{displayName}</div>
          </div>
        </div>
        <Image
          src={backgroundSrc}
          alt="О бренде"
          fill
          className={styles.fullScreenImage}
          priority
          sizes="(max-width: 520px) 100vw, 520px"
          quality={90}
        />
        <Image
          src={textSrc}
          alt="Текст"
          fill
          className={styles.fullScreenOverlayImage}
          sizes="(max-width: 520px) 100vw, 520px"
          quality={90}
        />

        <button
          type="button"
          className={styles.fullScreenCenterButton}
          onClick={() => setIsAlt((v) => !v)}
          aria-label="Переключить"
        >
          <Image src={buttonSrc} alt="" fill className={styles.fullScreenCenterButtonImage} sizes="86px" quality={90} />
        </button>
      </div>
    </div>
  );
}
