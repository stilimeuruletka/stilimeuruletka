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

// Резервный ролик — играет сразу, до того как придёт очередь из БД.
// ?v=2 — обход кэша после перекодирования видео (HEVC → H.264 + faststart)
const DEFAULT_OWN = "/ГЛАВНОЕВИДЕО.mp4?v=2";

export default function Home() {
  const router = useRouter();
  const [playlist, setPlaylist] = useState<string[]>([DEFAULT_OWN]);
  const [adIds, setAdIds] = useState<string[]>(["own"]);
  const [index, setIndex] = useState(0);
  const recordedRef = useRef<Set<number>>(new Set());
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Загружаем очередь роликов (наш + активная реклама).
  // Пока она едет, уже играет DEFAULT_OWN — поэтому никакой текстовой
  // заглушки («анимация») и вспышек на экране нет.
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
        const items = [own.trim()];
        const ids: string[] = ["own"];
        if (ad && ad.video_url && ad.video_url.trim()) {
          items.push(ad.video_url.trim());
          ids.push(ad.id);
        }
        setPlaylist(items);
        setAdIds(ids);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Звук: на iOS автоплей со звуком заблокирован до первого касания —
  // в разметке видео стартует в muted-режиме (иначе play() на iPhone
  // «зависает» в ожидании тапа и видео не начинает играть).
  // Первый тап по экрану включает звук.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const play = (): Promise<void> | undefined => {
      try {
        const p = v.play();
        if (p && typeof p.catch === "function") {
          return Promise.resolve(p).catch(() => {});
        }
        return undefined;
      } catch {
        /* media API недоступен (jsdom) — игнорируем */
        return undefined;
      }
    };

    play();

    const unlock = () => {
      v.muted = false;
      play();
    };
    document.addEventListener("pointerdown", unlock, { passive: true });

    return () => {
      document.removeEventListener("pointerdown", unlock);
    };
  }, [playlist[index]]);

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

  return (
    <div className={styles.splashVideoWrap}>
      <video
        key={playlist[index]}
        ref={videoRef}
        data-testid="preview-video"
        src={playlist[index]}
        className={styles.splashVideo}
        autoPlay
        muted
        playsInline
        preload="auto"
        onPlay={() => recordView(index)}
        onEnded={onEnded}
      />
    </div>
  );
}