import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs/promises";
import path from "path";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { requireRequesterProfile, isAdminRole } from "@/lib/requesterProfile";

type ApiOk = { ok: true; data: any };
type ApiErr = { ok: false; error: { code: string; message: string; meta?: any } };

function getBearer(req: NextApiRequest) {
  const auth = (req.headers.authorization || "").trim();
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  return auth.slice(7).trim() || null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
  if (req.method !== "GET" && req.method !== "DELETE" && req.method !== "PATCH") {
    res.setHeader("Allow", "GET, DELETE, PATCH");
    return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET, DELETE or PATCH" } });
  }

  let supabase: any;
  let userId: string | null = null;
  try {
    ({ client: supabase, userId } = createServerSupabaseClient(req));
  } catch (e: any) {
    return res.status(401).json({ ok: false, error: { code: "AUTH_INVALID", message: "Missing Bearer token" } });
  }

  let requester: { id: string; role: string | null };
  try {
    requester = await requireRequesterProfile(supabase, userId);
  } catch (err: any) {
    return res.status(err?.status || 403).json({
      ok: false,
      error: { code: err?.code || "PROFILE_ERROR", message: err?.message || "Unable to load profile" },
    });
  }

  const isAdmin = isAdminRole(requester.role);

  if (req.method === "DELETE") {
    if (!isAdmin) {
      return res.status(403).json({
        ok: false,
        error: { code: "FORBIDDEN", message: "Only admins can delete plans" },
      });
    }
    return handleDelete(req, res);
  }

  if (req.method === "PATCH") {
    if (!isAdmin) {
      return res.status(403).json({
        ok: false,
        error: { code: "FORBIDDEN", message: "Only admins can update plans" },
      });
    }
    return handlePatch(req, res);
  }

  const projectId = (req.query.projectId as string) || "";
  if (!projectId) return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing query: projectId" } });

  const floorId = (req.query.floorId as string) || undefined;
  const onlyCurrent = ((req.query.current as string) || "").toLowerCase() === "true";

  // Utilize admin client to ensure users can see ALL plans for the project,
  // bypassing RLS which might restrict them to only plans they are assigned to.
  // Ideally we should check project membership here.
  const admin = getSupabaseAdminClient();
  let q = admin
    .from("plans")
    .select("*, floors(name, buildings(name))")
    .eq("project_id", projectId);

  if (floorId) q = q.eq("floor_id", floorId);
  if (onlyCurrent) q = q.eq("is_current", true);

  const { data, error } = await q.order("created_at", { ascending: false });

  if (error) {
    return res.status((error as any).status || 400).json({
      ok: false,
      error: { code: "SUPABASE", message: error.message, meta: { code: (error as any).code, details: (error as any).details } },
    });
  }

  return res.status(200).json({ ok: true, data: data ?? [] });
}

async function handleDelete(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
  const planId = (req.query.id as string) || (req.body && (req.body as any).id) || "";
  if (!planId) {
    return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing plan id" } });
  }

  let admin: ReturnType<typeof getSupabaseAdminClient>;
  try {
    admin = getSupabaseAdminClient();
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: { code: "CONFIG", message: e?.message || "Admin client error" } });
  }

  const { data: plan, error: planError } = await admin
    .from("plans")
    .select("id,project_id,floor_id,storage_bucket,storage_path")
    .eq("id", planId)
    .maybeSingle();

  if (planError) {
    return res.status((planError as any).status || 400).json({
      ok: false,
      error: {
        code: "SUPABASE",
        message: planError.message,
        meta: { code: (planError as any).code, details: (planError as any).details },
      },
    });
  }

  if (!plan) {
    return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Plan not found" } });
  }

  const { error: deleteTasksError } = await admin.from("tasks").delete().eq("plan_id", planId);
  if (deleteTasksError) {
    const err = deleteTasksError as any;
    return res.status(err?.status || 400).json({
      ok: false,
      error: { code: "SUPABASE", message: deleteTasksError.message, meta: { code: err?.code, details: err?.details } },
    });
  }

  const deleteResult = await admin.from("plans").delete().eq("id", planId);
  if (deleteResult.error) {
    const err = deleteResult.error as any;
    return res.status(err?.status || 400).json({
      ok: false,
      error: { code: "SUPABASE", message: deleteResult.error.message, meta: { code: err?.code, details: err?.details } },
    });
  }

  if (plan.storage_bucket && plan.storage_path) {
    await admin.storage.from(plan.storage_bucket).remove([plan.storage_path]).catch(() => { });
  }

  const tilesDir = path.join(process.cwd(), "private_tiles", planId);
  await fs.rm(tilesDir, { recursive: true, force: true }).catch(() => { });

  const { data: replacement, error: replacementError } = await admin
    .from("plans")
    .select("id")
    .eq("project_id", plan.project_id)
    .eq("floor_id", plan.floor_id)
    .order("version", { ascending: false })
    .limit(1);

  if (!replacementError && replacement?.[0]) {
    await admin.from("plans").update({ is_current: true }).eq("id", replacement[0].id);
  }

  return res.status(200).json({ ok: true, data: { id: planId } });
}

async function handlePatch(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const { id, ...updates } = body;

  if (!id) {
    return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing id" } });
  }

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.from("plans").update(updates).eq("id", id).select("*").single();

  if (error) {
    return res.status(400).json({ ok: false, error: { code: "SUPABASE", message: error.message } });
  }

  return res.status(200).json({ ok: true, data });
}
