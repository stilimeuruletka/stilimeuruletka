"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "./page.module.css";

export default function Home() {
  const router = useRouter();
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/splash", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled) return;
        const url = (json as { splash_video_url?: string } | null)?.splash_video_url;
        setVideoUrl(typeof url === "string" && url.length > 0 ? url : null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const go = () => router.push("/main");

  return (
    <div className={styles.splash} onClick={go} role="button" tabIndex={0}>
      {videoUrl ? (
        <video
          className={styles.splashVideo}
          src={videoUrl}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster="/IMG_1294.PNG"
          onLoadedData={() => setLoaded(true)}
          onError={() => setVideoUrl(null)}
        />
      ) : loaded ? null : (
        <div className={styles.splashInner}>
          <Image src="/IMG_1294.PNG" alt="анимация" width={520} height={520} className={styles.splashImage} priority />
        </div>
      )}
    </div>
  );
}