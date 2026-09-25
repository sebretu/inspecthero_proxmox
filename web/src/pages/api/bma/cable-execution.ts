import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { requireRequesterProfile } from "@/lib/requesterProfile";
import { sendBmaCableApprovalRequest } from "@/lib/telegram";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let supabase: any;
  let userId: string | null = null;

  try {
    ({ client: supabase, userId } = createServerSupabaseClient(req));
  } catch (e: any) {
    return res.status(401).json({ ok: false, error: { code: 'AUTH_INVALID', message: 'Missing Bearer token' } });
  }

  let profile: any;
  try {
    profile = await requireRequesterProfile(supabase, userId);
  } catch (err: any) {
    return res.status(err?.status || 403).json({
      ok: false,
      error: { code: err?.code || "PROFILE_ERROR", message: err?.message || "Unable to load profile" },
    });
  }

  const connectionId = req.body.connectionId || req.body.id || (req.query.connectionId as string);

  if (!connectionId) {
    return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing connectionId" } });
  }

  const admin = getSupabaseAdminClient();

  // Fetch the current cable connection
  const { data: connection, error: fetchErr } = await admin
    .from("bma_connections")
    .select("*, projects(name)")
    .eq("id", connectionId)
    .single();

  if (fetchErr || !connection) {
    console.error("[bma cable-execution API] Error fetching connection:", fetchErr);
    return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Cable connection not found" } });
  }

  const metadata = connection.metadata || {};
  const now = new Date().toISOString();
  const userName = profile.full_name || profile.email || "Unknown User";

  // POST: Submit cable execution for approval
  if (req.method === "POST") {
    if (metadata.execution_status === "PENDING_APPROVAL" || metadata.execution_status === "APPROVED") {
      return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Cable execution already submitted or approved" } });
    }

    const history = metadata.execution_history || [];
    history.push({ action: "SUBMITTED", timestamp: now, user: userName });

    metadata.execution_status = "PENDING_APPROVAL";
    metadata.submitted_by = userName;
    metadata.submitted_at = now;
    metadata.execution_history = history;

    const { data: updatedData, error: updErr } = await admin
      .from("bma_connections")
      .update({ metadata })
      .eq("id", connectionId)
      .select("*")
      .single();

    if (updErr) {
      return res.status(500).json({ ok: false, error: { code: "SUPABASE", message: updErr.message } });
    }

    // Send Telegram Notification to Admin
    const cableName = metadata.cable_number || connection.name || "Kabel";
    const projectName = connection.projects?.name || "Projekt";
    let planName = "Plan";
    if (metadata.plan_id) {
      const { data: planData } = await admin
        .from("plans")
        .select("version, floors(name)")
        .eq("id", metadata.plan_id)
        .maybeSingle();
      const floorName = (planData?.floors as any)?.name;
      if (floorName) {
        planName = `${floorName} (v${planData?.version})`;
      }
    }

    sendBmaCableApprovalRequest(connectionId, cableName, projectName, planName, userName).catch(err => {
      console.error("[bma cable-execution API] Telegram notification failed:", err);
    });

    return res.status(200).json({ ok: true, connection: updatedData });
  }

  // PATCH: Admin approve / reject cable execution
  if (req.method === "PATCH") {
    const isAdmin = profile.role === "ADMIN";
    if (!isAdmin) {
      return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Admin authorization required" } });
    }

    const { action } = req.body; // 'APPROVED' or 'REJECTED' or 'approve' or 'reject'
    const actionUpper = typeof action === "string" ? action.toUpperCase() : "";
    const isApprove = actionUpper === "APPROVED" || actionUpper === "APPROVE";

    const history = metadata.execution_history || [];

    if (isApprove) {
      metadata.execution_status = "APPROVED";
      metadata.approved_by = userName;
      metadata.approved_at = now;
      history.push({ action: "APPROVED", timestamp: now, user: userName });
    } else {
      metadata.execution_status = "REJECTED";
      metadata.rejected_by = userName;
      metadata.rejected_at = now;
      history.push({ action: "REJECTED", timestamp: now, user: userName });
    }
    metadata.execution_history = history;

    const { data: updatedData, error: updErr } = await admin
      .from("bma_connections")
      .update({ metadata })
      .eq("id", connectionId)
      .select("*")
      .single();

    if (updErr) {
      return res.status(500).json({ ok: false, error: { code: "SUPABASE", message: updErr.message } });
    }

    return res.status(200).json({ ok: true, connection: updatedData });
  }

  // DELETE: User undo submission or Admin undo approval
  if (req.method === "DELETE") {
    const isAdmin = profile.role === "ADMIN";
    const currentStatus = metadata.execution_status;

    if (currentStatus === "APPROVED" && !isAdmin) {
      return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Cannot undo approved execution" } });
    }

    const history = metadata.execution_history || [];
    history.push({ action: "WITHDRAWN", timestamp: now, user: userName });

    metadata.execution_status = "NOT_SUBMITTED";
    delete metadata.submitted_by;
    delete metadata.submitted_at;
    metadata.execution_history = history;

    const { data: updatedData, error: updErr } = await admin
      .from("bma_connections")
      .update({ metadata })
      .eq("id", connectionId)
      .select("*")
      .single();

    if (updErr) {
      return res.status(500).json({ ok: false, error: { code: "SUPABASE", message: updErr.message } });
    }

    return res.status(200).json({ ok: true, connection: updatedData });
  }

  res.setHeader("Allow", "POST, PATCH, DELETE");
  return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } });
}
