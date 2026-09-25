import type { NextApiRequest, NextApiResponse } from "next";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const auth = req.headers.authorization || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : null;

  if (!token) return res.status(401).json({ ok: false, error: "Missing Bearer token" });

  const supabase = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) return res.status(401).json({ ok: false, error: "AUTH_INVALID" });

  const planId = req.query.id as string;
  const adminClient = getSupabaseAdminClient();

  // GET: Fetch all cable connections for this plan (or whole project if requested)
  if (req.method === "GET") {
    const projectId = req.query.projectId as string | undefined;

    let query = adminClient
      .from("bma_connections")
      .select("*")
      .order("created_at", { ascending: true });

    if (projectId) {
      query = query.eq("project_id", projectId);
    }

    const { data, error } = await query;

    if (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }

    // Filter connections that are either:
    // 1. Specifically for this plan (in metadata)
    // 2. Or if projectId was provided, return all for project
    // Filter connections that are real cables/free lines and belong strictly to this plan
    const all = data ?? [];
    const filtered = all.filter((c) => {
      // Exclude legacy auto-generated loop scans
      if (c.name && (c.name.includes("Auto-generated") || c.name.startsWith("Loop "))) {
        const m = c.metadata || {};
        if (!m.waypoints?.length && !m.source_symbol_id && !m.cable_number) {
          return false;
        }
      }

      const m = c.metadata || {};
      return (
        m.plan_id === planId ||
        m.source_plan_id === planId ||
        m.target_plan_id === planId
      );
    });

    return res.status(200).json({ ok: true, connections: filtered });
  }

  // POST: Create a new Cable Connection or Free Line
  if (req.method === "POST") {
    const {
      project_id,
      name,
      type = "CABLE_CONNECTION",
      color = "#0284c7",
      metadata = {},
    } = req.body;

    if (!project_id) {
      return res.status(400).json({ ok: false, error: "Missing project_id" });
    }

    // Ensure plan_id is attached to metadata
    const finalMetadata = {
      plan_id: planId,
      source_plan_id: metadata.source_plan_id || planId,
      target_plan_id: metadata.target_plan_id || planId,
      ...metadata,
    };

    // Validation for CABLE_CONNECTION: source cannot equal target if on same plan
    if (type === "CABLE_CONNECTION" && !finalMetadata.is_free_line) {
      if (!finalMetadata.source_symbol_id || !finalMetadata.target_symbol_id) {
        return res.status(400).json({
          ok: false,
          error: "source_symbol_id and target_symbol_id are required for Cable Connections",
        });
      }
      if (
        finalMetadata.source_symbol_id === finalMetadata.target_symbol_id &&
        finalMetadata.source_plan_id === finalMetadata.target_plan_id
      ) {
        return res.status(400).json({
          ok: false,
          error: "Source and target device cannot be the same symbol on the same plan",
        });
      }
    }

    const insertPayload = {
      project_id,
      name: name || finalMetadata.cable_number || finalMetadata.description || "Kabel",
      type: type || (finalMetadata.is_free_line ? "FREE_LINE" : "CABLE_CONNECTION"),
      color: color || (finalMetadata.is_free_line ? "#f59e0b" : "#0284c7"),
      metadata: finalMetadata,
    };

    const { data, error } = await adminClient
      .from("bma_connections")
      .insert(insertPayload)
      .select("*")
      .single();

    if (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }

    return res.status(201).json({ ok: true, connection: data });
  }

  // PATCH: Update an existing cable connection
  if (req.method === "PATCH") {
    const connectionId = req.query.connectionId as string;
    if (!connectionId) {
      return res.status(400).json({ ok: false, error: "Missing connectionId" });
    }

    const { name, color, type, metadata } = req.body;

    const updatePayload: Record<string, any> = {};
    if (name !== undefined) updatePayload.name = name;
    if (color !== undefined) updatePayload.color = color;
    if (type !== undefined) updatePayload.type = type;

    if (metadata !== undefined) {
      // Merge with existing metadata
      const { data: existing } = await adminClient
        .from("bma_connections")
        .select("metadata")
        .eq("id", connectionId)
        .single();

      const merged = {
        ...(existing?.metadata || {}),
        ...metadata,
      };

      // Delete keys explicitly set to null or undefined
      Object.keys(metadata).forEach((key) => {
        if (metadata[key] === null || metadata[key] === undefined) {
          delete merged[key];
        }
      });

      updatePayload.metadata = merged;
    }

    const { data, error } = await adminClient
      .from("bma_connections")
      .update(updatePayload)
      .eq("id", connectionId)
      .select("*")
      .single();

    if (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }

    return res.status(200).json({ ok: true, connection: data });
  }

  // DELETE: Delete a connection
  if (req.method === "DELETE") {
    const connectionId = req.query.connectionId as string;
    if (!connectionId) {
      return res.status(400).json({ ok: false, error: "Missing connectionId" });
    }

    const { error } = await adminClient
      .from("bma_connections")
      .delete()
      .eq("id", connectionId);

    if (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }

    return res.status(200).json({ ok: true, deleted: true });
  }

  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
