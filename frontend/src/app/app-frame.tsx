"use client";

import { usePathname } from "next/navigation";

export default function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");

  if (isAdmin) return <>{children}</>;

  return <div className="app-frame">{children}</div>;
}