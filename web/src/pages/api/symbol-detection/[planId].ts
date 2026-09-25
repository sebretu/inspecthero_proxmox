import type { NextApiRequest, NextApiResponse } from "next";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const { planId } = req.query;

  if (!planId || typeof planId !== "string") {
    return res.status(400).json({ error: "Missing planId query parameter" });
  }

  const admin = getSupabaseAdminClient();

  try {
    const { data: predictions, error } = await admin
      .from("symbol_predictions")
      .select("*")
      .eq("plan_id", planId)
      .order("confidence", { ascending: false });

    if (error) {
      throw error;
    }

    return res.status(200).json({
      ok: true,
      data: predictions || []
    });
  } catch (err: any) {
    console.error(`[Get Predictions] Error loading predictions for plan ${planId}:`, err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
