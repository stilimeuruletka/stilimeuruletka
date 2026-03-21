/* istanbul ignore file */
"use client";

import { useEffect } from "react";

type Props = {
  nextPath?: string;
  prevPath?: string;
};

export function SwipeNavigation({ nextPath, prevPath }: Props) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    let startX: number | null = null;
    let startY: number | null = null;
    let active = false;

    const start = (x: number, y: number) => {
      startX = x;
      startY = y;
      active = true;
    };

    const finish = (x: number, y: number) => {
      if (!active || startX === null || startY === null) return;
      const deltaX = x - startX;
      const deltaY = y - startY;
      const threshold = 40;

      if (Math.abs(deltaX) > threshold && Math.abs(deltaX) > Math.abs(deltaY)) {
        if (deltaX < 0 && nextPath) {
          window.location.href = nextPath;
        } else if (deltaX > 0 && prevPath) {
          window.location.href = prevPath;
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
  }, [nextPath, prevPath]);

  return null;
}
