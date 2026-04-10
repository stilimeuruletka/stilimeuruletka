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
            setHeaderColor?: (color: string) => void;
            setBackgroundColor?: (color: string) => void;
            setBottomBarColor?: (color: string) => void;
            disableVerticalSwipes?: () => void;
          };
        };
      };
      const webApp = w.Telegram?.WebApp;
      if (!webApp) return;

      webApp.setBackgroundColor?.("#ffffff");
      webApp.setHeaderColor?.("#ffffff");
      webApp.setBottomBarColor?.("#ffffff");
      webApp.expand?.();
      webApp.disableVerticalSwipes?.();
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
