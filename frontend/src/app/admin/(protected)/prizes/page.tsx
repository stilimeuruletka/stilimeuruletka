"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import styles from "../../admin.module.css";

type Prize = {
  id: string;
  title: string;
  weight: number;
  value: number | null;
  active: boolean;
  created_at: string;
};

export default function AdminPrizesPage() {
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [newWeight, setNewWeight] = useState("100");
  const [newValue, setNewValue] = useState<string>("");
  const [newActive, setNewActive] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch("/admin/api/prizes", { cache: "no-store" }).catch(() => null);
    if (!res || !res.ok) {
      const msg = (await res?.json().catch(() => null)) as { error?: string } | null;
      setError(msg?.error || "Не удалось загрузить призы");
      setLoading(false);
      return;
    }
    const json = (await res.json().catch(() => null)) as { prizes?: Prize[] } | null;
    setPrizes(Array.isArray(json?.prizes) ? json!.prizes! : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(id);
  }, [load]);

  const totals = useMemo(() => {
    const activeCount = prizes.filter((p) => p.active).length;
    const totalWeight = prizes.reduce((acc, p) => acc + (p.active ? p.weight : 0), 0);
    return { activeCount, totalWeight };
  }, [prizes]);

  const createPrize = async () => {
    setError(null);
    const payload = {
      title: newTitle,
      weight: Number(newWeight),
      value: newValue === "" ? null : Number(newValue),
      active: newActive
    };
    const res = await fetch("/admin/api/prizes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(() => null);
    if (!res || !res.ok) {
      const msg = (await res?.json().catch(() => null)) as { error?: string } | null;
      setError(msg?.error || "Не удалось создать приз");
      return;
    }
    setNewTitle("");
    setNewWeight("100");
    setNewValue("");
    setNewActive(true);
    await load();
  };

  const updatePrize = async (id: string, patch: Partial<Pick<Prize, "title" | "weight" | "value" | "active">>) => {
    setError(null);
    const res = await fetch(`/admin/api/prizes/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch)
    }).catch(() => null);
    if (!res || !res.ok) {
      const msg = (await res?.json().catch(() => null)) as { error?: string } | null;
      setError(msg?.error || "Не удалось сохранить");
      return;
    }
    await load();
  };

  const deletePrize = async (id: string) => {
    setError(null);
    const ok = window.confirm("Удалить приз?");
    if (!ok) return;
    const res = await fetch(`/admin/api/prizes/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
    if (!res || !res.ok) {
      const msg = (await res?.json().catch(() => null)) as { error?: string } | null;
      setError(msg?.error || "Не удалось удалить");
      return;
    }
    await load();
  };

  return (
    <div className={styles.card}>
      <div className={styles.titleRow}>
        <h1 className={styles.title}>Призы</h1>
        <div className={styles.pill}>
          <span>Активных: {totals.activeCount}</span>
          <span>Вес: {totals.totalWeight}</span>
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <div className={styles.label}>Название</div>
          <input className={styles.input} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Например: Малый приз" />
        </div>
        <div className={styles.field}>
          <div className={styles.label}>Вес</div>
          <input className={styles.input} value={newWeight} onChange={(e) => setNewWeight(e.target.value)} inputMode="numeric" />
        </div>
        <div className={styles.field}>
          <div className={styles.label}>Значение</div>
          <input className={styles.input} value={newValue} onChange={(e) => setNewValue(e.target.value)} inputMode="decimal" placeholder="0" />
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
          Добавить
        </button>
        <button className={styles.button} type="button" onClick={load} disabled={loading}>
          Обновить
        </button>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>Название</th>
              <th className={styles.th}>Вес</th>
              <th className={styles.th}>Значение</th>
              <th className={styles.th}>Активен</th>
              <th className={`${styles.th} ${styles.tdRight}`}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {prizes.map((p) => (
              <tr key={p.id}>
                <td className={styles.td}>
                  <input
                    className={styles.inlineInput}
                    defaultValue={p.title}
                    onBlur={(e) => {
                      const next = e.target.value;
                      if (next.trim() && next.trim() !== p.title) void updatePrize(p.id, { title: next });
                    }}
                  />
                </td>
                <td className={styles.td}>
                  <input
                    className={styles.inlineInput}
                    defaultValue={String(p.weight)}
                    inputMode="numeric"
                    onBlur={(e) => {
                      const next = Number(e.target.value);
                      if (Number.isFinite(next) && Number.isInteger(next) && next > 0 && next !== p.weight) void updatePrize(p.id, { weight: next });
                    }}
                  />
                </td>
                <td className={styles.td}>
                  <input
                    className={styles.inlineInput}
                    defaultValue={p.value == null ? "" : String(p.value)}
                    inputMode="decimal"
                    onBlur={(e) => {
                      const raw = e.target.value.trim();
                      const next = raw === "" ? null : Number(raw);
                      if ((raw === "" && p.value !== null) || (raw !== "" && Number.isFinite(next) && next !== p.value)) void updatePrize(p.id, { value: next });
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
                <td className={styles.td} colSpan={5}>
                  {loading ? "Загрузка..." : "Пока нет призов"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
