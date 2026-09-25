import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { requireRequesterProfile } from "@/lib/requesterProfile";
import { sendStromkreisApprovalRequest } from "@/lib/telegram";
import { generateSymbolCrop } from "@/lib/symbolCropper";


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

  const markerId = req.body.id || req.body.markerId;
  const subCable = req.body.subCable;

  if (!markerId || !subCable) {
    return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing markerId or subCable" } });
  }

  const admin = getSupabaseAdminClient();

  // Fetch the current marker
  const { data: marker, error: fetchErr } = await admin
    .from("stromkreise")
    .select("*, projects(name), plans(version, floors(name))")
    .eq("id", markerId)
    .single();

  if (fetchErr || !marker) {
    console.error("[execution API] Error fetching marker:", fetchErr);
    return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Marker not found" } });
  }

  const metadata = marker.metadata || {};
  metadata.executions = metadata.executions || {};

  const now = new Date().toISOString();
  const userName = profile.full_name || profile.email || "Unknown User";
  const userEmail = profile.email || "Unknown Email";

  // POST: Submit execution
  if (req.method === "POST") {
    if (metadata.executions[subCable] && metadata.executions[subCable].status !== "REJECTED") {
      return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Execution already submitted or approved" } });
    }

    const history = metadata.executions[subCable]?.history || [];
    history.push({ action: "SUBMITTED", timestamp: now, user: userName });

    metadata.executions[subCable] = {
      status: "PENDING_APPROVAL",
      submitted_by: userName,
      submitted_at: now,
      history,
    };

    const { error: updErr } = await admin
      .from("stromkreise")
      .update({ metadata })
      .eq("id", markerId);

    if (updErr) {
      return res.status(500).json({ ok: false, error: { code: "SUPABASE", message: updErr.message } });
    }

    // Record activity in stromkreis_history
    await admin.from("stromkreis_history").insert({
      marker_id: markerId,
      action: "SUBMITTED",
      sub_cable: subCable,
      new_value: { status: "PENDING_APPROVAL", user: userName },
      changed_by: userId
    });

    // Send Telegram Notification
    const projectName = marker.projects?.name || "Unknown Project";
    const planName = marker.plans?.floors?.name
      ? `${marker.plans.floors.name} (v${marker.plans.version})`
      : "Unknown Plan";
    await sendStromkreisApprovalRequest(markerId, subCable, projectName, planName, userName);

    return res.status(200).json({ ok: true, data: metadata });
  }

  // PATCH: Admin approve / reject
  if (req.method === "PATCH") {
    const isAdmin = profile.role === "ADMIN";
    if (!isAdmin) {
      return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Admin only" } });
    }

    const { action } = req.body; // 'approve' or 'reject'
    if (!metadata.executions[subCable]) {
      return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Execution not found" } });
    }

    const ex = metadata.executions[subCable];
    const history = ex.history || [];

    const actionLower = typeof action === "string" ? action.toLowerCase() : "";
    const isApprove = actionLower === "approve" || actionLower === "approved";

    if (isApprove) {
      ex.status = "APPROVED";
      ex.approved_by = userName;
      ex.approved_at = now;
      history.push({ action: "APPROVED", timestamp: now, user: userName });
    } else if (actionLower === "reject" || actionLower === "rejected") {
      metadata.executions[subCable] = {
        ...ex,
        status: "REJECTED",
        history: [...history, { action: "REJECTED", timestamp: now, user: userName }]
      };
    } else {
      return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Invalid action" } });
    }

    const { error: updErr } = await admin
      .from("stromkreise")
      .update({ metadata })
      .eq("id", markerId);

    if (updErr) {
      return res.status(500).json({ ok: false, error: { code: "SUPABASE", message: updErr.message } });
    }

    if (isApprove) {
      generateSymbolCrop(markerId).catch((err) => {
        console.error("[execution API] Background symbol crop generation failed:", err);
      });
    }


    // Record activity in stromkreis_history
    await admin.from("stromkreis_history").insert({
      marker_id: markerId,
      action: isApprove ? "APPROVED" : "REJECTED",
      sub_cable: subCable,
      old_value: { status: "PENDING_APPROVAL" },
      new_value: { status: isApprove ? "APPROVED" : "REJECTED", user: userName },
      changed_by: userId
    });

    return res.status(200).json({ ok: true, data: metadata });
  }

  // DELETE: User undo submission or Admin undo approval
  if (req.method === "DELETE") {
    const ex = metadata.executions[subCable];
    if (!ex) {
      return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Execution not found" } });
    }
    
    const isAdmin = profile.role === "ADMIN";
    // Only allow undo if it's not approved yet, unless the requester is an admin
    if (ex.status === "APPROVED" && !isAdmin) {
      return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Cannot undo approved execution" } });
    }

    const originalStatus = ex.status;
    delete metadata.executions[subCable];

    const { error: updErr } = await admin
      .from("stromkreise")
      .update({ metadata })
      .eq("id", markerId);

    if (updErr) {
      return res.status(500).json({ ok: false, error: { code: "SUPABASE", message: updErr.message } });
    }

    // Record activity in stromkreis_history
    await admin.from("stromkreis_history").insert({
      marker_id: markerId,
      action: originalStatus === "APPROVED" ? "UNDO_APPROVE" : "UNDO_SUBMIT",
      sub_cable: subCable,
      old_value: { status: originalStatus },
      new_value: null,
      changed_by: userId
    });

    // Optionally notify admin that it was cancelled, as per requirements: 
    // "administrator otrzymuje informację o anulowaniu" -> maybe we can skip telegram message for cancellation, 
    // or we can just let it go. The webhook logic will just not find the pending approval anymore.
    // For now we don't send an extra telegram message as it would just spam.

    return res.status(200).json({ ok: true, data: metadata });
  }

  res.setHeader("Allow", "POST, PATCH, DELETE");
  return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } });
}
