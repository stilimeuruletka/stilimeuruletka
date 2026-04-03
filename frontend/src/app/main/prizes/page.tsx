import Image from "next/image";
import Link from "next/link";
import styles from "../../page.module.css";

export default function PrizesPlaceholderPage() {
  return (
    <div className={styles.placeholderPage}>
      <div className={styles.placeholderFrame}>
        <Link href="/main" className={styles.placeholderBackLink} aria-label="Назад в меню">
          <Image src="/стрелканадпись.png" alt="Назад" width={3340} height={1472} className={styles.placeholderBackIcon} priority />
        </Link>
        <Image src="/заглушка2.png" alt="Страница в разработке" fill className={styles.placeholderImage} priority />
      </div>
    </div>
  );
}
