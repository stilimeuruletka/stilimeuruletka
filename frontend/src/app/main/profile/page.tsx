"use client";

import Image from "next/image";
import Link from "next/link";
import styles from "../../page.module.css";

const displayName = "@username";
const avatarSrc: string | null = null;

export default function ProfilePage() {
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
            width={80}
            height={24}
            className={styles.profileInviteImageOverlay}
            priority
          />
        </button>

        <Link href="/main" className={styles.profileArrowLeft}>
          <Image
            src="/стрелканазад.PNG"
            alt="Назад"
            width={52}
            height={26}
            className={styles.profileArrow}
            priority
          />
        </Link>

        <Link href="/main" className={styles.profileArrowRight}>
          <Image
            src="/стрелканазад.PNG"
            alt="Вперёд"
            width={52}
            height={26}
            className={styles.profileArrow}
            priority
          />
        </Link>

        <Image
          src="/IMG_2236.PNG"
          alt="Навигация профиля"
          width={720}
          height={1280}
          className={styles.profileOverlayImage}
          priority
        />
        <Image
          src="/IMG_2234.PNG"
          alt="Стильный профиль"
          width={720}
          height={1280}
          className={styles.profileBottomImage}
          priority
        />
      </div>
    </div>
  );
}
