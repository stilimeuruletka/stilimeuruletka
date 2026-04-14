"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
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

function formatRemaining(ms: number | null) {
  if (ms == null) {
    return "--:--:--";
  }

  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");

  return `${hours}:${minutes}:${seconds}`;
}

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

function readLocalSpinHistory() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(getLocalSpinHistoryKey());
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    const list = Array.isArray(parsed) ? parsed : [];
    return list
      .filter(
        (x): x is { spin_id: string; created_at: string; win: boolean; prize_title: string | null; prize_value: number | null } =>
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

function SpinTimer() {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [canSpin, setCanSpin] = useState<boolean>(false);
  const [nextSpinAtMs, setNextSpinAtMs] = useState<number | null>(null);

  const remainingText = useMemo(() => formatRemaining(remainingMs), [remainingMs]);

  const refresh = useCallback(async () => {
    const initData = getInitData();
    if (!initData) {
      setRemainingMs(null);
      setCanSpin(false);
      setNextSpinAtMs(null);
      return;
    }

    const base = getBackendBase();
    const tzOffset = new Date().getTimezoneOffset();
    const res = await fetch(`${base}/api/me?tz_offset=${encodeURIComponent(String(tzOffset))}`, {
      headers: { "x-telegram-init-data": initData }
    });
    if (!res.ok) return;
    const json = (await res.json().catch(() => null)) as
      | { can_spin: boolean; next_spin_at: string | null }
      | null;
    if (!json) return;
    setCanSpin(Boolean(json.can_spin));
    setNextSpinAtMs(json.next_spin_at ? Date.parse(json.next_spin_at) : null);
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(id);
  }, [refresh]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refresh();
    }, 30_000);
    return () => window.clearInterval(intervalId);
  }, [refresh]);

  useEffect(() => {
    const update = () => {
      if (canSpin || !nextSpinAtMs) {
        setRemainingMs(0);
        return;
      }
      const diff = nextSpinAtMs - Date.now();
      if (diff <= 0) {
        setRemainingMs(0);
        void refresh();
        return;
      }
      setRemainingMs(diff);
    };

    const timeoutId = window.setTimeout(update, 0);
    const intervalId = window.setInterval(update, 1000);
    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [canSpin, nextSpinAtMs, refresh]);

  return (
    <div className={styles.profileSpinTimer}>
      <Image
        src="/круг5к.png"
        alt="До следующего спина"
        width={720}
        height={320}
        className={styles.profileSpinTimerImage}
        sizes="320px"
        quality={90}
      />
      <div className={styles.profileSpinTimerText}>
        <span>{canSpin ? "МОЖНО КРУТИТЬ" : "ДО СЛЕДУЮЩЕГО СПИНА"}</span>
        <span className={styles.profileSpinTimerValue}>{remainingText}</span>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const backgroundVideoRef = useRef<HTMLVideoElement | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<
    Array<{ spin_id: string; created_at: string; win: boolean; prize_title: string | null; prize_value: number | null }>
  >([]);

  const { displayName, avatarSrc } = useMemo(() => {
    if (!isClient) {
      return { displayName: "@username", avatarSrc: null as string | null };
    }

    const w = window as TelegramSdkWindow;
    const tgUser = w.Telegram?.WebApp?.initDataUnsafe?.user;
    return {
      displayName: tgUser?.username ? `@${tgUser.username}` : "@username",
      avatarSrc: tgUser?.photo_url ?? null
    };
  }, [isClient]);

  useEffect(() => {
    const v = backgroundVideoRef.current;
    if (!v) return;

    const sync = () => {
      if (document.visibilityState === "hidden") {
        v.pause();
        return;
      }
      void v.play().catch(() => {});
    };

    document.addEventListener("visibilitychange", sync);
    sync();
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  useEffect(() => {
    if (!historyOpen) return;
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
            | { items?: Array<{ spin_id: string; created_at: string; win: boolean; prize_title: string | null; prize_value: number | null }> }
            | { message?: string }
            | null;
          if (!res.ok) {
            const msg = (json && "message" in json && typeof json.message === "string" && json.message) || "Не удалось загрузить историю";
            throw new Error(msg);
          }
          const items =
            json && typeof json === "object" && "items" in json && Array.isArray((json as { items?: unknown }).items)
              ? ((json as { items: Array<{ spin_id: string; created_at: string; win: boolean; prize_title: string | null; prize_value: number | null }> }).items ?? [])
              : [];
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
  }, [historyOpen]);

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

  return (
    <div className={styles.placeholderPage}>
      <div className={styles.placeholderFrame}>
        <div className={styles.profileBackgroundLayer} aria-hidden="true">
          <video
            ref={backgroundVideoRef}
            className={styles.profileBackgroundLayerVideo}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            poster="/IMG_1294.PNG"
            disablePictureInPicture
            disableRemotePlayback
          >
            <source src="/IMG_2304.MP4" type="video/mp4" />
          </video>
        </div>

        <div className={styles.commonTopHeader} aria-hidden="true">
          <Image
            src="/главноеменюрулеткакрасный.png"
            alt=""
            width={4052}
            height={1312}
            className={styles.commonTopHeaderImage}
            priority
            sizes="(max-width: 520px) 100vw, 520px"
            quality={90}
          />
          <div className={styles.commonTopHeaderUser}>
            <div className={styles.commonTopHeaderAvatar}>
              {avatarSrc && <img src={avatarSrc} alt="" width={44} height={44} loading="lazy" draggable="false" />}
            </div>
            <div className={styles.commonTopHeaderName}>{displayName}</div>
          </div>
        </div>

        <Link href="/main" className={`${styles.profileArrowLeft} ${styles.profileArrowLeftProfile}`} aria-label="Назад в меню">
          <Image
            src="/стрелканазад.PNG"
            alt="Назад"
            width={52}
            height={26}
            className={styles.profileArrow}
          />
        </Link>
        <Link href="/main/roulette" className={`${styles.profileArrowRightNoFlip} ${styles.profileArrowRightProfile}`} aria-label="Вперёд">
          <Image
            src="/стрелканазад.PNG"
            alt="Вперёд"
            width={52}
            height={26}
            className={`${styles.profileArrow} ${styles.profileArrowIconRight}`}
          />
        </Link>

        <div className={styles.profileActionsOverlay}>
          <div className={styles.profileQuickButtons}>
            <div className={styles.profileQuickButtonsCenter}>
              <button
                type="button"
                className={`${styles.profileQuickButtonLink} ${styles.profileQuickButtonButton}`}
                aria-label="История стильных спинов"
                onClick={() => setHistoryOpen(true)}
              >
                <Image
                  src="/историястильныхпинов.png"
                  alt="История стильных спинов"
                  width={10324}
                  height={1720}
                  className={styles.profileQuickButtonImg}
                  sizes="(max-width: 520px) 44vw, 180px"
                  quality={90}
                />
              </button>
            </div>

            <div className={styles.profileQuickButtonsRow}>
              <Link href="/main/friend" className={styles.profileQuickButtonLink}>
                <Image
                  src="/пригласитьстильныхдрузей2.png"
                  alt="Пригласить стильных друзей"
                  width={10296}
                  height={1732}
                  className={`${styles.profileQuickButtonImg} ${styles.profileQuickButtonImgLift} ${styles.profileQuickButtonImgLarge}`}
                  sizes="(max-width: 520px) 46vw, 186px"
                  quality={90}
                />
              </Link>
              <a
                href="https://t.me/stilimeuruletkamanager"
                target="_blank"
                rel="noreferrer"
                className={styles.profileQuickButtonLink}
                aria-label="@stilimeuruletkamanager"
              >
                <Image
                  src="/рекламаисотрудничество.png"
                  alt="Реклама и сотрудничество"
                  width={10260}
                  height={1700}
                  className={`${styles.profileQuickButtonImg} ${styles.profileQuickButtonImgLift} ${styles.profileQuickButtonImgAdTweak}`}
                  sizes="(max-width: 520px) 44vw, 180px"
                  quality={90}
                />
              </a>
            </div>

            <div className={styles.profileQuickButtonsRow}>
              <a
                href="https://t.me/stilimeuruletka"
                target="_blank"
                rel="noreferrer"
                className={styles.profileQuickButtonLink}
                aria-label="Канал сообщества"
              >
                <Image
                  src="/каналсообщество.png"
                  alt="Канал сообщества"
                  width={10252}
                  height={1692}
                  className={`${styles.profileQuickButtonImg} ${styles.profileQuickButtonImgLift} ${styles.profileQuickButtonImgChannelTweak}`}
                  sizes="(max-width: 520px) 44vw, 180px"
                  quality={90}
                />
              </a>
              <Link href="/main/about" className={styles.profileQuickButtonLink}>
                <Image
                  src="/обренда.png"
                  alt="О бренде"
                  width={10216}
                  height={1664}
                  className={`${styles.profileQuickButtonImg} ${styles.profileQuickButtonImgBrandShiftLeft} ${styles.profileQuickButtonImgLift} ${styles.profileQuickButtonImgLarge}`}
                  sizes="(max-width: 520px) 46vw, 186px"
                  quality={90}
                />
              </Link>
            </div>
          </div>

          <SpinTimer />
        </div>

        {historyOpen && (
          <div className={styles.profileHistoryOverlay} role="dialog" aria-modal="true" onClick={() => setHistoryOpen(false)}>
            <div className={styles.profileHistoryFrame} onClick={(e) => e.stopPropagation()}>
              <Image src="/историястильныхспинов.PNG" alt="" fill className={styles.fullScreenImage} priority />
              
              <div className={styles.profileHistoryContent}>
                {historyLoading && <div className={styles.profileHistoryEmpty}>ЗАГРУЗКА...</div>}
                {!historyLoading && historyError && <div className={styles.profileHistoryEmpty}>НЕ УДАЛОСЬ ЗАГРУЗИТЬ ИСТОРИЮ</div>}
                {!historyLoading && !historyError && historyItems.length === 0 && (
                  <div className={styles.profileHistoryEmpty}>НЕ УДАЛОСЬ ЗАГРУЗИТЬ ИСТОРИЮ</div>
                )}
                {!historyLoading && !historyError && historyItems.length > 0 && (
                  <div className={styles.profileHistoryCarouselWrapper}>
                    <button
                      type="button"
                      className={`${styles.profileHistoryArrow} ${styles.profileHistoryArrowLeft}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        document.getElementById('history-carousel')?.scrollBy({ left: -200, behavior: 'smooth' });
                      }}
                      aria-label="Листать влево"
                    >
                      <Image src="/стрелканазад.PNG" alt="Влево" width={40} height={20} className={styles.profileHistoryArrowIcon} />
                    </button>
                    
                    <div id="history-carousel" className={styles.profileHistoryCarousel}>
                      {historyItems.map((it) => (
                        <div key={it.spin_id} className={styles.profileHistoryCard}>
                          <div className={styles.profileHistoryCardDate}>{formatHistoryDate(it.created_at)}</div>
                          <div className={styles.profileHistoryCardImageWrapper}>
                            <img
                              src={it.win ? "/IMG_2805.PNG" : "/проигрыш.PNG"}
                              alt={it.win ? "Победа" : "Поражение"}
                              className={styles.profileHistoryCardImage}
                              draggable="false"
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
                      className={`${styles.profileHistoryArrow} ${styles.profileHistoryArrowRight}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        document.getElementById('history-carousel')?.scrollBy({ left: 200, behavior: 'smooth' });
                      }}
                      aria-label="Листать вправо"
                    >
                      <Image src="/стрелканазад.PNG" alt="Вправо" width={40} height={20} className={styles.profileHistoryArrowIcon} />
                    </button>
                  </div>
                )}
              </div>
              <button type="button" className={styles.profileHistoryCloseButton} onClick={() => setHistoryOpen(false)} aria-label="Закрыть">
                <Image src="/стрелканазад.PNG" alt="Назад" width={52} height={26} className={styles.profileHistoryCloseIcon} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
