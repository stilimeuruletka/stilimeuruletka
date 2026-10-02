"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import styles from "../../../../admin.module.css";

type UserDetailUser = {
  id: string;
  tg_user_id: number;
  username: string | null;
  created_at: string;
  last_seen_at: string | null;
  banned_at: string | null;
  ban_reason: string | null;
  ban_until: string | null;
  admin_note: string | null;
  ref_code: string | null;
};

type UserDetailCooldown = {
  next_spin_at: string | null;
  free_spin_granted: boolean;
  last_free_granted_at: string | null;
};

type UserDetailInviter = {
  tg_user_id: number;
  username: string | null;
  invited_at: string;
} | null;

type UserDetailSpinsSummary = {
  total: number;
  wins: number;
  losses: number;
  last_spin_at: string | null;
};

type UserDetailSpin = {
  created_at: string;
  win: boolean;
  prize_title: string | null;
};

type UserDetailCoupon = {
  created_at: string;
  coupon_type: string;
  coupon_set_id: string | null;
};

type UserDetailPayload = {
  user: UserDetailUser;
  balance: number;
  cooldown: UserDetailCooldown;
  inviter: UserDetailInviter;
  invitees_count: number;
  spins_summary: UserDetailSpinsSummary;
  spins_recent: UserDetailSpin[];
  coupons_count: number;
  coupons_recent: UserDetailCoupon[];
  ref_code: string | null;
};

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

function formatRuDateTime(iso: string | null) {
  return formatRu(iso);
}

function nextCooldownMs(nextIso: string | null): number | null {
  if (!nextIso) return null;
  const ms = Date.parse(nextIso);
  if (!Number.isFinite(ms)) return null;
  const diff = ms - Date.now();
  return diff > 0 ? diff : 0;
}

