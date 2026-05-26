import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let supabase;
  try {
    ({ client: supabase } = createServerSupabaseClient(req));
  } catch {
    return res.status(401).json({ ok: false, error: { message: "Unauthorized" } });
  }

  if (req.method === "GET") {
    const projectId = String(req.query.projectId || "").trim();
    const planId = String(req.query.planId || "").trim();
    if (!projectId) return res.status(400).json({ ok: false, error: { message: "Missing projectId" } });

    let query = supabase.from("bma_devices").select("*").eq("project_id", projectId);
    if (planId) query = query.eq("plan_id", planId);

    const { data, error } = await query;
    if (error) return res.status(400).json({ ok: false, error: { message: error.message } });
    return res.status(200).json({ ok: true, data });
  }

  if (req.method === "POST") {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { data, error } = await supabase.from("bma_devices").insert(body).select("*");
    if (error) return res.status(400).json({ ok: false, error: { message: error.message } });
    return res.status(200).json({ ok: true, data });
  }

  if (req.method === "PATCH") {
    console.log("[devices PATCH] Start handler");
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    console.log("[devices PATCH] Body:", body);
    const { id, ...updates } = body;
    if (!id) return res.status(400).json({ ok: false, error: { message: "Missing id" } });

    // Fetch the device first to check project_id and current metadata
    const { data: device, error: fetchErr } = await supabase.from("bma_devices").select("*").eq("id", id).single();
    if (fetchErr || !device) {
      console.error("[devices PATCH] Device not found:", id, fetchErr);
      return res.status(404).json({ ok: false, error: { message: "Device not found" } });
    }

    const { userId } = createServerSupabaseClient(req);
    console.log("[devices PATCH] User ID:", userId);
    
    const { data: profile, error: profErr } = await supabase.from("profiles").select("role").eq("id", userId).single();
    if (profErr) console.error("[devices PATCH] Profile fetch error:", profErr);
    
    const role = (profile?.role || "").toUpperCase();
    console.log("[devices PATCH] User role:", role);
    const isAdmin = role === "ADMIN";

    if (!isAdmin) {
      console.warn("[devices PATCH] Non-admin attempt:", userId, role);
      // Standard users can ONLY update metadata
      const keys = Object.keys(updates);
      if (keys.length > 1 || keys[0] !== "metadata") {
        return res.status(403).json({ ok: false, error: { message: "Users can only update metadata (photos/serial)" } });
      }
    }

    // Use admin client to bypass RLS since users don't have UPDATE permission on the table
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin.from("bma_devices").update(updates).eq("id", id).select("*").single();

    if (error) {
      console.error("[devices PATCH] Error updating device:", error);
      return res.status(400).json({ ok: false, error: { message: error.message } });
    }
    console.log("[devices PATCH] Success for device:", id);
    return res.status(200).json({ ok: true, data });
  }

  if (req.method === "DELETE") {
    const id = String(req.query.id || "").trim();
    const planId = String(req.query.planId || "").trim();
    const projectId = String(req.query.projectId || "").trim();

    if (!id && !planId && !projectId) {
      return res.status(400).json({ ok: false, error: { message: "Missing filter parameter (id, planId, or projectId)" } });
    }

    // Use admin client to bypass RLS since users don't have DELETE permission on the table
    const admin = getSupabaseAdminClient();
    const { error } = await admin.from("bma_devices").delete().match(
      id ? { id } : planId ? { plan_id: planId } : { project_id: projectId }
    );
    
    if (error) {
      console.error("[devices DELETE] Error:", error);
      return res.status(400).json({ ok: false, error: { message: error.message } });
    }
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ ok: false, error: { message: "Method not allowed" } });
}
