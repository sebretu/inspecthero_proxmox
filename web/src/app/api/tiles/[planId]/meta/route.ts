import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type Meta = {
  tileSize: number;
  minZoom: number;
  maxZoom: number;
  gridW: number;
  gridH: number;
  format?: string;
  limits?: Record<string, { maxX: number; maxY: number }>;
  activeVersionId?: string;
};

// Simple memory cache for metadata
const metaCache = new Map<string, { data: Meta; expires: number }>();
const META_TTL = 5 * 1000; // 5 seconds

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ planId: string }> }
) {
  try {
    const { planId } = await ctx.params;
    const url = new URL(req.url);
    const isPublic = url.searchParams.get("public") === "true";
    
    console.log(`[tiles meta] Request for ${planId}, isPublic: ${isPublic}`);

    let { userId } = createServerSupabaseClient(req, { requireAuth: false });

    if (!userId && !isPublic) {
      let token = url.searchParams.get("token");
      if (!token) {
        const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
        if (authHeader?.startsWith("Bearer ")) {
          token = authHeader.slice(7).trim();
        }
      }
      if (token) {
        const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const sbKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
        const supabase = createClient(sbUrl, sbKey, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false },
        });
        const { data: { user } } = await supabase.auth.getUser();
        if (user) userId = user.id;
      }
    }

    if (!userId && !isPublic) {
      console.warn(`[tiles meta] Unauthorized access attempt for ${planId}`);
      return jsonError("Unauthorized", 401);
    }

    // If public access, the plan MUST be shared (is_archived === true)
    if (isPublic && !userId) {
      const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
      const supabase = createClient(sbUrl, sbKey, { auth: { persistSession: false } });
      const { data: plan } = await supabase.from("plans").select("is_archived").eq("id", planId).single();
      if (!plan || plan.is_archived !== true) {
        console.warn(`[tiles meta] Access denied: Plan ${planId} is not shared.`);
        return jsonError("Forbidden: Plan is not shared", 403);
      }
    }

    const now = Date.now();
    const cached = metaCache.get(planId);

    if (cached && cached.expires > now) {
      console.log(`[tiles meta] Returning cached meta for ${planId}`);
      return NextResponse.json(cached.data, {
        status: 200,
        headers: { "Cache-Control": "no-store, no-cache, must-revalidate" }
      });
    }

    // Resolve version directory or fall back to planId
    let targetFolder = planId;
    try {
      const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
      const supabase = createClient(sbUrl, sbKey, { auth: { persistSession: false } });
      const { data: activeVersion } = await supabase
        .from("plan_versions")
        .select("id")
        .eq("plan_id", planId)
        .eq("status", "active")
        .maybeSingle();
      if (activeVersion?.id) {
        targetFolder = activeVersion.id;
      }
    } catch (err) {
      console.error("[tiles meta] Failed to resolve active version:", err);
    }

    const basePaths = [
      path.join(process.cwd(), "private_tiles", targetFolder),
      path.join(process.cwd(), "web", "private_tiles", targetFolder),
      path.join(process.cwd(), "private_tiles", planId),
      path.join(process.cwd(), "web", "private_tiles", planId)
    ];
    
    let metaPath = "";
    let found = false;
    for (const p of basePaths) {
      const testPath = path.join(p, "meta.json");
      try {
        await fs.access(testPath);
        metaPath = testPath;
        found = true;
        break;
      } catch {}
    }

    if (!found) {
      console.error(`[tiles meta] meta.json not found for ${planId} in any expected path`);
      return jsonError("Metadata not found", 404);
    }
    
    try {
      const raw = await fs.readFile(metaPath, "utf8");
      const meta = JSON.parse(raw) as Meta;

      // Basic validation
      if (!meta.tileSize || !meta.gridW || !meta.gridH) {
        return jsonError("meta.json is invalid", 500);
      }

      // Enrich meta with activeVersionId
      const enrichedMeta = {
        ...meta,
        activeVersionId: targetFolder
      };

      metaCache.set(planId, { data: enrichedMeta, expires: now + META_TTL });

      return NextResponse.json(enrichedMeta, {
        status: 200,
        headers: { "Cache-Control": "no-store, no-cache, must-revalidate" }
      });
    } catch (err: any) {
      return jsonError(`Failed to load metadata: ${err.message}`, 404);
    }
  } catch (e: any) {
    console.error("[meta] error:", e);
    return jsonError(e?.message ?? "Server error", 500);
  }
}
