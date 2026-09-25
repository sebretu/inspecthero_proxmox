import type { NextApiRequest, NextApiResponse } from "next";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

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

  try {
    const pins: any[] = [];

    // 1. Tasks
    const { data: tasks } = await adminClient
      .from("tasks")
      .select("id, x_norm, y_norm, title")
      .eq("plan_id", planId);
    if (tasks) {
      tasks.forEach(t => {
        if (t.x_norm !== null && t.y_norm !== null) {
          pins.push({
            id: t.id,
            x: Number(t.x_norm),
            y: Number(t.y_norm),
            type: "task",
            label: t.title || "Task"
          });
        }
      });
    }

    // 2. Stromkreise
    const { data: strom } = await adminClient
      .from("stromkreise")
      .select("id, x_norm, y_norm, circuit_code")
      .eq("plan_id", planId);
    if (strom) {
      strom.forEach(s => {
        if (s.x_norm !== null && s.y_norm !== null) {
          pins.push({
            id: s.id,
            x: Number(s.x_norm),
            y: Number(s.y_norm),
            type: "stromkreis",
            label: s.circuit_code || "Stromkreis"
          });
        }
      });
    }

    // 3. BMA Devices
    const { data: bma } = await adminClient
      .from("bma_devices")
      .select("id, x, y, name")
      .eq("plan_id", planId);
    if (bma) {
      bma.forEach(b => {
        if (b.x !== null && b.y !== null) {
          pins.push({
            id: b.id,
            x: Number(b.x),
            y: Number(b.y),
            type: "bma",
            label: b.name || "BMA Device"
          });
        }
      });
    }

    return res.status(200).json({ ok: true, data: pins });
  } catch (err: any) {
    console.error("[pins] Error:", err);
    return res.status(500).json({ error: err.message || "Failed to fetch plan pins" });
  }
}
