import type { NextApiRequest, NextApiResponse } from "next";
import { clusterSymbols } from "@/lib/symbolClusterService";
import { maintainVectorIndex } from "@/lib/vectorMaintenance";
import { processQueue } from "@/lib/embeddingQueue";
import { findSimilarPlans } from "@/lib/planMatcher";
import { getSymbolGraph } from "@/lib/symbolGraphService";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const { action, plan_id, plan_version_id, threshold } = req.body;

  try {
    if (action === "cluster") {
      const stats = await clusterSymbols(undefined, threshold || 0.90);
      return res.status(200).json({ ok: true, data: { ok: true, stats } });
    }

    if (action === "vacuum") {
      const stats = await maintainVectorIndex();
      return res.status(200).json({ ok: true, data: { ok: true, stats } });
    }

    if (action === "process_queue") {
      const count = await processQueue();
      return res.status(200).json({ ok: true, data: { ok: true, processed: count } });
    }

    if (action === "similar_plans") {
      if (!plan_version_id) return res.status(400).json({ error: "Missing plan_version_id" });
      const matches = await findSimilarPlans(plan_version_id);
      return res.status(200).json({ ok: true, data: { ok: true, matches } });
    }

    if (action === "plan_graph") {
      if (!plan_id) return res.status(400).json({ error: "Missing plan_id" });
      const graph = await getSymbolGraph(plan_id);
      return res.status(200).json({ ok: true, data: { ok: true, graph } });
    }

    if (action === "dataset_versions") {
      const admin = getSupabaseAdminClient();
      const { data } = await admin.from("dataset_versions").select("*").order("created_at", { ascending: false });
      return res.status(200).json({ ok: true, data: { versions: data || [] } });
    }

    return res.status(400).json({ error: "Invalid maintenance action parameter" });
  } catch (err: any) {
    console.error("[Maintenance API] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
