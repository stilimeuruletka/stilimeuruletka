import Image from "next/image";
import Link from "next/link";
import styles from "../../page.module.css";

export default function AboutPage() {
  return (
    <div className={styles.fullScreenPage}>
      <Link href="/main/profile" className={styles.fullScreenLink}>
        <div className={styles.fullScreenFrame}>
          <Image src="/IMG_2124.JPEG" alt="О бренде" fill className={styles.fullScreenImage} priority />
        </div>
      </Link>
    </div>
  );
}
