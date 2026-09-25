import type { NextApiRequest, NextApiResponse } from "next";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const admin = getSupabaseAdminClient();

  try {
    const { data: crops, error } = await admin
      .from("symbol_crops")
      .select("id, quality_status, quality_score, symbol_type");

    if (error) {
      throw error;
    }

    const total = crops?.length || 0;
    let passed = 0;
    let approved = 0;
    let failed = 0;
    let sumQuality = 0;
    let withEmbedding = 0;
    const { data: cropsRaw } = await admin.from("symbol_crops").select("id, embedding");
    const embeddingMap = new Map((cropsRaw || []).map(r => [r.id, r.embedding]));

    const types: Record<string, number> = {};

    for (const crop of crops || []) {
      if (crop.quality_status === "approved") {
        approved++; // Manual ground truth markers
      } else if (crop.quality_status === "passed") {
        passed++;
      } else {
        failed++;
      }
      
      const emb = embeddingMap.get(crop.id);
      if (emb) {
        withEmbedding++;
      }
      
      const rawScore = Number(crop.quality_score || 0);
      const score = rawScore > 1 ? Math.min(1.0, rawScore / 100) : Math.min(1.0, rawScore);
      sumQuality += score;

      const type = crop.symbol_type || "unknown";
      types[type] = (types[type] || 0) + 1;
    }

    const average_quality = total > 0 ? Number((sumQuality / total).toFixed(4)) : 0;
    const embedding_coverage = total > 0 ? Number((withEmbedding / total).toFixed(4)) : 0;

    return res.status(200).json({
      ok: true,
      data: {
        total,
        passed,
        approved,
        failed,
        average_quality,
        embedding_coverage,
        types
      }
    });
  } catch (err: any) {
    console.error("[Dataset Stats] Error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
