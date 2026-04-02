import Image from "next/image";
import Link from "next/link";
import styles from "../../page.module.css";

export default function HowToPlayPlaceholderPage() {
  return (
    <div className={styles.placeholderPage}>
      <div className={styles.placeholderFrame}>
        <Link href="/main" className={styles.placeholderBackLink} aria-label="Назад в меню">
          <Image src="/стрелканазад.PNG" alt="Назад" width={52} height={26} className={styles.placeholderBackIcon} priority />
        </Link>
        <Image
          src="/telegram-cloud-document-2-5355247322399807646 1.png"
          alt="Как играть"
          width={1000}
          height={1000}
          className={styles.howToPlayLeftImage}
          priority
        />
        <Image
          src="/telegram-cloud-document-2-5355247322399807648 1.png"
          alt=""
          width={1000}
          height={1000}
          className={styles.howToPlayRightImage}
          priority
        />
      </div>
    </div>
  );
}