function formatCountdown(ms: number | null): string {
  if (ms == null) return "свободно";
  if (ms <= 0) return "сейчас можно";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export default function AdminUserDetailPage() {
  const params = useParams();
  const tgId = typeof params?.id === "string" ? params.id : "";

  const [data, setData] = useState<UserDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [ticketReason, setTicketReason] = useState("");
  const [ticketLoading, setTicketLoading] = useState<1 | 5 | 10 | 0>(0);

  const [resetCooldownLoading, setResetCooldownLoading] = useState(false);

  const [banHours, setBanHours] = useState<string>("24");
  const [banReason, setBanReason] = useState<string>("");
  const [banLoading, setBanLoading] = useState(false);

  const [noteText, setNoteText] = useState<string>("");
  const [noteSaving, setNoteSaving] = useState(false);

  const [tickNow, setTickNow] = useState<number>(Date.now());

  const load = useCallback(async () => {
    if (!tgId) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/admin/api/users/${encodeURIComponent(tgId)}`, { cache: "no-store" }).catch(
      () => null
    );
    if (!res || !res.ok) {
      const msg = (await res?.json().catch(() => null)) as { error?: string } | null;
      setError(msg?.error || "Не удалось загрузить пользователя");
      setLoading(false);
      return;
    }
    const json = (await res.json().catch(() => null)) as UserDetailPayload | null;
    if (!json) {
      setError("Нет данных");
      setLoading(false);
      return;
    }
    setData(json);
    setNoteText(json.user.admin_note || "");
    setLoading(false);
  }, [tgId]);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(id);
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => setTickNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const countdown = useMemo(
    () => formatCountdown(nextCooldownMs(data?.cooldown?.next_spin_at ?? null)),
    [data, tickNow]
  );

  const isBanned = useMemo(() => {
    if (!data?.user.banned_at) return false;
    if (!data.user.ban_until) return true;
    const until = Date.parse(data.user.ban_until);
    if (!Number.isFinite(until)) return true;
    return until > Date.now();
  }, [data, tickNow]);

  const winRate = useMemo(() => {
    const s = data?.spins_summary;
    if (!s || !s.total) return 0;
    return Math.round((s.wins / s.total) * 10000) / 100;
  }, [data]);

  const adjustTickets = useCallback(
    async (delta: 1 | 5 | 10) => {
      if (!tgId) return;
      setTicketLoading(delta);
      const reason = ticketReason.trim() || `Админ: выдано ${delta} билет(ов)`;
      const res = await fetch(`/admin/api/users/${encodeURIComponent(tgId)}/adjust-tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delta, reason })
      }).catch(() => null);
      const msg = (await res?.json().catch(() => null)) as { error?: string; new_balance?: number } | null;
      if (!res || !res.ok) {
        alert(msg?.error || "Не удалось выдать билеты");
      } else {
        setTicketReason("");
        if (msg?.new_balance != null && data) {
          setData({ ...data, balance: msg.new_balance });
        } else {
          await load();
        }
      }
      setTicketLoading(0);
    },
    [tgId, ticketReason, data, load]
  );

  const resetCooldown = useCallback(async () => {
    if (!tgId) return;
    setResetCooldownLoading(true);
    const res = await fetch(`/admin/api/users/${encodeURIComponent(tgId)}/reset-cooldown`, {
      method: "POST"
    }).catch(() => null);
    const msg = (await res?.json().catch(() => null)) as { error?: string; next_spin_at?: string } | null;
    if (!res || !res.ok) {
      alert(msg?.error || "Не удалось сбросить кулдаун");
    } else if (data) {
      setData({
        ...data,
        cooldown: { ...data.cooldown, next_spin_at: msg?.next_spin_at ?? null }
      });
    }
    setResetCooldownLoading(false);
  }, [tgId, data]);

  const toggleBan = useCallback(async () => {
    if (!tgId) return;
    setBanLoading(true);
    const shouldBan = !isBanned;
    const hours = shouldBan ? Number(banHours) || 0 : 0;
    const reason = shouldBan ? banReason.trim() || "Админ: бан" : "";
    const res = await fetch(`/admin/api/users/${encodeURIComponent(tgId)}/ban`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ banned: shouldBan, ban_hours: hours, ban_reason: reason })
      }).catch(() => null);
    const msg = (await res?.json().catch(() => null)) as
      | { error?: string; banned?: boolean; ban_until?: string }
      | null;
    if (!res || !res.ok) {
      alert(msg?.error || "Не удалось изменить статус");
    } else {
      if (!shouldBan) {
        setBanHours("24");
        setBanReason("");
      }
      await load();
    }
    setBanLoading(false);
  }, [tgId, isBanned, banHours, banReason, load]);

  const saveNote = useCallback(async () => {
    if (!tgId) return;
    setNoteSaving(true);
    const res = await fetch(`/admin/api/users/${encodeURIComponent(tgId)}/set-note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin_note: noteText.slice(0, 5000) })
      }).catch(() => null);
    const msg = (await res?.json().catch(() => null)) as { error?: string } | null;
    if (!res || !res.ok) {
      alert(msg?.error || "Не удалось сохранить заметку");
    } else if (data) {
      setData({ ...data, user: { ...data.user, admin_note: noteText.slice(0, 5000) } });
    }
    setNoteSaving(false);
  }, [tgId, noteText, data]);

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <Link href="/admin/users" className={styles.backLink}>
          ← К списку пользователей
        </Link>
      </div>

      {loading && <div className={styles.card}>Загрузка...</div>}
      {!loading && error && (
        <div className={styles.card}>
          <div className={styles.error}>{error}</div>
        </div>
      )}

      {!loading && !error && data && (
        <div className={styles.card}>
          <div className={styles.userCardHeader}>
            <div>
              <h1 className={styles.userCardTitle}>
                {data.user.username ? `@${data.user.username}` : `#${data.user.tg_user_id}`}
              </h1>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                <span className={`${styles.userBadge} ${styles.userBadgeDefault}`} style={{ fontFamily: "monospace" }}>
                  TG ID: {data.user.tg_user_id}
                </span>
                {isBanned ? (
                  <span className={`${styles.userBadge} ${styles.userBadgeDanger}`}>
                    🔒 Забанен
                    {data.user.ban_until && ` до ${formatRuDateTime(data.user.ban_until)}`}
                  </span>
                ) : (
                  <span className={`${styles.userBadge} ${styles.userBadgeOk}`}>✓ Активен</span>
                )}
                {data.ref_code && (
                  <span className={`${styles.userBadge} ${styles.userBadgeWarn}`}>REF: {data.ref_code}</span>
                )}
              </div>
              <div className={styles.muted} style={{ marginTop: 8, fontSize: 13 }}>
                Регистрация: {formatRuDateTime(data.user.created_at)} · Последняя активность:{" "}
                {formatRuDateTime(data.user.last_seen_at)}
                {data.user.ban_reason && (
                  <span style={{ marginLeft: 8, color: "#ff7b7b" }}>Причина бана: {data.user.ban_reason}</span>
                )}
              </div>
            </div>
          </div>

          <div className={styles.userCardGrid}>
            <div className={styles.userMetric}>
              <div className={styles.userMetricLabel}>Билеты на балансе</div>
              <div className={styles.userMetricValue}>{data.balance}</div>
            </div>
            <div className={styles.userMetric}>
              <div className={styles.userMetricLabel}>Кулдаун спина</div>
              <div className={styles.userMetricValue} style={{ fontSize: 18 }}>{countdown}</div>
              {data.cooldown.free_spin_granted && (
                <div className={styles.muted} style={{ fontSize: 11, marginTop: 2 }}>бесплатный выдан</div>
              )}
            </div>
            <div className={styles.userMetric}>
              <div className={styles.userMetricLabel}>Всего спинов</div>
              <div className={styles.userMetricValue}>{data.spins_summary.total}</div>
            </div>
            <div className={styles.userMetric}>
              <div className={styles.userMetricLabel}>Выигрышей</div>
              <div className={styles.userMetricValue} style={{ color: "#ff7b7b" }}>{data.spins_summary.wins}</div>
            </div>
            <div className={styles.userMetric}>
              <div className={styles.userMetricLabel}>Проигрышей</div>
              <div className={styles.userMetricValue}>{data.spins_summary.losses}</div>
            </div>
            <div className={styles.userMetric}>
              <div className={styles.userMetricLabel}>Купонов получено</div>
              <div className={styles.userMetricValue} style={{ color: "#c69bff" }}>{data.coupons_count}</div>
            </div>
            <div className={styles.userMetric}>
              <div className={styles.userMetricLabel}>Кого пригласил</div>
              <div className={styles.userMetricValue} style={{ color: "#ffb800" }}>{data.invitees_count}</div>
            </div>
            <div className={styles.userMetric}>
              <div className={styles.userMetricLabel}>Win rate</div>
              <div className={styles.userMetricValue}>{winRate}%</div>
              <div className={styles.muted} style={{ fontSize: 11, marginTop: 2 }}>
                последний спин {formatRuDateTime(data.spins_summary.last_spin_at)}
              </div>
            </div>
            <div className={styles.userMetric}>
              <div className={styles.userMetricLabel}>Приглашён кем</div>
              {data.inviter ? (
                <div style={{ marginTop: 4 }}>
                  <Link
                    href={`/admin/users/${data.inviter.tg_user_id}`}
                    className={styles.linkLikeCell}
                    style={{ fontSize: 16, fontWeight: 700 }}
                  >
                    {data.inviter.username ? `@${data.inviter.username}` : `#${data.inviter.tg_user_id}`}
                  </Link>
                  <div className={styles.muted} style={{ fontSize: 11 }}>
                    {formatRuDateTime(data.inviter.invited_at)}
                  </div>
                </div>
              ) : (
                <div className={styles.userMetricValue} style={{ fontSize: 14, opacity: 0.6 }}>—</div>
              )}
            </div>
          </div>

          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>🎟️ Выдать билеты</h2>
            <div className={styles.actionRow}>
              <div className={styles.field} style={{ minWidth: 220, flex: 1 }}>
                <div className={styles.label}>Причина</div>
                <input
                  className={styles.input}
                  type="text"
                  placeholder="Комментарий (необязательно)"
                  value={ticketReason}
                  onChange={(e) => setTicketReason(e.target.value)}
                />
              </div>
              <button
                className={`${styles.button} ${styles.buttonPrimary}`}
                type="button"
                disabled={ticketLoading !== 0}
                onClick={() => void adjustTickets(1)}
              >
                {ticketLoading === 1 ? "..." : "+1 билет"}
              </button>
              <button
                className={`${styles.button} ${styles.buttonPrimary}`}
                type="button"
                disabled={ticketLoading !== 0}
                onClick={() => void adjustTickets(5)}
              >
                {ticketLoading === 5 ? "..." : "+5 билетов"}
              </button>
              <button
                className={`${styles.button} ${styles.buttonPrimary}`}
                type="button"
                disabled={ticketLoading !== 0}
                onClick={() => void adjustTickets(10)}
              >
                {ticketLoading === 10 ? "..." : "+10 билетов"}
              </button>
            </div>
          </div>

          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>⏱️ Кулдаун</h2>
            <div className={styles.actionRow}>
              <div className={styles.muted} style={{ marginRight: 8 }}>
                Следующий спин через: <b>{countdown}</b>
              </div>
              <button
                className={styles.button}
                type="button"
                disabled={resetCooldownLoading}
                onClick={() => void resetCooldown()}
              >
                {resetCooldownLoading ? "Обновляем..." : "Сбросить кулдаун (дать спин сейчас)"}
              </button>
            </div>
          </div>

          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>{isBanned ? "🔒 Бан пользователя" : "⚠️ Забанить пользователя"}</h2>
            <div className={styles.actionRow}>
              {!isBanned && (
                <>
                  <div className={styles.field} style={{ width: 160 }}>
                    <div className={styles.label}>Часы бана</div>
                    <input
                      className={styles.input}
                      type="number"
                      min="0"
                      placeholder="24"
                      value={banHours}
                      onChange={(e) => setBanHours(e.target.value)}
                    />
                  </div>
                  <div className={styles.field} style={{ flex: 1, minWidth: 200 }}>
                    <div className={styles.label}>Причина</div>
                    <input
                      className={styles.input}
                      type="text"
                      placeholder="Причина бана"
                      value={banReason}
                      onChange={(e) => setBanReason(e.target.value)}
                    />
                  </div>
                </>
              )}
              <button
                className={`${styles.button} ${isBanned ? styles.buttonPrimary : styles.buttonDanger}`}
                type="button"
                disabled={banLoading}
                onClick={() => void toggleBan()}
              >
                {banLoading
                  ? "..."
                  : isBanned
                  ? "Разбанить пользователя"
                  : `Забанить на ${Number(banHours) || 0} ч`}
              </button>
            </div>
          </div>

          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>📝 Заметка админа</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <textarea
                className={styles.textarea}
                maxLength={5000}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Внутренние заметки о пользователе (доступны только админам)"
              />
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  className={`${styles.button} ${styles.buttonPrimary}`}
                  type="button"
                  disabled={noteSaving || noteText === (data.user.admin_note || "")}
                  onClick={() => void saveNote()}
                >
                  {noteSaving ? "Сохраняем..." : "Сохранить заметку"}
                </button>
              </div>
            </div>
          </div>

          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>
              🎰 История спинов · последние {data.spins_recent.length}
            </h2>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>Время</th>
                    <th className={styles.th}>Приз</th>
                    <th className={styles.th}>Результат</th>
                  </tr>
                </thead>
                <tbody>
                  {data.spins_recent.map((s, i) => (
                    <tr key={`${s.created_at}-${i}`}>
                      <td className={styles.td}>{formatRuDateTime(s.created_at)}</td>
                      <td className={styles.td}>{s.prize_title || "Ничего"}</td>
                      <td className={styles.td}>
                        {s.win ? (
                          <span style={{ color: "#ff7b7b", fontWeight: 700 }}>Выигрыш</span>
                        ) : (
                          <span className={styles.muted}>Проигрыш</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {data.spins_recent.length === 0 && (
                    <tr>
                      <td className={styles.td} colSpan={3}>
                        Нет спинов
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>
              🎟️ История купонов · последние {data.coupons_recent.length}
            </h2>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>Время</th>
                    <th className={styles.th}>Тип купона</th>
                    <th className={styles.th}>Набор</th>
                  </tr>
                </thead>
                <tbody>
                  {data.coupons_recent.map((c, i) => (
                    <tr key={`${c.created_at}-${i}`}>
                      <td className={styles.td}>{formatRuDateTime(c.created_at)}</td>
                      <td className={styles.td}>
                        <span className={styles.badgeOk}>{c.coupon_type}</span>
                      </td>
                      <td className={styles.td}>
                        {c.coupon_set_id ? <code style={{ fontSize: 12 }}>{c.coupon_set_id}</code> : "—"}
                      </td>
                    </tr>
                  ))}
                  {data.coupons_recent.length === 0 && (
                    <tr>
                      <td className={styles.td} colSpan={3}>
                        Купонов нет
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
