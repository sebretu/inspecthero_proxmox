"use client";

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dummy.supabase.co";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "dummy";

// Ensure cross-platform fetch compatibility for Capacitor
const customFetch = (...args: Parameters<typeof fetch>) => {
  return fetch(...args);
};

// Safe lock function to prevent uncaught "LockManager lock immediately failed" errors in multi-tab usage
const customLock = async <T>(name: string, _timeout: number, fn: () => Promise<T>): Promise<T> => {
  if (typeof window !== "undefined" && navigator?.locks?.request) {
    try {
      return await navigator.locks.request(name, { ifAvailable: true }, async (lock) => {
        if (!lock) {
          // Lock was taken by another tab, execute function directly without erroring out
          return await fn();
        }
        return await fn();
      });
    } catch {
      return await fn();
    }
  }
  return await fn();
};

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
    lock: customLock,
  },
  global: {
    fetch: customFetch,
  },
});
