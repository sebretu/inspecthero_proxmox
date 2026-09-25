import type { NextApiRequest, NextApiResponse } from "next";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const { plan_id, symbol_type, quality_status, embedding_status, page = "1", limit = "20" } = req.query;
  const admin = getSupabaseAdminClient();

  const pageNum = parseInt(page as string, 10) || 1;
  const limitNum = parseInt(limit as string, 10) || 20;
  const fromOffset = (pageNum - 1) * limitNum;
  const toOffset = fromOffset + limitNum - 1;

  try {
    let dbQuery = admin
      .from("symbol_crops")
      .select("*, plans(id, version, floors(name, buildings(name, projects(name, companies(name)))))", { count: "exact" });

    if (plan_id) {
      dbQuery = dbQuery.eq("plan_id", plan_id);
    }
    if (symbol_type && symbol_type !== "all") {
      dbQuery = dbQuery.eq("symbol_type", symbol_type);
    }
    if (quality_status && quality_status !== "all") {
      dbQuery = dbQuery.eq("quality_status", quality_status);
    }
    if (embedding_status && embedding_status !== "all") {
      dbQuery = dbQuery.eq("embedding_status", embedding_status);
    }

    dbQuery = dbQuery
      .order("created_at", { ascending: false })
      .range(fromOffset, toOffset);

    const { data: crops, count, error } = await dbQuery;

    if (error) {
      throw error;
    }

    // Load list of all unique plans with full company > project > building > floor hierarchy
    const { data: plans } = await admin
      .from("plans")
      .select("id, version, floors(name, buildings(name, projects(name, companies(name))))")
      .order("version", { ascending: true });

    return res.status(200).json({
      ok: true,
      data: {
        items: crops || [],
        total: count || 0,
        plans: plans || [],
        page: pageNum,
        limit: limitNum
      }
    });
  } catch (err: any) {
    console.error("[List Symbol Crops] Error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
