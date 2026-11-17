import Image from "next/image";
import Link from "next/link";
import styles from "../../page.module.css";

export default function InvitePlaceholderPage() {
  return (
    <div className={styles.placeholderPage}>
      <div className={styles.placeholderFrame}>
        <Link href="/main2" className={styles.placeholderBackLink} aria-label="Назад в меню">
          <Image src="/только_стрелка.png" alt="Назад" width={969} height={418} className={styles.placeholderArrow} priority />
          <Image src="/только_надпись.png" alt="Стильные друзья" width={1318} height={411} className={styles.placeholderText} priority />
        </Link>
        <Image src="/заглушка2.png" alt="Страница в разработке" fill className={styles.placeholderImage} priority />
      </div>
    </div>
  );
}
