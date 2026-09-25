import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { requireRequesterProfile, isAdminRole } from "@/lib/requesterProfile";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

type ApiOk = { ok: true; data: any };
type ApiErr = { ok: false; error: { code: string; message: string; meta?: any } };

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET" } });
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

  const id = (req.query.id as string) || (req.query.planId as string) || "";
  if (!id) return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing query: id or planId" } });

  // Use admin client to bypass RLS, ensuring users can see the plan details
  // even if they don't have tasks assigned to them yet.
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("plans")
    .select("id,project_id,floor_id,version,status,pdf_path,image_path,image_width,image_height,is_current,storage_bucket,storage_path,processing_error,created_at,updated_at,min_zoom,magnification, project:projects(name), floor:floors(name, building:buildings(name))")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return res.status((error as any).status || 400).json({
      ok: false,
      error: { code: "SUPABASE", message: error.message, meta: { code: (error as any).code, details: (error as any).details } },
    });
  }

  if (!data) {
    return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Plan not found" } });
  }

  // Removed restriction: users can now access any plan to create tasks.

  return res.status(200).json({ ok: true, data });
}
