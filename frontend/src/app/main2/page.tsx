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
              width={180}
              height={24}
              className={styles.topImage}
              priority
              sizes="90px"
              quality={80}
            />
          </a>
          <Image
            src="/основавверхниже-trim.png"
            alt="Заголовок"
            width={1040}
            height={235}
            className={styles.titleImage}
            priority
            sizes="(max-width: 520px) 100vw, 520px"
            quality={80}
          />
        </div>

        <div className={styles.grid}>
          <div className={styles.card}>
            <Link href="/main/profile" className={styles.cardLink} aria-label="Профиль подробный">
              <div className={styles.girlWrap}>
                <Image
                  src="/7девушка.PNG"
                  alt="Девушка 1"
                  width={340}
                  height={623}
                  className={styles.girl}
                  priority
                  sizes="(max-width: 520px) 33vw, 170px"
                  quality={75}
                />
              </div>
              <Image
                src="/другоекнопка-trim.png"
                alt="Профиль подробный"
                width={340}
                height={54}
                className={styles.btnImg}
                sizes="(max-width: 520px) 33vw, 170px"
                quality={80}
              />
            </Link>
          </div>

          <div className={styles.card}>
            <Link href="/main/spin" className={`${styles.cardLink} ${styles.cardLinkLower}`} aria-label="Страница в разработке">
              <div className={styles.girlWrap}>
                <Image
                  src="/8девушка.PNG"
                  alt="Девушка 2"
                  width={340}
                  height={623}
                  className={styles.girl}
                  sizes="(max-width: 520px) 33vw, 170px"
                  quality={75}
                />
              </div>
              <Image
                src="/каталог.png"
                alt="Страница в разработке"
                width={340}
                height={54}
                className={styles.btnImg}
                sizes="(max-width: 520px) 33vw, 170px"
                quality={80}
              />
            </Link>
          </div>

          <div className={styles.card}>
            <Link href="/main/spin" className={styles.cardLink} aria-label="Страница в разработке">
              <div className={styles.girlWrap}>
                <Image
                  src="/9девушка.PNG"
                  alt="Девушка 3"
                  width={340}
                  height={623}
                  className={styles.girl}
                  sizes="(max-width: 520px) 33vw, 170px"
                  quality={75}
                />
              </div>
              <Image
                src="/сомнгкнопка-trim.png"
                alt="Страница в разработке"
                width={340}
                height={54}
                className={styles.btnImg}
                sizes="(max-width: 520px) 33vw, 170px"
                quality={80}
              />
            </Link>
          </div>
        </div>

        <div className={styles.grid}>
          <div className={styles.card}>
            <Link href="/main/spin" className={styles.cardLink} aria-label="Страница в разработке">
              <div className={styles.girlWrap}>
                <Image
                  src="/10девушка.PNG"
                  alt="Девушка 4"
                  width={340}
                  height={623}
                  className={styles.girl}
                  sizes="(max-width: 520px) 33vw, 170px"
                  quality={75}
                />
              </div>
              <Image
                src="/сомнгкнопка-trim.png"
                alt="Страница в разработке"
                width={340}
                height={54}
                className={styles.btnImg}
                sizes="(max-width: 520px) 33vw, 170px"
                quality={80}
              />
            </Link>
          </div>

          <div className={styles.card}>
            <Link href="/main/spin" className={styles.cardLink} aria-label="Страница в разработке">
              <div className={styles.girlWrap}>
                <Image
                  src="/11девушка.PNG"
                  alt="Девушка 5"
                  width={340}
                  height={623}
                  className={styles.girl}
                  sizes="(max-width: 520px) 33vw, 170px"
                  quality={75}
                />
              </div>
              <Image
                src="/сомнгкнопка-trim.png"
                alt="Страница в разработке"
                width={340}
                height={54}
                className={styles.btnImg}
                sizes="(max-width: 520px) 33vw, 170px"
                quality={80}
              />
            </Link>
          </div>

          <div className={styles.card}>
            <Link href="/main/spin" className={styles.cardLink} aria-label="Страница в разработке">
              <div className={styles.girlWrap}>
                <Image
                  src="/12девушка.PNG"
                  alt="Девушка 6"
                  width={340}
                  height={623}
                  className={styles.girl}
                  sizes="(max-width: 520px) 33vw, 170px"
                  quality={75}
                />
              </div>
              <Image
                src="/сомнгкнопка-trim.png"
                alt="Страница в разработке"
                width={340}
                height={54}
                className={styles.btnImg}
                sizes="(max-width: 520px) 33vw, 170px"
                quality={80}
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
          width={460}
          height={230}
          className={styles.bottomImage}
          sizes="(max-width: 520px) 100vw, 520px"
          quality={80}
        />
      </main>
    </div>
  );
}
