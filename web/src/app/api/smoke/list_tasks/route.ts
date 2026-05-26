// src/app/api/smoke/list_tasks/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function decodeJwtPayload(token: string) {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    // base64url -> base64
    const b = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b + "=".repeat((4 - (b.length % 4)) % 4);
    const json = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const auth = req.headers.get("authorization") || "";

    if (!auth.toLowerCase().startsWith("bearer ")) {
      return NextResponse.json(
        { ok: false, error: { code: "AUTH_INVALID", message: "Missing Bearer token" } },
        { status: 401 }
      );
    }
    const token = auth.slice("bearer ".length).trim();

    const supabase = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("project_id");
    if (!projectId) {
      return NextResponse.json(
        { ok: false, error: { code: "BAD_REQUEST", message: "Missing query param: project_id" } },
        { status: 400 }
      );
    }

    // pagination & basic validation
    const limitRaw = parseInt(searchParams.get("limit") || "10", 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 10;
    const offsetRaw = parseInt(searchParams.get("offset") || "0", 10);
    const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;

    // status filter: single or comma-separated list
    const statusParam = searchParams.get("status");
    const statuses = statusParam ? statusParam.split(",").map(s => s.trim()).filter(Boolean) : null;

    // order: e.g. created_at.desc or updated_at.asc
    const orderParam = searchParams.get("order") || "updated_at.desc";
    const [orderColRaw, orderDirRaw] = orderParam.split(".");
    const orderCol = (orderColRaw || "updated_at").trim();
    const orderDir = (orderDirRaw || "desc").toLowerCase() === "asc" ? "asc" : "desc";

    // "me" flag: filter by assigned_user_id == sub from JWT
    const me = searchParams.get("me") === "1";
    let assignedUserId: string | null = null;
    if (me) {
      const payload = decodeJwtPayload(token);
      if (!payload || !payload.sub) {
        return NextResponse.json(
          { ok: false, error: { code: "AUTH_INVALID", message: "Invalid JWT payload for me=1" } },
          { status: 401 }
        );
      }
      assignedUserId = String(payload.sub);
    }

    // Build query
    let query = supabase
      .from("tasks")
      .select("id, project_id, x_norm, y_norm, title, status, assigned_user_id, created_at, updated_at");

    query = query.eq("project_id", projectId);

    if (statuses && statuses.length > 0) {
      // if only 1 status, .eq is ok; for multiple, use .in
      if (statuses.length === 1) {
        query = (query as any).eq("status", statuses[0]);
      } else {
        query = (query as any).in("status", statuses);
      }
    }

    if (assignedUserId) {
      query = (query as any).eq("assigned_user_id", assignedUserId);
    }

    // Apply ordering + pagination
    query = (query as any).order(orderCol, { ascending: orderDir === "asc" }).range(offset, offset + limit - 1);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ ok: false, error: { code: "DB_ERROR", message: error.message } }, { status: 400 });
    }

    return NextResponse.json({ ok: true, data: data || [] });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: { code: "UNEXPECTED", message: e?.message || String(e) } },
      { status: 500 }
    );
  }
}
