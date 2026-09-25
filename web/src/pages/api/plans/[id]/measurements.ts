import type { NextApiRequest, NextApiResponse } from "next";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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
  if (!planId) return res.status(400).json({ error: "Missing planId" });

  const adminClient = getSupabaseAdminClient();

  if (req.method === "GET") {
    const { data, error } = await adminClient
      .from("plan_measurements")
      .select("id, label, points, created_by, created_at")
      .eq("plan_id", planId)
      .order("created_at", { ascending: true });

    // If table doesn't exist yet, return empty array instead of 500
    if (error) {
      if (error.message?.includes("does not exist") || error.code === "42P01") {
        return res.status(200).json({ measurements: [], tableNotReady: true });
      }
      return res.status(500).json({ error: error.message });
    }
    return res.status(200).json({ measurements: data ?? [] });
  }

  if (req.method === "POST") {
    const { measurements } = req.body as {
      measurements: Array<{ id: string; points: Array<{ x: number; y: number }>; label?: string }>;
    };

    if (!Array.isArray(measurements)) {
      return res.status(400).json({ error: "measurements must be an array" });
    }

    const { error: delErr } = await adminClient
      .from("plan_measurements")
      .delete()
      .eq("plan_id", planId);

    if (delErr) {
      if (delErr.message?.includes("does not exist") || delErr.code === "42P01") {
        return res.status(503).json({ error: "Tabela plan_measurements nie istnieje. Wykonaj migrację SQL w Supabase." });
      }
      return res.status(500).json({ error: delErr.message });
    }

    if (measurements.length === 0) {
      return res.status(200).json({ saved: 0 });
    }

    const rows = measurements.map((m) => ({
      plan_id: planId,
      label: m.label ?? null,
      points: m.points,
      created_by: user.id,
    }));

    const { error: insErr } = await adminClient.from("plan_measurements").insert(rows);
    if (insErr) return res.status(500).json({ error: insErr.message });

    return res.status(200).json({ saved: rows.length });
  }

  if (req.method === "DELETE") {
    const { error } = await adminClient
      .from("plan_measurements")
      .delete()
      .eq("plan_id", planId);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ deleted: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
