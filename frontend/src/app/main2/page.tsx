import Image from "next/image";
import Link from "next/link";
import styles from "../page.module.css";
import { TelegramInit } from "../main/TelegramInit";
import { SwipeNavigation } from "../main/SwipeNavigation";

export default function Main2Page() {
  return (
    <div className={styles.screen}>
      <TelegramInit />
      <main className={styles.container}>
        <SwipeNavigation prevPath="/main" />
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

        <div className={styles.grid}>
          <div className={styles.card}>
            <Link href="/main/profile" className={styles.cardLink} aria-label="Профиль подробный">
              <div className={styles.girlWrap}>
                <Image
                  src="/7девушка.PNG"
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
                src="/другоекнопка-trim.png"
                alt="Профиль подробный"
                width={3882}
                height={608}
                className={styles.btnImg}
                sizes="(max-width: 520px) 33vw, 170px"
                quality={90}
              />
            </Link>
          </div>

          <div className={styles.card}>
            <Link href="/main/roulette" className={styles.cardLink} aria-label="Страница в разработке">
              <div className={styles.girlWrap}>
                <Image
                  src="/8девушка.PNG"
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
                src="/каталогкнопка.png"
                alt="Страница в разработке"
                width={3882}
                height={608}
                className={`${styles.btnImg} ${styles.btnImgCatalogLower}`}
                sizes="(max-width: 520px) 33vw, 170px"
                quality={90}
              />
            </Link>
          </div>

          <div className={styles.card}>
            <Link href="/main/roulette" className={styles.cardLink} aria-label="Страница в разработке">
              <div className={styles.girlWrap}>
                <Image
                  src="/9девушка.PNG"
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
                src="/сомнгкнопка-trim.png"
                alt="Страница в разработке"
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
            <Link href="/main/roulette" className={styles.cardLink} aria-label="Страница в разработке">
              <div className={styles.girlWrap}>
                <Image
                  src="/10девушка.PNG"
                  alt="Девушка 4"
                  width={1340}
                  height={2400}
                  className={styles.girl}
                  sizes="(max-width: 520px) 33vw, 170px"
                  quality={85}
                />
              </div>
              <Image
                src="/сомнгкнопка-trim.png"
                alt="Страница в разработке"
                width={3882}
                height={608}
                className={styles.btnImg}
                sizes="(max-width: 520px) 33vw, 170px"
                quality={90}
              />
            </Link>
          </div>

          <div className={styles.card}>
            <Link href="/main/roulette" className={styles.cardLink} aria-label="Страница в разработке">
              <div className={styles.girlWrap}>
                <Image
                  src="/11девушка.PNG"
                  alt="Девушка 5"
                  width={1340}
                  height={2400}
                  className={styles.girl}
                  sizes="(max-width: 520px) 33vw, 170px"
                  quality={85}
                />
              </div>
              <Image
                src="/сомнгкнопка-trim.png"
                alt="Страница в разработке"
                width={3882}
                height={608}
                className={styles.btnImg}
                sizes="(max-width: 520px) 33vw, 170px"
                quality={90}
              />
            </Link>
          </div>

          <div className={styles.card}>
            <Link href="/main/roulette" className={styles.cardLink} aria-label="Страница в разработке">
              <div className={styles.girlWrap}>
                <Image
                  src="/12девушка.PNG"
                  alt="Девушка 6"
                  width={1340}
                  height={2400}
                  className={styles.girl}
                  sizes="(max-width: 520px) 33vw, 170px"
                  quality={85}
                />
              </div>
              <Image
                src="/сомнгкнопка-trim.png"
                alt="Страница в разработке"
                width={3882}
                height={608}
                className={styles.btnImg}
                sizes="(max-width: 520px) 33vw, 170px"
                quality={90}
              />
            </Link>
          </div>
        </div>

        <div className={styles.scrollDots}>
          <Link href="/main" aria-label="Перейти на первую страницу">
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="8" height="8" rx="4" fill="#D7D7D7" />
            </svg>
          </Link>
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="8" height="8" rx="4" fill="#6F6F6F" />
          </svg>
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
      </main>
    </div>
  );
}
