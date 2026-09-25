import type { NextApiRequest, NextApiResponse } from "next";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const planId = req.query.id as string;
  if (!planId) return res.status(400).json({ error: "Missing planId" });

  const adminClient = getSupabaseAdminClient();

  // GET – fetch saved scale for a plan (accessible to any user viewing the plan)
  if (req.method === "GET") {
    try {
      const { data, error } = await adminClient
        .from("plan_scale")
        .select("pixels_per_meter, unit, updated_at")
        .eq("plan_id", planId)
        .maybeSingle();

      if (error) {
        if (error.message?.includes("does not exist") || error.code === "42P01") {
          return res.status(200).json({ scale: null });
        }
        return res.status(500).json({ error: error.message });
      }
      return res.status(200).json({ scale: data ?? null });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Internal server error" });
    }
  }

  // Auth check for modifying operations (POST / DELETE)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const auth = req.headers.authorization || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : null;

  let userId: string | null = null;
  if (token) {
    const supabase = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (user) userId = user.id;
  }

  // POST – save scale for a plan (upsert)
  if (req.method === "POST") {
    const { pixelsPerMeter, unit } = req.body as { pixelsPerMeter: number; unit: string };

    if (!pixelsPerMeter || typeof pixelsPerMeter !== "number") {
      return res.status(400).json({ error: "pixelsPerMeter is required" });
    }

    const { error } = await adminClient.from("plan_scale").upsert({
      plan_id: planId,
      pixels_per_meter: pixelsPerMeter,
      unit: unit ?? "m",
      updated_by: userId || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "plan_id" });

    if (error) {
      if (error.message?.includes("does not exist") || error.code === "42P01") {
        return res.status(503).json({ error: "Tabela plan_scale nie istnieje." });
      }
      return res.status(500).json({ error: error.message });
    }
    return res.status(200).json({ ok: true });
  }

  // DELETE – remove scale for a plan
  if (req.method === "DELETE") {
    const { error } = await adminClient
      .from("plan_scale")
      .delete()
      .eq("plan_id", planId);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ deleted: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
