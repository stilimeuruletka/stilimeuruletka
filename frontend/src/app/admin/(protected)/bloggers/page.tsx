"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import styles from "../../admin.module.css";

type BloggerStat = {
  blogger_id: string;
  code: string;
  name: string;
  clicks: number;
  registrations: number;
  spins: number;
};

type BloggerRow = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  created_at: string;
};

type ToastState = { message: string; variant: "ok" | "error" } | null;

function demoStats(): BloggerStat[] {
  return [
    { blogger_id: "demo-1", code: "blog_anna", name: "Анна", clicks: 120, registrations: 38, spins: 44 },
    { blogger_id: "demo-2", code: "blog_kate", name: "Катя", clicks: 76, registrations: 21, spins: 19 },
    { blogger_id: "demo-3", code: "blog_masha", name: "Маша", clicks: 34, registrations: 8, spins: 5 }
  ];
}

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

export default function AdminBloggersPage() {
  const today = useMemo(() => new Date(), []);
  const defaultTo = useMemo(() => yyyyMmDd(today), [today]);
  const defaultFrom = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 30);
    return yyyyMmDd(d);
  }, [today]);

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [stats, setStats] = useState<BloggerStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [bloggers, setBloggers] = useState<BloggerRow[]>([]);
  const [bloggersLoading, setBloggersLoading] = useState(false);

  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newActive, setNewActive] = useState(true);

  const [editing, setEditing] = useState<Record<string, { name: string; active: boolean }>>({});

  const [toast, setToast] = useState<ToastState>(null);
  const toastTimerRef = useRef<number | null>(null);
  const [linkConfig, setLinkConfig] = useState<{
    bot_username: string;
    app_slug: string;
  } | null>(null);

  const showToast = useCallback((message: string, variant: "ok" | "error" = "ok") => {
    setToast({ message, variant });
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2500);
  }, []);

  const loadBloggers = useCallback(async () => {
    setBloggersLoading(true);
    const res = await fetch("/admin/api/bloggers", { cache: "no-store" }).catch(() => null);
    if (!res || !res.ok) {
      setBloggers([]);
    } else {
      const json = (await res.json().catch(() => null)) as { bloggers?: BloggerRow[] } | null;
      setBloggers(Array.isArray(json?.bloggers) ? json!.bloggers! : []);
    }
    setBloggersLoading(false);
  }, []);

  const loadConfig = useCallback(async () => {
    const res = await fetch("/admin/api/bloggers/link-config", { cache: "no-store" }).catch(() => null);
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

    const res = await fetch(`/admin/api/bloggers/stats?${qs.toString()}`, { cache: "no-store" }).catch(() => null);
    if (!res || !res.ok) {
      const msg = (await res?.json().catch(() => null)) as { error?: string } | null;
      setError(msg?.error || "Демо-режим: нет доступа к API аналитики");
      setStats(demoStats());
      setLoading(false);
      return;
    }

    const json = (await res.json().catch(() => null)) as { stats?: BloggerStat[] } | null;
    setStats(Array.isArray(json?.stats) ? json!.stats! : []);
    setLoading(false);
  }, [from, to]);

  const loadAll = useCallback(() => {
    void loadBloggers();
    void loadStats();
    void loadConfig();
  }, [loadBloggers, loadStats, loadConfig]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadAll();
    }, 0);
    return () => window.clearTimeout(id);
  }, [loadAll]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void loadStats();
    }, 5000);
    return () => window.clearInterval(id);
  }, [loadStats]);

  const totals = useMemo(() => {
    return stats.reduce(
      (acc, s) => {
        acc.clicks += Number(s.clicks) || 0;
        acc.registrations += Number(s.registrations) || 0;
        acc.spins += Number(s.spins) || 0;
        return acc;
      },
      { clicks: 0, registrations: 0, spins: 0 }
    );
  }, [stats]);

  const buildBloggerLink = useCallback(
    (code: string) => {
      const bot = linkConfig?.bot_username || "<BOT>";
      const slug = linkConfig?.app_slug || "app";
      const cleanCode = String(code || "").trim().replace(/^blog_/i, "");
      return `https://t.me/${bot}/${slug}?startapp=blog_${cleanCode}&mode=fullscreen`;
    },
    [linkConfig]
  );

  const handleCopyLink = async (code: string) => {
    const link = buildBloggerLink(code);
    const ok = await copyToClipboardFallback(link);
    showToast(ok ? `Ссылка скопирована: ${link}` : "Не удалось скопировать", ok ? "ok" : "error");
  };

  const createBlogger = async () => {
    setError(null);
    const payload = {
      code: newCode.trim(),
      name: newName.trim(),
      active: newActive
    };
    const res = await fetch("/admin/api/bloggers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(() => null);
    if (!res || !res.ok) {
      const msg = (await res?.json().catch(() => null)) as { error?: string } | null;
      setError(msg?.error || "Не удалось создать блогера");
      return;
    }
    setNewCode("");
    setNewName("");
    setNewActive(true);
    await loadBloggers();
    void loadStats();
  };

  const startEdit = (b: BloggerRow) => {
    setEditing((prev) => ({ ...prev, [b.id]: { name: b.name, active: b.active } }));
  };

  const cancelEdit = (id: string) => {
    setEditing((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const updateBlogger = async (id: string) => {
    const patch = editing[id];
    if (!patch) return;
    setError(null);
    const res = await fetch(`/admin/api/bloggers/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: patch.name, active: patch.active })
    }).catch(() => null);
    if (!res || !res.ok) {
      const msg = (await res?.json().catch(() => null)) as { error?: string } | null;
      setError(msg?.error || "Не удалось сохранить");
      return;
    }
    cancelEdit(id);
    await loadBloggers();
    void loadStats();
  };

  const deleteBlogger = async (id: string) => {
    setError(null);
    const ok = window.confirm("Удалить блогера? Статистика кликов останется.");
    if (!ok) return;
    const res = await fetch(`/admin/api/bloggers/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { "x-confirm": "yes" }
    }).catch(() => null);
    if (!res || !res.ok) {
      const msg = (await res?.json().catch(() => null)) as { error?: string } | null;
      setError(msg?.error || "Не удалось удалить");
      return;
    }
    await loadBloggers();
    void loadStats();
  };

  return (
    <>
      <div className={styles.card}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Блогеры: реферальные ссылки</h1>
          <div className={styles.pill}>
            <span>Всего: {bloggers.length}</span>
            <span>Активных: {bloggers.filter((b) => b.active).length}</span>
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <div className={styles.label}>Код ссылки (a-z 0-9 _ -)</div>
            <input
              className={styles.input}
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              placeholder="Например: blog_anna"
            />
          </div>
          <div className={styles.field}>
            <div className={styles.label}>Имя блогера</div>
            <input
              className={styles.input}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Например: Анна"
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
          <button
            className={`${styles.button} ${styles.buttonPrimary}`}
            type="button"
            onClick={createBlogger}
          >
            Создать ссылку
          </button>
          <button className={styles.button} type="button" onClick={loadBloggers} disabled={bloggersLoading}>
            {bloggersLoading ? "Обновление..." : "Обновить список"}
          </button>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Код</th>
                <th className={styles.th}>Имя</th>
                <th className={styles.th}>Активен</th>
                <th className={styles.th}>Создан</th>
                <th className={styles.th}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {bloggers.map((b) => {
                const e = editing[b.id];
                const link = buildBloggerLink(b.code);
                return (
                  <tr key={b.id}>
                    <td className={styles.td}>
                      <div style={{ fontFamily: "monospace", fontSize: 13 }}>{b.code}</div>
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
                              [b.id]: { ...prev[b.id]!, name: ev.target.value }
                            }))
                          }
                        />
                      ) : (
                        b.name
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
                              [b.id]: { ...prev[b.id]!, active: ev.target.value === "1" }
                            }))
                          }
                        >
                          <option value="1">Да</option>
                          <option value="0">Нет</option>
                        </select>
                      ) : b.active ? (
                        "Да"
                      ) : (
                        "Нет"
                      )}
                    </td>
                    <td className={styles.td}>
                      {new Intl.DateTimeFormat("ru-RU", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit"
                      }).format(new Date(b.created_at))}
                    </td>
                    <td className={styles.td}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button className={styles.button} type="button" onClick={() => handleCopyLink(b.code)}>
                          Копировать ссылку
                        </button>
                        {e ? (
                          <>
                            <button
                              className={`${styles.button} ${styles.buttonPrimary}`}
                              type="button"
                              onClick={() => updateBlogger(b.id)}
                            >
                              Сохранить
                            </button>
                            <button className={styles.button} type="button" onClick={() => cancelEdit(b.id)}>
                              Отмена
                            </button>
                          </>
                        ) : (
                          <button className={styles.button} type="button" onClick={() => startEdit(b)}>
                            Редактировать
                          </button>
                        )}
                        <button
                          className={`${styles.button} ${styles.buttonDanger}`}
                          type="button"
                          onClick={() => deleteBlogger(b.id)}
                        >
                          Удалить
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {bloggers.length === 0 && (
                <tr>
                  <td className={styles.td} colSpan={5}>
                    {bloggersLoading ? "Загрузка..." : "Нет ссылок — создайте первую выше"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className={styles.card} style={{ marginTop: 16 }}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Аналитика по блогерам</h1>
          <div className={styles.pill}>
            <span>Переходы: {totals.clicks}</span>
            <span>Регистрации: {totals.registrations}</span>
            <span>Спины: {totals.spins}</span>
          </div>
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
          <button
            className={`${styles.button} ${styles.buttonPrimary}`}
            type="button"
            onClick={loadStats}
            disabled={loading}
          >
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
                <th className={`${styles.th} ${styles.tdRight}`}>Регистрации</th>
                <th className={`${styles.th} ${styles.tdRight}`}>Спины</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <tr key={s.blogger_id}>
                  <td className={styles.td}>{s.code}</td>
                  <td className={styles.td}>{s.name}</td>
                  <td className={`${styles.td} ${styles.tdRight}`}>{s.clicks}</td>
                  <td className={`${styles.td} ${styles.tdRight}`}>{s.registrations}</td>
                  <td className={`${styles.td} ${styles.tdRight}`}>{s.spins}</td>
                </tr>
              ))}
              {stats.length === 0 && (
                <tr>
                  <td className={styles.td} colSpan={5}>
                    {loading ? "Загрузка..." : "Нет данных за выбранный период"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className={styles.muted} style={{ marginTop: 12 }}>
          Автообновление аналитики: каждые 5 секунд
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
