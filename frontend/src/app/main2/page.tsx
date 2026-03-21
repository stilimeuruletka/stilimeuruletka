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

        <div className={styles.grid}>
          <div className={styles.card}>
            <div className={styles.girlWrap}>
              <Image src="/7девушка.PNG" alt="Девушка 1" width={600} height={1100} className={styles.girl} priority />
            </div>
            <Link href="/main/profile" className={styles.imageButton}>
              <Image
                src="/другоекнопка-trim.png"
                alt="Профиль подробный"
                width={3882}
                height={608}
                className={styles.btnImg}
              />
            </Link>
          </div>

          <div className={styles.card}>
            <div className={styles.girlWrap}>
              <Image src="/8девушка.PNG" alt="Девушка 2" width={600} height={1100} className={styles.girl} priority />
            </div>
            <button type="button" className={styles.imageButton}>
              <Image
                src="/сомнгкнопка-trim.png"
                alt="Кнопка профиля"
                width={3882}
                height={608}
                className={styles.btnImg}
              />
            </button>
          </div>

          <div className={styles.card}>
            <div className={styles.girlWrap}>
              <Image src="/9девушка.PNG" alt="Девушка 3" width={600} height={1100} className={styles.girl} priority />
            </div>
            <button type="button" className={styles.imageButton}>
              <Image
                src="/сомнгкнопка-trim.png"
                alt="Кнопка профиля"
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
              <Image src="/10девушка.PNG" alt="Девушка 4" width={1340} height={2400} className={styles.girl} priority />
            </div>
            <button type="button" className={styles.imageButton}>
              <Image
                src="/сомнгкнопка-trim.png"
                alt="Кнопка профиля"
                width={3882}
                height={608}
                className={styles.btnImg}
              />
            </button>
          </div>

          <div className={styles.card}>
            <div className={styles.girlWrap}>
              <Image src="/11девушка.PNG" alt="Девушка 5" width={1340} height={2400} className={styles.girl} priority />
            </div>
            <button type="button" className={styles.imageButton}>
              <Image
                src="/сомнгкнопка-trim.png"
                alt="Кнопка профиля"
                width={3882}
                height={608}
                className={styles.btnImg}
              />
            </button>
          </div>

          <div className={styles.card}>
            <div className={styles.girlWrap}>
              <Image src="/12девушка.PNG" alt="Девушка 6" width={1340} height={2400} className={styles.girl} priority />
            </div>
            <button type="button" className={styles.imageButton}>
              <Image
                src="/сомнгкнопка-trim.png"
                alt="Кнопка профиля"
                width={3882}
                height={608}
                className={styles.btnImg}
              />
            </button>
          </div>
        </div>

        <div className={styles.scrollDots}>
          <Link href="/main" aria-label="Перейти на первую страницу">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="10" height="10" rx="5" fill="#D7D7D7" />
            </svg>
          </Link>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="10" height="10" rx="5" fill="#6F6F6F" />
          </svg>
        </div>

        <Image src="/низ-final.png" alt="Низ" width={1186} height={591} className={styles.bottomImage} priority />
      </main>
    </div>
  );
}
