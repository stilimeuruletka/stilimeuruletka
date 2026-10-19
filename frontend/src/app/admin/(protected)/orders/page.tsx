"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import styles from "../../admin.module.css";

type BloggerRow = {
  id: string;
  code: string;
  name: string;
  telegram_link: string | null;
  active: boolean;
  created_at: string;
};

type CampaignRow = {
  id: string;
  blogger_id: string;
  blogger_name: string | null;
  channel_id: string;
  telegram_link: string | null;
  goal_subscribers: number;
  starts_at: string;
  ends_at: string | null;
  active: boolean;
  created_at: string;
  confirmed_count: number;
  percent: number;
};

type ToastState = { message: string; variant: "ok" | "error" } | null;

function progressClass(p: number) {
  if (p >= 100) return `${styles.progressFill} ${styles.progressFillFull}`;
  if (p >= 85) return `${styles.progressFill} ${styles.progressFillAlmost}`;
  return styles.progressFill;
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

export default function AdminOrdersPage() {
  // ---- Общее состояние ----
  const [toast, setToast] = useState<ToastState>(null);
  const toastTimerRef = useRef<number | null>(null);

  // ---- Заказы (блогеры) ----
  const [bloggers, setBloggers] = useState<BloggerRow[]>([]);
  const [bloggersLoading, setBloggersLoading] = useState(false);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newTelegramLink, setNewTelegramLink] = useState("");
  const [newActive, setNewActive] = useState(true);
  const [editing, setEditing] = useState<Record<string, { name: string; telegram_link: string; active: boolean }>>(
    {}
  );
  const [showClosed, setShowClosed] = useState(false);
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

  const loadCampaigns = useCallback(async () => {
    const res = await fetch("/admin/api/subscription/campaigns", { cache: "no-store" }).catch(() => null);
    if (!res || !res.ok) {
      setCampaigns([]);
      return;
    }
    const json = (await res.json().catch(() => null)) as { campaigns?: CampaignRow[] } | null;
    setCampaigns(Array.isArray(json?.campaigns) ? json!.campaigns! : []);
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

  const loadAll = useCallback(() => {
    void loadBloggers();
    void loadCampaigns();
    void loadConfig();
  }, [loadBloggers, loadCampaigns, loadConfig]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadAll();
    }, 0);
    return () => window.clearTimeout(id);
  }, [loadAll]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void loadCampaigns();
    }, 5000);
    return () => window.clearInterval(id);
  }, [loadCampaigns]);

  const bloggerProgress = useMemo(() => {
    const map = new Map<string, { got: number; goal: number }>();
    for (const c of campaigns) {
      if (!c.blogger_id) continue;
      const cur = map.get(c.blogger_id) ?? { got: 0, goal: 0 };
      cur.got += Number(c.confirmed_count) || 0;
      cur.goal += Number(c.goal_subscribers) || 0;
      map.set(c.blogger_id, cur);
    }
    return map;
  }, [campaigns]);

  // Заказы, достигшие цели (100%) — «задача выполнена»
  const doneBloggerIds = useMemo(() => {
    const set = new Set<string>();
    for (const b of bloggers) {
      const prog = bloggerProgress.get(b.id);
      const goal = prog?.goal ?? 0;
      const got = prog?.got ?? 0;
      if (goal > 0 && got >= goal) set.add(b.id);
    }
    return set;
  }, [bloggers, bloggerProgress]);

  const visibleBloggers = useMemo(() => {
    if (showClosed) return bloggers;
    return bloggers.filter((b) => !doneBloggerIds.has(b.id));
  }, [bloggers, showClosed, doneBloggerIds]);

  const buildBloggerLink = useCallback(
    (b: { code: string; telegram_link: string | null }) => {
      // Своя ссылка используется, только если это полноценный URL.
      const custom = b.telegram_link?.trim();
      if (custom && /^https?:\/\//i.test(custom)) return custom;
      const bot = linkConfig?.bot_username || "<BOT>";
      const slug = linkConfig?.app_slug || "app";
      const cleanCode = String(b.code || "").trim().replace(/^blog_/i, "") || "blog";
      return `https://t.me/${bot}/${slug}?startapp=blog_${cleanCode}&mode=fullscreen`;
    },
    [linkConfig]
  );

  const handleCopyLink = async (b: { code: string; telegram_link: string | null }) => {
    const link = buildBloggerLink(b);
    const ok = await copyToClipboardFallback(link);
    showToast(ok ? `Ссылка скопирована: ${link}` : "Не удалось скопировать", ok ? "ok" : "error");
  };

  const createBlogger = async () => {
    setError(null);
    const payload = {
      code: newCode.trim(),
      name: newName.trim(),
      telegram_link: newTelegramLink.trim() || null,
      active: newActive
    };
    const res = await fetch("/admin/api/bloggers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(() => null);
    if (!res || !res.ok) {
      const msg = (await res?.json().catch(() => null)) as { error?: string } | null;
      setError(msg?.error || "Не удалось создать заказ");
      return;
    }
    setNewCode("");
    setNewName("");
    setNewTelegramLink("");
    setNewActive(true);
    await loadBloggers();
  };

  const startEdit = (b: BloggerRow) => {
    setEditing((prev) => ({
      ...prev,
      [b.id]: { name: b.name, telegram_link: b.telegram_link ?? "", active: b.active }
    }));
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
    await loadBloggers();
  };

  const deleteBlogger = async (id: string) => {
    setError(null);
    const ok = window.confirm("Удалить заказ? Статистика кликов останется.");
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
  };

  return (
    <>
      {/* ============ ЗАКАЗЫ (покупка подписчиков) ============ */}
      <div className={styles.card}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Заказы</h1>
          <div className={styles.pill}>
            <span>Всего: {bloggers.length}</span>
            <span>Активных: {bloggers.filter((b) => b.active).length}</span>
          </div>
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              marginLeft: 12,
              fontSize: 13,
              cursor: "pointer",
              whiteSpace: "nowrap"
            }}
          >
            <input
              type="checkbox"
              checked={showClosed}
              onChange={(e) => setShowClosed(e.target.checked)}
              style={{ cursor: "pointer" }}
            />
            Показать закрытые
          </label>
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
          <button className={`${styles.button} ${styles.buttonPrimary}`} type="button" onClick={createBlogger}>
            Создать заказ
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
                <th className={styles.th}>Выполнение</th>
                <th className={styles.th}>Готовая ссылка</th>
                <th className={styles.th}>Активен</th>
                <th className={styles.th}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {visibleBloggers.map((b) => {
                const e = editing[b.id];
                const link = buildBloggerLink(b);
                const prog = bloggerProgress.get(b.id);
                const got = prog?.got ?? 0;
                const goal = prog?.goal ?? 0;
                const percent = goal > 0 ? (got / goal) * 100 : 0;
                const done = goal > 0 && percent >= 100;
                return (
                  <tr key={b.id} style={done ? { opacity: 0.55 } : undefined}>
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
                    <td className={styles.td} style={{ minWidth: 170 }}>
                      <div className={styles.progressWrap} style={{ marginBottom: 4 }}>
                        <div className={progressClass(percent)} style={{ width: `${Math.min(100, percent)}%` }} />
                      </div>
                      <div style={{ fontSize: 12 }}>
                        {done ? (
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: 999,
                              background: "rgba(28,138,59,0.15)",
                              color: "#1c8a3b",
                              fontWeight: 700
                            }}
                          >
                            ЗАКАЗ ВЫПОЛНЕН
                          </span>
                        ) : (
                          <>
                            <strong>{got}</strong>
                            <span className={styles.muted}> / {goal} подписчиков</span>
                          </>
                        )}
                      </div>
                    </td>
                    <td className={styles.td}>
                      {e ? (
                        <input
                          className={styles.inlineInput}
                          value={e.telegram_link}
                          onChange={(ev) =>
                            setEditing((prev) => ({
                              ...prev,
                              [b.id]: { ...prev[b.id]!, telegram_link: ev.target.value }
                            }))
                          }
                          placeholder="https://t.me/..."
                        />
                      ) : b.telegram_link ? (
                        <a
                          href={b.telegram_link}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: "#b81f22", textDecoration: "underline", wordBreak: "break-all", fontSize: 13 }}
                        >
                          {b.telegram_link}
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
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button className={styles.button} type="button" onClick={() => handleCopyLink(b)}>
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
                        {!e && (
                          <button
                            className={`${styles.button} ${styles.buttonDanger}`}
                            type="button"
                            onClick={() => deleteBlogger(b.id)}
                          >
                            Удалить
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visibleBloggers.length === 0 && (
                <tr>
                  <td className={styles.td} colSpan={6}>
                    {bloggersLoading
                      ? "Загрузка..."
                      : bloggers.length > 0
                        ? "Все заказы выполнены. Включите «Показать закрытые», чтобы увидеть их."
                        : "Нет заказов — создайте первый выше"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ============ КАМПАНИИ ПОДПИСОК (сводно по заказам) ============ */}
      {campaigns.length > 0 && (
        <div className={styles.card} style={{ marginTop: 16 }}>
          <div className={styles.titleRow}>
            <h2 className={styles.title}>Кампании подписки</h2>
            <div className={styles.pill}>
              <span>Всего: {campaigns.length}</span>
            </div>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>Блогер</th>
                  <th className={styles.th}>Канал</th>
                  <th className={styles.th}>Прогресс</th>
                  <th className={styles.th}>Активна</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => {
                  const pct = c.percent;
                  return (
                    <tr key={c.id}>
                      <td className={styles.td}>{c.blogger_name ?? "—"}</td>
                      <td className={styles.td}>
                        <div style={{ fontFamily: "monospace", fontSize: 13, wordBreak: "break-all" }}>
                          {c.channel_id}
                        </div>
                      </td>
                      <td className={styles.td} style={{ minWidth: 180 }}>
                        <div className={styles.progressWrap} style={{ marginBottom: 4 }}>
                          <div
                            className={progressClass(pct)}
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                        <div style={{ fontSize: 12 }}>
                          <strong>{c.confirmed_count}</strong> / {c.goal_subscribers} · {pct.toFixed(1)}%
                        </div>
                      </td>
                      <td className={styles.td}>
                        {c.active ? (
                          <span
                            style={{
                              padding: "3px 8px",
                              borderRadius: 999,
                              background: "rgba(28,138,59,0.15)",
                              color: "#1c8a3b",
                              fontWeight: 700,
                              fontSize: 12
                            }}
                          >
                            АКТИВНА
                          </span>
                        ) : (
                          <span className={styles.muted} style={{ fontSize: 12 }}>
                            Нет
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

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