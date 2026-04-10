"use client";

import { useEffect } from "react";

export default function TelegramInit() {
  useEffect(() => {
    try {
      const w = window as unknown as {
        Telegram?: {
          WebApp?: {
            ready?: () => void;
            expand?: () => void;
            requestFullscreen?: () => Promise<void>;
          };
        };
      };
      const webApp = w.Telegram?.WebApp;
      if (!webApp) return;

      webApp.expand?.();
      webApp.ready?.();

      if (typeof webApp.requestFullscreen === "function") {
        webApp.requestFullscreen().catch(() => {});
      }
    } catch {
      /* no-op */
    }
  }, []);

  return null;
}

