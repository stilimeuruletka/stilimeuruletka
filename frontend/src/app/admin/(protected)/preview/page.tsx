"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import styles from "../../admin.module.css";

type ToastState = { message: string; variant: "ok" | "error" } | null;

type OwnState = { video_url: string | null };

type Ad = {
  id: string;
  client_name: string;
  video_url: string;
  publish_date: string;
  end_date: string;
  active: boolean;
  views: number;
  created_at: string;
};

const DEFAULT_OWN = "/ГЛАВНОЕВИДЕО.mp4";

function formatRu(iso: string | null | undefined) {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(ms));
}

export default function AdminPreviewPage() {
  const [toast, setToast] = useState<ToastState>(null);
  const toastTimerRef = useRef<number | null>(null);
  const showToast = useCallback((message: string, variant: "ok" | "error" = "ok") => {
    setToast({ message, variant });
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  // --- Наш ролик ---
  const [own, setOwn] = useState<OwnState>({ video_url: null });
  const [ownFile, setOwnFile] = useState<File | null>(null);
  const [ownUploading, setOwnUploading] = useState(false);
  const [ownError, setOwnError] = useState<string | null>(null);
  const ownInputRef = useRef<HTMLInputElement | null>(null);

  // --- Реклама: текущая очередь + список ---
  const [ads, setAds] = useState<Ad[]>([]);
  const [ownViews, setOwnViews] = useState(0);
  const [adsLoading, setAdsLoading] = useState(true);
  const [adsError, setAdsError] = useState<string | null>(null);

  // --- Форма нового заказа ---
  const [clientName, setClientName] = useState("");
  const [publishDate, setPublishDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [adFile, setAdFile] = useState<File | null>(null);
  const [adActive, setAdActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const adInputRef = useRef<HTMLInputElement | null>(null);

  const loadAds = useCallback(async () => {
    const res = await fetch("/admin/api/preview/ads", { cache: "no-store" }).catch(() => null);
    if (!res || !res.ok) {
      setAdsError("Нет доступа к БД локально");
      setAds([]);
      setAdsLoading(false);
      return;
    }
    const json = (await res.json().catch(() => null)) as { ads?: Ad[]; own_views?: number } | null;
    setAds(Array.isArray(json?.ads) ? json!.ads! : []);
    setOwnViews(typeof json?.own_views === "number" ? json!.own_views! : 0);
    setAdsLoading(false);
  }, []);

  const loadOwn = useCallback(async () => {
    const res = await fetch("/admin/api/settings/splash", { cache: "no-store" }).catch(() => null);
    if (!res || !res.ok) {
      setOwn({ video_url: null });
      return;
    }
    const json = (await res.json().catch(() => null)) as { splash_video_url?: string } | null;
    setOwn({ video_url: json?.splash_video_url ?? null });
  }, []);

  useEffect(() => {
    void loadAds();
    void loadOwn();
  }, [loadAds, loadOwn]);

  const handleOwnFile = (file: File | null) => {
    setOwnError(null);
    if (!file) return;
    const isMp4 = file.type === "video/mp4" || file.name.toLowerCase().endsWith(".mp4");
    if (!isMp4) {
      setOwnError("Разрешён только MP4");
      setOwnFile(null);
      return;
    }
    if (file.size <= 0 || file.size > 100 * 1024 * 1024) {
      setOwnError("Размер до 100 МБ");
      setOwnFile(null);
      return;
    }
    setOwnFile(file);
  };

  const uploadOwn = async () => {
    if (!ownFile) return;
    setOwnError(null);
    setOwnUploading(true);
    const form = new FormData();
    form.append("file", ownFile, ownFile.name);
    const res = await fetch("/admin/api/settings/splash", { method: "POST", body: form }).catch(() => null);
    setOwnUploading(false);
    if (!res || !res.ok) {
      const msg = (await res?.json().catch(() => null)) as { error?: string } | null;
      setOwnError(msg?.error || "Не удалось загрузить ролик");
      return;
    }
    const json = (await res.json().catch(() => null)) as { splash_video_url?: string } | null;
    setOwn({ video_url: json?.splash_video_url ?? null });
    setOwnFile(null);
    if (ownInputRef.current) ownInputRef.current.value = "";
    showToast("Наш Preview-ролик обновлён", "ok");
  };

  const resetOwn = async () => {
    setOwnError(null);
    setOwnUploading(true);
    const res = await fetch("/admin/api/settings/splash", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reset: true })
    }).catch(() => null);
    setOwnUploading(false);
    if (!res || !res.ok) {
      setOwnError("Не удалось сбросить");
      return;
    }
    setOwn({ video_url: DEFAULT_OWN });
    showToast("Восстановлен ролик по умолчанию", "ok");
  };

  const handleAdFile = (file: File | null) => {
    setFormError(null);
    if (!file) {
      setAdFile(null);
      return;
    }
    const isMp4 = file.type === "video/mp4" || file.name.toLowerCase().endsWith(".mp4");
    if (!isMp4) {
      setFormError("Ролик должен быть MP4");
      setAdFile(null);
      return;
    }
    if (file.size <= 0 || file.size > 100 * 1024 * 1024) {
      setFormError("Размер ролика до 100 МБ");
      setAdFile(null);
      return;
    }
    setAdFile(file);
  };

  const saveAd = async () => {
    if (!clientName.trim()) {
      setFormError("Укажи заказчика");
      return;
    }
    if (!publishDate || !endDate) {
      setFormError("Укажи даты публикации и окончания");
      return;
    }
    if (!adFile) {
      setFormError("Прикрепи видео-ролик");
      return;
    }
    setSaving(true);
    setFormError(null);

    const form = new FormData();
    form.append("client_name", clientName.trim());
    form.append("publish_date", publishDate);
    form.append("end_date", endDate);
    form.append("active", String(adActive));
    form.append("file", adFile, adFile.name);

    const res = await fetch("/admin/api/preview/ads", { method: "POST", body: form }).catch(() => null);
    setSaving(false);
    if (!res || !res.ok) {
      const msg = (await res?.json().catch(() => null)) as { error?: string } | null;
      setFormError(msg?.error || "Не удалось сохранить заказ");
      return;
    }
    setClientName("");
    setPublishDate("");
    setEndDate("");
    setAdActive(true);
    setAdFile(null);
    if (adInputRef.current) adInputRef.current.value = "";
    showToast("Рекламный ролик добавлен", "ok");
    await loadAds();
  };

  const toggleAdActive = async (ad: Ad) => {
    const next = !ad.active;
    await fetch(`/admin/api/preview/ads/${ad.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: next })
    }).catch(() => null);
    setAds((prev) => prev.map((x) => (x.id === ad.id ? { ...x, active: next } : x)));
  };

  const deleteAd = async (ad: Ad) => {
    if (!window.confirm(`Удалить заказ "${ad.client_name}"?`)) return;
    await fetch(`/admin/api/preview/ads/${ad.id}`, { method: "DELETE" }).catch(() => null);
    showToast("Заказ удалён");
    await loadAds();
  };

  const activeNow = ads.find((a) => a.active && a.publish_date <= new Date().toISOString().slice(0, 10) && a.end_date >= new Date().toISOString().slice(0, 10));
  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className={styles.row} style={{ gridTemplateColumns: "1fr", gap: 12 }}>
        {/* ============ НАШ РОЛИК (1-й экран) ============ */}
        <section className={styles.card}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>Preview-ролик (наш 1-й экран)</h1>
            <div className={styles.pill}>
              <span>Просмотров сегодня: {ownViews}</span>
            </div>
          </div>
          <div className={styles.muted} style={{ marginBottom: 12, lineHeight: 1.5 }}>
            Это твой ролик, который всегда идёт первым при открытии приложения. Ниже можно добавить платную рекламу
            заказчика на второй (после нашей) экран.
          </div>

          <div style={{ maxWidth: 480, marginBottom: 16 }}>
            <video
              key={own.video_url ?? "none"}
              src={own.video_url ?? undefined}
              className="splash-preview"
              style={{ width: "100%", maxHeight: 380, background: "#000", borderRadius: 12 }}
              muted
              loop
              controls
              playsInline
            />
          </div>

          <div className={styles.row} style={{ alignItems: "flex-end" }}>
            <div className={styles.field}>
              <div className={styles.label}>Новый MP4 (до 100 МБ)</div>
              <input
                ref={ownInputRef}
                className={styles.input}
                type="file"
                accept="video/mp4,.mp4"
                onChange={(e) => handleOwnFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
          <div className={styles.buttonRow}>
            <button
              className={`${styles.button} ${styles.buttonPrimary}`}
              type="button"
              onClick={uploadOwn}
              disabled={ownUploading || !ownFile}
            >
              {ownUploading ? "Загрузка..." : ownFile ? "Загрузить наш ролик" : "Выберите файл"}
            </button>
            <button className={styles.button} type="button" onClick={resetOwn} disabled={ownUploading}>
              Вернуть стандартный ролик
            </button>
          </div>
          {ownError && <div className={styles.error} style={{ marginTop: 10 }}>{ownError}</div>}
        </section>

        {/* ============ РЕКЛАМА 2-го экрана ============ */}
        <section className={styles.card}>
          <div className={styles.titleRow}>
            <h2 className={styles.title}>Аналитика</h2>
            <div className={styles.pill}>
              <span>{activeNow ? "Сейчас активна" : "Реклама не активна"}</span>
            </div>
          </div>
          <div className={styles.muted} style={{ marginBottom: 14, lineHeight: 1.5 }}>
            После нашего ролика пользователь увидит ролик заказчика, но только в указанный период. Вне периода реклама
            пропускается.
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <div className={styles.label}>Заказчик</div>
              <input className={styles.input} value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Название бренда/лица" />
            </div>
            <div className={styles.field}>
              <div className={styles.label}>Дата публикации (выход)</div>
              <input className={styles.input} type="date" value={publishDate} onChange={(e) => setPublishDate(e.target.value)} />
            </div>
            <div className={styles.field}>
              <div className={styles.label}>Дата окончания (удаление)</div>
              <input className={styles.input} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className={styles.row} style={{ alignItems: "flex-end" }}>
            <div className={styles.field} style={{ flex: 2 }}>
              <div className={styles.label}>Видео заказчика (MP4, до 100 МБ)</div>
              <input
                ref={adInputRef}
                className={styles.input}
                type="file"
                accept="video/mp4,.mp4"
                onChange={(e) => handleAdFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className={styles.field}>
              <div className={styles.label}>Активно</div>
              <select className={styles.input} value={adActive ? "1" : "0"} onChange={(e) => setAdActive(e.target.value === "1")}>
                <option value="1">Да</option>
                <option value="0">Нет</option>
              </select>
            </div>
            <div className={styles.buttonRow} style={{ marginTop: 0, alignItems: "flex-end" }}>
              <button className={`${styles.button} ${styles.buttonPrimary}`} type="button" onClick={saveAd} disabled={saving}>
                {saving ? "Сохраняем…" : "Добавить заказ"}
              </button>
            </div>
          </div>
          {formError && <div className={styles.error} style={{ marginTop: 10 }}>{formError}</div>}
        </section>

        {/* ============ СПИСОК ЗАКАЗОВ + АНАЛИТИКА ============ */}
        <section className={styles.card}>
          <div className={styles.titleRow}>
            <h2 className={styles.title}>Заказы Preview-роликов</h2>
            <div className={styles.pill}>
              <span>Просмотров наших роликов: {ownViews.toLocaleString("ru-RU")}</span>
            </div>
          </div>

          {adsError && <div className={styles.error}>{adsError}</div>}
          {adsLoading && <div className={styles.muted} style={{ marginTop: 8 }}>Загрузка…</div>}

          {!adsLoading && ads.length === 0 && !adsError && (
            <div className={styles.muted} style={{ marginTop: 8 }}>Пока нет заказов.</div>
          )}

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>Заказчик</th>
                  <th className={styles.th}>
                    Дата публикации,<br />день выхода
                  </th>
                  <th className={styles.th}>
                    Дата окончания публикации,<br />день удаления рекламы
                  </th>
                  <th className={`${styles.th} ${styles.tdRight}`}>Просмотров</th>
                  <th className={styles.th}>Статус</th>
                  <th className={`${styles.th} ${styles.tdRight}`}>Действия</th>
                </tr>
              </thead>
              <tbody>
                {ads.map((ad) => {
                  const isActiveNow = ad.active && todayStr >= ad.publish_date && todayStr <= ad.end_date;
                  return (
                    <tr key={ad.id}>
                      <td className={styles.td}>
                        <div style={{ fontWeight: 700 }}>{ad.client_name}</div>
                        <div className={styles.muted} style={{ fontSize: 12 }}>
                          <video src={ad.video_url} style={{ width: 120, maxHeight: 68, background: "#000", borderRadius: 6, marginTop: 6 }} muted playsInline controls />
                        </div>
                      </td>
                      <td className={styles.td}>{formatRu(ad.publish_date)}</td>
                      <td className={styles.td}>{formatRu(ad.end_date)}</td>
                      <td className={`${styles.td} ${styles.tdRight}`} style={{ fontWeight: 700 }}>{ad.views ?? 0}</td>
                      <td className={styles.td}>
                        <span className={`${styles.pill} ${isActiveNow ? styles.badgeOk : ad.active ? styles.badgeWarn : ""}`}>
                          {isActiveNow ? "Активна сейчас" : ad.active ? "Запланирована" : "Выкл"}
                        </span>
                      </td>
                      <td className={`${styles.td} ${styles.tdRight}`}>
                        <button className={styles.button} type="button" onClick={() => void toggleAdActive(ad)}>
                          {ad.active ? "Выключить" : "Включить"}
                        </button>
                        <button className={`${styles.button} ${styles.buttonDanger}`} type="button" onClick={() => void deleteAd(ad)}>
                          Удалить
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
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