"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import styles from "../../admin.module.css";

// ---------------------------------------------------------------------------
// Типы
// ---------------------------------------------------------------------------
type Prize = {
  id: string;
  title: string;
  weight: number;
  spins: number | null;
  active: boolean;
  created_at: string;
};

type CalendarItem = {
  id: string;
  prize_date: string;
  prize_id: string;
  prize_title: string;
  amount: number;
  remaining: number;
  created_at: string;
};

type Redemption = {
  id: string;
  coupon_set_id: string;
  spin_id: string | null;
  user_id: string | null;
  tg_user_id: number | null;
  username: string | null;
  coupon_type: string;
  created_at: string;
  per_user_total: number;
};

type CouponSet = {
  id: string;
  period: string;
  title: string;
  total_coupons: number;
  created_at: string;
  redeemed: number;
  remaining: number;
  fill_percent: number;
  unique_users: number;
};

type SortKey = "created_at" | "username" | "coupon_type" | "tg_user_id";

const MONTH_NAMES_RU = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
];
const WD_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function currentPeriod(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function periodLabel(period: string) {
  const [y, m] = period.split("-").map(Number);
  return `${MONTH_NAMES_RU[(m - 1 + 12) % 12]} ${y}`;
}

function shiftPeriod(period: string, delta: number) {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return currentPeriod(d);
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
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(ms));
}

