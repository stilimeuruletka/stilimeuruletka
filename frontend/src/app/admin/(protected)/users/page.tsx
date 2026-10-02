"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import styles from "../../admin.module.css";

type UserSpinStat = {
  user_id: string;
  tg_user_id: number;
  username: string | null;
  created_at: string;
  last_seen_at: string | null;
  total_spins: number;
  wins: number;
  losses: number;
  last_spin_at: string | null;
  referrals: number;
  invited_by_tg_id: number | null;
  coupons: number;
};

type Pagination = { total: number; limit: number; offset: number };
type Filters = {
  from: string;
  to: string;
  q: string;
  winFilter: "winners" | "losers" | "zero" | "";
  minSpins: string;
  maxSpins: string;
  hasRef: boolean;
  invited: boolean;
  hasCoupons: boolean;
  sort:
    | "total_spins"
    | "wins"
    | "losses"
    | "last_spin_at"
    | "tg_user_id"
    | "created_at"
    | "referrals"
    | "coupons";
  order: "asc" | "desc";
};

function demoStats(): UserSpinStat[] {
  const now = new Date();
  return [
    {
      user_id: "u1",
      tg_user_id: 1001,
      username: "demo_anna",
      created_at: now.toISOString(),
      last_seen_at: now.toISOString(),
      total_spins: 12,
      wins: 5,
      losses: 7,
      last_spin_at: now.toISOString(),
      referrals: 3,
      invited_by_tg_id: null,
      coupons: 2
    },
    {
      user_id: "u2",
      tg_user_id: 1002,
      username: "demo_kate",
      created_at: now.toISOString(),
      last_seen_at: now.toISOString(),
      total_spins: 4,
      wins: 1,
      losses: 3,
      last_spin_at: new Date(Date.now() - 86_400_000).toISOString(),
      referrals: 0,
      invited_by_tg_id: 1001,
      coupons: 1
    },
    {
      user_id: "u3",
      tg_user_id: 1003,
      username: null,
      created_at: now.toISOString(),
      last_seen_at: now.toISOString(),
      total_spins: 0,
      wins: 0,
      losses: 0,
      last_spin_at: null,
      referrals: 0,
      invited_by_tg_id: null,
      coupons: 0
    }
  ];
}

function yyyyMmDd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

type SortKey = Filters["sort"];

