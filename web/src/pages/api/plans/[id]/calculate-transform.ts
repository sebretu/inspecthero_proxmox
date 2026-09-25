import type { NextApiRequest, NextApiResponse } from "next";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { createClient } from "@supabase/supabase-js";
import { solveTransformation } from "@/lib/transformUtils";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const auth = req.headers.authorization || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : null;

  if (!token) return res.status(401).json({ error: "Missing Bearer token" });

  const supabase = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return res.status(401).json({ error: "AUTH_INVALID" });

  const planId = req.query.id as string;
  if (!planId) { console.error("400: Missing planId"); return res.status(400).json({ error: "Missing planId" }); }

  const { v_old_anchors, v_draft_anchors, versionId, clear, custom_transformation_model } = req.body;

  const adminClient = getSupabaseAdminClient();

  let finalVersionId = versionId;
  if (!finalVersionId) {
    const { data: draft } = await adminClient.from("plan_versions")
      .select("id").eq("plan_id", planId).eq("status", "needs_alignment").single();
    if (draft) finalVersionId = draft.id;
  }

  if (!finalVersionId) { console.error("400: Missing versionId"); return res.status(400).json({ error: "Missing versionId. Please refresh the page without cache." }); }

  if (clear) {
    try {
      await adminClient
        .from("plan_versions")
        .update({ transformation_model: null })
        .eq("id", finalVersionId);
      return res.status(200).json({ ok: true, message: "Alignment cleared successfully." });
    } catch (err: any) {
      console.error("[calculate-transform] Clear failed:", err);
      return res.status(500).json({ error: err.message || "Failed to clear alignment" });
    }
  }

  if (custom_transformation_model) {
    try {
      await adminClient
        .from("plan_versions")
        .update({ transformation_model: custom_transformation_model })
        .eq("id", finalVersionId);
      return res.status(200).json({ ok: true, data: custom_transformation_model });
    } catch (err: any) {
      console.error("[calculate-transform] Custom model save failed:", err);
      return res.status(500).json({ error: err.message || "Failed to save custom alignment" });
    }
  }

  if (!v_old_anchors || !v_draft_anchors || v_old_anchors.length < 2 || v_old_anchors.length !== v_draft_anchors.length) {
    console.error("400: Invalid anchor count or mismatched count", { v_old_anchors, v_draft_anchors });
    return res.status(400).json({ error: "At least 2 matching reference points for each version are required." });
  }

  try {
    const transformModel = solveTransformation(v_old_anchors, v_draft_anchors);
    
    // Include the anchor coordinates in the saved JSON for frontend state reconstruction
    (transformModel as any).anchors = {
      v_old: v_old_anchors,
      v_draft: v_draft_anchors
    };

    // Save to plan_versions
    await adminClient
      .from("plan_versions")
      .update({ transformation_model: transformModel })
      .eq("id", finalVersionId);

    return res.status(200).json({ ok: true, data: transformModel });
  } catch (err: any) {
    console.error("[calculate-transform]", err);
    return res.status(400).json({ error: err.message || "Server error" });
  }
}
