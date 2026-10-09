"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";

import styles from "./page.module.css";

export default function Home() {
  const router = useRouter();
  const go = () => router.push("/main");

  return (
    <div className={styles.splash} onClick={go} role="button" tabIndex={0}>
      <div className={styles.splashInner}>
        <Image
          src="/IMG_1294.PNG"
          alt="анимация"
          width={520}
          height={520}
          className={styles.splashImage}
          priority
        />
        <div className={styles.splashText}>анимация</div>
      </div>
    </div>
  );
}