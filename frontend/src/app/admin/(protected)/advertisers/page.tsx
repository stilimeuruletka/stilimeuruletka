"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import styles from "../../admin.module.css";

type AdvertiserRow = {
  id: string;
  code: string;
  name: string;
  telegram_link: string | null;
  active: boolean;
  created_at: string;
};

type AdvertiserStat = {
  advertiser_id: string;
  code: string;
  name: string;
  clicks: number;
  registrations: number;
};

type ToastState = { message: string; variant: "ok" | "error" } | null;

function yyyyMmDd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toIsoStartOfDayLocal(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function toIsoEndOfDayLocal(dateStr: string) {
  const d = new Date(`${dateStr}T23:59:59.999`);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

async function copyToClipboardFallback(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // ignore
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.left = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export default function AdminAdvertisersPage() {
  const today = useMemo(() => new Date(), []);
  const defaultTo = useMemo(() => yyyyMmDd(today), [today]);
  const defaultFrom = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 30);
    return yyyyMmDd(d);
  }, [today]);

  const [toast, setToast] = useState<ToastState>(null);
  const toastTimerRef = useRef<number | null>(null);

  const [advertisers, setAdvertisers] = useState<AdvertiserRow[]>([]);
  const [advertisersLoading, setAdvertisersLoading] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newTelegramLink, setNewTelegramLink] = useState("");
  const [newActive, setNewActive] = useState(true);
  const [editing, setEditing] = useState<
    Record<string, { name: string; telegram_link: string; active: boolean }>
  >({});

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [stats, setStats] = useState<AdvertiserStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [linkConfig, setLinkConfig] = useState<{
    bot_username: string;
    app_slug: string;
  } | null>(null);

  const showToast = useCallback((message: string, variant: "ok" | "error" = "ok") => {
    setToast({ message, variant });
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2500);
  }, []);

  const loadAdvertisers = useCallback(async () => {
    setAdvertisersLoading(true);
    const res = await fetch("/admin/api/advertisers", { cache: "no-store" }).catch(() => null);
    if (!res || !res.ok) {
      setAdvertisers([]);
    } else {
      const json = (await res.json().catch(() => null)) as { advertisers?: AdvertiserRow[] } | null;
      setAdvertisers(Array.isArray(json?.advertisers) ? json!.advertisers! : []);
    }
    setAdvertisersLoading(false);
  }, []);

  const loadConfig = useCallback(async () => {
    const res = await fetch("/admin/api/advertisers/link-config", { cache: "no-store" }).catch(() => null);
    if (!res || !res.ok) {
      setLinkConfig(null);
      return;
    }
    const json = (await res.json().catch(() => null)) as {
      bot_username?: string;
      app_slug?: string;
    } | null;
    setLinkConfig({
      bot_username: json?.bot_username || "",
      app_slug: json?.app_slug || "app"
    });
  }, []);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    const fromIso = toIsoStartOfDayLocal(from);
    const toIso = toIsoEndOfDayLocal(to);

    const qs = new URLSearchParams();
    if (fromIso) qs.set("from", fromIso);
    if (toIso) qs.set("to", toIso);

    const res = await fetch(`/admin/api/advertisers/stats?${qs.toString()}`, { cache: "no-store" }).catch(
      () => null
    );
    if (!res || !res.ok) {
      const msg = (await res?.json().catch(() => null)) as { error?: string } | null;
      setError(msg?.error || "Нет доступа к аналитике рекламы");
      setStats([]);
      setLoading(false);
      return;
    }

    const json = (await res.json().catch(() => null)) as { stats?: AdvertiserStat[] } | null;
    setStats(Array.isArray(json?.stats) ? json!.stats! : []);
    setLoading(false);
  }, [from, to]);

  const loadAll = useCallback(() => {
    void loadAdvertisers();
    void loadStats();
    void loadConfig();
  }, [loadAdvertisers, loadStats, loadConfig]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadAll();
    }, 0);
    return () => window.clearTimeout(id);
  }, [loadAll]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void loadAdvertisers();
      void loadStats();
    }, 5000);
    return () => window.clearInterval(id);
  }, [loadAdvertisers, loadStats]);

  const statsMap = useMemo(() => {
    const map = new Map<string, AdvertiserStat>();
    for (const s of stats) map.set(s.advertiser_id, s);
    return map;
  }, [stats]);

  const totals = useMemo(() => {
    let clicks = 0;
    let registrations = 0;
    for (const s of stats) {
      clicks += Number(s.clicks) || 0;
      registrations += Number(s.registrations) || 0;
    }
    return { clicks, registrations };
  }, [stats]);

  const buildAdvertiserLink = useCallback(
    (a: { code: string; telegram_link: string | null }) => {
      const custom = a.telegram_link?.trim();
      if (custom && /^https?:\/\//i.test(custom)) return custom;
      const bot = linkConfig?.bot_username || "<BOT>";
      const slug = linkConfig?.app_slug || "app";
      const cleanCode = String(a.code || "").trim().replace(/^adv_/i, "") || "adv";
      return `https://t.me/${bot}/${slug}?startapp=adv_${cleanCode}&mode=fullscreen`;
    },
    [linkConfig]
  );

  const handleCopyLink = async (a: { code: string; telegram_link: string | null }) => {
    const link = buildAdvertiserLink(a);
    const ok = await copyToClipboardFallback(link);
    showToast(ok ? `Ссылка скопирована: ${link}` : "Не удалось скопировать", ok ? "ok" : "error");
  };

  const createAdvertiser = async () => {
    setError(null);
    const payload = {
      code: newCode.trim(),
      name: newName.trim(),
      telegram_link: newTelegramLink.trim() || null,
      active: newActive
    };
    const res = await fetch("/admin/api/advertisers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(() => null);
    if (!res || !res.ok) {
      const msg = (await res?.json().catch(() => null)) as { error?: string } | null;
      setError(msg?.error || "Не удалось добавить рекламодателя");
      return;
    }
    setNewCode("");
    setNewName("");
    setNewTelegramLink("");
    setNewActive(true);
    await loadAdvertisers();
    void loadStats();
  };

  const startEdit = (a: AdvertiserRow) => {
    setEditing((prev) => ({
      ...prev,
      [a.id]: { name: a.name, telegram_link: a.telegram_link ?? "", active: a.active }
    }));
  };

  const cancelEdit = (id: string) => {
    setEditing((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const updateAdvertiser = async (id: string) => {
    const patch = editing[id];
    if (!patch) return;
    setError(null);
    const res = await fetch(`/admin/api/advertisers/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: patch.name,
        telegram_link: patch.telegram_link.trim() || null,
        active: patch.active
      })
    }).catch(() => null);
    if (!res || !res.ok) {
      const msg = (await res?.json().catch(() => null)) as { error?: string } | null;
      setError(msg?.error || "Не удалось сохранить");
      return;
    }
    cancelEdit(id);
    await loadAdvertisers();
    void loadStats();
  };

  const deleteAdvertiser = async (id: string) => {
    setError(null);
    const ok = window.confirm("Удалить рекламодателя? Статистика переходов останется.");
    if (!ok) return;
    const res = await fetch(`/admin/api/advertisers/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { "x-confirm": "yes" }
    }).catch(() => null);
    if (!res || !res.ok) {
      const msg = (await res?.json().catch(() => null)) as { error?: string } | null;
      setError(msg?.error || "Не удалось удалить");
      return;
    }
    await loadAdvertisers();
    void loadStats();
  };

  return (
    <>
      {/* ============ РАБОТА С РЕКЛАМОДАТЕЛЯМИ ============ */}
      <div className={styles.card}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Реклама</h1>
          <div className={styles.pill}>
            <span>Всего: {advertisers.length}</span>
            <span>Активных: {advertisers.filter((a) => a.active).length}</span>
          </div>
        </div>

        <div className={styles.muted} style={{ marginBottom: 12, lineHeight: 1.5 }}>
          Рекламодатели — те, у кого мы покупаем рекламу. Создайте рекламодателя и скопируйте его
          реферальную ссылку, чтобы отдать её блогеру. По ссылке видно, сколько людей к нам пришло.
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <div className={styles.label}>Код ссылки (a-z 0-9 _ -)</div>
            <input
              className={styles.input}
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              placeholder="Например: adv_anna"
            />
          </div>
          <div className={styles.field}>
            <div className={styles.label}>Имя</div>
            <input
              className={styles.input}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Например: Анна"
            />
          </div>
          <div className={styles.field}>
            <div className={styles.label}>Своя готовая ссылка (опционально)</div>
            <input
              className={styles.input}
              value={newTelegramLink}
              onChange={(e) => setNewTelegramLink(e.target.value)}
              placeholder="https://t.me/... (если есть готовая ссылка)"
            />
          </div>
          <div className={styles.field}>
            <div className={styles.label}>Активен</div>
            <select
              className={styles.input}
              value={newActive ? "1" : "0"}
              onChange={(e) => setNewActive(e.target.value === "1")}
            >
              <option value="1">Да</option>
              <option value="0">Нет</option>
            </select>
          </div>
        </div>

        <div className={styles.buttonRow}>
          <button className={`${styles.button} ${styles.buttonPrimary}`} type="button" onClick={createAdvertiser}>
            Добавить рекламодателя
          </button>
          <button className={styles.button} type="button" onClick={loadAdvertisers} disabled={advertisersLoading}>
            {advertisersLoading ? "Обновление..." : "Обновить список"}
          </button>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Код</th>
                <th className={styles.th}>Имя</th>
                <th className={styles.th}>Готовая ссылка</th>
                <th className={styles.th}>Активен</th>
                <th className={styles.th}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {advertisers.map((a) => {
                const e = editing[a.id];
                const link = buildAdvertiserLink(a);
                return (
                  <tr key={a.id}>
                    <td className={styles.td}>
                      <div style={{ fontFamily: "monospace", fontSize: 13 }}>{a.code}</div>
                      <div className={styles.muted} style={{ fontSize: 11, wordBreak: "break-all" }}>
                        {link}
                      </div>
                    </td>
                    <td className={styles.td}>
                      {e ? (
                        <input
                          className={styles.inlineInput}
                          value={e.name}
                          onChange={(ev) =>
                            setEditing((prev) => ({
                              ...prev,
                              [a.id]: { ...prev[a.id]!, name: ev.target.value }
                            }))
                          }
                        />
                      ) : (
                        a.name
                      )}
                    </td>
                    <td className={styles.td}>
                      {e ? (
                        <input
                          className={styles.inlineInput}
                          value={e.telegram_link}
                          onChange={(ev) =>
                            setEditing((prev) => ({
                              ...prev,
                              [a.id]: { ...prev[a.id]!, telegram_link: ev.target.value }
                            }))
                          }
                          placeholder="https://t.me/..."
                        />
                      ) : a.telegram_link ? (
                        <a
                          href={a.telegram_link}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            color: "#b81f22",
                            textDecoration: "underline",
                            wordBreak: "break-all",
                            fontSize: 13
                          }}
                        >
                          {a.telegram_link}
                        </a>
                      ) : (
                        <span className={styles.muted}>—</span>
                      )}
                    </td>
                    <td className={styles.td}>
                      {e ? (
                        <select
                          className={styles.inlineInput}
                          value={e.active ? "1" : "0"}
                          onChange={(ev) =>
                            setEditing((prev) => ({
                              ...prev,
                              [a.id]: { ...prev[a.id]!, active: ev.target.value === "1" }
                            }))
                          }
                        >
                          <option value="1">Да</option>
                          <option value="0">Нет</option>
                        </select>
                      ) : a.active ? (
                        "Да"
                      ) : (
                        "Нет"
                      )}
                    </td>
                    <td className={styles.td}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button className={styles.button} type="button" onClick={() => handleCopyLink(a)}>
                          Копировать ссылку
                        </button>
                        {e ? (
                          <>
                            <button
                              className={`${styles.button} ${styles.buttonPrimary}`}
                              type="button"
                              onClick={() => updateAdvertiser(a.id)}
                            >
                              Сохранить
                            </button>
                            <button className={styles.button} type="button" onClick={() => cancelEdit(a.id)}>
                              Отмена
                            </button>
                          </>
                        ) : (
                          <button className={styles.button} type="button" onClick={() => startEdit(a)}>
                            Редактировать
                          </button>
                        )}
                        {!e && (
                          <button
                            className={`${styles.button} ${styles.buttonDanger}`}
                            type="button"
                            onClick={() => deleteAdvertiser(a.id)}
                          >
                            Удалить
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {advertisers.length === 0 && (
                <tr>
                  <td className={styles.td} colSpan={5}>
                    {advertisersLoading ? "Загрузка..." : "Нет рекламодателей — добавьте первого выше"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ============ СТАТИСТИКА ПЕРЕХОДОВ ============ */}
      <div className={styles.card} style={{ marginTop: 16 }}>
        <div className={styles.titleRow}>
          <h2 className={styles.title}>Сколько людей пришло</h2>
          <div className={styles.pill}>
            <span>
              Переходы: {totals.clicks} · Пришло: {totals.registrations}
            </span>
          </div>
        </div>

        <div className={styles.muted} style={{ marginBottom: 12, lineHeight: 1.5 }}>
          Переходы — сколько человек открыли приложение по ссылке рекламодателя. Пришло людей —
          сколько новых пользователей зарегистрировалось через эту ссылку.
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <div className={styles.label}>С</div>
            <input className={styles.input} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className={styles.field}>
            <div className={styles.label}>По</div>
            <input className={styles.input} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        <div className={styles.buttonRow}>
          <button className={`${styles.button} ${styles.buttonPrimary}`} type="button" onClick={loadStats} disabled={loading}>
            {loading ? "Обновление..." : "Обновить аналитику"}
          </button>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Код</th>
                <th className={styles.th}>Имя</th>
                <th className={`${styles.th} ${styles.tdRight}`}>Переходы</th>
                <th className={`${styles.th} ${styles.tdRight}`}>Пришло людей</th>
              </tr>
            </thead>
            <tbody>
              {advertisers.map((a) => {
                const s = statsMap.get(a.id);
                return (
                  <tr key={a.id}>
                    <td className={styles.td}>{a.code}</td>
                    <td className={styles.td}>{a.name}</td>
                    <td className={`${styles.td} ${styles.tdRight}`}>{s?.clicks ?? 0}</td>
                    <td className={`${styles.td} ${styles.tdRight}`}>{s?.registrations ?? 0}</td>
                  </tr>
                );
              })}
              {advertisers.length === 0 && (
                <tr>
                  <td className={styles.td} colSpan={4}>
                    {loading ? "Загрузка..." : "Нет данных за выбранный период"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className={styles.muted} style={{ marginTop: 12 }}>
          Автообновление: каждые 5 секунд
        </div>
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