"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import styles from "../../admin.module.css";

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

type SortKey = "created_at" | "username" | "coupon_type" | "tg_user_id";

const MONTH_NAMES_RU = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
];

function currentPeriod(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function nextPeriod(period: string) {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(y, m, 1);
  return currentPeriod(d);
}

function periodLabel(period: string) {
  const [y, m] = period.split("-").map(Number);
  return `${MONTH_NAMES_RU[(m - 1 + 12) % 12]} ${y}`;
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

function yyyyMmDd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

const POLL_MS = 5000;

export default function AdminCouponsPage() {
  const today = useMemo(() => new Date(), []);
  const defaultPeriod = useMemo(() => currentPeriod(today), [today]);
  const defaultFrom = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 14);
    return yyyyMmDd(d);
  }, [today]);
  const defaultTo = useMemo(() => yyyyMmDd(today), [today]);

  const [sets, setSets] = useState<CouponSet[]>([]);
  const [setsLoading, setSetsLoading] = useState(true);
  const [setsError, setSetsError] = useState<string | null>(null);

  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);

  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [redemptionsLoading, setRedemptionsLoading] = useState(true);
  const [redemptionsError, setRedemptionsError] = useState<string | null>(null);

  const [fSetId, setFSetId] = useState<string>("");
  const [fUser, setFUser] = useState<string>("");
  const [fType, setFType] = useState<string>("");
  const [fFrom, setFFrom] = useState<string>(defaultFrom);
  const [fTo, setFTo] = useState<string>(defaultTo);
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortAsc, setSortAsc] = useState(false);
  const [filtersApplied, setFiltersApplied] = useState(0);

  const [newPeriod, setNewPeriod] = useState<string>(nextPeriod(defaultPeriod));
  const [newTitle, setNewTitle] = useState<string>("");
  const [newTotal, setNewTotal] = useState<string>("1000");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const loadSets = useCallback(async () => {
    setSetsError(null);
    const res = await fetch("/admin/api/coupons/sets", { cache: "no-store" }).catch(() => null);
    if (!res || !res.ok) {
      const msg = (await res?.json().catch(() => null)) as { error?: string } | null;
      setSetsError(msg?.error || "Не удалось загрузить наборы купонов");
      setSetsLoading(false);
      return;
    }
    const json = (await res.json().catch(() => null)) as { sets?: CouponSet[] } | null;
    const arr = Array.isArray(json?.sets) ? (json!.sets as CouponSet[]) : [];
    setSets(arr);
    setSelectedSetId((prev) => {
      if (prev && arr.some((s) => s.id === prev)) return prev;
      const cur = arr.find((s) => s.period === defaultPeriod);
      return cur ? cur.id : arr[0]?.id ?? null;
    });
    setSetsLoading(false);
  }, [defaultPeriod]);

  const loadRedemptions = useCallback(async () => {
    setRedemptionsError(null);
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
    if (!res || !res.ok) {
      const msg = (await res?.json().catch(() => null)) as { error?: string } | null;
      setRedemptionsError(msg?.error || "Не удалось загрузить журнал купонов");
      setRedemptionsLoading(false);
      return;
    }
    const json = (await res.json().catch(() => null)) as { redemptions?: Redemption[] } | null;
    const arr = Array.isArray(json?.redemptions) ? (json!.redemptions as Redemption[]) : [];
    setRedemptions(arr);
    setRedemptionsLoading(false);
  }, [fSetId, selectedSetId, fUser, fType, fFrom, fTo, sortKey, sortAsc]);

  useEffect(() => {
    void loadSets();
    const id = window.setInterval(() => void loadSets(), POLL_MS);
    return () => window.clearInterval(id);
  }, [loadSets]);

  useEffect(() => {
    void loadRedemptions();
    const id = window.setInterval(() => void loadRedemptions(), POLL_MS);
    return () => window.clearInterval(id);
  }, [loadRedemptions, filtersApplied]);

  const selectedSet = useMemo(() => sets.find((s) => s.id === selectedSetId) ?? null, [sets, selectedSetId]);
  const currentSet = useMemo(() => sets.find((s) => s.period === defaultPeriod) ?? null, [sets, defaultPeriod]);

  const sortedRedemptions = useMemo(() => {
    const copy = [...redemptions];
    const mul = sortAsc ? 1 : -1;
    copy.sort((a, b) => {
      let va: string | number | null = null;
      let vb: string | number | null = null;
      if (sortKey === "username") {
        va = a.username ?? "";
        vb = b.username ?? "";
      } else if (sortKey === "coupon_type") {
        va = a.coupon_type ?? "";
        vb = b.coupon_type ?? "";
      } else if (sortKey === "tg_user_id") {
        va = a.tg_user_id ?? 0;
        vb = b.tg_user_id ?? 0;
      } else {
        va = a.created_at ?? "";
        vb = b.created_at ?? "";
      }
      if (va < vb) return -1 * mul;
      if (va > vb) return 1 * mul;
      return 0;
    });
    return copy;
  }, [redemptions, sortKey, sortAsc]);

  const applyFilters = () => setFiltersApplied((x) => x + 1);

  const resetFilters = () => {
    setFSetId("");
    setFUser("");
    setFType("");
    setFFrom(defaultFrom);
    setFTo(defaultTo);
    setSortKey("created_at");
    setSortAsc(false);
    setFiltersApplied((x) => x + 1);
  };

  const submitCreate = async () => {
    setCreateLoading(true);
    setCreateError(null);
    setCreateSuccess(null);
    const totalNum = Number(newTotal);
    const trimmedTitle = newTitle.trim();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(newPeriod)) {
      setCreateError("Период должен быть в формате YYYY-MM");
      setCreateLoading(false);
      return;
    }
    if (trimmedTitle.length < 1 || trimmedTitle.length > 180) {
      setCreateError("Название должно быть от 1 до 180 символов");
      setCreateLoading(false);
      return;
    }
    if (!Number.isFinite(totalNum) || !Number.isInteger(totalNum) || totalNum < 0 || totalNum > 10_000_000) {
      setCreateError("Количество купонов — целое число от 0 до 10 000 000");
      setCreateLoading(false);
      return;
    }
    const res = await fetch("/admin/api/coupons/sets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ period: newPeriod, title: trimmedTitle, total_coupons: totalNum })
    }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as { error?: string; set?: CouponSet } | null;
    setCreateLoading(false);
    if (!res || !res.ok) {
      setCreateError(json?.error || "Не удалось создать набор");
      return;
    }
    setCreateSuccess(`Создан набор «${json?.set?.title ?? trimmedTitle}»`);
    setNewTitle("");
    setNewTotal(String(Math.min(1_000_000, Math.max(0, Number(newTotal) || 1000))));
    setNewPeriod(nextPeriod(newPeriod));
    await loadSets();
  };

  const progressClass = (p: number) => {
    if (p >= 100) return `${styles.progressFill} ${styles.progressFillFull}`;
    if (p >= 85) return `${styles.progressFill} ${styles.progressFillAlmost}`;
    return styles.progressFill;
  };

  const remainingBadgeClass = (r: number, t: number) => {
    if (t <= 0) return `${styles.pill} ${styles.badgeWarn}`;
    const share = r / t;
    if (share <= 0) return `${styles.pill} ${styles.badgeDanger}`;
    if (share <= 0.15) return `${styles.pill} ${styles.badgeWarn}`;
    return `${styles.pill} ${styles.badgeOk}`;
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc((s) => !s);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const sortArrow = (key: SortKey) => {
    if (sortKey !== key) return "↕";
    return sortAsc ? "↑" : "↓";
  };

  const uniqueCouponTypes = useMemo(() => {
    const set = new Set<string>();
    for (const r of redemptions) if (r.coupon_type) set.add(r.coupon_type);
    return Array.from(set).sort();
  }, [redemptions]);

  return (
    <div className={styles.row} style={{ gridTemplateColumns: "1fr", gap: 12 }}>
      <section className={styles.card}>
        <div className={styles.toolbarRow}>
          <div>
            <h2 className={styles.title}>Календарь купонов</h2>
            <div className={styles.muted}>
              Автообновление каждые 5 сек. Каждый выигрыш в рулетке автоматически списывает купон текущего месяца.
            </div>
          </div>
          <div className={styles.buttonRow} style={{ marginTop: 0 }}>
            <button className={styles.button} type="button" onClick={() => void loadSets()}>Обновить наборы</button>
            <button className={styles.button} type="button" onClick={() => void loadRedemptions()}>Обновить журнал</button>
          </div>
        </div>

        {currentSet && (
          <div className={styles.card} style={{ marginTop: 12, background: "rgba(184,31,34,0.08)", borderColor: "rgba(184,31,34,0.35)" }}>
            <div className={styles.toolbarRow}>
              <div>
                <div className={styles.muted}>Текущий месяц · {periodLabel(currentSet.period)}</div>
                <div className={styles.title} style={{ margin: "2px 0 0 0" }}>{currentSet.title}</div>
              </div>
              <div className={styles.statRow} style={{ flex: "1 1 auto", justifyContent: "flex-end" }}>
                <div style={{ marginRight: 24 }}>
                  <div className={styles.statBig}>{currentSet.remaining.toLocaleString("ru-RU")}</div>
                  <div className={styles.statSub}>осталось из {currentSet.total_coupons.toLocaleString("ru-RU")}</div>
                </div>
                <div style={{ marginRight: 24 }}>
                  <div className={styles.statBig}>{currentSet.redeemed.toLocaleString("ru-RU")}</div>
                  <div className={styles.statSub}>выдано</div>
                </div>
                <div>
                  <div className={styles.statBig}>{currentSet.unique_users.toLocaleString("ru-RU")}</div>
                  <div className={styles.statSub}>уникальных пользователей</div>
                </div>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <div className={styles.progressWrap}>
                <div className={progressClass(currentSet.fill_percent)} style={{ width: `${Math.min(100, currentSet.fill_percent)}%` }} />
              </div>
              <div className={styles.statSub} style={{ marginTop: 6 }}>
                Заполнено: {currentSet.fill_percent.toFixed(2)}%
              </div>
            </div>
          </div>
        )}

        {setsLoading && <div className={styles.muted} style={{ marginTop: 10 }}>Загрузка наборов…</div>}
        {setsError && <div className={styles.error}>{setsError}</div>}

        {!setsLoading && sets.length === 0 && (
          <div className={styles.muted} style={{ marginTop: 10 }}>
            Наборов пока нет. Создайте первый в форме ниже (следующий месяц по умолчанию).
          </div>
        )}

        {!setsLoading && sets.length > 0 && (
          <div className={styles.calGrid}>
            {sets.map((s) => {
              const active = s.id === selectedSetId;
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`${styles.calCard} ${active ? styles.calCardActive : ""}`}
                  onClick={() => setSelectedSetId(s.id)}
                  style={{ textAlign: "left" }}
                >
                  <div className={styles.calCardTitleRow}>
                    <div>
                      <div className={styles.calCardTitle}>{s.title}</div>
                      <div className={styles.calCardPeriod}>
                        {periodLabel(s.period)} · {s.period}
                        {s.period === defaultPeriod ? " · текущий" : ""}
                      </div>
                    </div>
                    <span className={remainingBadgeClass(s.remaining, s.total_coupons)}>
                      {s.remaining.toLocaleString("ru-RU")} ост.
                    </span>
                  </div>
                  <div className={styles.progressWrap}>
                    <div className={progressClass(s.fill_percent)} style={{ width: `${Math.min(100, s.fill_percent)}%` }} />
                  </div>
                  <div className={styles.statRow}>
                    <div>
                      <div className={styles.statSub}>выдано</div>
                      <div style={{ fontWeight: 700 }}>{s.redeemed.toLocaleString("ru-RU")} / {s.total_coupons.toLocaleString("ru-RU")}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className={styles.statSub}>% / юзеров</div>
                      <div style={{ fontWeight: 700 }}>{s.fill_percent.toFixed(1)}% · {s.unique_users}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className={styles.card}>
        <h2 className={styles.title}>Создать набор на новый месяц</h2>
        <div className={styles.muted}>Название и период уникальны — защита от дублей на уровне БД и API.</div>
        <div className={styles.formRow} style={{ marginTop: 10 }}>
          <div className={styles.field}>
            <label className={styles.label}>Период (YYYY-MM)</label>
            <input
              className={styles.input}
              type="month"
              value={newPeriod}
              onChange={(e) => setNewPeriod(e.target.value)}
              placeholder="2026-11"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Название набора</label>
            <input
              className={styles.input}
              type="text"
              maxLength={180}
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Ноябрь 2026: Чёрная пятница"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Всего купонов на месяц</label>
            <input
              className={styles.input}
              type="number"
              min={0}
              max={10000000}
              step={1}
              value={newTotal}
              onChange={(e) => setNewTotal(e.target.value)}
            />
          </div>
          <div className={styles.buttonRow} style={{ marginTop: 0 }}>
            <button
              className={`${styles.button} ${styles.buttonPrimary}`}
              type="button"
              onClick={() => void submitCreate()}
              disabled={createLoading}
            >
              {createLoading ? "Создаём…" : "Создать набор"}
            </button>
          </div>
        </div>
        {createError && <div className={styles.error}>{createError}</div>}
        {createSuccess && (
          <div className={styles.muted} style={{ color: "#b9e9c6", marginTop: 10 }}>
            ✅ {createSuccess}
          </div>
        )}
      </section>

      <section className={styles.card}>
        <div className={styles.toolbarRow}>
          <div>
            <h2 className={styles.title} style={{ margin: 0 }}>
              Журнал выдачи купонов
              {selectedSet ? (
                <span className={styles.pill} style={{ marginLeft: 10 }}>
                  набор: {selectedSet.title}
                </span>
              ) : null}
            </h2>
            <div className={styles.muted} style={{ marginTop: 2 }}>
              Всего записей в выборке: {sortedRedemptions.length.toLocaleString("ru-RU")}
            </div>
          </div>
          <div className={styles.buttonRow} style={{ marginTop: 0 }}>
            <span className={remainingBadgeClass(selectedSet?.remaining ?? 0, selectedSet?.total_coupons ?? 0)}>
              {selectedSet
                ? `Остаток ${selectedSet.remaining.toLocaleString("ru-RU")} / ${selectedSet.total_coupons.toLocaleString("ru-RU")}`
                : "Набор не выбран"}
            </span>
          </div>
        </div>

        <div className={styles.filtersRow}>
          <div className={styles.field}>
            <label className={styles.label}>Набор</label>
            <select
              className={styles.input}
              value={fSetId}
              onChange={(e) => setFSetId(e.target.value)}
            >
              <option value="">(как в календаре слева)</option>
              {sets.map((s) => (
                <option key={s.id} value={s.id}>
                  {periodLabel(s.period)} · {s.title}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Пользователь (ник или tg id)</label>
            <input
              className={styles.input}
              type="text"
              value={fUser}
              onChange={(e) => setFUser(e.target.value)}
              placeholder="username или 12345678"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Тип купона</label>
            <input
              className={styles.input}
              type="text"
              list="coupon-types-list"
              value={fType}
              onChange={(e) => setFType(e.target.value)}
              placeholder="Малый приз, Сертификат…"
            />
            <datalist id="coupon-types-list">
              {uniqueCouponTypes.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Дата с</label>
            <input
              className={styles.input}
              type="date"
              value={fFrom}
              onChange={(e) => setFFrom(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Дата по</label>
            <input
              className={styles.input}
              type="date"
              value={fTo}
              onChange={(e) => setFTo(e.target.value)}
            />
          </div>
          <div className={styles.buttonRow} style={{ marginTop: 0, justifyContent: "flex-end" }}>
            <button className={styles.button} type="button" onClick={resetFilters}>Сбросить</button>
            <button className={`${styles.button} ${styles.buttonPrimary}`} type="button" onClick={applyFilters}>
              Применить
            </button>
          </div>
        </div>

        {redemptionsError && <div className={styles.error}>{redemptionsError}</div>}
        {redemptionsLoading && <div className={styles.muted} style={{ marginTop: 10 }}>Загрузка журнала…</div>}

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>
                  <button className={styles.sortButton} type="button" onClick={() => toggleSort("created_at")}>
                    Дата {sortArrow("created_at")}
                  </button>
                </th>
                <th className={styles.th}>
                  <button className={styles.sortButton} type="button" onClick={() => toggleSort("tg_user_id")}>
                    TG ID {sortArrow("tg_user_id")}
                  </button>
                </th>
                <th className={styles.th}>
                  <button className={styles.sortButton} type="button" onClick={() => toggleSort("username")}>
                    Ник в Telegram {sortArrow("username")}
                  </button>
                </th>
                <th className={styles.th}>
                  <button className={styles.sortButton} type="button" onClick={() => toggleSort("coupon_type")}>
                    Тип купона {sortArrow("coupon_type")}
                  </button>
                </th>
                <th className={`${styles.th} ${styles.tdRight}`}>Всего у пользователя</th>
              </tr>
            </thead>
            <tbody>
              {!redemptionsLoading && sortedRedemptions.length === 0 && (
                <tr>
                  <td className={styles.td} colSpan={5} style={{ color: "rgba(245,245,247,0.72)", textAlign: "center" }}>
                    Нет записей за выбранный период/фильтры.
                  </td>
                </tr>
              )}
              {sortedRedemptions.map((r) => (
                <tr key={r.id}>
                  <td className={styles.td}>{formatRu(r.created_at)}</td>
                  <td className={styles.td}>
                    {r.tg_user_id ? (
                      <code style={{ fontSize: 13 }}>{r.tg_user_id}</code>
                    ) : (
                      <span className={styles.muted}>—</span>
                    )}
                  </td>
                  <td className={styles.td}>
                    {r.username ? (
                      <span className={styles.pill}>@{r.username}</span>
                    ) : (
                      <span className={styles.muted}>без ника</span>
                    )}
                  </td>
                  <td className={styles.td}>
                    {r.coupon_type ? (
                      <span className={`${styles.pill} ${styles.badgeWarn}`}>{r.coupon_type}</span>
                    ) : (
                      <span className={styles.muted}>тип не указан</span>
                    )}
                  </td>
                  <td className={`${styles.td} ${styles.tdRight}`} style={{ fontWeight: 700 }}>
                    {r.per_user_total ?? 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
