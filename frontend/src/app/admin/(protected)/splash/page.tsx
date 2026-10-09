"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import styles from "../../admin.module.css";

type ToastState = { message: string; variant: "ok" | "error" } | null;

export default function AdminSplashPage() {
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((message: string, variant: "ok" | "error" = "ok") => {
    setToast({ message, variant });
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3000);
  }, []);

  const load = useCallback(async () => {
    const res = await fetch("/admin/api/settings/splash", { cache: "no-store" }).catch(() => null);
    if (!res || !res.ok) {
      setCurrentUrl(null);
      return;
    }
    const json = (await res.json().catch(() => null)) as { splash_video_url?: string } | null;
    setCurrentUrl(json?.splash_video_url ?? null);
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(id);
  }, [load]);

  const handleFile = (file: File | null) => {
    setError(null);
    if (!file) return;
    const isMp4 = file.type === "video/mp4" || file.name.toLowerCase().endsWith(".mp4");
    if (!isMp4) {
      setError("Разрешён только MP4");
      setSelectedFile(null);
      return;
    }
    if (file.size <= 0 || file.size > 100 * 1024 * 1024) {
      setError("Размер до 100 МБ");
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
  };

  const upload = async () => {
    if (!selectedFile) return;
    setError(null);
    setUploading(true);
    const form = new FormData();
    form.append("file", selectedFile, selectedFile.name);
    const res = await fetch("/admin/api/settings/splash", {
      method: "POST",
      body: form
    }).catch(() => null);
    setUploading(false);
    if (!res || !res.ok) {
      const msg = (await res?.json().catch(() => null)) as { error?: string } | null;
      setError(msg?.error || "Не удалось загрузить видео");
      return;
    }
    const json = (await res.json().catch(() => null)) as { splash_video_url?: string } | null;
    setCurrentUrl(json?.splash_video_url ?? null);
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    showToast("Видео обложки обновлено ✅", "ok");
  };

  const resetDefault = async () => {
    setError(null);
    setUploading(true);
    const res = await fetch("/admin/api/settings/splash", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reset: true })
    }).catch(() => null);
    setUploading(false);
    if (!res || !res.ok) {
      setError("Не удалось сбросить");
      return;
    }
    const json = (await res.json().catch(() => null)) as { splash_video_url?: string } | null;
    setCurrentUrl(json?.splash_video_url ?? null);
    showToast("Восстановлено видео по умолчанию", "ok");
  };

  return (
    <>
      <div className={styles.card}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Видео обложки (сплэш)</h1>
        </div>

        <div className={styles.muted} style={{ marginBottom: 14, lineHeight: 1.5 }}>
          Это полноэкранное видео на стартовом экране, которое ведёт в приложение. Загрузите MP4 — оно сразу
          встанет вместо обложки.
        </div>

        <div style={{ maxWidth: 480 }}>
          <video
            key={currentUrl ?? "none"}
            src={currentUrl ?? undefined}
            className="splash-preview"
            style={{ width: "100%", maxHeight: 420, background: "#000", borderRadius: 12 }}
            muted
            loop
            controls
            playsInline
            onClick={(e) => e.currentTarget.play().catch(() => {})}
          />
        </div>

        <div className={styles.row} style={{ marginTop: 16, alignItems: "flex-end" }}>
          <div className={styles.field}>
            <div className={styles.label}>Файл MP4 (до 100 МБ)</div>
            <input
              ref={fileInputRef}
              className={styles.input}
              type="file"
              accept="video/mp4,.mp4"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>

        <div className={styles.buttonRow}>
          <button
            className={`${styles.button} ${styles.buttonPrimary}`}
            type="button"
            onClick={upload}
            disabled={uploading || !selectedFile}
          >
            {uploading ? "Загрузка..." : selectedFile ? "Загрузить и применить" : "Выберите файл"}
          </button>
          <button className={styles.button} type="button" onClick={resetDefault} disabled={uploading}>
            Вернуть стандартное видео
          </button>
        </div>

        {error && <div className={styles.error} style={{ marginTop: 10 }}>{error}</div>}
      </div>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            left: "50%",
            bottom: 30,
            transform: "translateX(-50%) translateY(-6px)",
            padding: "12px 18px",
            borderRadius: 12,
            background: toast.variant === "error" ? "#7a1f1f" : "rgba(184, 31, 34, 0.9)",
            color: "#f5f5f7",
            fontSize: 14,
            fontWeight: 600,
            zIndex: 9999,
            boxShadow: "0 6px 20px rgba(0,0,0,0.35)",
            maxWidth: "calc(100vw - 32px)",
            border: "1px solid rgba(255,255,255,0.12)"
          }}
        >
          {toast.message}
        </div>
      )}
    </>
  );
}