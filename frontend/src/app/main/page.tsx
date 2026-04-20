"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import styles from "../page.module.css";
import { TelegramInit } from "./TelegramInit";
import { SwipeNavigation } from "./SwipeNavigation";

type TelegramWebAppUser = {
  id?: number;
  username?: string;
  photo_url?: string;
};

type TelegramWebApp = {
  initDataUnsafe?: {
    user?: TelegramWebAppUser;
  };
  initData?: string;
  showAlert?: (message: string) => void;
  openTelegramLink?: (url: string) => void;
};

type TelegramSdkWindow = Window & {
  Telegram?: {
    WebApp?: TelegramWebApp;
  };
};

function getBackendBase() {
  const raw = process.env.NEXT_PUBLIC_BACKEND_URL;
  return raw ? raw.replace(/\/+$/, "") : "";
}

export default function MainPage() {
  const initData = useMemo(() => {
    if (typeof window === "undefined") return null;
    const w = window as TelegramSdkWindow;
    const initDataRaw = w.Telegram?.WebApp?.initData;
    return typeof initDataRaw === "string" && initDataRaw.length > 10 ? initDataRaw : null;
  }, []);

  const [referralLink, setReferralLink] = useState<string | null>(null);

  const loadReferralLink = useCallback(async () => {
    if (!initData) return null;
    if (referralLink) return referralLink;
    const base = getBackendBase();
    const res = await fetch(`${base}/api/referral/link`, { headers: { "x-telegram-init-data": initData } }).catch(() => null);
    if (!res || !res.ok) return null;
    const json = (await res.json().catch(() => null)) as { link?: string } | null;
    const link = typeof json?.link === "string" && json.link.length > 0 ? json.link : null;
    if (link) setReferralLink(link);
    return link;
  }, [initData, referralLink]);

  const handleInviteCardClick = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      const link = await loadReferralLink();
      const w = window as TelegramSdkWindow;
      if (!link) {
        w.Telegram?.WebApp?.showAlert?.("Не удалось получить реферальную ссылку");
        return;
      }

      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(link);
          w.Telegram?.WebApp?.showAlert?.("Реферальная ссылка скопирована");
        } catch {
          w.Telegram?.WebApp?.showAlert?.("Скопируйте ссылку вручную в следующем окне");
        }
      } else {
        w.Telegram?.WebApp?.showAlert?.("Скопируйте ссылку вручную в следующем окне");
      }

      const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}`;
      if (typeof w.Telegram?.WebApp?.openTelegramLink === "function") {
        w.Telegram.WebApp.openTelegramLink(shareUrl);
        return;
      }
      window.open(shareUrl, "_blank", "noopener,noreferrer");
    },
    [loadReferralLink]
  );

  return (
    <div className={styles.screen}>
      <TelegramInit />
      <main className={styles.container}>
        <SwipeNavigation nextPath="/main2" />
        <div className={styles.top}>
          <a href="https://t.me/stilimeu" target="_blank" rel="noreferrer">
            <Image
              src="/основавверх-trim.png"
              alt="Верхняя часть"
              width={90}
              height={12}
              className={styles.topImage}
              priority
              sizes="90px"
              quality={90}
            />
          </a>
          <Image
            src="/основавверхниже-trim.png"
            alt="Заголовок"
            width={4490}
            height={1012}
            className={styles.titleImage}
            priority
            sizes="(max-width: 520px) 100vw, 520px"
          />
        </div>

        <div className={styles.carousel}>
          <section className={styles.slide}>
            <div className={styles.grid}>
              <div className={styles.card}>
                <Link href="/main/roulette" className={styles.cardLink} aria-label="Стильная рулетка">
                  <div className={styles.girlWrap}>
                    <Image
                      src="/1девушка.PNG"
                      alt="Девушка 1"
                      width={600}
                      height={1100}
                      className={styles.girl}
                      priority
                      sizes="(max-width: 520px) 33vw, 170px"
                      quality={85}
                    />
                  </div>
                  <Image
                    src="/стильнаярулетка-trim.png"
                    alt="Стильная рулетка"
                    width={3882}
                    height={608}
                    className={styles.btnImg}
                    sizes="(max-width: 520px) 33vw, 170px"
                    quality={90}
                  />
                </Link>
              </div>

              <div className={styles.card}>
                <Link href="/main/profile" className={styles.cardLink} aria-label="Профиль">
                  <div className={styles.girlWrap}>
                    <Image
                      src="/2девушка.PNG"
                      alt="Девушка 2"
                      width={600}
                      height={1100}
                      className={styles.girl}
                      priority
                      sizes="(max-width: 520px) 33vw, 170px"
                      quality={85}
                    />
                  </div>
                  <Image
                    src="/профиль-trim.png"
                    alt="Профиль"
                    width={3882}
                    height={608}
                    className={styles.btnImg}
                    sizes="(max-width: 520px) 33vw, 170px"
                    quality={90}
                  />
                </Link>
              </div>

              <div className={styles.card}>
                <Link href="/main/how-to-play" className={styles.cardLink} aria-label="Как играть">
                  <div className={styles.girlWrap}>
                    <Image
                      src="/3девушка.jpg"
                      alt="Девушка 3"
                      width={600}
                      height={1100}
                      className={styles.girl}
                      priority
                      sizes="(max-width: 520px) 33vw, 170px"
                      quality={85}
                    />
                  </div>
                  <Image
                    src="/какиграть-trim.png"
                    alt="Как играть"
                    width={3882}
                    height={608}
                    className={styles.btnImg}
                    sizes="(max-width: 520px) 33vw, 170px"
                    quality={90}
                  />
                </Link>
              </div>
            </div>

            <div className={styles.grid}>
              <div className={styles.card}>
                <Link href="/main/invite" className={styles.cardLink} aria-label="Пригласить друзей" onClick={handleInviteCardClick}>
                  <div className={styles.girlWrap}>
                    <Image
                      src="/4девушка.PNG"
                      alt="Девушка 4"
                      width={1340}
                      height={2400}
                      className={styles.girl}
                      sizes="(max-width: 520px) 33vw, 170px"
                      quality={85}
                    />
                  </div>
                  <Image
                    src="/пригласитьдр-trim.png"
                    alt="Пригласить друзей"
                    width={3882}
                    height={608}
                    className={styles.btnImg}
                    sizes="(max-width: 520px) 33vw, 170px"
                    quality={90}
                  />
                </Link>
              </div>

              <div className={styles.card}>
                <a href="https://t.me/stilimeuruletka/6" target="_blank" rel="noreferrer" className={styles.cardLink} aria-label="Список призов">
                  <div className={styles.girlWrap}>
                    <Image
                      src="/5девушка.PNG"
                      alt="Девушка 5"
                      width={1340}
                      height={2400}
                      className={styles.girl}
                      sizes="(max-width: 520px) 33vw, 170px"
                      quality={85}
                    />
                  </div>
                  <Image
                    src="/списокпризов-trim.png"
                    alt="Список призов"
                    width={3882}
                    height={608}
                    className={styles.btnImg}
                    sizes="(max-width: 520px) 33vw, 170px"
                    quality={90}
                  />
                </a>
              </div>

              <div className={styles.card}>
                <a href="https://t.me/stilimeuruletkasos" target="_blank" rel="noreferrer" className={styles.cardLink} aria-label="Поддержка">
                  <div className={styles.girlWrap}>
                    <Image
                      src="/6девушка.PNG"
                      alt="Девушка 6"
                      width={1340}
                      height={2400}
                      className={styles.girl}
                      sizes="(max-width: 520px) 33vw, 170px"
                      quality={85}
                    />
                  </div>
                  <Image
                    src="/поддержка-trim.png"
                    alt="Поддержка"
                    width={3882}
                    height={608}
                    className={styles.btnImg}
                    sizes="(max-width: 520px) 33vw, 170px"
                    quality={90}
                  />
                </a>
              </div>
            </div>

            <div className={styles.scrollDots}>
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="8" height="8" rx="4" fill="#6F6F6F" />
              </svg>
              <Link href="/main2" aria-label="Перейти на вторую страницу">
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect width="8" height="8" rx="4" fill="#D7D7D7" />
                </svg>
              </Link>
            </div>

            <Image
              src="/низ-trim.png"
              alt="Низ"
              width={1186}
              height={591}
              className={styles.bottomImage}
              sizes="(max-width: 520px) 100vw, 520px"
              quality={90}
            />
          </section>

        </div>
      </main>
    </div>
  );
}
