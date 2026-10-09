"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import styles from "../../admin.module.css";

type BloggerOption = {
  id: string;
  code: string;
  name: string;
  telegram_link: string | null;
  active: boolean;
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

function yyyyMmDdInput(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function AdminSubscriptionPage() {
  const [bloggers, setBloggers] = useState<BloggerOption[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const toastTimerRef = useRef<number | null>(null);

  const today = useMemo(() => new Date(), []);
  const inWeek = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 7);
    return d;
  }, [today]);

  const [bloggerId, setBloggerId] = useState("");
  const [channelId, setChannelId] = useState("");
  const [telegramLink, setTelegramLink] = useState("");
  const [goal, setGoal] = useState<string>("1000");
  const [startsAt, setStartsAt] = useState(yyyyMmDdInput(today));
  const [endsAt, setEndsAt] = useState(yyyyMmDdInput(inWeek));
  const [activateNow, setActivateNow] = useState(true);

  const showToast = useCallback((message: string, variant: "ok" | "error" = "ok") => {
    setToast({ message, variant });
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2800);
  }, []);

  const loadBloggers = useCallback(async () => {
    const res = await fetch("/admin/api/bloggers", { cache: "no-store" }).catch(() => null);
    if (!res || !res.ok) {
      setBloggers([]);
      return;
    }
    const json = (await res.json().catch(() => null)) as { bloggers?: BloggerOption[] } | null;
    setBloggers(Array.isArray(json?.bloggers) ? json!.bloggers! : []);
  }, []);

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/admin/api/subscription/campaigns", { cache: "no-store" }).catch(() => null);
    if (!res || !res.ok) {
      const msg = (await res?.json().catch(() => null)) as { error?: string } | null;
      setError(msg?.error || "Не удалось загрузить кампании");
      setCampaigns([]);
    } else {
      setError(null);
      const json = (await res.json().catch(() => null)) as { campaigns?: CampaignRow[] } | null;
      setCampaigns(Array.isArray(json?.campaigns) ? json!.campaigns! : []);
    }
    setLoading(false);
  }, []);

  const loadAll = useCallback(() => {
    void loadBloggers();
    void loadCampaigns();
  }, [loadBloggers, loadCampaigns]);

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

  const activeCampaigns = useMemo(
    () => campaigns.filter((c) => c.active),
    [campaigns]
  );

  const handleBloggerChange = (id: string) => {
    setBloggerId(id);
    const b = bloggers.find((x) => x.id === id);
    if (b && b.telegram_link) {
      setTelegramLink(b.telegram_link);
      const usernameMatch = b.telegram_link.match(/t\.me\/([A-Za-z0-9_]+)/);
      if (usernameMatch && !channelId) {
        setChannelId(`@${usernameMatch[1]!}`);
      }
    }
  };

  const createCampaign = async () => {
    setError(null);
    const cleanGoal = parseInt(goal.trim(), 10);
    if (!bloggerId) {
      setError("Выберите блогера");
      return;
    }
    if (!channelId.trim()) {
      setError("Введите ID канала (например @channel или -1001234567890)");
      return;
    }
    if (!Number.isFinite(cleanGoal) || cleanGoal < 1) {
      setError("Цель подписки должна быть больше 0");
      return;
    }
    setSubmitting(true);
    const payload: Record<string, unknown> = {
      blogger_id: bloggerId,
      channel_id: channelId.trim(),
      telegram_link: telegramLink.trim() || null,
      goal_subscribers: cleanGoal,
      starts_at: new Date(`${startsAt}T00:00:00`).toISOString(),
      ends_at: endsAt.trim() ? new Date(`${endsAt}T23:59:59`).toISOString() : null,
      active: activateNow
    };
    const res = await fetch("/admin/api/subscription/campaigns", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(() => null);
    setSubmitting(false);
    if (!res || !res.ok) {
      const msg = (await res?.json().catch(() => null)) as { error?: string } | null;
      setError(msg?.error || "Не удалось создать кампанию");
      return;
    }
    setChannelId("");
    setTelegramLink("");
    setGoal("1000");
    setActivateNow(true);
    showToast("Кампания создана ✅", "ok");
    await loadCampaigns();
  };

  const activateCampaign = async (id: string, deactivate = false) => {
    setError(null);
    const res = await fetch(`/admin/api/subscription/campaigns/${encodeURIComponent(id)}/activate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deactivate })
    }).catch(() => null);
    if (!res || !res.ok) {
      const msg = (await res?.json().catch(() => null)) as { error?: string } | null;
      setError(msg?.error || "Не удалось изменить статус");
      return;
    }
    showToast(deactivate ? "Кампания деактивирована" : "Кампания активирована ✅", "ok");
    await loadCampaigns();
  };

  const deleteCampaign = async (id: string) => {
    setError(null);
    const ok = window.confirm("Удалить кампанию? История подтверждений сохранится.");
    if (!ok) return;
    const res = await fetch(`/admin/api/subscription/campaigns/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { "x-confirm": "yes" }
    }).catch(() => null);
    if (!res || !res.ok) {
      const msg = (await res?.json().catch(() => null)) as { error?: string } | null;
      setError(msg?.error || "Не удалось удалить кампанию");
      return;
    }
    showToast("Кампания удалена", "ok");
    await loadCampaigns();
  };

  return (
    <>
      <div className={styles.card}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Активные аккаунты подписки</h1>
          <div className={styles.pill}>
            <span>Всего кампаний: {campaigns.length}</span>
            <span>
              Активно:{" "}
              <span style={{ color: activeCampaigns.length > 0 ? "#1c8a3b" : "#777" }}>
                {activeCampaigns.length > 0 ? `${activeCampaigns.length}` : "НЕТ"}
              </span>
            </span>
          </div>
        </div>

        {activeCampaigns.length > 0 ? (
          <div>
            {activeCampaigns.map((activeCampaign) => (
              <div
                key={activeCampaign.id}
                style={{
                  border: "1px solid rgba(184,31,34,0.2)",
                  borderRadius: 14,
                  padding: "14px 16px",
                  marginTop: 12
                }}
              >
                <div className={styles.metricRow} style={{ marginTop: 0 }}>
                  <div className={styles.metric}>
                    <div className={styles.metricLabel}>Блогер</div>
                    <div className={styles.metricValue}>{activeCampaign.blogger_name ?? "—"}</div>
                  </div>
                  <div className={styles.metric}>
                    <div className={styles.metricLabel}>Канал</div>
                    <div className={styles.metricValue} style={{ fontSize: 14, wordBreak: "break-all" }}>
                      {activeCampaign.channel_id}
                    </div>
                  </div>
                  <div className={styles.metric}>
                    <div className={styles.metricLabel}>Цель</div>
                    <div className={styles.metricValue}>{activeCampaign.goal_subscribers.toLocaleString("ru-RU")}</div>
                  </div>
                  <div className={styles.metric}>
                    <div className={styles.metricLabel}>Подписалось</div>
                    <div className={styles.metricValue}>{activeCampaign.confirmed_count.toLocaleString("ru-RU")}</div>
                  </div>
                  <div className={styles.metric}>
                    <div className={styles.metricLabel}>Заполнено</div>
                    <div className={styles.metricValue}>{activeCampaign.percent.toFixed(2)}%</div>
                  </div>
                </div>

                <div className={styles.progressWrap} style={{ marginTop: 14 }}>
                  <div
                    className={progressClass(activeCampaign.percent)}
                    style={{ width: `${Math.min(100, activeCampaign.percent)}%` }}
                  />
                </div>
                <div className={styles.muted} style={{ marginTop: 6, fontSize: 13 }}>
                  {activeCampaign.confirmed_count} / {activeCampaign.goal_subscribers} человек уже подписалось и
                  подтвердило
                </div>

                <div className={styles.buttonRow} style={{ marginTop: 14 }}>
                  {activeCampaign.telegram_link && (
                    <a
                      className={`${styles.button} ${styles.buttonPrimary}`}
                      href={activeCampaign.telegram_link}
                      target="_blank"
                      rel="noreferrer"
                      style={{ textDecoration: "none", display: "inline-flex" }}
                    >
                      Открыть канал →
                    </a>
                  )}
                  <button
                    className={styles.button}
                    type="button"
                    onClick={() => activateCampaign(activeCampaign.id, true)}
                  >
                    Деактивировать
                  </button>
                  <button className={styles.button} type="button" onClick={() => void loadCampaigns()}>
                    {loading ? "Обновление..." : "Обновить"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div
            className={styles.muted}
            style={{
              border: `1px dashed rgba(184,31,34,0.35)`,
              padding: "16px 18px",
              borderRadius: 12,
              marginTop: 10
            }}
          >
            {loading ? "Загрузка..." : "Сейчас нет активных аккаунтов — пользователи могут крутить рулетку без подписки."}
          </div>
        )}
      </div>

      <div className={styles.card} style={{ marginTop: 16 }}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Создать новую кампанию</h1>
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <div className={styles.label}>Блогер</div>
            <select
              className={styles.input}
              value={bloggerId}
              onChange={(e) => handleBloggerChange(e.target.value)}
            >
              <option value="">Выберите блогера</option>
              {bloggers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <div className={styles.label}>
              ID канала <span className={styles.muted}>(@username или -100xxx)</span>
            </div>
            <input
              className={styles.input}
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              placeholder="@stil_style или -1001234567890"
            />
          </div>
          <div className={styles.field}>
            <div className={styles.label}>Ссылка на Telegram (для кнопки)</div>
            <input
              className={styles.input}
              value={telegramLink}
              onChange={(e) => setTelegramLink(e.target.value)}
              placeholder="https://t.me/stil_style"
            />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <div className={styles.label}>Цель: сколько человек должно подписаться</div>
            <input
              className={styles.input}
              type="number"
              min={1}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="1000"
            />
          </div>
          <div className={styles.field}>
            <div className={styles.label}>Старт</div>
            <input
              className={styles.input}
              type="date"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <div className={styles.label}>Конец (опционально)</div>
            <input
              className={styles.input}
              type="date"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <div className={styles.label}>Активировать сразу</div>
            <select
              className={styles.input}
              value={activateNow ? "1" : "0"}
              onChange={(e) => setActivateNow(e.target.value === "1")}
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
            onClick={createCampaign}
            disabled={submitting}
          >
            {submitting ? "Создание..." : "Создать кампанию"}
          </button>
        </div>

        {error && <div className={styles.error} style={{ marginTop: 10 }}>{error}</div>}

        <div className={styles.muted} style={{ marginTop: 12, fontSize: 13, lineHeight: 1.5 }}>
          ⚠️ Важно: бот должен быть&nbsp;
          <strong>администратором</strong>&nbsp;канала/группы с правом «Добавлять администраторов» или хотя бы
          «Публиковать сообщения». Иначе проверка подписки вернёт ошибку Forbidden.
          <br />
          ID канала в формате <code>-1001234567890</code> можно получить через @username_to_id_bot.
        </div>
      </div>

      <div className={styles.card} style={{ marginTop: 16 }}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>История кампаний</h1>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Блогер</th>
                <th className={styles.th}>Канал</th>
                <th className={styles.th}>Прогресс</th>
                <th className={styles.th}>Активна</th>
                <th className={styles.th}>Старт</th>
                <th className={styles.th}>Конец</th>
                <th className={styles.th}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id}>
                  <td className={styles.td}>{c.blogger_name ?? "—"}</td>
                  <td className={styles.td}>
                    <div style={{ fontFamily: "monospace", fontSize: 13, wordBreak: "break-all" }}>
                      {c.channel_id}
                    </div>
                    {c.telegram_link && (
                      <a
                        href={c.telegram_link}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.muted}
                        style={{ fontSize: 11 }}
                      >
                        открыть
                      </a>
                    )}
                  </td>
                  <td className={styles.td} style={{ minWidth: 180 }}>
                    <div className={styles.progressWrap} style={{ marginBottom: 4 }}>
                      <div
                        className={progressClass(c.percent)}
                        style={{ width: `${Math.min(100, c.percent)}%` }}
                      />
                    </div>
                    <div style={{ fontSize: 12 }}>
                      <strong>{c.confirmed_count}</strong> / {c.goal_subscribers} · {c.percent.toFixed(1)}%
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
                  <td className={styles.td}>
                    {new Intl.DateTimeFormat("ru-RU", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit"
                    }).format(new Date(c.starts_at))}
                  </td>
                  <td className={styles.td}>
                    {c.ends_at
                      ? new Intl.DateTimeFormat("ru-RU", {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit"
                        }).format(new Date(c.ends_at))
                      : "—"}
                  </td>
                  <td className={styles.td}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {!c.active ? (
                        <button
                          className={`${styles.button} ${styles.buttonPrimary}`}
                          type="button"
                          onClick={() => activateCampaign(c.id)}
                          style={{ padding: "4px 10px", fontSize: 13 }}
                        >
                          Активировать
                        </button>
                      ) : (
                        <button
                          className={styles.button}
                          type="button"
                          onClick={() => activateCampaign(c.id, true)}
                          style={{ padding: "4px 10px", fontSize: 13 }}
                        >
                          Стоп
                        </button>
                      )}
                      <button
                        className={`${styles.button} ${styles.buttonDanger}`}
                        type="button"
                        onClick={() => deleteCampaign(c.id)}
                        style={{ padding: "4px 10px", fontSize: 13 }}
                      >
                        Удалить
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {campaigns.length === 0 && (
                <tr>
                  <td className={styles.td} colSpan={7}>
                    {loading ? "Загрузка..." : "Нет кампаний — создайте первую выше"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className={styles.muted} style={{ marginTop: 12 }}>
          Автообновление прогресса каждые 5 секунд
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