function toIsoStartOfDayLocal(dateStr: string | null) {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function toIsoEndOfDayLocal(dateStr: string | null) {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T23:59:59.999`);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

// ---------------------------------------------------------------------------
// Демо-призы на случай, если API недоступен локально
// ---------------------------------------------------------------------------
function demoPrizes(): Prize[] {
  const now = new Date().toISOString();
  return [
    { id: "demo-1", title: "Сертификат WB 500₽", weight: 100, spins: null, active: true, created_at: now },
    { id: "demo-2", title: "1 крутка", weight: 100, spins: 1, active: true, created_at: now },
    { id: "demo-3", title: "Бьюти-набор", weight: 100, spins: null, active: true, created_at: now },
    { id: "demo-4", title: "Ничего", weight: 100, spins: null, active: true, created_at: now }
  ];
}

const RESTRICTED_ERROR = "Не удалось получить данные (нет доступа к БД локально).";

// ---------------------------------------------------------------------------
// Страница
// ---------------------------------------------------------------------------
export default function AdminCouponsPage() {
  const today = useMemo(() => new Date(), []);
  const defaultPeriod = useMemo(() => currentPeriod(today), [today]);

  // --- Призы ---
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [prizesLoading, setPrizesLoading] = useState(true);
  const [prizesError, setPrizesError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newSpins, setNewSpins] = useState("");
  const [newActive, setNewActive] = useState(true);

  // --- Календарь ---
  const [period, setPeriod] = useState<string>(defaultPeriod);
  const [calendar, setCalendar] = useState<CalendarItem[]>([]);
  const [calLoading, setCalLoading] = useState(false);
  const [calError, setCalError] = useState<string | null>(null);

  // --- Модалка дня ---
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const [modalPrizeId, setModalPrizeId] = useState<string>("");
  const [modalAmount, setModalAmount] = useState<string>("1");
  const [modalSaving, setModalSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalVersion, setModalVersion] = useState(0);

  // --- Журнал выдачи (сохранён из прежней логики) ---
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [redemptionsLoading, setRedemptionsLoading] = useState(true);
  const [fSetId, setFSetId] = useState("");
  const [fUser, setFUser] = useState("");
  const [fType, setFType] = useState("");
  const [fFrom, setFFrom] = useState<string>(() => yyyyMmDd(new Date(Date.now() - 14 * 864e5)));
  const [fTo, setFTo] = useState<string>(() => yyyyMmDd(new Date()));
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortAsc, setSortAsc] = useState(false);
  const [filtersApplied, setFiltersApplied] = useState(0);

  // --- Загрузка призов ---
  const loadPrizes = useCallback(async () => {
    setPrizesError(null);
    const res = await fetch("/admin/api/prizes", { cache: "no-store" }).catch(() => null);
    if (!res || !res.ok) {
      setPrizesError(RESTRICTED_ERROR);
      setPrizes(demoPrizes());
      setPrizesLoading(false);
      return;
    }
    const json = (await res.json().catch(() => null)) as { prizes?: Prize[] } | null;
    setPrizes(Array.isArray(json?.prizes) ? json!.prizes! : []);
    setPrizesLoading(false);
  }, []);

  // --- Загрузка календаря ---
  const loadCalendar = useCallback(async () => {
    setCalLoading(true);
    setCalError(null);
    const res = await fetch(`/admin/api/prize-calendar?period=${encodeURIComponent(period)}`, { cache: "no-store" }).catch(() => null);
    if (!res || !res.ok) {
      setCalError(RESTRICTED_ERROR);
      setCalendar([]);
      setCalLoading(false);
      return;
    }
    const json = (await res.json().catch(() => null)) as { items?: CalendarItem[] } | null;
    setCalendar(Array.isArray(json?.items) ? json!.items! : []);
    setCalLoading(false);
  }, [period]);

  // --- Журнал: наборы ---
  const loadSets = useCallback(async () => {
    const res = await fetch("/admin/api/coupons/sets", { cache: "no-store" }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as { sets?: CouponSet[] } | null;
    const arr = Array.isArray(json?.sets) ? json!.sets! : [];
    setSelectedSetId((prev) => {
      if (prev && arr.some((s) => s.id === prev)) return prev;
      const cur = arr.find((s) => s.period === currentPeriod());
      return cur ? cur.id : arr[0]?.id ?? null;
    });
  }, []);

  // --- Журнал: выдача ---
  const loadRedemptions = useCallback(async () => {
    const qs = new URLSearchParams();
    const actualSet = fSetId || selectedSetId || "";
    if (actualSet) qs.set("set_id", actualSet);
    if (fUser.trim()) qs.set("user", fUser.trim());
    if (fType.trim()) qs.set("coupon_type", fType.trim());
    const fromIso = toIsoStartOfDayLocal(fFrom);
    const toIso = toIsoEndOfDayLocal(fTo);
    if (fromIso) qs.set("from", fromIso);
    if (toIso) qs.set("to", toIso);
    qs.set("sort", sortKey);
    qs.set("order", sortAsc ? "asc" : "desc");
    qs.set("limit", "500");
    const res = await fetch(`/admin/api/coupons/redemptions?${qs.toString()}`, { cache: "no-store" }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as { redemptions?: Redemption[] } | null;
    setRedemptions(Array.isArray(json?.redemptions) ? json!.redemptions! : []);
    setRedemptionsLoading(false);
  }, [fSetId, selectedSetId, fUser, fType, fFrom, fTo, sortKey, sortAsc]);

  // --- Эффекты ---
  useEffect(() => {
    void loadPrizes();
    void loadSets();
  }, [loadPrizes, loadSets]);

  useEffect(() => {
    void loadCalendar();
  }, [loadCalendar, modalVersion]);

  useEffect(() => {
    void loadRedemptions();
  }, [loadRedemptions, filtersApplied]);

  // --- Календарные ячейки месяца ---
  const monthCells = useMemo(() => {
    const [y, m] = period.split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const daysInMonth = new Date(y, m, 0).getDate();
    const startOffset = (first.getDay() + 6) % 7; // Пн = 0
    const cells: Array<{ dateStr: string; dayNum: number; items: CalendarItem[] }> = [];
    for (let i = 0; i < startOffset; i++) {
      cells.push({ dateStr: "", dayNum: 0, items: [] });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${period}-${String(d).padStart(2, "0")}`;
      cells.push({
        dateStr,
        dayNum: d,
        items: calendar.filter((c) => c.prize_date === dateStr)
      });
    }
    return cells;
  }, [period, calendar]);

  const dayItem = useMemo(
    () => (activeDay ? calendar.filter((c) => c.prize_date === activeDay) : []),
    [activeDay, calendar]
  );

  const openDay = (dateStr: string) => {
    setActiveDay(dateStr);
    setModalPrizeId("");
    setModalAmount("1");
    setModalError(null);
  };

  const saveDayItem = async () => {
    if (!activeDay || !modalPrizeId) return;
    setModalSaving(true);
    setModalError(null);
    const res = await fetch("/admin/api/prize-calendar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date: activeDay, prize_id: modalPrizeId, amount: Number(modalAmount) })
    }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as { error?: string } | null;
    setModalSaving(false);
    if (!res || !res.ok) {
      setModalError(json?.error || "Не удалось сохранить");
      return;
    }
    setModalPrizeId("");
    setModalAmount("1");
    setModalVersion((v) => v + 1);
  };

  const deleteDayItem = async (id: string) => {
    if (!window.confirm("Удалить эту запись дня?")) return;
    setModalError(null);
    const res = await fetch(`/admin/api/prize-calendar?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
    if (!res || !res.ok) {
      const json = (await res?.json().catch(() => null)) as { error?: string } | null;
      setModalError(json?.error || "Не удалось удалить");
      return;
    }
    setModalVersion((v) => v + 1);
  };

  // --- CRUD призов ---
  const createPrize = async () => {
    const payload = { title: newTitle, weight: 100, spins: newSpins === "" ? null : Number(newSpins), active: newActive };
    const res = await fetch("/admin/api/prizes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(() => null);
    if (res && res.ok) {
      setNewTitle("");
      setNewSpins("");
      await loadPrizes();
    }
  };

  const updatePrize = async (id: string, patch: Partial<Pick<Prize, "title" | "weight" | "spins" | "active">>) => {
    await fetch(`/admin/api/prizes/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch)
    }).catch(() => null);
    await loadPrizes();
  };

  const deletePrize = async (id: string) => {
    if (!window.confirm("Удалить приз (и связанные с ним записи календаря)?")) return;
    await fetch(`/admin/api/prizes/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
    await loadPrizes();
    setModalVersion((v) => v + 1);
  };

  // --- Журнал: сортировка/фильтры ---
  const sortedRedemptions = useMemo(() => {
    const copy = [...redemptions];
    const mul = sortAsc ? 1 : -1;
    copy.sort((a, b) => {
      const va = sortKey === "username" ? (a.username ?? "") : sortKey === "coupon_type" ? (a.coupon_type ?? "") : sortKey === "tg_user_id" ? (a.tg_user_id ?? 0) : (a.created_at ?? "");
      const vb = sortKey === "username" ? (b.username ?? "") : sortKey === "coupon_type" ? (b.coupon_type ?? "") : sortKey === "tg_user_id" ? (b.tg_user_id ?? 0) : (b.created_at ?? "");
      if (va < vb) return -1 * mul;
      if (va > vb) return 1 * mul;
      return 0;
    });
    return copy;
  }, [redemptions, sortKey, sortAsc]);

  const uniqueCouponTypes = useMemo(() => {
    const set = new Set<string>();
    for (const r of redemptions) if (r.coupon_type) set.add(r.coupon_type);
    return Array.from(set).sort();
  }, [redemptions]);

  const toggleSort = (key: SortKey) => setSortKey(key);
  const sortArrow = (key: SortKey) => (sortKey === key ? (sortAsc ? "↑" : "↓") : "↕");
  const resetFilters = () => {
    setFSetId("");
    setFUser("");
    setFType("");
    setFFrom(yyyyMmDd(new Date(Date.now() - 14 * 864e5)));
    setFTo(yyyyMmDd(new Date()));
    setSortKey("created_at");
    setSortAsc(false);
    setFiltersApplied((x) => x + 1);
  };

  const activePrizes = prizes.filter((p) => p.active);

  return (
    <div className={styles.row} style={{ gridTemplateColumns: "1fr", gap: 12 }}>
      {/* ================= ПРИЗЫ ================= */}
      <section className={styles.card}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Призовой фонд — призы</h1>
          <div className={styles.pill}>
            <span>Активных: {prizes.filter((p) => p.active).length}</span>
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <div className={styles.label}>Название</div>
            <input className={styles.input} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Например: Сертификат WB 500₽" />
          </div>
          <div className={styles.field}>
            <div className={styles.label}>Крутки (если приз-крутка)</div>
            <input className={styles.input} value={newSpins} onChange={(e) => setNewSpins(e.target.value)} inputMode="numeric" placeholder="0" />
          </div>
          <div className={styles.field}>
            <div className={styles.label}>Активен</div>
            <select className={styles.input} value={newActive ? "1" : "0"} onChange={(e) => setNewActive(e.target.value === "1")}>
              <option value="1">Да</option>
              <option value="0">Нет</option>
            </select>
          </div>
        </div>
        <div className={styles.buttonRow}>
          <button className={`${styles.button} ${styles.buttonPrimary}`} type="button" onClick={createPrize} disabled={newTitle.trim().length === 0}>
            Добавить приз
          </button>
        </div>

        {prizesError && <div className={styles.error}>{prizesError}</div>}

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Название</th>
                <th className={styles.th}>Крутки</th>
                <th className={styles.th}>Активен</th>
                <th className={`${styles.th} ${styles.tdRight}`}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {prizes.map((p) => (
                <tr key={p.id}>
                  <td className={styles.td} style={{ width: "100%" }}>
                    <input
                      className={styles.inlineInput}
                      style={{ width: "100%" }}
                      defaultValue={p.title}
                      onBlur={(e) => {
                        const next = e.target.value;
                        if (next.trim() && next.trim() !== p.title) void updatePrize(p.id, { title: next });
                      }}
                    />
                  </td>
                  <td className={styles.td} style={{ width: 90, textAlign: "center" }}>
                    <input
                      className={styles.inlineInput}
                      style={{ width: 64, textAlign: "center" }}
                      defaultValue={p.spins == null ? "" : String(p.spins)}
                      inputMode="numeric"
                      onBlur={(e) => {
                        const raw = e.target.value.trim();
                        const next = raw === "" ? null : Number(raw);
                        if ((raw === "" && p.spins !== null) || (raw !== "" && Number.isFinite(next) && next !== p.spins)) void updatePrize(p.id, { spins: next });
                      }}
                    />
                  </td>
                  <td className={styles.td}>
                    <select
                      className={styles.inlineInput}
                      defaultValue={p.active ? "1" : "0"}
                      onChange={(e) => {
                        const next = e.target.value === "1";
                        if (next !== p.active) void updatePrize(p.id, { active: next });
                      }}
                    >
                      <option value="1">Да</option>
                      <option value="0">Нет</option>
                    </select>
                  </td>
                  <td className={`${styles.td} ${styles.tdRight}`}>
                    <button className={`${styles.button} ${styles.buttonDanger}`} type="button" onClick={() => void deletePrize(p.id)}>
                      Удалить
                    </button>
                  </td>
                </tr>
              ))}
              {prizes.length === 0 && (
                <tr>
                  <td className={styles.td} colSpan={4}>{prizesLoading ? "Загрузка..." : "Пока нет призов"}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ================= КАЛЕНДАРЬ ================= */}
      <section className={styles.card}>
        <div className={styles.toolbarRow}>
          <div>
            <h2 className={styles.title}>Календарь призов</h2>
            <div className={styles.muted}>
              Жми на день — укажи, какой приз и сколько раз выдать в этот день. Выдано будет ровно столько, сколько ты запланируешь.
            </div>
          </div>
          <div className={styles.buttonRow} style={{ marginTop: 0 }}>
            <button className={styles.button} type="button" onClick={() => setPeriod(shiftPeriod(period, -1))}>← назад</button>
            <span className={styles.pill}>{periodLabel(period)}</span>
            <button className={styles.button} type="button" onClick={() => setPeriod(shiftPeriod(period, 1))}>вперёд →</button>
            <button className={styles.button} type="button" onClick={() => { setPeriod(defaultPeriod); }}>Сегодня</button>
          </div>
        </div>

        {calError && <div className={styles.error}>{calError}</div>}
        {calLoading && <div className={styles.muted} style={{ marginTop: 8 }}>Загрузка календаря…</div>}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gap: 6,
            marginTop: 10
          }}
        >
          {WD_SHORT.map((w) => (
            <div key={w} className={styles.muted} style={{ textAlign: "center", fontSize: 12, fontWeight: 600 }}>
              {w}
            </div>
          ))}
          {monthCells.map((cell, idx) =>
            cell.dateStr === "" ? (
              <div key={`empty-${idx}`} style={{ minHeight: 72 }} />
            ) : (
              <button
                key={cell.dateStr}
                type="button"
                onClick={() => openDay(cell.dateStr)}
                style={{
                  minHeight: 72,
                  borderRadius: 10,
                  border: "1px solid #e5e5ea",
                  background: cell.items.length > 0 ? "rgba(184,31,34,0.06)" : "#ffffff",
                  padding: 8,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  alignItems: "stretch",
                  textAlign: "left",
                  cursor: "pointer",
                  gap: 4
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: cell.dateStr === yyyyMmDd(new Date()) ? "#b81f22" : "#0f172a" }}>
                  {cell.dayNum}
                </div>
                {cell.items.length > 0 ? (
                  <div style={{ fontSize: 10, lineHeight: 1.2, color: "#334155", whiteSpace: "pre-wrap" }}>
                    {cell.items.map((it) => `${it.prize_title}: ${it.remaining}/${it.amount}`).join("\n")}
                  </div>
                ) : (
                  <div className={styles.muted} style={{ fontSize: 10 }}>— нет плана</div>
                )}
              </button>
            )
          )}
        </div>
      </section>

      {/* ================= ЖУРНАЛ ВЫДАЧИ ================= */}
      <section className={styles.card}>
        <div className={styles.toolbarRow}>
          <div>
            <h2 className={styles.title}>Журнал выдачи</h2>
            <div className={styles.muted}>Всего записей в выборке: {sortedRedemptions.length.toLocaleString("ru-RU")}</div>
          </div>
        </div>

        <div className={styles.filtersRow}>
          <div className={styles.field}>
            <label className={styles.label}>Пользователь</label>
            <input className={styles.input} type="text" value={fUser} onChange={(e) => setFUser(e.target.value)} placeholder="username или tg id" />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Тип приза</label>
            <input className={styles.input} type="text" list="coupon-types-list" value={fType} onChange={(e) => setFType(e.target.value)} placeholder="Сертификат…" />
            <datalist id="coupon-types-list">
              {uniqueCouponTypes.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Дата с</label>
            <input className={styles.input} type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Дата по</label>
            <input className={styles.input} type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} />
          </div>
          <div className={styles.buttonRow} style={{ marginTop: 0, justifyContent: "flex-end" }}>
            <button className={styles.button} type="button" onClick={resetFilters}>Сбросить</button>
            <button className={`${styles.button} ${styles.buttonPrimary}`} type="button" onClick={() => setFiltersApplied((x) => x + 1)}>
              Применить
            </button>
          </div>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}><button className={styles.sortButton} type="button" onClick={() => toggleSort("created_at")}>Дата {sortArrow("created_at")}</button></th>
                <th className={styles.th}><button className={styles.sortButton} type="button" onClick={() => toggleSort("tg_user_id")}>TG ID {sortArrow("tg_user_id")}</button></th>
                <th className={styles.th}><button className={styles.sortButton} type="button" onClick={() => toggleSort("username")}>Ник в Telegram {sortArrow("username")}</button></th>
                <th className={styles.th}><button className={styles.sortButton} type="button" onClick={() => toggleSort("coupon_type")}>Приз {sortArrow("coupon_type")}</button></th>
                <th className={`${styles.th} ${styles.tdRight}`}>Всего у пользователя</th>
              </tr>
            </thead>
            <tbody>
              {!redemptionsLoading && sortedRedemptions.length === 0 && (
                <tr>
                  <td className={styles.td} colSpan={5} style={{ textAlign: "center", color: "rgba(245,245,247,0.72)" }}>
                    Нет записей за выбранный период.
                  </td>
                </tr>
              )}
              {sortedRedemptions.map((r) => (
                <tr key={r.id}>
                  <td className={styles.td}>{formatRu(r.created_at)}</td>
                  <td className={styles.td}>{r.tg_user_id ? <code style={{ fontSize: 13 }}>{r.tg_user_id}</code> : <span className={styles.muted}>—</span>}</td>
                  <td className={styles.td}>{r.username ? <span className={styles.pill}>@{r.username}</span> : <span className={styles.muted}>без ника</span>}</td>
                  <td className={styles.td}>{r.coupon_type ? <span className={`${styles.pill} ${styles.badgeWarn}`}>{r.coupon_type}</span> : <span className={styles.muted}>—</span>}</td>
                  <td className={`${styles.td} ${styles.tdRight}`} style={{ fontWeight: 700 }}>{r.per_user_total ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ================= МОДАЛКА ДНЯ ================= */}
      {activeDay && (
        <div className={styles.modalBackdrop} onClick={() => setActiveDay(null)} role="presentation">
          <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`План дня ${activeDay}`}>
            <div className={styles.modalHeader}>
              <div>
                <div className={styles.modalTitle}>План выигрышей: {activeDay}</div>
                <div className={styles.muted}>Сколько и какие призы выдать в этот день</div>
              </div>
              <button className={styles.button} type="button" onClick={() => setActiveDay(null)}>Закрыть</button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.row} style={{ marginBottom: 10 }}>
                <div className={styles.field}>
                  <div className={styles.label}>Приз</div>
                  <select
                    className={styles.input}
                    value={modalPrizeId}
                    onChange={(e) => setModalPrizeId(e.target.value)}
                  >
                    <option value="">— выбери приз —</option>
                    {activePrizes.map((p) => (
                      <option key={p.id} value={p.id}>{p.title}</option>
                    ))}
                  </select>
                </div>
                <div className={styles.field}>
                  <div className={styles.label}>Сколько раз выдать</div>
                  <input className={styles.input} type="number" min={0} step={1} value={modalAmount} onChange={(e) => setModalAmount(e.target.value)} />
                </div>
                <div className={styles.buttonRow} style={{ marginTop: 0, alignItems: "flex-end" }}>
                  <button className={`${styles.button} ${styles.buttonPrimary}`} type="button" onClick={() => void saveDayItem()} disabled={modalSaving || !modalPrizeId}>
                    {modalSaving ? "Сохраняем…" : "Добавить"}
                  </button>
                </div>
              </div>

              {modalError && <div className={styles.error}>{modalError}</div>}

              {dayItem.length === 0 && <div className={styles.muted}>На этот день плана нет.</div>}

              {dayItem.map((it) => (
                <div
                  key={it.id}
                  className={styles.statRow}
                  style={{
                    border: "1px solid #e5e5ea",
                    borderRadius: 10,
                    padding: 10,
                    marginBottom: 8,
                    background: "#fff"
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700 }}>{it.prize_title}</div>
                    <div className={styles.muted} style={{ fontSize: 12 }}>
                      Выдано: {(it.amount - it.remaining).toLocaleString("ru-RU")} из {it.amount.toLocaleString("ru-RU")} · осталось{" "}
                      {it.remaining.toLocaleString("ru-RU")}
                    </div>
                  </div>
                  <div className={styles.buttonRow} style={{ marginTop: 0 }}>
                    <button
                      className={styles.button}
                      type="button"
                      onClick={() => {
                        setModalPrizeId(it.prize_id);
                        setModalAmount(String(it.amount));
                      }}
                    >
                      Изменить
                    </button>
                    <button className={`${styles.button} ${styles.buttonDanger}`} type="button" onClick={() => void deleteDayItem(it.id)}>
                      Удалить
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}