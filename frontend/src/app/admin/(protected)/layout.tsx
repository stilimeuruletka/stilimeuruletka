"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import styles from "../admin.module.css";

export default function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const logout = async () => {
    await fetch("/admin/api/logout", { method: "POST" }).catch(() => null);
    router.replace("/admin");
  };

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.nav}>
          <div className={styles.navLinks}>
            <Link
              href="/admin/dashboard"
              className={`${styles.navLink} ${pathname.startsWith("/admin/dashboard") ? styles.navLinkActive : ""}`}
            >
              Дашборд
            </Link>
            <Link
              href="/admin/preview"
              className={`${styles.navLink} ${pathname.startsWith("/admin/preview") ? styles.navLinkActive : ""}`}
            >
              Preview
            </Link>
            <Link
              href="/admin/bloggers"
              className={`${styles.navLink} ${pathname.startsWith("/admin/bloggers") ? styles.navLinkActive : ""}`}
            >
              Блогеры
            </Link>
            <Link
              href="/admin/users"
              className={`${styles.navLink} ${pathname.startsWith("/admin/users") ? styles.navLinkActive : ""}`}
            >
              Пользователи
            </Link>
            <Link
              href="/admin/coupons"
              className={`${styles.navLink} ${pathname.startsWith("/admin/coupons") ? styles.navLinkActive : ""}`}
            >
              Призовой фонд
            </Link>
            <Link
              href="/admin/subscription"
              className={`${styles.navLink} ${pathname.startsWith("/admin/subscription") ? styles.navLinkActive : ""}`}
            >
              Подписки
            </Link>
          </div>
          <button className={styles.button} type="button" onClick={logout}>
            Выйти
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
