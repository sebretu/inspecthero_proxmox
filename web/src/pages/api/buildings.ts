import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabaseServer";
import { requireRequesterProfile, isAdminRole } from "@/lib/requesterProfile";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST" && req.method !== "GET" && req.method !== "PATCH" && req.method !== "DELETE") {
    res.setHeader("Allow", "POST, GET, PATCH, DELETE");
    return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use POST, GET, PATCH or DELETE" } });
  }

  if (req.method === "PATCH") {
    const { id, name } = req.body ?? {};
    if (!id || typeof id !== "string") {
      return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing or invalid building id" } });
    }
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing or invalid name" } });
    }

    const adminSupabase = createServiceSupabaseClient();
    const { data, error } = await adminSupabase
      .from("buildings")
      .update({ name: name.trim() })
      .eq("id", id)
      .select("id, project_id, name, created_at, updated_at")
      .single();

    if (error) {
      return res.status((error as any).status || 400).json({
        ok: false,
        error: { code: "SUPABASE", message: error.message, meta: { code: (error as any).code, details: (error as any).details } },
      });
    }

    return res.status(200).json({ ok: true, data });
  }

  if (req.method === "DELETE") {
    const { id } = req.query;
    if (!id || typeof id !== "string") {
      return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing building id" } });
    }

    const adminSupabase = createServiceSupabaseClient();
    const { data, error } = await adminSupabase
      .from("buildings")
      .delete()
      .eq("id", id)
      .select("id")
      .single();

    if (error) {
      return res.status((error as any).status || 400).json({
        ok: false,
        error: { code: "SUPABASE", message: error.message, meta: { code: (error as any).code, details: (error as any).details } },
      });
    }

    return res.status(200).json({ ok: true, data });
  }

  let supabase: any;
  let userId: string | null = null;
  try {
    ({ client: supabase, userId } = createServerSupabaseClient(req));
  } catch (e: any) {
    return res.status(401).json({ ok: false, error: { code: "AUTH_INVALID", message: "Missing Bearer token" } });
  }

  let requester;
  try {
    requester = await requireRequesterProfile(supabase, userId);
  } catch (err: any) {
    return res.status(err?.status || 403).json({
      ok: false,
      error: { code: err?.code || "PROFILE_ERROR", message: err?.message || "Unable to load profile" },
    });
  }

  const isGlobalAdmin = isAdminRole(requester.role);

  if (req.method === "GET") {
    const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
    if (!projectId) {
      return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing projectId" } });
    }

    const fetchClient = isGlobalAdmin ? createServiceSupabaseClient() : supabase;

    const { data, error } = await fetchClient
      .from("buildings")
      .select("id, project_id, name, created_at, updated_at")
      .eq("project_id", projectId)
      .order("name", { ascending: true });

    if (error) {
      return res.status((error as any).status || 400).json({
        ok: false,
        error: { code: "SUPABASE", message: error.message, meta: { code: (error as any).code, details: (error as any).details } },
      });
    }

    return res.status(200).json({ ok: true, data: data ?? [] });
  }

  if (!isGlobalAdmin) {
    return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Only admins can add buildings" } });
  }

  const { project_id, name } = req.body ?? {};
  if (!project_id || typeof project_id !== "string" || !name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing project_id or name" } });
  }

  const adminSupabase = createServiceSupabaseClient();
  const { data, error } = await adminSupabase
    .from("buildings")
    .insert([{ project_id, name: name.trim() }])
    .select("id, project_id, name, created_at, updated_at")
    .single();

  if (error) {
    console.error("Building insert error:", error);

    // Handle unique constraint violation (duplicate name for project)
    if (error.code === "23505") {
      console.log("Duplicate building detected, fetching existing...");
      const { data: existing, error: existingError } = await adminSupabase
        .from("buildings")
        .select("id, project_id, name, created_at, updated_at")
        .eq("project_id", project_id)
        .eq("name", name.trim())
        .maybeSingle();

      if (existingError) {
        console.error("Error fetching existing building:", existingError);
      }

      if (!existingError && existing) {
        console.log("Returning existing building:", existing);
        return res.status(200).json({ ok: true, data: existing });
      }
    }

    return res.status((error as any).status || 400).json({
      ok: false,
      error: { code: "SUPABASE", message: error.message, meta: { code: (error as any).code, details: (error as any).details } },
    });
  }

  return res.status(200).json({ ok: true, data });
}
