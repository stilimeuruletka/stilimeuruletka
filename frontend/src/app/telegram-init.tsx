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
            isVersionAtLeast?: (version: string) => boolean;
            version?: string;
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

      const canFullscreen =
        (typeof webApp.isVersionAtLeast === "function" && webApp.isVersionAtLeast("8.0")) ||
        (typeof webApp.version === "string" && Number.parseFloat(webApp.version) >= 8);

      if (canFullscreen && typeof webApp.requestFullscreen === "function") {
        try {
          const p = webApp.requestFullscreen();
          if (p && typeof (p as Promise<void>).catch === "function") {
            (p as Promise<void>).catch(() => {});
          }
        } catch {
          /* no-op */
        }
      }
    } catch {
      /* no-op */
    }
  }, []);

  return null;
}
