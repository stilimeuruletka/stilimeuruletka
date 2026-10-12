"use client";

import { useEffect } from "react";

export function TelegramInit() {
  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    if (webApp) {
      webApp.ready();
      webApp.expand();

      const initData = typeof webApp.initData === "string" && webApp.initData.length > 10 ? webApp.initData : null;
      if (initData) {
        const tzOffset = new Date().getTimezoneOffset();
        void fetch(`/api/me?tz_offset=${encodeURIComponent(String(tzOffset))}`, {
          headers: { "x-telegram-init-data": initData },
          cache: "no-store"
        }).catch(() => null);
      }
    }
  }, []);

  return null;
}
