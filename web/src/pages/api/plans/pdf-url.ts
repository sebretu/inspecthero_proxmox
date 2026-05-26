import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabaseServer";
import { requireRequesterProfile, isAdminRole } from "@/lib/requesterProfile";

type ApiOk = { ok: true; data: { signedUrl: string } };
type ApiErr = { ok: false; error: { code: string; message: string; meta?: any } };

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET" } });
  }

  const id = (req.query.id as string) || "";
  if (!id) {
    return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing query: id" } });
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

  const { data: plan, error: planError } = await supabase
    .from("plans")
    .select("id, project_id, floor_id, storage_bucket, storage_path")
    .eq("id", id)
    .maybeSingle();

  if (planError) {
    return res.status((planError as any).status || 400).json({
      ok: false,
      error: { code: "SUPABASE", message: planError.message, meta: { code: (planError as any).code, details: (planError as any).details } },
    });
  }

  if (!plan) {
    return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Plan not found" } });
  }

  if (!isAdmin) {
    const { data: taskAccess, error: taskAccessError } = await supabase
      .from("tasks")
      .select("id")
      .eq("plan_id", id)
      .eq("assigned_user_id", requester.id)
      .limit(1);

    if (taskAccessError) {
      return res.status((taskAccessError as any).status || 400).json({
        ok: false,
        error: {
          code: "SUPABASE",
          message: taskAccessError.message,
          meta: { code: (taskAccessError as any).code, details: (taskAccessError as any).details },
        },
      });
    }

    if (!taskAccess || taskAccess.length === 0) {
      return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "You do not have access to this plan" } });
    }
  }

  const adminClient = createServiceSupabaseClient();
  const { data: signed, error: signedError } = await adminClient.storage
    .from(plan.storage_bucket as string)
    .createSignedUrl(plan.storage_path as string, 60);

  if (signedError || !signed?.signedUrl) {
    return res.status((signedError as any)?.status || 500).json({
      ok: false,
      error: {
        code: "STORAGE",
        message: signedError?.message || "Unable to create signed URL",
        meta: { code: (signedError as any)?.code },
      },
    });
  }

  return res.status(200).json({ ok: true, data: { signedUrl: signed.signedUrl } });
}
