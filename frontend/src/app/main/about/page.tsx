 "use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "../../page.module.css";

export default function AboutPage() {
  const router = useRouter();
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
