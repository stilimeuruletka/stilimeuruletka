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
        <Image src="/IMG_2381.PNG" alt="Как играть" fill className={styles.howToPlayCompositeImage} priority />
        <div className={styles.howToPlayRulesRow}>
          <Image src="/правилакруг.png" alt="" width={44} height={44} className={styles.howToPlayRuleIcon} />
          <Image src="/правилакруг.png" alt="" width={44} height={44} className={styles.howToPlayRuleIcon} />
          <Image src="/правилакруг.png" alt="" width={44} height={44} className={styles.howToPlayRuleIcon} />
        </div>
      </div>
    </div>
  );
}
