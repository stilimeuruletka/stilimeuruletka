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

type DashboardPayload = {
  overview: Overview;
  prize_breakdown: PrizeBreakdown[];
  recent_spins: RecentSpin[];
};

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

  useEffect(() => {
    const id = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(id);
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void load();
    }, 5000);
    return () => window.clearInterval(id);
  }, [load]);

  const winRate = useMemo(() => {
    if (!payload.overview.total_spins) return 0;
    return Math.round((payload.overview.wins / payload.overview.total_spins) * 10000) / 100;
  }, [payload.overview.total_spins, payload.overview.wins]);

  return (
    <>
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
          <div
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
              padding: 14
            }}
          >
            <div className={styles.muted}>Новых пользователей</div>
            <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>
              {payload.overview.users_created}
            </div>
          </div>
          <div
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
              padding: 14
            }}
          >
            <div className={styles.muted}>Активных (были в сети)</div>
            <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>
              {payload.overview.active_users}
            </div>
          </div>
          <div
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
              padding: 14
            }}
          >
            <div className={styles.muted}>Всего круток</div>
            <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>
              {payload.overview.total_spins}
            </div>
          </div>
          <div
            style={{
              background: "rgba(184, 31, 34, 0.14)",
              border: "1px solid rgba(184, 31, 34, 0.5)",
              borderRadius: 12,
              padding: 14
            }}
          >
            <div className={styles.muted}>Выигрышей</div>
            <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>
              {payload.overview.wins}
            </div>
          </div>
          <div
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
              padding: 14
            }}
          >
            <div className={styles.muted}>Проигрышей</div>
            <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>
              {payload.overview.losses}
            </div>
          </div>
          <div
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
              padding: 14
            }}
          >
            <div className={styles.muted}>Win rate</div>
            <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>{winRate}%</div>
          </div>
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
                  <td className={`${styles.td} ${styles.tdRight}`}>
                    {b.win_count_share_percent.toFixed(2)}%
                  </td>
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
    </>
  );
}
