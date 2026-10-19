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
              href="/admin/orders"
              className={`${styles.navLink} ${pathname.startsWith("/admin/orders") ? styles.navLinkActive : ""}`}
            >
              Заказы
            </Link>
            <Link
              href="/admin/advertisers"
              className={`${styles.navLink} ${pathname.startsWith("/admin/advertisers") ? styles.navLinkActive : ""}`}
            >
              Реклама
            </Link>
            <Link
              href="/admin/shelf"
              className={`${styles.navLink} ${pathname.startsWith("/admin/shelf") ? styles.navLinkActive : ""}`}
            >
              Полка
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
