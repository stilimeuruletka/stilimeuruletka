"use client";

import Image from "next/image";
import styles from "../../page.module.css";

export default function ProfilePage() {
  return (
    <div className={styles.profileScreen}>
      <div className={styles.profileStack}>
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
