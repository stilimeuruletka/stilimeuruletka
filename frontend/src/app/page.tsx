import styles from "./page.module.css";
import Link from "next/link";

export default function Home() {
  return (
    <Link href="/main" className={styles.splash}>
      <div className={styles.splashInner}>
        <div className={styles.splashText}>анимация</div>
      </div>
    </Link>
  );
}
