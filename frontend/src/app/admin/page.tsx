"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import styles from "./admin.module.css";

export default function AdminLoginPage() {
  return (
    <Suspense>
      <AdminLoginInner />
    </Suspense>
  );
}

function AdminLoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = useMemo(() => searchParams.get("next") || "/admin/prizes", [searchParams]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch("/admin/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password })
    }).catch(() => null);

    if (!res || !res.ok) {
      const msg = (await res?.json().catch(() => null)) as { error?: string } | null;
      setError(msg?.error || "Не удалось войти");
      setSubmitting(false);
      return;
    }

    router.replace(nextPath);
  };

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>Админ-панель</h1>
            <div className={styles.muted}>Вход</div>
          </div>

          <form onSubmit={onSubmit} className={styles.row}>
            <div className={styles.field}>
              <div className={styles.label}>Email</div>
              <input
                className={styles.input}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="email"
                inputMode="email"
                required
              />
            </div>
            <div className={styles.field}>
              <div className={styles.label}>Пароль</div>
              <input
                className={styles.input}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete="current-password"
                required
              />
            </div>

            <div className={styles.buttonRow}>
              <button className={`${styles.button} ${styles.buttonPrimary}`} type="submit" disabled={submitting}>
                {submitting ? "Вход..." : "Войти"}
              </button>
            </div>
          </form>

          {error && <div className={styles.error}>{error}</div>}
        </div>
      </div>
    </div>
  );
}
