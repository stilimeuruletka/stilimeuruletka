"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "../../page.module.css";

type TgUser = {
  username?: string;
  photo_url?: string;
};

export default function ProfilePage() {
  const [user, setUser] = useState<TgUser | null>(null);

  useEffect(() => {
    const webApp = (window as any).Telegram?.WebApp;
    const tgUser = webApp?.initDataUnsafe?.user;
    if (tgUser) {
      setUser({ username: tgUser.username, photo_url: tgUser.photo_url });
    }
  }, []);

  const displayName = user?.username ? `@${user.username}` : "@username";
  const avatarSrc = user?.photo_url ?? null;

  return (
    <div className={styles.screen}>
      <main className={`${styles.container} ${styles.profileContainer}`}>
        <div className={styles.profileCard}>
          <Image
            src="/профиль1.png"
            alt="Профиль"
            width={720}
            height={1280}
            className={styles.profileCardImage}
            priority
          />

          <div className={styles.profileLayout}>
            <div className={styles.profileHeader}>
          <Link href="/main" className={styles.profileHeaderSide}>
            <Image
              src="/стрелканазад.PNG"
              alt="В главное меню"
              width={64}
              height={32}
              className={styles.profileBackArrow}
            />
            <div className={styles.profileHeaderTextLeft}>
              В ГЛАВНОЕ
              <br />
              МЕНЮ
            </div>
          </Link>

          <div className={styles.profileAvatarBlock}>
            <div className={styles.profileAvatarCircle}>
              {avatarSrc && (
                <Image src={avatarSrc} alt="Аватар" width={96} height={96} className={styles.profileAvatarImage} />
              )}
            </div>
            <div className={styles.profileUsername}>{displayName}</div>
          </div>

          <div className={styles.profileHeaderSideRight}>
            <div className={styles.profileHeaderTextRight}>
              СТИЛЬНАЯ
              <br />
              РУЛЕТКА
            </div>
          </div>
        </div>

        <p className={styles.profileLead}>
          ПРИГЛАШАЙ СТИЛЬНЫХ ДРУЗЕЙ И ПОЛУЧАЙ
          <br />
          ДОПОЛНИТЕЛЬНЫЕ СПИНЫ ЗА КАЖДОГО
        </p>

        <button type="button" className={styles.profileInviteButton}>
          <Image
            src="/пригласить.PNG"
            alt="Пригласить"
            width={720}
            height={160}
            className={styles.profileInviteImage}
            priority
          />
        </button>

        <p className={styles.profileSubtext}>1 ДРУГ — 1 ДОПОЛНИТЕЛЬНЫЙ СПИН</p>

        <div className={styles.profileLinks}>
          <div className={styles.profileLinkRow}>
            <Image src="/черточка.PNG" alt="Линия" width={80} height={8} className={styles.profileDash} />
            <span className={styles.profileLinkLabel}>РЕФЕРАЛЬНАЯ ССЫЛКА</span>
            <Image src="/рефссылка.PNG" alt="Реферальная ссылка" width={28} height={28} className={styles.profileIcon} />
          </div>

          <div className={styles.profileLinkRow}>
            <Image src="/черточка.PNG" alt="Линия" width={80} height={8} className={styles.profileDash} />
            <span className={styles.profileLinkLabel}>СТИЛЬНЫЕ ДРУЗЬЯ</span>
            <Image
              src="/стильныедрущья.PNG"
              alt="Стильные друзья"
              width={28}
              height={28}
              className={styles.profileIcon}
            />
          </div>
        </div>
          </div>
        </div>
      </main>
    </div>
  );
}
