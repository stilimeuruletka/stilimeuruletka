/* istanbul ignore file */
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

type Props = {
  nextPath?: string;
  prevPath?: string;
};

export function SwipeNavigation({ nextPath, prevPath }: Props) {
  const router = useRouter();
  const nextRef = useRef(nextPath);
  const prevRef = useRef(prevPath);

  useEffect(() => {
    nextRef.current = nextPath;
    prevRef.current = prevPath;
  }, [nextPath, prevPath]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let startX: number | null = null;
    let startY: number | null = null;
    let active = false;
    let navigating = false;

    const start = (x: number, y: number) => {
      startX = x;
      startY = y;
      active = true;
    };

    const finish = (x: number, y: number) => {
      if (!active || startX === null || startY === null || navigating) return;
      const deltaX = x - startX;
      const deltaY = y - startY;
      const threshold = 40;

      if (Math.abs(deltaX) > threshold && Math.abs(deltaX) > Math.abs(deltaY)) {
        navigating = true;
        const supportsViewTransition = "startViewTransition" in document;
        const doNavigate = (path: string) => {
          if (supportsViewTransition) {
            try {
              (document as Document & { startViewTransition?: (cb: () => void) => void }).startViewTransition?.(() => {
                router.push(path);
              });
              return;
            } catch {
              /* fallthrough */
            }
          }
          router.push(path);
        };

        if (deltaX < 0 && nextRef.current) {
          doNavigate(nextRef.current);
        } else if (deltaX > 0 && prevRef.current) {
          doNavigate(prevRef.current);
        } else {
          navigating = false;
        }
      }

      active = false;
      startX = null;
      startY = null;
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.buttons !== 1) return;
      start(event.clientX, event.clientY);
    };

    const handlePointerUp = (event: PointerEvent) => {
      finish(event.clientX, event.clientY);
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const t = event.touches[0];
      start(t.clientX, t.clientY);
    };

    const handleTouchEnd = (event: TouchEvent) => {
      if (event.changedTouches.length !== 1) return;
      const t = event.changedTouches[0];
      finish(t.clientX, t.clientY);
    };

    window.addEventListener("pointerdown", handlePointerDown, { passive: true, capture: true });
    window.addEventListener("pointerup", handlePointerUp, { passive: true, capture: true });
    window.addEventListener("touchstart", handleTouchStart, { passive: true, capture: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true, capture: true });

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, { capture: true });
      window.removeEventListener("pointerup", handlePointerUp, { capture: true });
      window.removeEventListener("touchstart", handleTouchStart, { capture: true });
      window.removeEventListener("touchend", handleTouchEnd, { capture: true });
    };
  }, [router]);

  return null;
}
