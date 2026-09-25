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

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) return res.status(401).json({ error: "AUTH_INVALID" });

  const planId = req.query.id as string;
  if (!planId) return res.status(400).json({ error: "Missing planId" });

  const adminClient = getSupabaseAdminClient();

  // GET: Fetch all Revisionsklappen for this plan
  if (req.method === "GET") {
    const { data, error } = await adminClient
      .from("plan_revisions_klappen")
      .select("*")
      .eq("plan_id", planId)
      .order("created_at", { ascending: true });

    if (error) {
      if (error.message?.includes("does not exist") || error.code === "42P01") {
        return res.status(200).json({ klappen: [] });
      }
      return res.status(500).json({ error: error.message });
    }
    return res.status(200).json({ klappen: data ?? [] });
  }

  // Check user role for mutations
  if (req.method === "POST" || req.method === "DELETE" || req.method === "PATCH") {
    const { data: profile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const role = (profile?.role || "").toUpperCase();
    if (role !== "ADMIN") {
      return res.status(403).json({ error: "FORBIDDEN: Only administrators can modify revisionsklappen" });
    }
  }

  // POST: Create a new Revisionsklappe
  if (req.method === "POST") {
    const {
      x_norm,
      y_norm,
      w_norm,
      h_norm,
      width_cm,
      height_cm,
      label,
      description,
    } = req.body;

    if (
      typeof x_norm !== "number" ||
      typeof y_norm !== "number" ||
      typeof w_norm !== "number" ||
      typeof h_norm !== "number"
    ) {
      return res.status(400).json({ error: "Invalid coordinates (x_norm, y_norm, w_norm, h_norm required)" });
    }

    const row = {
      plan_id: planId,
      x_norm,
      y_norm,
      w_norm,
      h_norm,
      width_cm: typeof width_cm === "number" ? width_cm : null,
      height_cm: typeof height_cm === "number" ? height_cm : null,
      label: typeof label === "string" ? label.trim() : null,
      description: typeof description === "string" ? description.trim() : null,
      created_by: user.id,
    };

    const { data, error } = await adminClient
      .from("plan_revisions_klappen")
      .insert([row])
      .select("*")
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ klappe: data });
  }

  // PATCH: Update an existing Revisionsklappe
  if (req.method === "PATCH") {
    const klappeId = req.query.klappeId as string || req.body.id;
    if (!klappeId) return res.status(400).json({ error: "Missing klappeId" });

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (typeof req.body.label !== "undefined") updates.label = req.body.label;
    if (typeof req.body.description !== "undefined") updates.description = req.body.description;
    if (typeof req.body.width_cm === "number") updates.width_cm = req.body.width_cm;
    if (typeof req.body.height_cm === "number") updates.height_cm = req.body.height_cm;

    const { data, error } = await adminClient
      .from("plan_revisions_klappen")
      .update(updates)
      .eq("id", klappeId)
      .eq("plan_id", planId)
      .select("*")
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ klappe: data });
  }

  // DELETE: Delete a Revisionsklappe
  if (req.method === "DELETE") {
    const klappeId = req.query.klappeId as string || req.body?.id;
    if (!klappeId) return res.status(400).json({ error: "Missing klappeId" });

    const { error } = await adminClient
      .from("plan_revisions_klappen")
      .delete()
      .eq("id", klappeId)
      .eq("plan_id", planId);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