export default function AdminUsersPage() {
  const today = useMemo(() => new Date(), []);
  const defaultTo = useMemo(() => yyyyMmDd(today), [today]);
  const defaultFrom = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 30);
    return yyyyMmDd(d);
  }, [today]);

  const [filters, setFilters] = useState<Filters>({
    from: defaultFrom,
    to: defaultTo,
    q: "",
    winFilter: "",
    minSpins: "",
    maxSpins: "",
    hasRef: false,
    invited: false,
    hasCoupons: false,
    sort: "total_spins",
    order: "desc"
  });
  const [stats, setStats] = useState<UserSpinStat[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const fromIso = `${filters.from}T00:00:00.000Z`;
    const toIso = `${filters.to}T23:59:59.999Z`;

    const qs = new URLSearchParams();
    qs.set("from", fromIso);
    qs.set("to", toIso);
    if (filters.q.trim()) qs.set("q", filters.q.trim());
    if (filters.winFilter) qs.set("win_filter", filters.winFilter);
    if (filters.minSpins) qs.set("min_spins", filters.minSpins);
    if (filters.maxSpins) qs.set("max_spins", filters.maxSpins);
    if (filters.hasRef) qs.set("has_ref", "1");
    if (filters.invited) qs.set("invited", "1");
    if (filters.hasCoupons) qs.set("has_coupons", "1");
    qs.set("sort", filters.sort);
    qs.set("order", filters.order);
    qs.set("limit", "100");
    qs.set("offset", "0");

    const res = await fetch(`/admin/api/users/stats?${qs.toString()}`, { cache: "no-store" }).catch(() => null);
    if (!res || !res.ok) {
      const msg = (await res?.json().catch(() => null)) as { error?: string } | null;
      setError(msg?.error || "Демо-режим: нет доступа к API статистики");
      setStats(demoStats());
      setPagination({ total: demoStats().length, limit: 100, offset: 0 });
      setLoading(false);
      return;
    }

    const json = (await res.json().catch(() => null)) as
      | { stats?: UserSpinStat[]; pagination?: Pagination; filters?: unknown }
      | null;
    setStats(Array.isArray(json?.stats) ? json!.stats! : []);
    setPagination(
      json?.pagination
        ? (json.pagination as Pagination)
        : { total: (json?.stats?.length ?? 0), limit: 100, offset: 0 }
    );
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void load();
    }, 120);
    return () => window.clearTimeout(id);
  }, [load]);

  const totals = useMemo(() => {
    return stats.reduce(
      (acc, s) => {
        acc.total += Number(s.total_spins) || 0;
        acc.wins += Number(s.wins) || 0;
        acc.losses += Number(s.losses) || 0;
        acc.coupons += Number(s.coupons) || 0;
        acc.refs += Number(s.referrals) || 0;
        return acc;
      },
      { total: 0, wins: 0, losses: 0, coupons: 0, refs: 0 }
    );
  }, [stats]);

  const setSort = useCallback((key: SortKey) => {
    setFilters((prev) => {
      if (prev.sort === key) {
        return { ...prev, order: prev.order === "asc" ? "desc" : "asc" };
      }
      return { ...prev, sort: key, order: "desc" };
    });
  }, []);

  const resetFilters = useCallback(() => {
    setFilters((prev) => ({
      from: defaultFrom,
      to: defaultTo,
      q: "",
      winFilter: "",
      minSpins: "",
      maxSpins: "",
      hasRef: false,
      invited: false,
      hasCoupons: false,
      sort: "total_spins",
      order: "desc"
    }));
  }, [defaultFrom, defaultTo]);

  const sortButtonClass = (key: SortKey) =>
    `${styles.thButton} ${filters.sort === key ? (filters.order === "asc" ? styles.thAsc : styles.thDesc) : ""}`;

  const activeFilterCount = useMemo(() => {
    let c = 0;
    if (filters.q.trim()) c += 1;
    if (filters.winFilter) c += 1;
    if (filters.minSpins) c += 1;
    if (filters.maxSpins) c += 1;
    if (filters.hasRef) c += 1;
    if (filters.invited) c += 1;
    if (filters.hasCoupons) c += 1;
    if (filters.from !== defaultFrom || filters.to !== defaultTo) c += 1;
    return c;
  }, [filters, defaultFrom, defaultTo]);

  return (
    <div className={styles.card}>
      <div className={styles.titleRow}>
        <h1 className={styles.title}>Статистика по пользователям</h1>
        <div className={styles.pill}>
          <span>Показано: {stats.length} / {pagination?.total ?? 0}</span>
          <span>Игры: {totals.total}</span>
          <span>Выигрыши: {totals.wins}</span>
          <span>Проигрыши: {totals.losses}</span>
          <span>Купоны: {totals.coupons}</span>
          <span>Рефералы: {totals.refs}</span>
        </div>
      </div>

      <div className={styles.filterPanel}>
        <div className={styles.filterRow}>
          <div className={`${styles.field} ${styles.fieldWide}`}>
            <div className={styles.label}>Поиск (TG ID / @username)</div>
            <input
              className={styles.input}
              type="search"
              placeholder="123456789 или @anna или anna"
              value={filters.q}
              onChange={(e) => setFilters((prev) => ({ ...prev, q: e.target.value }))}
            />
          </div>
          <div className={styles.field}>
            <div className={styles.label}>С</div>
            <input
              className={styles.input}
              type="date"
              value={filters.from}
              onChange={(e) => setFilters((prev) => ({ ...prev, from: e.target.value }))}
            />
          </div>
          <div className={styles.field}>
            <div className={styles.label}>По</div>
            <input
              className={styles.input}
              type="date"
              value={filters.to}
              onChange={(e) => setFilters((prev) => ({ ...prev, to: e.target.value }))}
            />
          </div>
        </div>

        <div className={styles.filterRow}>
          <div className={styles.radioGroup}>
            <div className={styles.label}>Результат спина</div>
            <div className={styles.radioButtons}>
              {(
                [
                  { v: "", label: "Все" },
                  { v: "winners", label: "Только выиграли 🏆" },
                  { v: "losers", label: "Только проиграли 😥" },
                  { v: "zero", label: "Нет спинов 🙅" }
                ] as Array<{ v: Filters["winFilter"]; label: string }>
              ).map((opt) => (
                <label key={opt.v || "all"} className={`${styles.radio} ${filters.winFilter === opt.v ? styles.radioOn : ""}`}>
                  <input
                    type="radio"
                    name="winFilter"
                    className={styles.radioInput}
                    checked={filters.winFilter === opt.v}
                    onChange={() => setFilters((prev) => ({ ...prev, winFilter: opt.v }))}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.filterRow}>
          <div className={styles.field}>
            <div className={styles.label}>Мин. спинов</div>
            <input
              className={styles.input}
              type="number"
              min="0"
              placeholder="0"
              value={filters.minSpins}
              onChange={(e) => setFilters((prev) => ({ ...prev, minSpins: e.target.value }))}
            />
          </div>
          <div className={styles.field}>
            <div className={styles.label}>Макс. спинов</div>
            <input
              className={styles.input}
              type="number"
              min="0"
              placeholder="1000"
              value={filters.maxSpins}
              onChange={(e) => setFilters((prev) => ({ ...prev, maxSpins: e.target.value }))}
            />
          </div>
          <div className={styles.checkboxRow}>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={filters.hasRef}
                onChange={(e) => setFilters((prev) => ({ ...prev, hasRef: e.target.checked }))}
              />
              <span>Пригласили кого-то</span>
            </label>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={filters.invited}
                onChange={(e) => setFilters((prev) => ({ ...prev, invited: e.target.checked }))}
              />
              <span>Приглашены рефералкой</span>
            </label>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={filters.hasCoupons}
                onChange={(e) => setFilters((prev) => ({ ...prev, hasCoupons: e.target.checked }))}
              />
              <span>Получили купоны</span>
            </label>
          </div>
        </div>

        <div className={styles.buttonRow}>
          <button
            className={`${styles.button} ${styles.buttonPrimary}`}
            type="button"
            onClick={load}
            disabled={loading}
          >
            {loading ? "Обновление..." : "Обновить"}
          </button>
          <button
            className={styles.button}
            type="button"
            onClick={resetFilters}
            disabled={loading || activeFilterCount === 0}
          >
            Сбросить фильтры{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </button>
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={`${styles.th} ${sortButtonClass("tg_user_id")}`} onClick={() => setSort("tg_user_id")}>
                TG ID
              </th>
              <th className={styles.th}>Username</th>
              <th className={`${styles.th} ${styles.tdRight} ${sortButtonClass("total_spins")}`} onClick={() => setSort("total_spins")}>
                Игры
              </th>
              <th className={`${styles.th} ${styles.tdRight} ${sortButtonClass("wins")}`} onClick={() => setSort("wins")}>
                Выигрыши
              </th>
              <th className={`${styles.th} ${styles.tdRight} ${sortButtonClass("losses")}`} onClick={() => setSort("losses")}>
                Проигрыши
              </th>
              <th className={`${styles.th} ${styles.tdRight} ${sortButtonClass("coupons")}`} onClick={() => setSort("coupons")}>
                Купоны
              </th>
              <th className={`${styles.th} ${styles.tdRight} ${sortButtonClass("referrals")}`} onClick={() => setSort("referrals")}>
                Рефералы
              </th>
              <th className={styles.th}>Кто пригласил</th>
              <th className={`${styles.th} ${sortButtonClass("created_at")}`} onClick={() => setSort("created_at")}>
                Регистрация
              </th>
              <th className={`${styles.th} ${sortButtonClass("last_spin_at")}`} onClick={() => setSort("last_spin_at")}>
                Последний спин
              </th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <tr key={s.tg_user_id} className={s.wins > 0 ? styles.rowWinner : styles.rowLoser}>
                <td className={styles.td}>
                  <Link href={`/admin/users/${s.tg_user_id}`} className={styles.linkLikeCell}>
                    <code>{s.tg_user_id}</code>
                  </Link>
                </td>
                <td className={styles.td}>
                  {s.username ? (
                    <Link href={`/admin/users/${s.tg_user_id}`} className={styles.linkLikeCell}>
                      @{s.username}
                    </Link>
                  ) : (
                    <Link href={`/admin/users/${s.tg_user_id}`} className={styles.linkLikeCell}>
                      —
                    </Link>
                  )}
                </td>
                <td className={`${styles.td} ${styles.tdRight}`}>
                  <b>{s.total_spins}</b>
                </td>
                <td className={`${styles.td} ${styles.tdRight} ${styles.cellWin}`}>{s.wins > 0 ? `+${s.wins}` : 0}</td>
                <td className={`${styles.td} ${styles.tdRight} ${styles.cellLose}`}>{s.losses}</td>
                <td className={`${styles.td} ${styles.tdRight}`}>
                  {s.coupons > 0 ? <span className={styles.badgeOk}>×{s.coupons}</span> : "—"}
                </td>
                <td className={`${styles.td} ${styles.tdRight}`}>
                  {s.referrals > 0 ? <span className={styles.badgeWarn}>{s.referrals}</span> : "—"}
                </td>
                <td className={styles.td}>
                  {s.invited_by_tg_id ? (
                    <span className={styles.linkLike} title={`Пригласил TG ID ${s.invited_by_tg_id}`}>
                      #{s.invited_by_tg_id}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className={styles.td}>{formatRu(s.created_at)}</td>
                <td className={styles.td}>{formatRu(s.last_spin_at)}</td>
              </tr>
            ))}
            {stats.length === 0 && (
              <tr>
                <td className={styles.td} colSpan={10}>
                  {loading ? "Загрузка..." : "Нет пользователей, подходящих под фильтры"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
