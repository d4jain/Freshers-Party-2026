"use client";

import { useSyncExternalStore } from "react";

/**
 * Browser-only values read through useSyncExternalStore: the server snapshot
 * is used during SSR and hydration (no mismatch), then the live value.
 */

const noopSubscribe = () => () => {};

export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

export function useMediaQuery(query: string, serverValue = false): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

export function useSaveData(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData),
    () => false,
  );
}

/** Current time, quantised to `stepMs`; null on the server and during hydration. */
export function useNow(stepMs = 1000): number | null {
  return useSyncExternalStore(
    (cb) => {
      const id = window.setInterval(cb, Math.min(stepMs, 1000));
      return () => window.clearInterval(id);
    },
    () => Math.floor(Date.now() / stepMs) * stepMs,
    () => null,
  );
}

/** A tiny localStorage-backed store (per-browser convenience only). */
export function createLocalFlag(key: string, defaultValue: boolean) {
  const listeners = new Set<() => void>();
  const read = () => {
    try {
      const v = window.localStorage.getItem(key);
      return v == null ? defaultValue : v === "on";
    } catch {
      return defaultValue;
    }
  };
  return {
    subscribe(cb: () => void) {
      listeners.add(cb);
      const onStorage = (e: StorageEvent) => e.key === key && cb();
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(cb);
        window.removeEventListener("storage", onStorage);
      };
    },
    get: read,
    set(value: boolean) {
      try {
        window.localStorage.setItem(key, value ? "on" : "off");
      } catch {
        /* storage unavailable */
      }
      listeners.forEach((l) => l());
    },
    serverValue: defaultValue,
  };
}

/** Hydration-safe prefers-reduced-motion (false on the server and during hydration). */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}
