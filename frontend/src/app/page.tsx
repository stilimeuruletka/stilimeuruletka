"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "./page.module.css";

type AdVideo = {
  id: string;
  client_name: string;
  video_url: string;
  publish_date: string;
  end_date: string;
};

type QueueResponse = {
  own: string | null;
  ad: AdVideo | null;
};

function getInitData() {
  const w = window as unknown as {
    Telegram?: { WebApp?: { initData?: string } };
  };
  const initData = w.Telegram?.WebApp?.initData;
  return typeof initData === "string" && initData.length > 10 ? initData : null;
}

export default function Home() {
  const router = useRouter();
  const [playlist, setPlaylist] = useState<string[]>([]);
  const [adIds, setAdIds] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [readyToPlay, setReadyToPlay] = useState(false);
  const recordedRef = useRef<Set<number>>(new Set());

  // Загружаем очередь роликов (наш + активная реклама)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let queue: QueueResponse | null = null;
      try {
        const res = await fetch("/api/preview/queue", { cache: "no-store" });
        if (res.ok) queue = (await res.json()) as QueueResponse;
      } catch {
        queue = null;
      }
      if (cancelled) return;

      const own = queue?.own ?? null;
      const ad = queue?.ad ?? null;

      if (own && own.trim()) {
        const items = [own];
        const ids: string[] = ["own"];
        if (ad && ad.video_url && ad.video_url.trim()) {
          items.push(ad.video_url);
          ids.push(ad.id);
        }
        setPlaylist(items);
        setAdIds(ids);
        setReadyToPlay(true);
      } else {
        // Ролика нет — остаёмся на подписи-заглушке (тап для входа)
        setReadyToPlay(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Фиксируем просмотр текущего видео
  const recordView = (i: number) => {
    if (recordedRef.current.has(i)) return;
    recordedRef.current.add(i);
    const initData = getInitData();
    const kind = adIds[i] && adIds[i] !== "own" ? "ad" : "own";
    const ad_id = kind === "ad" ? adIds[i] : undefined;
    void fetch("/api/preview/view", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(initData ? { "x-telegram-init-data": initData } : {})
      },
      body: JSON.stringify({ kind, ad_id })
    }).catch(() => {});
  };

  const onEnded = () => {
    if (index < playlist.length - 1) {
      setIndex((i) => i + 1);
    } else {
      router.push("/main");
    }
  };

  if (!readyToPlay || playlist.length === 0) {
    const go = () => router.push("/main");
    return (
      <div className={styles.splash} onClick={go} role="button" tabIndex={0}>
        <div className={styles.splashInner}>
          <div className={styles.splashText}>анимация</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#000" }}>
      <video
        key={playlist[index]}
        data-testid="preview-video"
        src={playlist[index]}
        className={styles.splashVideo}
        autoPlay
        muted
        playsInline
        onPlay={() => recordView(index)}
        onEnded={onEnded}
      />
    </div>
  );
}