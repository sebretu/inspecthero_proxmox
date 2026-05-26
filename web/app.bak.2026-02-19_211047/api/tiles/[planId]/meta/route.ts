import { NextResponse } from "next/server";
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
  format?: string;
  limits?: Record<string, { maxX: number; maxY: number }>;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ planId: string }> }
) {
  try {
    let { userId } = createServerSupabaseClient(req, { requireAuth: false });

    // Fallback: try query param
    if (!userId) {
      const url = new URL(req.url);
      const token = url.searchParams.get("token");
      if (token) {
        const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const sbKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
        const supabase = createClient(sbUrl, sbKey, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false },
        });
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          userId = user.id;
        }
      }
    }

    if (!userId) {
      return jsonError("Unauthorized", 401);
    }

    const { planId } = await ctx.params;

    // Zakładam, że masz meta.json w: public/tiles/<planId>/meta.json
    // (bo w PlanViewer fetchujesz `/tiles/${planId}/meta.json`)
    const metaPath = path.join(process.cwd(), "private_tiles", planId, "meta.json");

    let raw: string;
    try {
      raw = await fs.readFile(metaPath, "utf8");
    } catch {
      return jsonError(`Brak meta.json: ${metaPath}`, 404);
    }

    let meta: Meta;
    try {
      meta = JSON.parse(raw) as Meta;
    } catch {
      return jsonError("meta.json jest uszkodzony (niepoprawny JSON)", 500);
    }

    // minimalna walidacja
    if (
      typeof meta?.tileSize !== "number" ||
      typeof meta?.minZoom !== "number" ||
      typeof meta?.maxZoom !== "number" ||
      typeof meta?.gridW !== "number" ||
      typeof meta?.gridH !== "number"
    ) {
      return jsonError("meta.json ma zły format (brakuje pól)", 500);
    }

    return NextResponse.json(meta, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    if (e.message === "AUTH_REQUIRED") {
      return jsonError("Unauthorized", 401);
    }
    console.error(e);
    return jsonError(e?.message ?? "Błąd serwera", 500);
  }
}
