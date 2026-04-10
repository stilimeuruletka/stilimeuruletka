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
              href="/admin/prizes"
              className={`${styles.navLink} ${pathname.startsWith("/admin/prizes") ? styles.navLinkActive : ""}`}
            >
              Призы
            </Link>
            <Link
              href="/admin/bloggers"
              className={`${styles.navLink} ${pathname.startsWith("/admin/bloggers") ? styles.navLinkActive : ""}`}
            >
              Блогеры
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

