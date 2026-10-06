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
      .slice(0, 80);
  } catch {
    return [];
  }
}

export default function HistoryPage() {
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
            { spin_id: `demo-${now}-1`, created_at: new Date(now - 3_600_000).toISOString(), win: true, prize_title: "Демо", prize_value: null },
            { spin_id: `demo-${now}-2`, created_at: new Date(now - 2_100_000).toISOString(), win: false, prize_title: null, prize_value: null },
            { spin_id: `demo-${now}-3`, created_at: new Date(now - 600_000).toISOString(), win: true, prize_title: "Демо", prize_value: null }
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
      void fetch(`${base}/api/spins/history?limit=80`, {
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

  const formatHistoryDate = useCallback((iso: string) => {
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return iso;
    return new Intl.DateTimeFormat("ru-RU", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(ms));
  }, []);

  const _ = useMemo(() => isClient, [isClient]);

  return (
    <div className={styles.placeholderPage}>
      <div className={styles.placeholderFrame}>
        <Image src="/историястильныхспинов.PNG" alt="" fill className={styles.fullScreenImage} sizes="100vw" quality={80} />

        <div className={styles.profileHistoryContent}>
          {historyLoading && <div className={styles.profileHistoryEmpty}>ЗАГРУЗКА...</div>}
          {!historyLoading && historyError && <div className={styles.profileHistoryEmpty}>НЕ УДАЛОСЬ ЗАГРУЗИТЬ ИСТОРИЮ</div>}
          {!historyLoading && !historyError && historyItems.length === 0 && (
            <div className={styles.profileHistoryEmpty}>НЕ УДАЛОСЬ ЗАГРУЗИТЬ ИСТОРИЮ</div>
          )}
          {!historyLoading && !historyError && historyItems.length > 0 && (
            <div className={styles.profileHistoryCarouselWrapper}>
              <div id="history-carousel" className={styles.profileHistoryCarousel}>
                {historyItems.map((it) => (
                  <div key={it.spin_id} className={styles.profileHistoryCard}>
                    <div className={styles.profileHistoryCardDate}>{formatHistoryDate(it.created_at)}</div>
                    <div className={styles.profileHistoryCardImageWrapper}>
                      <Image
                        src={it.win ? "/IMG_2805.PNG" : "/проигрыш.PNG"}
                        alt={it.win ? "Победа" : "Поражение"}
                        fill
                        sizes="140px"
                        quality={75}
                        style={{ objectFit: "cover", objectPosition: "top center" }}
                      />
                    </div>
                    <div className={styles.profileHistoryCardResult}>
                      {it.win ? "WOW! ПОБЕДА" : "OOPS...ПОРАЖЕНИЕ"}
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                className={`${styles.profileHistoryArrow} ${styles.profileHistoryArrowLeft}`}
                onClick={() => {
                  document.getElementById('history-carousel')?.scrollBy({ left: -200, behavior: 'smooth' });
                }}
                aria-label="Листать влево"
              >
                <Image src="/стрелканазад.PNG" alt="Влево" width={80} height={40} className={styles.profileHistoryArrowIcon} sizes="40px" quality={80} />
              </button>

              <button
                type="button"
                className={`${styles.profileHistoryArrow} ${styles.profileHistoryArrowRight}`}
                onClick={() => {
                  document.getElementById('history-carousel')?.scrollBy({ left: 200, behavior: 'smooth' });
                }}
                aria-label="Листать вправо"
              >
                <Image src="/стрелканазад.PNG" alt="Вправо" width={80} height={40} className={styles.profileHistoryArrowIcon} sizes="40px" quality={80} />
              </button>
            </div>
          )}
        </div>
        <Link href="/main/profile" className={styles.profileHistoryCloseButton} aria-label="Назад в профиль">
          <Image src="/стрелканазад.PNG" alt="Назад" width={104} height={52} className={styles.profileHistoryCloseIcon} sizes="52px" quality={80} />
        </Link>
        <Link href="/main/spin" className={styles.profileHistoryTopRightButton} aria-label="К рулетке">
          <Image src="/стрелканазад.PNG" alt="Далее" width={104} height={52} className={styles.profileHistoryTopRightIcon} sizes="52px" quality={80} />
        </Link>
        <Link href="/main" className={styles.profileHistoryTopRightLink} aria-label="В главное меню">
          <Image
            src="/чернымглавноеменюистория.png"
            alt=""
            width={440}
            height={90}
            className={styles.profileHistoryTopRightImg}
            sizes="220px"
            quality={80}
          />
        </Link>
      </div>
    </div>
  );
}
