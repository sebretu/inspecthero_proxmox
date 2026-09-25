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
    return res.status(401).json({ ok: false, error: { code: "AUTH_INVALID", message: "Missing Bearer token" } });
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

  const referencePlanId = req.body.reference_plan_id || null;

  let sidecarUrl = "http://localhost:8001/analyze";
  if (process.env.SIDECAR_URL) {
    try {
      const parsedUrl = new URL(process.env.SIDECAR_URL);
      if (parsedUrl.pathname === "/parse") {
        parsedUrl.pathname = "/analyze";
      } else if (!parsedUrl.pathname || parsedUrl.pathname === "/") {
        parsedUrl.pathname = "/analyze";
      }
      sidecarUrl = parsedUrl.toString();
    } catch (e) {
      console.error("Invalid SIDECAR_URL config, using fallback.", e);
    }
  }

  try {
    const response = await fetch(sidecarUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sidecar-Token": process.env.SIDECAR_SECRET || "dev-secret-token",
      },
      body: JSON.stringify({
        plan_id: planId,
        pdf_url: pdfUrl,
        reference_plan_id: referencePlanId,
        supabase_token: supabaseToken,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      res.status(502).json({
        ok: false,
        error: {
          code: "SIDECAR_ERROR",
          message: `Sidecar returned status ${response.status}: ${errorText}`,
        },
      });
      return;
    }

    const data = await response.json();
    res.status(200).json({ ok: true, data });
  } catch (err: any) {
    console.error("[Sidecar Hook] Error calling sidecar analyze:", err);
    res.status(500).json({
      ok: false,
      error: {
        code: "SERVER_ERROR",
        message: err.message || "Failed to communicate with the parsing sidecar",
      },
    });
  }
}
