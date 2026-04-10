"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import styles from "../../admin.module.css";

type BloggerStat = {
  blogger_id: string;
  code: string;
  name: string;
  clicks: number;
  registrations: number;
  spins: number;
};

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

  const load = useCallback(async () => {
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

  return (
    <div className={styles.card}>
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
        <button className={`${styles.button} ${styles.buttonPrimary}`} type="button" onClick={load} disabled={loading}>
          {loading ? "Обновление..." : "Обновить"}
        </button>
      </div>

      {error && <div className={styles.error}>{error}</div>}

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
        Автообновление: каждые 5 секунд
      </div>
    </div>
  );
}
