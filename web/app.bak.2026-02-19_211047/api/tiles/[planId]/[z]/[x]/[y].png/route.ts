import fs from "fs";
import path from "path";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { createClient } from "@supabase/supabase-js";

type Meta = {
  tileSize: number;
  minZoom: number;
  maxZoom: number;
  gridW: number;
  gridH: number;
  limits?: Record<string, { maxX: number; maxY: number }>;
};

// 1x1 transparent PNG
const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
);

// Simple in-memory cache for token -> userId
// Map<token, { userId: string | null, expires: number }>
// Also cache ongoing promises to prevent stampede
const valRef = {
  cache: new Map<string, { userId: string | null; expires: number }>(),
  pending: new Map<string, Promise<string | null>>()
};

const CACHE_TTL_MS = 60 * 1000; // 1 minute cache
const MAX_CACHE_SIZE = 1000;

function cleanupCache() {
  const now = Date.now();
  for (const [key, val] of valRef.cache.entries()) {
    if (val.expires < now) {
      valRef.cache.delete(key);
    }
  }
  if (valRef.cache.size > MAX_CACHE_SIZE) {
    const keysToDelete = Array.from(valRef.cache.keys()).slice(0, valRef.cache.size - MAX_CACHE_SIZE);
    for (const k of keysToDelete) {
      valRef.cache.delete(k);
    }
  }
}

async function getCachedUserId(token: string): Promise<string | null> {
  const now = Date.now();
  const cached = valRef.cache.get(token);
  if (cached && cached.expires > now) {
    return cached.userId;
  }

  // Check if there is a pending request for this token
  let promise = valRef.pending.get(token);
  if (promise) {
    return promise;
  }

  // Define the fetcher
  promise = (async () => {
    try {
      const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const sbKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      const supabase = createClient(sbUrl, sbKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false },
      });

      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || null;

      // Update cache
      valRef.cache.set(token, { userId, expires: Date.now() + CACHE_TTL_MS });
      return userId;
    } catch {
      return null;
    } finally {
      // Remove from pending
      valRef.pending.delete(token);
      cleanupCache();
    }
  })();

  valRef.pending.set(token, promise);
  return promise;
}

function pngResponse(buf: Buffer, debugPath: string) {
  const body = new Uint8Array(buf);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=0",
      "X-TILES-HANDLER": "app-router",
      "X-TILE-PATH": debugPath,
      "Content-Length": String(buf.length),
    },
  });
}

function transparent() {
  return pngResponse(TRANSPARENT_PNG, "TRANSPARENT");
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ planId: string; z: string; x: string; y: string }> }
) {
  try {
    let { userId } = createServerSupabaseClient(req, { requireAuth: false });

    // Fallback: try query param
    if (!userId) {
      const url = new URL(req.url);
      const token = url.searchParams.get("token");
      if (token) {
        userId = await getCachedUserId(token);
      }
    }

    if (!userId) {
      return transparent();
    }

    const { planId, z, x, y } = await ctx.params;

    const planIdStr = String(planId);
    const zNum = parseInt(String(z), 10);
    const xNum = parseInt(String(x), 10);

    // y w URL może przyjść jako "2.png" albo "-2.png"
    const yRaw = String(y);
    const yNum = parseInt(yRaw.replace(/\.png$/i, ""), 10);

    if (!Number.isFinite(zNum) || !Number.isFinite(xNum) || !Number.isFinite(yNum)) {
      return transparent();
    }

    const base = path.join(process.cwd(), "private_tiles", planIdStr);
    const metaPath = path.join(base, "meta.json");

    // Jeśli meta jeszcze nie ma (processing) → transparent (bez 404 spam)
    if (!fs.existsSync(metaPath)) {
      return transparent();
    }

    let meta: Meta;
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as Meta;
    } catch {
      return transparent();
    }

    // Ograniczanie zakresu: jeśli mamy limits, użyj ich
    const lim = meta.limits?.[String(zNum)];
    if (lim) {
      if (xNum < 0 || yNum < 0 || xNum > lim.maxX || yNum > lim.maxY) {
        return transparent();
      }
    } else {
      // Bez limits: ujemne uznajemy za “poza mapą”
      if (xNum < 0 || yNum < 0) {
        return transparent();
      }
    }

    const tilePath = path.join(base, String(zNum), String(xNum), `${yNum}.png`);
    if (!fs.existsSync(tilePath)) {
      return transparent();
    }

    const buf = fs.readFileSync(tilePath);
    return pngResponse(buf, tilePath);
  } catch (e: any) {
    // console.error("[tiles app] error:", e);
    if (e.message === "AUTH_REQUIRED") {
      // Return 401 for auth errors
      return new Response(null, { status: 401 });
    }
    return transparent();
  }
}

export async function HEAD(
  _req: Request,
  ctx: { params: Promise<{ planId: string; z: string; x: string; y: string }> }
) {
  // odpowiadamy jak GET, ale bez ciała
  const r = await GET(_req, ctx);
  return new Response(null, { status: r.status, headers: r.headers });
}
