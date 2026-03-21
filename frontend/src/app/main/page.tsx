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
          <Image
            src="/основавверх-trim.png"
            alt="Верхняя часть"
            width={90}
            height={12}
            className={styles.topImage}
            priority
          />
          <Image
            src="/основавверхниже-trim.png"
            alt="Заголовок"
            width={4490}
            height={1012}
            className={styles.titleImage}
            priority
          />
        </div>

        <div className={styles.carousel}>
          <section className={styles.slide}>
            <div className={styles.grid}>
              <div className={styles.card}>
                <div className={styles.girlWrap}>
                  <Image
                    src="/1девушка.PNG"
                    alt="Девушка 1"
                    width={600}
                    height={1100}
                    className={styles.girl}
                    priority
                  />
                </div>
                <button type="button" className={styles.imageButton}>
                  <Image
                    src="/стильнаярулетка-trim.png"
                    alt="Стильная рулетка"
                    width={3882}
                    height={608}
                    className={styles.btnImg}
                  />
                </button>
              </div>

              <div className={styles.card}>
                <div className={styles.girlWrap}>
                  <Image
                    src="/2девушка.PNG"
                    alt="Девушка 2"
                    width={600}
                    height={1100}
                    className={styles.girl}
                    priority
                  />
                </div>
                <Link href="/main/profile" className={styles.imageButton} role="button">
                  <Image
                    src="/профиль-trim.png"
                    alt="Профиль"
                    width={3882}
                    height={608}
                    className={styles.btnImg}
                  />
                </Link>
              </div>

              <div className={styles.card}>
                <div className={styles.girlWrap}>
                  <Image
                    src="/3девушка.jpg"
                    alt="Девушка 3"
                    width={600}
                    height={1100}
                    className={styles.girl}
                    priority
                  />
                </div>
                <button type="button" className={styles.imageButton}>
                  <Image
                    src="/какиграть-trim.png"
                    alt="Как играть"
                    width={3882}
                    height={608}
                    className={styles.btnImg}
                  />
                </button>
              </div>
            </div>

            <div className={styles.grid}>
              <div className={styles.card}>
                <div className={styles.girlWrap}>
                  <Image
                    src="/4девушка.PNG"
                    alt="Девушка 4"
                    width={1340}
                    height={2400}
                    className={styles.girl}
                    priority
                  />
                </div>
                <button type="button" className={styles.imageButton}>
                  <Image
                    src="/пригласитьдр-trim.png"
                    alt="Пригласить друзей"
                    width={3882}
                    height={608}
                    className={styles.btnImg}
                  />
                </button>
              </div>

              <div className={styles.card}>
                <div className={styles.girlWrap}>
                  <Image
                    src="/5девушка.PNG"
                    alt="Девушка 5"
                    width={1340}
                    height={2400}
                    className={styles.girl}
                    priority
                  />
                </div>
                <button type="button" className={styles.imageButton}>
                  <Image
                    src="/списокпризов-trim.png"
                    alt="Список призов"
                    width={3882}
                    height={608}
                    className={styles.btnImg}
                  />
                </button>
              </div>

              <div className={styles.card}>
                <div className={styles.girlWrap}>
                  <Image
                    src="/6девушка.PNG"
                    alt="Девушка 6"
                    width={1340}
                    height={2400}
                    className={styles.girl}
                    priority
                  />
                </div>
                <button type="button" className={styles.imageButton}>
                  <Image
                    src="/поддержка-trim.png"
                    alt="Поддержка"
                    width={3882}
                    height={608}
                    className={styles.btnImg}
                  />
                </button>
              </div>
            </div>

            <div className={styles.scrollDots}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="10" height="10" rx="5" fill="#6F6F6F" />
              </svg>
              <Link href="/main2" aria-label="Перейти на вторую страницу">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect width="10" height="10" rx="5" fill="#D7D7D7" />
                </svg>
              </Link>
            </div>

            <Image src="/низ.png" alt="Низ" width={1186} height={591} className={styles.bottomImage} priority />
          </section>

        </div>
      </main>
    </div>
  );
}
