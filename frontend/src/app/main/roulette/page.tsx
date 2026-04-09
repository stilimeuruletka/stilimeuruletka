"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "../../page.module.css";

function formatRemaining(ms: number | null) {
  if (ms == null) return "--:--:--";
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

type TelegramSdkWindow = Window & {
  Telegram?: {
    WebApp?: { initData?: string; showAlert?: (message: string) => void };
  };
};

function getBackendBase() {
  const raw = process.env.NEXT_PUBLIC_BACKEND_URL;
  return raw ? raw.replace(/\/+$/, "") : "";
}

function getInitData() {
  const w = window as TelegramSdkWindow;
  const initData = w.Telegram?.WebApp?.initData;
  return typeof initData === "string" && initData.length > 10 ? initData : null;
}

type MeState = { balance: number; can_spin: boolean; next_spin_at: string | null };

export default function RoulettePlaceholderPage() {
  const [me, setMe] = useState<MeState | null>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const remainingText = useMemo(() => formatRemaining(remainingMs), [remainingMs]);

  const refreshMe = useCallback(async () => {
    const initData = getInitData();
    if (!initData) return;

    const base = getBackendBase();
    const tzOffset = new Date().getTimezoneOffset();
    const res = await fetch(`${base}/api/me?tz_offset=${encodeURIComponent(String(tzOffset))}`, {
      headers: { "x-telegram-init-data": initData }
    });
    if (!res.ok) return;
    const json = (await res.json().catch(() => null)) as MeState | null;
    if (!json) return;
    setMe(json);
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void refreshMe();
    }, 0);
    return () => window.clearTimeout(id);
  }, [refreshMe]);

  useEffect(() => {
    const nextSpinAtMs = me?.next_spin_at ? Date.parse(me.next_spin_at) : null;

    const update = () => {
      if (!me || me.can_spin || !nextSpinAtMs) {
        setRemainingMs(0);
        return;
      }
      const diff = nextSpinAtMs - Date.now();
      if (diff <= 0) {
        setRemainingMs(0);
        void refreshMe();
        return;
      }
      setRemainingMs(diff);
    };

    const timeoutId = window.setTimeout(update, 0);
    const intervalId = window.setInterval(update, 1000);
    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [me, refreshMe]);

  const onSpin = useCallback(async () => {
    if (!me?.can_spin || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const initData = getInitData();
      if (!initData) return;

      const base = getBackendBase();
      const tzOffset = new Date().getTimezoneOffset();
      const res = await fetch(`${base}/api/spin?tz_offset=${encodeURIComponent(String(tzOffset))}`, {
        method: "POST",
        headers: { "x-telegram-init-data": initData }
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const w = window as TelegramSdkWindow;
        w.Telegram?.WebApp?.showAlert?.("Спин пока недоступен. Подождите таймер.");
        setMessage(text || "Спин пока недоступен.");
        return;
      }

      const json = (await res.json().catch(() => null)) as
        | { prize_title: string | null; win: boolean; next_spin_at?: string | null }
        | null;
      if (json) {
        const title = json.prize_title ?? "Ничего";
        setMessage(json.win ? `Вы выиграли: ${title}` : `Результат: ${title}`);
      }
      await refreshMe();
    } finally {
      setBusy(false);
    }
  }, [busy, me?.can_spin, refreshMe]);

  return (
    <div className={styles.placeholderPage}>
      <div className={styles.placeholderFrame}>
        <Link href="/main" className={styles.placeholderBackLink} aria-label="Назад в меню">
          <Image src="/стрелканадпись.png" alt="Назад" width={3340} height={1472} className={styles.placeholderBackIcon} priority />
        </Link>
        <Image src="/заглушка2.png" alt="Страница в разработке" fill className={styles.placeholderImage} priority />
        <div className={styles.rouletteOverlay}>
          <div className={styles.rouletteInfo}>
            <div>Баланс: {me?.balance ?? "--"}</div>
            <div>{me?.can_spin ? "Можно крутить" : `До следующего спина: ${remainingText}`}</div>
            {message && <div className={styles.rouletteMessage}>{message}</div>}
          </div>
          <button type="button" className={styles.rouletteSpinButton} onClick={onSpin} disabled={!me?.can_spin || busy}>
            {busy ? "Крутим..." : "Крутить"}
          </button>
        </div>
      </div>
    </div>
  );
}
