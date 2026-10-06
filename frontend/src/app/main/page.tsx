"use client";

import Image from "next/image";
import Link from "next/link";
import styles from "../page.module.css";
import { TelegramInit } from "./TelegramInit";
import { SwipeNavigation } from "./SwipeNavigation";

export default function MainPage() {
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

        <div className={styles.carousel}>
          <section className={styles.slide}>
            <div className={styles.grid}>
              <div className={styles.card}>
                <Link href="/main/spin" className={styles.cardLink} aria-label="Стильная рулетка">
                  <div className={styles.girlWrap}>
                    <Image
                      src="/1девушка.PNG"
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
                    src="/стильнаярулетка-trim.png"
                    alt="Стильная рулетка"
                    width={340}
                    height={54}
                    className={styles.btnImg}
                    sizes="(max-width: 520px) 33vw, 170px"
                    quality={80}
                  />
                </Link>
              </div>

              <div className={styles.card}>
                <Link href="/main/profile" className={styles.cardLink} aria-label="Профиль">
                  <div className={styles.girlWrap}>
                    <Image
                      src="/2девушка.PNG"
                      alt="Девушка 2"
                      width={340}
                      height={623}
                      className={styles.girl}
                      sizes="(max-width: 520px) 33vw, 170px"
                      quality={75}
                    />
                  </div>
                  <Image
                    src="/профиль-trim.png"
                    alt="Профиль"
                    width={340}
                    height={54}
                    className={styles.btnImg}
                    sizes="(max-width: 520px) 33vw, 170px"
                    quality={80}
                  />
                </Link>
              </div>

              <div className={styles.card}>
                <Link href="/main/how-to-play" className={styles.cardLink} aria-label="Как играть">
                  <div className={styles.girlWrap}>
                    <Image
                      src="/3девушка.jpg"
                      alt="Девушка 3"
                      width={340}
                      height={623}
                      className={styles.girl}
                      sizes="(max-width: 520px) 33vw, 170px"
                      quality={75}
                    />
                  </div>
                  <Image
                    src="/какиграть-trim.png"
                    alt="Как играть"
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
                <Link href="/main/friend" className={styles.cardLink} aria-label="Пригласить друзей">
                  <div className={styles.girlWrap}>
                    <Image
                      src="/4девушка.PNG"
                      alt="Девушка 4"
                      width={340}
                      height={623}
                      className={styles.girl}
                      sizes="(max-width: 520px) 33vw, 170px"
                      quality={75}
                    />
                  </div>
                  <Image
                    src="/пригласитьдр-trim.png"
                    alt="Пригласить друзей"
                    width={340}
                    height={54}
                    className={styles.btnImg}
                    sizes="(max-width: 520px) 33vw, 170px"
                    quality={80}
                  />
                </Link>
              </div>

              <div className={styles.card}>
                <a href="https://t.me/stilimeuruletka/6" target="_blank" rel="noreferrer" className={styles.cardLink} aria-label="Список призов">
                  <div className={styles.girlWrap}>
                    <Image
                      src="/5девушка.PNG"
                      alt="Девушка 5"
                      width={340}
                      height={623}
                      className={styles.girl}
                      sizes="(max-width: 520px) 33vw, 170px"
                      quality={75}
                    />
                  </div>
                  <Image
                    src="/списокпризов-trim.png"
                    alt="Список призов"
                    width={340}
                    height={54}
                    className={styles.btnImg}
                    sizes="(max-width: 520px) 33vw, 170px"
                    quality={80}
                  />
                </a>
              </div>

              <div className={styles.card}>
                <a href="https://t.me/stilimeuruletkasos" target="_blank" rel="noreferrer" className={styles.cardLink} aria-label="Поддержка">
                  <div className={styles.girlWrap}>
                    <Image
                      src="/6девушка.PNG"
                      alt="Девушка 6"
                      width={340}
                      height={623}
                      className={styles.girl}
                      sizes="(max-width: 520px) 33vw, 170px"
                      quality={75}
                    />
                  </div>
                  <Image
                    src="/поддержка-trim.png"
                    alt="Поддержка"
                    width={340}
                      height={54}
                    className={styles.btnImg}
                    sizes="(max-width: 520px) 33vw, 170px"
                    quality={80}
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
              width={460}
              height={230}
              className={styles.bottomImage}
              sizes="(max-width: 520px) 100vw, 520px"
              quality={80}
            />
          </section>

        </div>
      </main>
    </div>
  );
}
