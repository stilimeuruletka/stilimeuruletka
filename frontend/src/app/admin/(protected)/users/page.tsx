"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import styles from "../../admin.module.css";

type UserSpinStat = {
  tg_user_id: number;
  username: string | null;
  total_spins: number;
  wins: number;
  losses: number;
  last_spin_at: string | null;
};

function demoStats(): UserSpinStat[] {
  return [
    { tg_user_id: 1001, username: "demo_anna", total_spins: 12, wins: 5, losses: 7, last_spin_at: new Date().toISOString() },
    { tg_user_id: 1002, username: "demo_kate", total_spins: 4, wins: 1, losses: 3, last_spin_at: new Date(Date.now() - 86_400_000).toISOString() },
    { tg_user_id: 1003, username: null, total_spins: 0, wins: 0, losses: 0, last_spin_at: null }
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

export default function AdminUsersPage() {
  const today = useMemo(() => new Date(), []);
  const defaultTo = useMemo(() => yyyyMmDd(today), [today]);
  const defaultFrom = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 30);
    return yyyyMmDd(d);
  }, [today]);

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [stats, setStats] = useState<UserSpinStat[]>([]);
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

    const res = await fetch(`/admin/api/users/stats?${qs.toString()}`, { cache: "no-store" }).catch(() => null);
    if (!res || !res.ok) {
      const msg = (await res?.json().catch(() => null)) as { error?: string } | null;
      setError(msg?.error || "Демо-режим: нет доступа к API статистики");
      setStats(demoStats());
      setLoading(false);
      return;
    }

    const json = (await res.json().catch(() => null)) as { stats?: UserSpinStat[] } | null;
    setStats(Array.isArray(json?.stats) ? json!.stats! : []);
    setLoading(false);
  }, [from, to]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(id);
  }, [load]);

  const totals = useMemo(() => {
    return stats.reduce(
      (acc, s) => {
        acc.total += Number(s.total_spins) || 0;
        acc.wins += Number(s.wins) || 0;
        acc.losses += Number(s.losses) || 0;
        return acc;
      },
      { total: 0, wins: 0, losses: 0 }
    );
  }, [stats]);

  return (
    <div className={styles.card}>
      <div className={styles.titleRow}>
        <h1 className={styles.title}>Статистика по пользователям</h1>
        <div className={styles.pill}>
          <span>Игры: {totals.total}</span>
          <span>Выигрыши: {totals.wins}</span>
          <span>Проигрыши: {totals.losses}</span>
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

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>TG ID</th>
              <th className={styles.th}>Username</th>
              <th className={`${styles.th} ${styles.tdRight}`}>Игры</th>
              <th className={`${styles.th} ${styles.tdRight}`}>Выигрыши</th>
              <th className={`${styles.th} ${styles.tdRight}`}>Проигрыши</th>
              <th className={styles.th}>Последний спин</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <tr key={s.tg_user_id}>
                <td className={styles.td}>{s.tg_user_id}</td>
                <td className={styles.td}>{s.username ? `@${s.username}` : "—"}</td>
                <td className={`${styles.td} ${styles.tdRight}`}>{s.total_spins}</td>
                <td className={`${styles.td} ${styles.tdRight}`}>{s.wins}</td>
                <td className={`${styles.td} ${styles.tdRight}`}>{s.losses}</td>
                <td className={styles.td}>{formatRu(s.last_spin_at)}</td>
              </tr>
            ))}
            {stats.length === 0 && (
              <tr>
                <td className={styles.td} colSpan={6}>
                  {loading ? "Загрузка..." : "Нет данных за выбранный период"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
