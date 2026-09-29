"use client";

import { useEffect } from "react";

const LS_START_PARAM = "tg_pending_start_param";

function extractStartParamFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const u = new URL(window.location.href);
    const fromQuery =
      u.searchParams.get("startapp") ||
      u.searchParams.get("tgWebAppStartParam") ||
      u.searchParams.get("start_param");
    if (typeof fromQuery === "string" && fromQuery.length > 0) {
      return fromQuery;
    }
    const hash = u.hash.startsWith("#") ? u.hash.slice(1) : u.hash;
    if (hash) {
      const hp = new URLSearchParams(hash);
      const fromHash =
        hp.get("startapp") || hp.get("tgWebAppStartParam") || hp.get("start_param");
      if (typeof fromHash === "string" && fromHash.length > 0) {
        return fromHash;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

function setupStartParamHeader() {
  if (typeof window === "undefined") return;
  try {
    const headerValue = localStorage.getItem(LS_START_PARAM);
    if (!headerValue) return;

    const origFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const reqInit: RequestInit = init ? { ...init } : {};
      const headers = new Headers(reqInit.headers || {});
      const needsHeader =
        !headers.has("x-tg-start-param") &&
        (() => {
          try {
            const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
            return url.includes("/api/") || url.includes("localhost") || url.includes("127.0.0.1");
          } catch {
            return false;
          }
        })();
      if (needsHeader) {
        headers.set("x-tg-start-param", headerValue);
      }
      reqInit.headers = headers;
      return origFetch(input, reqInit);
    };

    const OrigXhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function patchedOpen(
      this: XMLHttpRequest,
      ...args: Parameters<typeof OrigXhrOpen>
    ) {
      const [, url] = args;
      (OrigXhrOpen as unknown as (this: XMLHttpRequest, ...a: unknown[]) => unknown).apply(this, args);
      try {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : "";
        if (urlStr.includes("/api/") || urlStr.includes("localhost") || urlStr.includes("127.0.0.1")) {
          try {
            this.setRequestHeader("x-tg-start-param", headerValue);
          } catch {
            /* ignore header set */
          }
        }
      } catch {
        /* ignore */
      }
    } as typeof OrigXhrOpen;
  } catch {
    /* ignore */
  }
}

export default function TelegramInit() {
  useEffect(() => {
    try {
      const pendingFromUrl = extractStartParamFromUrl();
      if (pendingFromUrl) {
        try {
          localStorage.setItem(LS_START_PARAM, pendingFromUrl);
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }

    try {
      setupStartParamHeader();
    } catch {
      /* ignore */
    }

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
            initDataUnsafe?: {
              start_param?: string;
            };
          };
        };
      };
      const webApp = w.Telegram?.WebApp;
      if (webApp) {
        const tgStart = webApp.initDataUnsafe?.start_param;
        if (tgStart) {
          try {
            localStorage.setItem(LS_START_PARAM, tgStart);
          } catch {
            /* ignore */
          }
        }

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
      }
    } catch {
      /* no-op */
    }
  }, []);

  return null;
}
