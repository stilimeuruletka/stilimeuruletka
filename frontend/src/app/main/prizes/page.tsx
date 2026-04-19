"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "../../page.module.css";

type TelegramSdkWindow = Window & {
  Telegram?: {
    WebApp?: { initData?: string };
  };
};

type WinItem = {
  spin_id: string;
  created_at: string;
  prize_title: string | null;
  prize_value: number | null;
};

function getBackendBase() {
  const raw = process.env.NEXT_PUBLIC_BACKEND_URL;
  return raw ? raw.replace(/\/+$/, "") : "";
}

function getInitData() {
  const w = window as TelegramSdkWindow;
  const initData = w.Telegram?.WebApp?.initData;
  return typeof initData === "string" && initData.length > 10 ? initData : null;
}

export default function PrizesPage() {
  const [wins, setWins] = useState<WinItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  const hasWins = wins.length > 0;

  const load = useCallback(async () => {
    const initData = getInitData();
    if (!initData) {
      setWins([]);
      setLoaded(true);
      return;
    }

    const base = getBackendBase();
    const res = await fetch(`${base}/api/wins?limit=9`, { headers: { "x-telegram-init-data": initData } }).catch(() => null);
    if (!res || !res.ok) {
      setWins([]);
      setLoaded(true);
      return;
    }
    const json = (await res.json().catch(() => null)) as { wins?: WinItem[] } | null;
    setWins(Array.isArray(json?.wins) ? json!.wins! : []);
    setLoaded(true);
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(id);
  }, [load]);

  const gridItems = useMemo(() => {
    const items: Array<WinItem | null> = [];
    for (let i = 0; i < 9; i += 1) items.push(wins[i] ?? null);
    return items;
  }, [wins]);

  return (
    <div className={styles.placeholderPage}>
      <div className={styles.placeholderFrame}>
        <Link href="/main" className={styles.placeholderBackLink} aria-label="Назад в меню">
          <Image src="/стрелканазад.PNG" alt="Назад" width={52} height={26} className={`${styles.placeholderBackIcon} ${styles.placeholderBackIconSmall}`} priority />
        </Link>

        <div className={styles.prizesHeader} aria-hidden="true">
          <Image
            src="/выигрышвверх.PNG"
            alt=""
            width={3900}
            height={1200}
            className={styles.prizesHeaderImage}
            priority
            sizes="(max-width: 520px) 100vw, 520px"
            quality={90}
          />
        </div>

        <div className={styles.prizesBody}>
          {!loaded && <div className={styles.prizesLoading}>ЗАГРУЗКА…</div>}

          {loaded && !hasWins && (
            <Image
              src="/белыекарточкипусто.png"
              alt=""
              width={2700}
              height={3360}
              className={styles.prizesEmptyImage}
              priority
              sizes="(max-width: 520px) 100vw, 520px"
              quality={90}
            />
          )}

          {loaded && hasWins && (
            <div className={styles.prizesGridWrap}>
              <Image
                src="/белыекарточкипусто.png"
                alt=""
                fill
                className={styles.prizesGridBg}
                priority
                sizes="(max-width: 520px) 100vw, 520px"
                quality={90}
              />
              <div className={styles.prizesGrid}>
                {gridItems.map((item, idx) => (
                  <div key={idx} className={styles.prizesCard}>
                    {item ? (
                      <>
                        <div className={styles.prizesCardTitle}>{item.prize_title ?? "Приз"}</div>
                        {item.prize_value != null && <div className={styles.prizesCardValue}>{item.prize_value}</div>}
                      </>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
