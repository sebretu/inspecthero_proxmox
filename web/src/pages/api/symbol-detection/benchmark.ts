import type { NextApiRequest, NextApiResponse } from "next";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const admin = getSupabaseAdminClient();

  try {
    // 1. Query feedback entries
    const { data: feedback, error: feedErr } = await admin
      .from("symbol_feedback")
      .select("*");

    if (feedErr) throw feedErr;

    // 2. Query symbol predictions entries
    const { data: predictions, error: predErr } = await admin
      .from("symbol_predictions")
      .select("id, confidence, predicted_symbol_type, status");

    if (predErr) throw predErr;

    const totalReviewed = feedback?.length || 0;
    const approvedCount = feedback?.filter((f) => f.accepted).length || 0;
    const rejectedCount = totalReviewed - approvedCount;

    const totalPreds = predictions?.length || 0;
    const avgConfidence =
      totalPreds > 0
        ? predictions.reduce((sum, p) => sum + (p.confidence || 0), 0) / totalPreds
        : 0;

    const approvedRate = totalReviewed > 0 ? (approvedCount / totalReviewed) * 100 : 0;
    const rejectedRate = totalReviewed > 0 ? (rejectedCount / totalReviewed) * 100 : 0;

    // Accuracy split per symbol type
    const approvalBySymbol: Record<string, { total: number; approved: number; rate: number }> = {};
    const symbolTypes = Array.from(new Set(predictions.map((p) => p.predicted_symbol_type)));

    for (const type of symbolTypes) {
      const typePredIds = new Set(
        predictions.filter((p) => p.predicted_symbol_type === type).map((p) => p.id)
      );
      const relatedFeedback = feedback?.filter((f) => typePredIds.has(f.prediction_id)) || [];

      const tTotal = relatedFeedback.length;
      const tApproved = relatedFeedback.filter((f) => f.accepted).length;

      approvalBySymbol[type] = {
        total: tTotal,
        approved: tApproved,
        rate: tTotal > 0 ? Number(((tApproved / tTotal) * 100).toFixed(1)) : 0
      };
    }

    // FP/FN rates derived from reviews
    const falsePositives = rejectedCount;
    const falseNegatives = feedback?.filter((f) => !f.accepted && f.corrected_symbol).length || 0;

    return res.status(200).json({
      ok: true,
      data: {
        total_predictions: totalPreds,
        total_reviewed: totalReviewed,
        approved_count: approvedCount,
        rejected_count: rejectedCount,
        approved_rate: Number(approvedRate.toFixed(1)),
        rejected_rate: Number(rejectedRate.toFixed(1)),
        average_confidence: Number((avgConfidence * 100).toFixed(1)),
        approval_by_symbol: approvalBySymbol,
        false_positives: falsePositives,
        false_negatives: falseNegatives
      }
    });
  } catch (err: any) {
    console.error("[Benchmark API] Error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
