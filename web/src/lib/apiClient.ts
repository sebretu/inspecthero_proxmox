"use client";

import { supabase } from "./supabase";

function looksLikeJwt(t: string | null | undefined) {
  if (!t) return false;
  const parts = t.split(".");
  return parts.length === 3 && parts.every((p) => p.length > 0);
}

function getLocalToken(): string | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) {
        const val = window.localStorage.getItem(key);
        if (val) {
          const parsed = JSON.parse(val);
          if (parsed && typeof parsed === "object") {
            const token = parsed.access_token;
            const expiresAt = parsed.expires_at;
            if (token && typeof token === "string" && expiresAt && expiresAt > Date.now() / 1000 + 10) {
              return token;
            }
          }
        }
      }
    }
  } catch (e) {
    console.error("Error reading localStorage token:", e);
  }
  return null;
}

let tokenPromise: Promise<string | null> | null = null;

/**
 * Get current user's access token.
 * Uses a short-term singleton promise to prevent concurrent Supabase lock timeouts.
 */
export async function getToken(): Promise<string | null> {
  const localTok = getLocalToken();
  if (localTok) return localTok;

  if (tokenPromise) return tokenPromise;

  tokenPromise = (async () => {
    // Add a safety timeout for auth session retrieval
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      // getSession can hang or timeout on LockManager on some browsers
      const { data } = await supabase.auth.getSession();
      clearTimeout(timeoutId);
      const tok = data.session?.access_token ?? null;
      return looksLikeJwt(tok) ? tok : null;
    } catch (e) {
      console.error("Token fetch error or timeout:", e);
      return null;
    } finally {
      clearTimeout(timeoutId);
      // Clear the promise after a short delay
      setTimeout(() => {
        tokenPromise = null;
      }, 2000);
    }
  })();

  return tokenPromise;
}


import { Capacitor } from '@capacitor/core';

/**
 * Generic string URL parser for React Components
 */
export function getApiUrl(path: string | undefined | null) {
  if (!path) return '';
  const isMobile = Capacitor.isNativePlatform();
  const baseUrl = isMobile ? 'https://inspecthero.pl' : '';
  return path.startsWith('/api/') ? `${baseUrl}${path}` : path;
}

/**
 * Generic API client with automatic token injection
 */
export async function apiCall<T>(
  path: string,
  options?: {
    method?: string;
    body?: any;
    headers?: Record<string, string>;
    token?: string | null;
    timeoutMs?: number;
  }
): Promise<T> {
  const token = options?.token !== undefined ? options.token : await getToken();

  const headers: Record<string, string> = {
    ...options?.headers,
  };

  if (looksLikeJwt(token)) {
    headers.Authorization = `Bearer ${token}`;
    headers["X-App-Token"] = token!;
  }

  const timeout = options?.timeoutMs || 30000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  const fetchOptions: any = {
    method: options?.method || "GET",
    signal: controller.signal,
  };

  if (headers && Object.keys(headers).length > 0) {
    fetchOptions.headers = headers;
  }

  if (options?.body !== undefined) {
    fetchOptions.body =
      typeof options.body === "string" ? options.body : JSON.stringify(options.body);
    if (!headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
      fetchOptions.headers = headers;
    }
  }

  const fullPath = getApiUrl(path);

  try {
    const r = await fetch(fullPath, fetchOptions);
    clearTimeout(timeoutId);

    let j;
    try {
      j = await r.json();
    } catch (e) {
      throw new Error(`Parse error for ${fullPath}: ${e}`);
    }

    if (!j.ok) {
      const msg = j?.error?.message || "API error";
      const err: any = new Error(msg);
      err.code = j?.error?.code;
      throw err;
    }

    return j.data as T;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw new Error(`Request timeout for ${fullPath}`);
    }
    throw err;
  }
}

/**
 * Convenience: GET with auto-token
 */
export async function apiGet<T>(path: string, token?: string | null): Promise<T> {
  return apiCall<T>(path, { method: "GET", token });
}

/**
 * Convenience: POST with auto-token
 */
export async function apiPost<T>(path: string, body?: any, token?: string | null): Promise<T> {
  return apiCall<T>(path, { method: "POST", body, token });
}

/**
 * Convenience: PATCH with auto-token
 */
export async function apiPatch<T>(path: string, body?: any, token?: string | null): Promise<T> {
  return apiCall<T>(path, { method: "PATCH", body, token });
}

/**
 * Convenience: DELETE with auto-token
 */
export async function apiDelete<T>(path: string, token?: string | null): Promise<T> {
  return apiCall<T>(path, { method: "DELETE", token });
}

/**
 * Convenience: PUT with auto-token
 */
export async function apiPut<T>(path: string, body?: any, token?: string | null): Promise<T> {
  return apiCall<T>(path, { method: "PUT", body, token });
}

