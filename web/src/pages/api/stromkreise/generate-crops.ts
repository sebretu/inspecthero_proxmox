import type { NextApiRequest, NextApiResponse } from "next";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { generateSymbolCrop } from "@/lib/symbolCropper";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { planId, markerId } = req.body;
  const admin = getSupabaseAdminClient();

  try {
    let markers: any[] = [];
    if (markerId) {
      const { data, error } = await admin
        .from("stromkreise")
        .select("id")
        .eq("id", markerId);
      if (error) throw error;
      markers = data || [];
    } else if (planId) {
      const { data, error } = await admin
        .from("stromkreise")
        .select("id")
        .eq("plan_id", planId);
      if (error) throw error;
      markers = data || [];
    } else {
      return res.status(400).json({ ok: false, error: "Missing planId or markerId" });
    }

    console.log(`[generate-crops API] Found ${markers.length} markers to process.`);

    let processed = 0;
    for (const m of markers) {
      await generateSymbolCrop(m.id).catch(err => {
        console.error(`[generate-crops API] Error processing marker ${m.id}:`, err);
      });
      processed++;
    }

    return res.status(200).json({ ok: true, message: `Processed ${processed} markers` });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
