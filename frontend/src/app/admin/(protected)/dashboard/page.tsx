"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import styles from "../../admin.module.css";

type Overview = {
  users_created: number;
  active_users: number;
  total_spins: number;
  wins: number;
  losses: number;
};

type PrizeBreakdown = {
  prize_id: string | null;
  prize_title: string;
  count: number;
  win_count_share_percent: number;
};

type RecentSpin = {
  created_at: string;
  tg_user_id: number;
  username: string | null;
  prize_title: string | null;
  win: boolean;
};

type RealtimePayload = {
  now: string;
  online_users: number;
  online_list: OnlineUser[];
  today: {
    spins: number;
    wins: number;
    delta_spins_percent: number;
    delta_wins_percent: number;
    coupons_issued: number;
  };
  today_spinners: SpinnerRow[];
  today_win_list: TodayWinEvent[];
  yesterday: {
    spins: number;
    wins: number;
  };
  last_24h: {
    spins: number;
    wins: number;
    win_rate_percent: number;
    top_prize: { prize_id: string | null; title: string; count: number } | null;
  };
  top_blogger_24h: {
    blogger_id: string;
    name: string;
    code: string;
    clicks: number;
  } | null;
};

type DailyRow = {
  date: string;
  weekday: string;
  unique_users: number;
  spins: number;
  wins: number;
  losses: number;
  win_rate_percent: number;
  new_users: number;
};

type DailyTotals = {
  unique_users: number;
  spins: number;
  wins: number;
  new_users: number;
};

type DashboardPayload = {
  overview: Overview;
  prize_breakdown: PrizeBreakdown[];
  recent_spins: RecentSpin[];
};

type DailyDetailUser = {
  tg_user_id: number;
  username: string | null;
  first_seen_at: string;
  last_seen_at: string;
  spins: number;
  wins: number;
  losses: number;
  coupons: number;
  was_new_user: boolean;
};

type DailyDetailTimeline = {
  created_at: string;
  tg_user_id: number;
  username: string | null;
  win: boolean;
  prize_title: string | null;
};

type DailyDetail = {
  date: string;
  from: string;
  to: string;
  users: DailyDetailUser[];
  timeline: DailyDetailTimeline[];
  totals: {
    unique_users: number;
    spins: number;
    wins: number;
    losses: number;
    coupons: number;
    new_users: number;
  };
};

type OnlineUser = {
  tg_user_id: number;
  username: string | null;
  last_seen_at: string;
};

type SpinnerRow = {
  tg_user_id: number;
  spins: number;
  wins: number;
  losses: number;
};

type TodayWinEvent = {
  created_at: string;
  tg_user_id: number;
  prize_title: string;
};

type DrillKind = "online" | "spins" | "wins" | null;

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

function formatRu(iso: string | null) {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return new Intl.DateTimeFormat("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(ms));
}

function formatRuTime(iso: string | null) {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(ms));
}

function emptyPayload(): DashboardPayload {
  return {
    overview: { users_created: 0, active_users: 0, total_spins: 0, wins: 0, losses: 0 },
    prize_breakdown: [],
    recent_spins: []
  };
}

