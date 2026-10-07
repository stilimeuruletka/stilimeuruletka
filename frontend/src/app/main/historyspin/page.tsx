"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
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
    WebApp?: TelegramWebApp & { initData?: string };
  };
};

type SpinHistoryItem = {
  spin_id: string;
  created_at: string;
  win: boolean;
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

function getTgUserId() {
  const w = window as TelegramSdkWindow;
  const id = w.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  return typeof id === "number" && Number.isFinite(id) ? id : null;
}

function getLocalSpinHistoryKey() {
  const id = typeof window !== "undefined" ? getTgUserId() : null;
  return `stilimeuruletka_spin_history:${id ?? "anon"}`;
}

function readLocalSpinHistory(): SpinHistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(getLocalSpinHistoryKey());
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    const list = Array.isArray(parsed) ? parsed : [];
    return list
      .filter(
        (x): x is SpinHistoryItem =>
          !!x &&
          typeof x === "object" &&
          typeof (x as Record<string, unknown>).spin_id === "string" &&
          typeof (x as Record<string, unknown>).created_at === "string" &&
          typeof (x as Record<string, unknown>).win === "boolean"
      )
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, 120);
  } catch {
    return [];
  }
}

const PRIZE_IMAGES: Array<{ match: (t: string) => boolean; src: string }> = [
  { match: (t) => t.includes("wb 500"), src: "/историясертвб500.jpg" },
  { match: (t) => t.includes("зя 300"), src: "/историязя300.jpg" },
  { match: (t) => t.includes("зя 500"), src: "/историяподарочныйсерт500.jpg" },
  { match: (t) => t.includes("зя 1000") || t.includes("1.000"), src: "/историяЗЯ1000.jpg" },
  { match: (t) => t.includes("бренда"), src: "/историясекретныйпотбренда.jpg" },
  { match: (t) => t.includes("бьюти") || t.includes("бью"), src: "/историясекретбп.jpg" },
  { match: (t) => t.includes("+3") || t.includes("3 спина"), src: "/история3спина.jpg" },
  { match: (t) => t.includes("+2") || t.includes("2 спина"), src: "/2спина.jpg" },
  { match: (t) => t.includes("+1") || t.includes("1 спин"), src: "/история1спин.jpg" }
];

function getPrizeImage(it: SpinHistoryItem): string | null {
  if (!it.win || !it.prize_title) return null;
  const t = it.prize_title.toLowerCase();
  for (const p of PRIZE_IMAGES) {
    if (p.match(t)) return p.src;
  }
  return null;
}

