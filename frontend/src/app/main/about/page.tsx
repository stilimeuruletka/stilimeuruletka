 "use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import styles from "../../page.module.css";

export default function AboutPage() {
  const router = useRouter();
  const [isAlt, setIsAlt] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastToggleAtRef = useRef<number>(0);

  const backgroundSrc = isAlt ? "/IMG_2343.PNG" : "/IMG_2342.PNG";
  const textSrc = isAlt ? "/IMG_2339.PNG" : "/IMG_2338.PNG";
  const buttonSrc = isAlt ? "/IMG_2122.PNG" : "/IMG_2121.PNG";

  const setAltWithThrottle = useCallback((next: boolean) => {
    const now = Date.now();
    if (now - lastToggleAtRef.current < 350) return;
    lastToggleAtRef.current = now;
    setIsAlt(next);
  }, []);

  return (
    <div className={styles.fullScreenPage}>
      <div
        className={styles.fullScreenFrame}
        onWheel={(e) => {
          if (Math.abs(e.deltaY) < 18) return;
          e.preventDefault();
          setAltWithThrottle(e.deltaY > 0);
        }}
        onTouchStart={(e) => {
          const t = e.touches[0];
          if (!t) return;
          touchStartRef.current = { x: t.clientX, y: t.clientY };
        }}
        onTouchEnd={(e) => {
          const start = touchStartRef.current;
          touchStartRef.current = null;
          if (!start) return;
          const t = e.changedTouches[0];
          if (!t) return;
          const dx = t.clientX - start.x;
          const dy = t.clientY - start.y;
          if (Math.abs(dy) < 48 || Math.abs(dy) < Math.abs(dx)) return;
          setAltWithThrottle(dy > 0);
        }}
      >
        <button
          type="button"
          className={styles.aboutNavArrowLeft}
          onClick={() => router.push("/main/profile")}
          aria-label="Назад"
        >
          <Image src="/стрелканазад.PNG" alt="" width={52} height={26} className={styles.aboutNavArrowImage} priority />
        </button>
        <button
          type="button"
          className={styles.aboutNavArrowRight}
          onClick={() => router.push("/main")}
          aria-label="В меню"
        >
          <Image src="/стрелканазад.PNG" alt="" width={52} height={26} className={styles.aboutNavArrowImage} priority />
        </button>
        <div className={`${styles.commonTopHeader} ${styles.aboutTopHeader}`} aria-hidden="true">
          <Image
            src="/белоеглавноеменюрулетка.png"
            alt=""
            width={4052}
            height={1312}
            className={`${styles.commonTopHeaderImage} ${styles.aboutHeaderImage}`}
            priority
            sizes="(max-width: 520px) 100vw, 520px"
            quality={90}
          />
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

        <div className={styles.fullScreenCenterButton} aria-hidden="true">
          <Image src={buttonSrc} alt="" fill className={styles.fullScreenCenterButtonImage} sizes="86px" quality={90} />
        </div>
      </div>
    </div>
  );
}