export default function AdminDashboardPage() {
  const today = useMemo(() => new Date(), []);
  const defaultTo = useMemo(() => yyyyMmDd(today), [today]);
  const defaultFrom = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 30);
    return yyyyMmDd(d);
  }, [today]);

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [payload, setPayload] = useState<DashboardPayload>(emptyPayload());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dailyDays, setDailyDays] = useState<number>(14);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [dailyTotals, setDailyTotals] = useState<DailyTotals>({ unique_users: 0, spins: 0, wins: 0, new_users: 0 });
  const [dailyLoading, setDailyLoading] = useState(true);
  const [dailyError, setDailyError] = useState<string | null>(null);

  const [realtime, setRealtime] = useState<RealtimePayload | null>(null);
  const [realtimeLoading, setRealtimeLoading] = useState(true);
  const [realtimeUpdated, setRealtimeUpdated] = useState<string | null>(null);
  const [realtimePulse, setRealtimePulse] = useState(false);

  const [activeDate, setActiveDate] = useState<string | null>(null);
  const [dayDetail, setDayDetail] = useState<DailyDetail | null>(null);
  const [dayLoading, setDayLoading] = useState(false);
  const [dayError, setDayError] = useState<string | null>(null);

  const [drill, setDrill] = useState<DrillKind>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const fromIso = toIsoStartOfDayLocal(from);
    const toIso = toIsoEndOfDayLocal(to);

    const qs = new URLSearchParams();
    if (fromIso) qs.set("from", fromIso);
    if (toIso) qs.set("to", toIso);

    const res = await fetch(`/admin/api/dashboard/stats?${qs.toString()}`, { cache: "no-store" }).catch(() => null);
    if (!res || !res.ok) {
      const msg = (await res?.json().catch(() => null)) as { error?: string } | null;
      setError(msg?.error || "Нет доступа к API дашборда");
      setLoading(false);
      return;
    }

    const json = (await res.json().catch(() => null)) as DashboardPayload | null;
    if (!json) {
      setError("Ошибка парсинга ответа");
      setLoading(false);
      return;
    }
    setPayload(json);
    setLoading(false);
  }, [from, to]);

  const loadDaily = useCallback(async () => {
    setDailyLoading(true);
    setDailyError(null);
    const qs = new URLSearchParams();
    qs.set("days", String(dailyDays));

    const res = await fetch(`/admin/api/dashboard/daily?${qs.toString()}`, { cache: "no-store" }).catch(() => null);
    if (!res || !res.ok) {
      const msg = (await res?.json().catch(() => null)) as { error?: string } | null;
      setDailyError(msg?.error || "Нет данных по дням");
      setDailyLoading(false);
      return;
    }
    const json = (await res.json().catch(() => null)) as
      | { days?: DailyRow[]; totals?: DailyTotals }
      | null;
    setDaily(Array.isArray(json?.days) ? (json!.days as DailyRow[]) : []);
    setDailyTotals(
      json?.totals ?? { unique_users: 0, spins: 0, wins: 0, new_users: 0 }
    );
    setDailyLoading(false);
  }, [dailyDays]);

  const loadDayDetail = useCallback(async (date: string) => {
    setDayLoading(true);
    setDayError(null);
    setDayDetail(null);
    const res = await fetch(`/admin/api/dashboard/daily/${encodeURIComponent(date)}/details`, {
      cache: "no-store"
    }).catch(() => null);
    if (!res || !res.ok) {
      const msg = (await res?.json().catch(() => null)) as { error?: string } | null;
      setDayError(msg?.error || "Нет детализации за этот день");
      setDayLoading(false);
      return;
    }
    const json = (await res.json().catch(() => null)) as DailyDetail | null;
    if (!json) {
      setDayError("Нет данных");
      setDayLoading(false);
      return;
    }
    setDayDetail(json);
    setDayLoading(false);
  }, []);

  const loadRealtime = useCallback(async () => {
    setRealtimeLoading(true);
    const res = await fetch("/admin/api/dashboard/realtime", { cache: "no-store" }).catch(() => null);
    if (!res || !res.ok) {
      setRealtimeLoading(false);
      return;
    }
    const json = (await res.json().catch(() => null)) as RealtimePayload | null;
    if (json) {
      setRealtime(json);
      setRealtimeUpdated(new Date().toLocaleTimeString("ru-RU"));
      setRealtimePulse(true);
      setTimeout(() => setRealtimePulse(false), 600);
    }
    setRealtimeLoading(false);
  }, []);

  const closeDayModal = useCallback(() => {
    setActiveDate(null);
    setDayDetail(null);
    setDayError(null);
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(id);
  }, [load]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadDaily();
    }, 0);
    return () => window.clearTimeout(id);
  }, [loadDaily]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadRealtime();
    }, 0);
    return () => window.clearTimeout(id);
  }, [loadRealtime]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void load();
    }, 5000);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void loadDaily();
      if (activeDate) void loadDayDetail(activeDate);
    }, 10000);
    return () => window.clearInterval(id);
  }, [loadDaily, activeDate, loadDayDetail]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void loadRealtime();
    }, 3000);
    return () => window.clearInterval(id);
  }, [loadRealtime]);

  useEffect(() => {
    if (!activeDate && !drill) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrill(null);
        closeDayModal();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeDate, drill, closeDayModal]);

  const winRate = useMemo(() => {
    if (!payload.overview.total_spins) return 0;
    return Math.round((payload.overview.wins / payload.overview.total_spins) * 10000) / 100;
  }, [payload.overview.total_spins, payload.overview.wins]);

  const dailyMaxUsers = useMemo(() => {
    let m = 0;
    for (const d of daily) if (d.unique_users > m) m = d.unique_users;
    return m || 1;
  }, [daily]);

  return (
    <>
      <div className={`${styles.card} ${styles.realtimeCard} ${realtimePulse ? styles.realtimePulse : ""}`}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>
            ⚡ Реальное время
          </h1>
          <div className={styles.pill}>
            {realtimeLoading && <span className={styles.muted}>обновление...</span>}
            {!realtimeLoading && realtimeUpdated && (
              <span>обновлено {realtimeUpdated}</span>
            )}
            <span>каждые 3 сек</span>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gap: 10,
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))"
          }}
        >
          {[
            {
              label: "Онлайн (были за 5 мин)",
              v: realtime?.online_users ?? 0,
              tone: "green" as const,
              icon: "👥",
              drillKey: "online" as DrillKind
            },
            {
              label: "Сегодня · Спинов",
              v: `${realtime?.today.spins ?? 0}`,
              sub: realtime
                ? `вчера ${realtime.yesterday.spins} · ${realtime.today.delta_spins_percent >= 0 ? "+" : ""}${realtime.today.delta_spins_percent}%`
                : undefined,
              tone: "default" as const,
              icon: "🎯",
              good: realtime ? realtime.today.delta_spins_percent >= 0 : undefined,
              drillKey: "spins" as DrillKind
            },
            {
              label: "Сегодня · Выигрышей",
              v: `${realtime?.today.wins ?? 0}`,
              sub: realtime
                ? `вчера ${realtime.yesterday.wins} · ${realtime.today.delta_wins_percent >= 0 ? "+" : ""}${realtime.today.delta_wins_percent}%`
                : undefined,
              tone: "red" as const,
              icon: "🏆",
              good: realtime ? realtime.today.delta_wins_percent >= 0 : undefined,
              drillKey: "wins" as DrillKind
            },
            {
              label: "Купонов выдано сегодня",
              v: `${realtime?.today.coupons_issued ?? 0}`,
              tone: "purple" as const,
              icon: "🎟️"
            },
            {
              label: "Win rate · 24ч",
              v: `${realtime?.last_24h.win_rate_percent ?? 0}%`,
              sub: realtime ? `спинов ${realtime.last_24h.spins}, побед ${realtime.last_24h.wins}` : undefined,
              tone: "amber" as const,
              icon: "📈"
            },
            {
              label: "Топ приз · 24ч",
              v: realtime?.last_24h.top_prize?.title ?? "—",
              sub: realtime?.last_24h.top_prize ? `выпал ${realtime.last_24h.top_prize.count} раз` : undefined,
              tone: "cyan" as const,
              icon: "🎁"
            },
            {
              label: "Топ блогер · 24ч",
              v: realtime?.top_blogger_24h?.name ?? realtime?.top_blogger_24h?.code ?? "—",
              sub: realtime?.top_blogger_24h ? `кликов ${realtime.top_blogger_24h.clicks}` : "нет кликов за сутки",
              tone: "default" as const,
              icon: "📣"
            }
          ].map((c, i) => {
            const toneBg =
              c.tone === "green"
                ? "rgba(78,201,132,0.12)"
                : c.tone === "red"
                ? "rgba(184,31,34,0.14)"
                : c.tone === "purple"
                ? "rgba(155,114,255,0.14)"
                : c.tone === "amber"
                ? "rgba(255,184,0,0.12)"
                : c.tone === "cyan"
                ? "rgba(94,204,255,0.12)"
                : "rgba(255,255,255,0.04)";
            const toneBorder =
              c.tone === "green"
                ? "rgba(78,201,132,0.45)"
                : c.tone === "red"
                ? "rgba(184,31,34,0.55)"
                : c.tone === "purple"
                ? "rgba(155,114,255,0.45)"
                : c.tone === "amber"
                ? "rgba(255,184,0,0.45)"
                : c.tone === "cyan"
                ? "rgba(94,204,255,0.45)"
                : "rgba(255,255,255,0.12)";
            const clickable = Boolean((c as { drillKey?: DrillKind }).drillKey);
            return (
              <div
                key={i}
                onClick={clickable ? () => setDrill((c as { drillKey: DrillKind }).drillKey) : undefined}
                role={clickable ? "button" : undefined}
                tabIndex={clickable ? 0 : undefined}
                onKeyDown={
                  clickable
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setDrill((c as { drillKey: DrillKind }).drillKey);
                        }
                      }
                    : undefined
                }
                style={{
                  background: toneBg,
                  border: `1px solid ${toneBorder}`,
                  borderRadius: 12,
                  padding: 12,
                  minHeight: 96,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  cursor: clickable ? "pointer" : "default"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div className={styles.muted} style={{ fontSize: 12 }}>{c.label}</div>
                  <div style={{ fontSize: 16 }}>{c.icon}</div>
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1, wordBreak: "break-word" }}>
                  {c.v}
                </div>
                {c.sub && (
                  <div
                    className={styles.muted}
                    style={{
                      fontSize: 11,
                      marginTop: 4,
                      color: c.good === true ? "#66d08f" : c.good === false ? "#ff7b7b" : undefined
                    }}
                  >
                    {c.sub}
                  </div>
                )}
                {clickable && (
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 11,
                      color: "#8aa3c4"
                    }}
                  >
                    Нажми для деталей ▾
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Дашборд: общая аналитика</h1>
          <div className={styles.pill}>
            <span>Период: 30 дней по умолчанию</span>
            <span>Авто: каждые 5 сек</span>
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
          <button className={`${styles.button} ${styles.buttonPrimary}`} type="button" onClick={load} disabled={loading}>
            {loading ? "Обновление..." : "Обновить"}
          </button>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div
          style={{
            marginTop: 16,
            display: "grid",
            gap: 10,
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))"
          }}
        >
          {[
            { label: "Новых пользователей", v: payload.overview.users_created, tone: "default" },
            { label: "Активных (были в сети)", v: payload.overview.active_users, tone: "default" },
            { label: "Всего круток", v: payload.overview.total_spins, tone: "default" },
            { label: "Выигрышей", v: payload.overview.wins, tone: "red" },
            { label: "Проигрышей", v: payload.overview.losses, tone: "default" },
            { label: "Win rate", v: `${winRate}%`, tone: "default" }
          ].map((c, i) => (
            <div
              key={i}
              style={{
                background:
                  c.tone === "red" ? "rgba(184, 31, 34, 0.14)" : "rgba(255,255,255,0.04)",
                border:
                  c.tone === "red"
                    ? "1px solid rgba(184, 31, 34, 0.5)"
                    : "1px solid rgba(255,255,255,0.12)",
                borderRadius: 12,
                padding: 14
              }}
            >
              <div className={styles.muted}>{c.label}</div>
              <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>{c.v}</div>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.card} style={{ marginTop: 16 }}>
        <div className={styles.titleRow}>
          <h2 className={styles.title}>Посещаемость по дням</h2>
          <div className={styles.pill}>
            <span>
              Всего за {dailyDays} дней: посетителей {dailyTotals.unique_users} · спинов {dailyTotals.spins} · выигрышей{" "}
              {dailyTotals.wins} · новых {dailyTotals.new_users}
            </span>
            <select
              className={styles.inputSmall}
              value={String(dailyDays)}
              onChange={(e) => setDailyDays(Number(e.target.value) || 14)}
              disabled={dailyLoading}
            >
              {[7, 14, 21, 30, 60, 90].map((d) => (
                <option key={d} value={d}>
                  {d} дней
                </option>
              ))}
            </select>
            <button
              type="button"
              className={`${styles.button} ${styles.buttonSmall}`}
              onClick={() => void loadDaily()}
              disabled={dailyLoading}
            >
              {dailyLoading ? "..." : "Обновить"}
            </button>
          </div>
        </div>

        {dailyError && <div className={styles.error}>{dailyError}</div>}

        <div className={styles.dailyGrid}>
          {daily.map((d) => {
            const fill = Math.min(100, Math.round((d.unique_users / dailyMaxUsers) * 100));
            const tone = d.win_rate_percent >= 40
              ? styles.dailyToneHigh
              : d.win_rate_percent >= 20
              ? styles.dailyToneMid
              : styles.dailyToneLow;
            return (
              <button
                key={d.date}
                type="button"
                className={`${styles.dailyCard} ${activeDate === d.date ? styles.dailyCardActive : ""} ${tone}`}
                onClick={() => {
                  setActiveDate(d.date);
                  void loadDayDetail(d.date);
                }}
              >
                <div className={styles.dailyTop}>
                  <span className={styles.dailyDate}>{d.date.slice(5)}</span>
                  <span className={styles.dailyWeekday}>{d.weekday}</span>
                </div>
                <div className={styles.dailyStatBig}>{d.unique_users}</div>
                <div className={styles.muted} style={{ fontSize: 12 }}>человек</div>
                <div className={styles.dailyBarWrap}>
                  <div className={styles.dailyBarFill} style={{ width: `${fill}%` }} />
                </div>
                <div className={styles.dailyStatRow}>
                  <span>спинов: <b>{d.spins}</b></span>
                  <span>вин: <b>{d.wins}</b></span>
                </div>
                <div className={styles.dailyStatRow}>
                  <span>новых: <b>{d.new_users}</b></span>
                  <span>wr: <b>{d.win_rate_percent.toFixed(0)}%</b></span>
                </div>
                <div className={styles.dailyHint}>Нажми для детализации</div>
              </button>
            );
          })}
          {daily.length === 0 && (
            <div className={styles.dailyCard} style={{ gridColumn: "1 / -1", textAlign: "center", padding: 20 }}>
              {dailyLoading ? "Загрузка..." : "Нет данных по дням"}
            </div>
          )}
        </div>
      </div>

      <div className={styles.card} style={{ marginTop: 16 }}>
        <div className={styles.titleRow}>
          <h2 className={styles.title}>Распределение призов</h2>
          <div className={styles.pill}>
            <span>Позиций: {payload.prize_breakdown.length}</span>
          </div>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Приз</th>
                <th className={`${styles.th} ${styles.tdRight}`}>Выпало раз</th>
                <th className={`${styles.th} ${styles.tdRight}`}>Доля, %</th>
              </tr>
            </thead>
            <tbody>
              {payload.prize_breakdown.map((b, idx) => (
                <tr key={b.prize_id || `null-${idx}`}>
                  <td className={styles.td}>{b.prize_title}</td>
                  <td className={`${styles.td} ${styles.tdRight}`}>{b.count}</td>
                  <td className={`${styles.td} ${styles.tdRight}`}>{b.win_count_share_percent.toFixed(2)}%</td>
                </tr>
              ))}
              {payload.prize_breakdown.length === 0 && (
                <tr>
                  <td className={styles.td} colSpan={3}>
                    {loading ? "Загрузка..." : "Нет данных за период"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className={styles.card} style={{ marginTop: 16 }}>
        <div className={styles.titleRow}>
          <h2 className={styles.title}>Последние 100 круток</h2>
          <div className={styles.pill}>
            <span>Показано: {payload.recent_spins.length}</span>
          </div>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Время</th>
                <th className={styles.th}>Пользователь</th>
                <th className={styles.th}>Приз</th>
                <th className={styles.th}>Результат</th>
              </tr>
            </thead>
            <tbody>
              {payload.recent_spins.map((r, idx) => (
                <tr key={`${r.created_at}-${r.tg_user_id}-${idx}`}>
                  <td className={styles.td}>{formatRu(r.created_at)}</td>
                  <td className={styles.td}>
                    <div style={{ fontFamily: "monospace", fontSize: 13 }}>id: {r.tg_user_id}</div>
                    {r.username && <div className={styles.muted}>@{r.username}</div>}
                  </td>
                  <td className={styles.td}>{r.prize_title || "Ничего"}</td>
                  <td className={styles.td}>
                    {r.win ? (
                      <span style={{ color: "#ff7b7b", fontWeight: 700 }}>Выигрыш</span>
                    ) : (
                      <span className={styles.muted}>Проигрыш</span>
                    )}
                  </td>
                </tr>
              ))}
              {payload.recent_spins.length === 0 && (
                <tr>
                  <td className={styles.td} colSpan={4}>
                    {loading ? "Загрузка..." : "Нет круток за период"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {activeDate && (
        <div className={styles.modalBackdrop} onClick={closeDayModal} role="presentation">
          <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Детализация дня">
            <div className={styles.modalHeader}>
              <div>
                <div className={styles.modalTitle}>Детализация дня: {activeDate}</div>
                <div className={styles.muted}>
                  {dayDetail ? (
                    <>
                      уникальных {dayDetail.totals.unique_users} · спинов {dayDetail.totals.spins} · выигрышей{" "}
                      {dayDetail.totals.wins} · проигрышей {dayDetail.totals.losses} · купонов{" "}
                      {dayDetail.totals.coupons} · новых {dayDetail.totals.new_users}
                    </>
                  ) : dayLoading ? (
                    "Загрузка..."
                  ) : (
                    dayError || "—"
                  )}
                </div>
              </div>
              <button className={styles.button} type="button" onClick={closeDayModal}>
                Закрыть
              </button>
            </div>

            {dayError && <div className={styles.error}>{dayError}</div>}

            {dayLoading && <div className={styles.muted} style={{ padding: 20, textAlign: "center" }}>Загрузка...</div>}

            {dayDetail && !dayLoading && (
              <div className={styles.modalBody}>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th className={styles.th}>TG ID</th>
                        <th className={styles.th}>Username</th>
                        <th className={`${styles.th} ${styles.tdRight}`}>Круток</th>
                        <th className={`${styles.th} ${styles.tdRight}`}>Выигрышей</th>
                        <th className={`${styles.th} ${styles.tdRight}`}>Проигрышей</th>
                        <th className={`${styles.th} ${styles.tdRight}`}>Купоны</th>
                        <th className={styles.th}>Первый заход</th>
                        <th className={styles.th}>Последний спин</th>
                        <th className={styles.th}>Новый</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dayDetail.users.map((u) => (
                        <tr key={u.tg_user_id}>
                          <td className={styles.td}>
                            <code>{u.tg_user_id}</code>
                          </td>
                          <td className={styles.td}>{u.username ? `@${u.username}` : "—"}</td>
                          <td className={`${styles.td} ${styles.tdRight}`}>
                            <b>{u.spins}</b>
                          </td>
                          <td className={`${styles.td} ${styles.tdRight} ${styles.cellWin}`}>
                            {u.wins > 0 ? `+${u.wins}` : 0}
                          </td>
                          <td className={`${styles.td} ${styles.tdRight} ${styles.cellLose}`}>{u.losses}</td>
                          <td className={`${styles.td} ${styles.tdRight}`}>
                            {u.coupons > 0 ? <span className={styles.badgeOk}>×{u.coupons}</span> : "—"}
                          </td>
                          <td className={styles.td}>{formatRu(u.first_seen_at)}</td>
                          <td className={styles.td}>{formatRu(u.last_seen_at)}</td>
                          <td className={styles.td}>
                            {u.was_new_user ? <span className={styles.badgeWarn}>новый</span> : "—"}
                          </td>
                        </tr>
                      ))}
                      {dayDetail.users.length === 0 && (
                        <tr>
                          <td className={styles.td} colSpan={9}>
                            Нет данных за этот день
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className={styles.subtitle}>Лента событий за день (по времени)</div>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th className={styles.th}>Время</th>
                        <th className={styles.th}>Кто</th>
                        <th className={styles.th}>Событие</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dayDetail.timeline.map((t, i) => (
                        <tr key={`${t.created_at}-${t.tg_user_id}-${i}`}>
                          <td className={styles.td}>{formatRuTime(t.created_at)}</td>
                          <td className={styles.td}>
                            <code>{t.tg_user_id}</code>
                            {t.username && (
                              <span style={{ marginLeft: 6 }} className={styles.muted}>
                                @{t.username}
                              </span>
                            )}
                          </td>
                          <td className={styles.td}>
                            {/^🏷️ Купон:/.test(t.prize_title || "") ? (
                              <span className={styles.badgeOk}>{t.prize_title}</span>
                            ) : t.win ? (
                              <span style={{ color: "#ff7b7b", fontWeight: 700 }}>
                                Выигрыш · {t.prize_title || "—"}
                              </span>
                            ) : (
                              <span className={styles.muted}>Проигрыш · {t.prize_title || "Ничего"}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {dayDetail.timeline.length === 0 && (
                        <tr>
                          <td className={styles.td} colSpan={3}>
                            Нет событий
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {drill && (
        <div className={styles.modalBackdrop} onClick={() => setDrill(null)} role="presentation">
          <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Детализация">
            <div className={styles.modalHeader}>
              <div>
                <div className={styles.modalTitle}>
                  {drill === "online" && "Кто был онлайн (за 5 минут)"}
                  {drill === "spins" && "Кто сегодня крутил"}
                  {drill === "wins" && "Выигрыши за сегодня"}
                </div>
                <div className={styles.muted}>
                  {drill === "online" && `сейчас онлайн: ${realtime?.online_users ?? 0}`}
                  {drill === "spins" && `всего круток сегодня: ${realtime?.today.spins ?? 0}`}
                  {drill === "wins" && `выигрышей сегодня: ${realtime?.today.wins ?? 0}`}
                </div>
              </div>
              <button className={styles.button} type="button" onClick={() => setDrill(null)}>
                Закрыть
              </button>
            </div>

            <div className={styles.modalBody}>
              {drill === "online" && (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th className={styles.th}>TG ID</th>
                        <th className={styles.th}>Username</th>
                        <th className={styles.th}>Последняя активность</th>
                      </tr>
                    </thead>
                    <tbody>
                      {realtime?.online_list.map((u) => (
                        <tr key={u.tg_user_id}>
                          <td className={styles.td}><code>{u.tg_user_id}</code></td>
                          <td className={styles.td}>{u.username ? `@${u.username}` : "—"}</td>
                          <td className={styles.td}>{formatRu(u.last_seen_at)}</td>
                        </tr>
                      ))}
                      {realtime && realtime.online_list.length === 0 && (
                        <tr>
                          <td className={styles.td} colSpan={3}>
                            Сейчас никто не онлайн
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {drill === "spins" && (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th className={styles.th}>TG ID</th>
                        <th className={`${styles.th} ${styles.tdRight}`}>Круток</th>
                        <th className={`${styles.th} ${styles.tdRight}`}>Выигрышей</th>
                        <th className={`${styles.th} ${styles.tdRight}`}>Проигрышей</th>
                      </tr>
                    </thead>
                    <tbody>
                      {realtime?.today_spinners.map((s) => (
                        <tr key={s.tg_user_id}>
                          <td className={styles.td}><code>{s.tg_user_id}</code></td>
                          <td className={`${styles.td} ${styles.tdRight}`}><b>{s.spins}</b></td>
                          <td className={`${styles.td} ${styles.tdRight} ${styles.cellWin}`}>
                            {s.wins > 0 ? `+${s.wins}` : 0}
                          </td>
                          <td className={`${styles.td} ${styles.tdRight} ${styles.cellLose}`}>{s.losses}</td>
                        </tr>
                      ))}
                      {realtime && realtime.today_spinners.length === 0 && (
                        <tr>
                          <td className={styles.td} colSpan={4}>
                            Сегодня ещё никто не крутил
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {drill === "wins" && (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th className={styles.th}>Время</th>
                        <th className={styles.th}>Кто</th>
                        <th className={styles.th}>Приз</th>
                      </tr>
                    </thead>
                    <tbody>
                      {realtime?.today_win_list.map((w, i) => (
                        <tr key={`${w.created_at}-${w.tg_user_id}-${i}`}>
                          <td className={styles.td}>{formatRuTime(w.created_at)}</td>
                          <td className={styles.td}><code>{w.tg_user_id}</code></td>
                          <td className={styles.td}>
                            <span className={styles.badgeOk}>{w.prize_title}</span>
                          </td>
                        </tr>
                      ))}
                      {realtime && realtime.today_win_list.length === 0 && (
                        <tr>
                          <td className={styles.td} colSpan={3}>
                            Сегодня выигрышей пока нет
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
