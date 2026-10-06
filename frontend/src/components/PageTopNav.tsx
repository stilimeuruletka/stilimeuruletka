"use client";

import Image from "next/image";
import Link from "next/link";
import styles from "../app/page.module.css";

export type PageTopNavCenterImg = "red-main-roulette" | "white-main-roulette" | "circle-top";

type PageTopNavProps = {
  /** Какая центральная картинка-хедер */
  center: PageTopNavCenterImg;
  /** Куда ведёт стрелка ← слева */
  backHref: string;
  /** Куда ведёт стрелка → справа */
  nextHref: string;
  /** z-index (по умолчанию 60) */
  zIndex?: number;
  /** Центральный img приподнят выше top (отступ сверху px; по умолчанию 112) */
  top?: number;
};

/**
 * ═══════════════════════════════════════════════════════════════
 * ЕДИНЫЙ ХЕДЕР ДЛЯ ВСЕХ СТРАНИЦ — ТРИ ЭЛЕМЕНТА:
 *   [← стрелка left]   [ЦЕНТРАЛЬНАЯ КАРТИНКА 1040×336]   [→ стрелка right]
 * ═══════════════════════════════════════════════════════════════
 * Все 3 элемента position:absolute с ФИКСИРОВАННЫМИ top/left/right в px.
 * Никогда больше не "гуляют" и не прыгают, не ломаются после правок других страниц.
 */
export default function PageTopNav({
  center,
  backHref,
  nextHref,
  zIndex = 60,
  top = 112,
}: PageTopNavProps) {
  const centerSrc =
    center === "red-main-roulette"
      ? "/главноеменюрулеткакрасный.png"
      : center === "white-main-roulette"
        ? "/белоеглавноеменюрулетка.png"
        : "/вверхкругл.png";

  const styleOverride: React.CSSProperties = {
    top: `${top}px`,
    zIndex,
  } as const;

  return (
    <div className={styles.pageTopNav} style={styleOverride}>
      {/* ← СТРЕЛКА СЛЕВА: top=0 относительно .pageTopNav, left=0 */}
      <Link href={backHref} className={`${styles.pageTopNavArrow} ${styles.pageTopNavArrowLeft}`} aria-label="Назад">
        <Image
          src="/стрелканазад.PNG"
          alt="Назад"
          width={104}
          height={52}
          className={styles.pageTopNavArrowImg}
          sizes="52px"
          quality={80}
        />
      </Link>

      {/* ══════════ ЦЕНТРАЛЬНАЯ КАРТИНКА-ХЕДЕР (ровно по центру) ══════════ */}
      <Image
        src={centerSrc}
        alt=""
        width={1040}
        height={336}
        className={styles.pageTopNavCenterImg}
        priority
        sizes="(max-width: 520px) 100vw, 520px"
        quality={80}
      />

      {/* → СТРЕЛКА СПРАВА: scaleX(-1) отраженная, top=0, right=0 */}
      <Link href={nextHref} className={`${styles.pageTopNavArrow} ${styles.pageTopNavArrowRight}`} aria-label="Вперёд">
        <Image
          src="/стрелканазад.PNG"
          alt="Вперёд"
          width={104}
          height={52}
          className={`${styles.pageTopNavArrowImg} ${styles.pageTopNavArrowImgFlip}`}
          sizes="52px"
          quality={80}
        />
      </Link>
    </div>
  );
}
