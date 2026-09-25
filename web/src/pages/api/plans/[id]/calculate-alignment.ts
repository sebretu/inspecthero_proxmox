import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

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
  const { versionId, anchors } = req.body;

  if (!planId || !versionId || !anchors || !Array.isArray(anchors)) {
    return res.status(400).json({ error: "Missing planId, versionId, or valid anchors array" });
  }

  const adminClient = getSupabaseAdminClient();

  try {
    // Basic 2-point translation + scale (no rotation) for MVP
    // If more points are provided, we'd do a full affine or homography.
    // Here we save the anchors and calculate a simple transformation model.
    let transformationModel: any = { type: 'identity' };

    if (anchors.length >= 2) {
      const p1Original = anchors[0].original;
      const p1Draft = anchors[0].draft;
      const p2Original = anchors[1].original;
      const p2Draft = anchors[1].draft;

      // Scale = distance_draft / distance_original (per axis)
      const dxOriginal = p2Original.x - p1Original.x;
      const dyOriginal = p2Original.y - p1Original.y;
      const dxDraft = p2Draft.x - p1Draft.x;
      const dyDraft = p2Draft.y - p1Draft.y;

      const scaleX = dxOriginal !== 0 ? dxDraft / dxOriginal : 1;
      const scaleY = dyOriginal !== 0 ? dyDraft / dyOriginal : 1;

      const translateX = p1Draft.x - (p1Original.x * scaleX);
      const translateY = p1Draft.y - (p1Original.y * scaleY);

      transformationModel = {
        type: 'affine_2d_basic',
        scaleX,
        scaleY,
        translateX,
        translateY,
        anchors
      };
    } else if (anchors.length === 1) {
      const p1Original = anchors[0].original;
      const p1Draft = anchors[0].draft;
      transformationModel = {
        type: 'translation',
        translateX: p1Draft.x - p1Original.x,
        translateY: p1Draft.y - p1Original.y,
        anchors
      };
    }

    // Save transformation model to plan_versions
    const { error: updateErr } = await adminClient
      .from('plan_versions')
      .update({ transformation_model: transformationModel })
      .eq('id', versionId)
      .eq('plan_id', planId)
      .eq('status', 'needs_alignment');

    if (updateErr) return res.status(500).json({ error: `Failed to update version: ${updateErr.message}` });

    return res.status(200).json({ ok: true, data: { transformationModel } });
  } catch (err: any) {
    console.error("[calculate-alignment] Internal error:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
