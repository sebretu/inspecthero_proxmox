import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { requireRequesterProfile } from "@/lib/requesterProfile";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

type ApiOk = { ok: true; data: any; meta?: any };
type ApiErr = { ok: false; error: { code: string; message: string; meta?: any } };

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Only POST allowed" } });
    return;
  }

  let supabase: any;
  let userId: string | null = null;
  try {
    ({ client: supabase, userId } = createServerSupabaseClient(req));
  } catch (e: any) {
    return res.status(401).json({ ok: false, error: { code: 'AUTH_INVALID', message: 'Missing Bearer token' } });
  }

  try {
    const p = await requireRequesterProfile(supabase, userId);
    if (p.role !== "ADMIN") {
      return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Admin access required" } });
    }
  } catch (err: any) {
    return res.status(err?.status || 403).json({
      ok: false,
      error: { code: err?.code || "PROFILE_ERROR", message: err?.message || "Unable to load profile" },
    });
  }

  const planId = req.query.id as string;
  if (!planId) {
    res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing plan ID" } });
    return;
  }

  const adminClient = getSupabaseAdminClient();
  const { data: planData, error } = await adminClient
    .from("plans")
    .select("storage_bucket, storage_path")
    .eq("id", planId)
    .single();

  if (error || !planData) {
    res.status(400).json({ ok: false, error: { code: "NOT_FOUND", message: "Plan not found" } });
    return;
  }

  const { data: activeVersion } = await adminClient
    .from("plan_versions")
    .select("file_url")
    .eq("plan_id", planId)
    .eq("status", "active")
    .maybeSingle();

  let storagePath = planData.storage_path;
  if (activeVersion?.file_url) {
    if (activeVersion.file_url.includes("/")) {
      storagePath = activeVersion.file_url;
    } else {
      const parts = planData.storage_path.split("/");
      parts.pop();
      parts.push(activeVersion.file_url);
      storagePath = parts.join("/");
    }
  }

  const pdfUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/authenticated/${planData.storage_bucket}/${storagePath}`;
  const supabaseToken = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const jobId = crypto.randomUUID();

  // Clear previous AI markers to prevent collision and duplication
  await adminClient
    .from("stromkreise")
    .delete()
    .eq("plan_id", planId)
    .contains("metadata", { is_ai_generated: true });

  // Trigger AI Parser Sidecar asynchronously (Fire-and-Forget)
  const sidecarUrl = process.env.SIDECAR_URL || "http://localhost:8001/parse";
  fetch(sidecarUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Sidecar-Token": process.env.SIDECAR_SECRET || "dev-secret-token"
    },
    body: JSON.stringify({
      plan_id: planId,
      pdf_url: pdfUrl,
      job_id: jobId,
      supabase_token: supabaseToken
    })
  }).catch(err => console.error("[Sidecar Hook] Error triggering sidecar:", err));

  res.status(200).json({ ok: true, data: { status: "accepted", job_id: jobId } });
}