export default function HistorySpinPage() {
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<SpinHistoryItem[]>([]);

  useEffect(() => {
    const initData = getInitData();
    if (!initData) {
      const isLocalhost = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.hostname.includes("192.168."));
      const id = window.setTimeout(() => {
        if (isLocalhost || process.env.NODE_ENV === "development") {
          const now = Date.now();
          setHistoryLoading(false);
          setHistoryError(null);
          setHistoryItems([
            { spin_id: `demo-1-${now}`, created_at: new Date(now - 3_600_000).toISOString(), win: true, prize_title: "Сертификат WB 500₽", prize_value: 500 },
            { spin_id: `demo-2-${now}`, created_at: new Date(now - 3_550_000).toISOString(), win: true, prize_title: "+3 спина", prize_value: null },
            { spin_id: `demo-3-${now}`, created_at: new Date(now - 3_500_000).toISOString(), win: false, prize_title: null, prize_value: null },
            { spin_id: `demo-4-${now}`, created_at: new Date(now - 2_100_000).toISOString(), win: true, prize_title: "Сертификат ЗЯ 300₽", prize_value: 300 },
            { spin_id: `demo-5-${now}`, created_at: new Date(now - 2_050_000).toISOString(), win: true, prize_title: "Секретный бьюти продукт от бренда", prize_value: null },
            { spin_id: `demo-6-${now}`, created_at: new Date(now - 600_000).toISOString(), win: true, prize_title: "+1 спин", prize_value: null }
          ]);
          return;
        }
        setHistoryError("Откройте приложение через Telegram");
        setHistoryItems([]);
      }, 0);
      return () => window.clearTimeout(id);
    }
    const base = getBackendBase();
    const controller = new AbortController();
    const id = window.setTimeout(() => {
      setHistoryLoading(true);
      setHistoryError(null);
      void fetch(`${base}/api/spins/history?limit=120`, {
        headers: { "x-telegram-init-data": initData },
        cache: "no-store",
        signal: controller.signal
      })
        .then(async (res) => {
          const json = (await res.json().catch(() => null)) as
            | { items?: SpinHistoryItem[]; spins?: SpinHistoryItem[] }
            | { message?: string }
            | null;
          if (!res.ok) {
            const msg = (json && "message" in json && typeof json.message === "string" && json.message) || "Не удалось загрузить историю";
            throw new Error(msg);
          }
          const items = (() => {
            const fromItems = json && typeof json === "object" && Array.isArray((json as { items?: unknown }).items) ? (json as { items: SpinHistoryItem[] }).items : null;
            if (fromItems) return fromItems;
            const fromSpins = json && typeof json === "object" && Array.isArray((json as { spins?: unknown }).spins) ? (json as { spins: SpinHistoryItem[] }).spins : null;
            return fromSpins ?? [];
          })();
          const local = items.length === 0 ? readLocalSpinHistory() : [];
          setHistoryItems(local.length ? local : items);
        })
        .catch((e) => {
          if (e instanceof DOMException && e.name === "AbortError") return;
          const local = readLocalSpinHistory();
          if (local.length) {
            setHistoryError(null);
            setHistoryItems(local);
            return;
          }
          setHistoryError(e instanceof Error ? e.message : "Не удалось загрузить историю");
          setHistoryItems([]);
        })
        .finally(() => setHistoryLoading(false));
    }, 0);
    return () => {
      window.clearTimeout(id);
      controller.abort();
    };
  }, []);

  const _ = useMemo(() => isClient, [isClient]);

  return (
    <div className={styles.historySpinPage}>
      <div className={styles.historySpinFrame}>
        <div className={styles.historySpinTop}>
          <Image
            src="/историяспиноввверх.png"
            alt=""
            width={540}
            height={220}
            priority
            sizes="(max-width: 520px) 84vw, 84vw"
            className={styles.historySpinTopImage}
          />
        </div>

        <Link href="/main/history" className={styles.historySpinBackButton} aria-label="Назад к истории">
          <Image src="/стрелканазад.PNG" alt="Назад" width={104} height={52} className={styles.historySpinBackIcon} sizes="52px" quality={80} />
        </Link>
        <Link href="/main/spin" className={styles.historySpinNextButton} aria-label="К рулетке">
          <Image src="/стрелканазад.PNG" alt="Далее" width={104} height={52} className={styles.historySpinNextIcon} sizes="52px" quality={80} />
        </Link>

        <div className={styles.historySpinContent}>
          {historyLoading && <div className={styles.profileHistoryEmpty}>ЗАГРУЗКА...</div>}
          {!historyLoading && historyError && <div className={styles.profileHistoryEmpty}>НЕ УДАЛОСЬ ЗАГРУЗИТЬ ИСТОРИЮ</div>}
          {!historyLoading && !historyError && historyItems.length === 0 && (
            <div className={styles.profileHistoryEmpty}>ПОКА НЕТ ЗАПИСЕЙ</div>
          )}
          {!historyLoading && !historyError && historyItems.length > 0 && (
            <>
              <button
                type="button"
                className={styles.historySpinNavButton}
                onClick={() => {
                  document.getElementById("history-spin-scroll")?.scrollBy({ top: -520, behavior: "smooth" });
                }}
                aria-label="Прокрутить вверх"
              >
                <Image src="/стрелкаистория.png" alt="Вверх" width={44} height={22} className={styles.historySpinNavButtonUp} sizes="22px" quality={80} />
              </button>
              <div id="history-spin-scroll" className={styles.historySpinGrid}>
                {historyItems.map((it) => {
                  const prizeImg = getPrizeImage(it);
                  return (
                    <div
                      key={it.spin_id}
                      className={`${styles.historySpinTile} ${prizeImg ? "" : styles.historySpinTileEmpty}`}
                    >
                      {prizeImg ? (
                        <Image
                          src={prizeImg}
                          alt={it.prize_title ?? ""}
                          fill
                          sizes="(max-width: 520px) 100vw, 520px"
                          quality={95}
                          className={`${styles.historySpinTileImage} ${it.prize_title && /спин/i.test(it.prize_title) ? styles.historySpinTileImageSpin : ""}`}
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                className={styles.historySpinNavButton}
                onClick={() => {
                  document.getElementById("history-spin-scroll")?.scrollBy({ top: 520, behavior: "smooth" });
                }}
                aria-label="Прокрутить вниз"
              >
                <Image src="/стрелкаистория.png" alt="Вниз" width={44} height={22} className={styles.historySpinNavButtonDown} sizes="22px" quality={80} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}