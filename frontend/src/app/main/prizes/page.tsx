import Image from "next/image";
import Link from "next/link";
import styles from "../../page.module.css";

export default function PrizesPlaceholderPage() {
  return (
    <div className={styles.placeholderPage}>
      <div className={styles.placeholderFrame}>
        <Link href="/main" className={styles.placeholderBackLink} aria-label="Назад в меню">
          <Image src="/стрелканазад.PNG" alt="Назад" width={52} height={26} className={styles.placeholderBackIcon} priority />
        </Link>
        <Image src="/check-white.svg" alt="" width={26} height={26} className={styles.placeholderCheck} priority />
        <Image src="/заглушка2.png" alt="Страница в разработке" fill className={styles.placeholderImage} priority />
      </div>
    </div>
  );
}
