"use client";

import { useRouter } from "next/navigation";

import styles from "./page.module.css";

export default function Home() {
  const router = useRouter();
  const go = () => router.push("/main");

  return (
    <div className={styles.splash} onClick={go} role="button" tabIndex={0}>
      <div className={styles.splashInner}>
        <div className={styles.splashText}>анимация</div>
      </div>
    </div>
  );
}