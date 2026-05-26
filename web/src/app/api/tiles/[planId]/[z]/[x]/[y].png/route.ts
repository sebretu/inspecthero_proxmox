import { promises as fs } from "fs";
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

export const dynamic = "force-dynamic";

// 1x1 transparent PNG
const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
);

function redTile(msg: string) {
  // A 1x1 red PNG
  const buf = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  return new Response(buf, {
    headers: { "Content-Type": "image/png", "X-Debug": msg }
  });
}

// Memory Cache
const cacheRef = {
  auth: new Map<string, { userId: string | null; expires: number }>(),
  meta: new Map<string, { data: Meta; expires: number }>(),
  pendingAuth: new Map<string, Promise<string | null>>()
};

const AUTH_CACHE_TTL = 60 * 1000;
const META_CACHE_TTL = 300 * 1000; // 5 minutes

async function getCachedUserId(token: string): Promise<string | null> {
  const now = Date.now();
  const cached = cacheRef.auth.get(token);
  if (cached && cached.expires > now) return cached.userId;

  let promise = cacheRef.pendingAuth.get(token);
  if (promise) return promise;

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
      cacheRef.auth.set(token, { userId, expires: Date.now() + AUTH_CACHE_TTL });
      return userId;
    } catch {
      return null;
    } finally {
      cacheRef.pendingAuth.delete(token);
    }
  })();

  cacheRef.pendingAuth.set(token, promise);
  return promise;
}

async function getCachedMeta(planId: string): Promise<Meta | null> {
  const now = Date.now();
  const cached = cacheRef.meta.get(planId);
  if (cached && cached.expires > now) return cached.data;

  const basePaths = [
    path.join(process.cwd(), "private_tiles", planId),
    path.join(process.cwd(), "web", "private_tiles", planId)
  ];

  for (const base of basePaths) {
    const metaPath = path.join(base, "meta.json");
    try {
      const raw = await fs.readFile(metaPath, "utf8");
      const data = JSON.parse(raw) as Meta;
      cacheRef.meta.set(planId, { data, expires: now + META_CACHE_TTL });
      return data;
    } catch {}
  }
  return null;
}

function pngResponse(buf: Buffer, debugPath: string, isRealFile = false) {
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      // If it's a real tile file, cache it for 24 hours. If transparent, don't cache.
      "Cache-Control": isRealFile ? "public, max-age=86400, immutable" : "no-store",
      "X-TILE-PATH": debugPath,
      "Content-Length": String(buf.length),
    },
  });
}

function transparent(reason: string) {
  return pngResponse(TRANSPARENT_PNG, "TRANSPARENT", false);
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ planId: string; z: string; x: string; y: string }> }
) {
  try {
    let { userId } = createServerSupabaseClient(req, { requireAuth: false });

    const url = new URL(req.url);
    const isPublic = url.searchParams.get("public") === "true";

    if (!userId && !isPublic) {
      const token = url.searchParams.get("token");
      if (token) {
        userId = await getCachedUserId(token);
      }
    }

    if (!userId && !isPublic) return transparent("No userId found (auth failed)");

    const { planId, z, x, y } = await ctx.params;
    const planIdStr = String(planId);

    // If public access, the plan MUST be shared (is_archived === true)
    if (isPublic && !userId) {
      const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
      const supabase = createClient(sbUrl, sbKey, { auth: { persistSession: false } });
      const { data: plan } = await supabase.from("plans").select("is_archived").eq("id", planIdStr).single();
      if (!plan || plan.is_archived !== true) {
        return transparent(`Forbidden: Plan ${planIdStr} is not shared.`);
      }
    }
    const zNum = parseInt(String(z), 10);
    const xNum = parseInt(String(x), 10);
    const yNum = parseInt(String(y).replace(/\.png$/i, ""), 10);

    if (isNaN(zNum) || isNaN(xNum) || isNaN(yNum)) return transparent("Invalid coordinates");

    const meta = await getCachedMeta(planIdStr);
    if (!meta) return transparent(`No valid meta.json for ${planIdStr}`);

    const lim = meta.limits?.[String(zNum)];
    if (lim) {
      if (xNum < 0 || yNum < 0 || xNum > lim.maxX || yNum > lim.maxY) return transparent("Out of limits");
    } else if (xNum < 0 || yNum < 0) {
      return transparent("Negative coords");
    }

    const basePaths = [
      path.join(process.cwd(), "private_tiles", planIdStr, String(zNum), String(xNum), `${yNum}.png`),
      path.join(process.cwd(), "web", "private_tiles", planIdStr, String(zNum), String(xNum), `${yNum}.png`)
    ];
    
    for (const tilePath of basePaths) {
      try {
        const buf = await fs.readFile(tilePath);
        return pngResponse(buf, tilePath, true);
      } catch {}
    }

    return transparent(`No tile file found for ${planIdStr} at ${z}/${x}/${y}`);
  } catch (e: any) {
    console.error("[tiles] Critical error:", e);
    return transparent(`Error: ${e.message}`);
  }
}

export async function HEAD(req: Request, ctx: any) {
  const r = await GET(req, ctx);
  return new Response(null, { status: r.status, headers: r.headers });
}
