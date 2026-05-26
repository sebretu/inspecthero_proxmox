import { createClient } from "@supabase/supabase-js";
import type { NextApiRequest } from "next";

export class AuthRequiredError extends Error {
  constructor() {
    super("AUTH_REQUIRED");
    this.name = "AuthRequiredError";
  }
}

export function isAuthRequiredError(err: unknown): err is AuthRequiredError {
  return err instanceof AuthRequiredError || (err instanceof Error && err.message === "AUTH_REQUIRED");
}

/**
 * Extract Bearer token from Authorization header
 */
export function getBearerToken(req: NextApiRequest | Request): string | null {
  const auth =
    req instanceof Request
      ? req.headers.get("authorization") || ""
      : (req.headers.authorization || "");

  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim() || null;
  }

  // Fallback: Cloudflare strips Authorization header, so we also check X-App-Token
  const xToken =
    req instanceof Request
      ? req.headers.get("x-app-token") || ""
      : (req.headers["x-app-token"] as string || "");

  return xToken.trim() || null;
}

/**
 * Extract JWT from Authorization header
 */
export function getAuthToken(req: NextApiRequest | Request): string | null {
  return getBearerToken(req);
}

/**
 * Create authenticated Supabase client:
 * - Uses Bearer token from Authorization header (user session)
 * - Falls back to service role only in DEV mode
 * - For FAZA B: remove fallback, make token required always
 */
export function createServerSupabaseClient(
  req: NextApiRequest | Request,
  options?: { requireAuth?: boolean }
): { client: any; userId: string | null } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const token = getAuthToken(req);

  if (!token && options?.requireAuth !== false) {
    throw new AuthRequiredError();
  }

  const client = createClient(url, anonKey, {
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  // Decode userId from JWT if present
  let userId: string | null = null;
  if (token) {
    try {
      const parts = token.split(".");
      if (parts.length === 3) {
        const decoded = JSON.parse(Buffer.from(parts[1], "base64").toString());
        userId = decoded.sub || null;
      }
    } catch {
      // Nie udało się decode, userId pozostaje null
    }
  }

  return { client, userId };
}

/**
 * Helper: get userId from request
 */
export function getUserIdFromRequest(req: NextApiRequest | Request): string | null {
  const token = getBearerToken(req);
  if (!token) return null;

  try {
    const parts = token.split(".");
    if (parts.length === 3) {
      const decoded = JSON.parse(Buffer.from(parts[1], "base64").toString());
      return decoded.sub || null;
    }
  } catch {
    return null;
  }

  return null;
}

export function createServiceSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!serviceKey) {
    throw new Error("Missing Supabase service role key");
  }

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
