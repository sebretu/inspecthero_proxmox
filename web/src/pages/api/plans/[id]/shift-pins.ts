import type { NextApiRequest, NextApiResponse } from "next";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { applyTransformMatrixToPlan, solveTransformation } from "@/lib/transformUtils";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const planId = req.query.id as string;
    const { v_old_anchors, v_draft_anchors } = req.body;

    if (!planId) return res.status(400).json({ error: "Missing planId" });
    if (!v_old_anchors || !v_draft_anchors || v_old_anchors.length < 2 || v_old_anchors.length !== v_draft_anchors.length) {
      return res.status(400).json({ error: "At least 2 matching reference points are required." });
    }

    const tModel = solveTransformation(v_old_anchors, v_draft_anchors);
    
    // Save anchors in representation
    (tModel as any).anchors = {
      v_old: v_old_anchors,
      v_draft: v_draft_anchors
    };

    const adminClient = getSupabaseAdminClient();
    await applyTransformMatrixToPlan(planId, tModel, adminClient);

    return res.status(200).json({ ok: true, message: "Pins shifted successfully" });
  } catch (err: any) {
    console.error("[shift-pins] Error:", err);
    return res.status(400).json({ error: err.message || "Internal server error" });
  }
}
