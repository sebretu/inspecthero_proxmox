import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { requireRequesterProfile, isAdminRole } from "@/lib/requesterProfile";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

type ApiOk = { ok: true; data: any };
type ApiErr = { ok: false; error: { code: string; message: string } };

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
  let supabase: any;
  let userId: string | null = null;
  try {
    ({ client: supabase, userId } = createServerSupabaseClient(req));
  } catch {
    return res.status(401).json({ ok: false, error: { code: "AUTH_INVALID", message: "Missing Bearer token" } });
  }

  let requester: { id: string; role: string | null };
  try {
    requester = await requireRequesterProfile(supabase, userId);
  } catch (err: any) {
    return res.status(err?.status || 403).json({ ok: false, error: { code: err?.code || "PROFILE_ERROR", message: err?.message || "Unable to load profile" } });
  }

  if (!isAdminRole(requester.role)) {
    return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Only admins can view activity reports" } });
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET" } });
  }

  const targetUserId = typeof req.query.userId === "string" ? req.query.userId.trim() : "";
  const dateFrom = typeof req.query.from === "string" ? req.query.from : "";
  const dateTo = typeof req.query.to === "string" ? req.query.to : "";

  if (!targetUserId) {
    return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing userId" } });
  }

  const admin = getSupabaseAdminClient();

  // Fetch all relevant history in parallel
  const taskQuery = admin.from("task_history").select("*, tasks(title)").eq("changed_by", targetUserId);
  const cableQuery = admin.from("cable_history").select("*, cables(name)").eq("user_id", targetUserId);
  const fehlerQuery = admin.from("fehler_history").select("*, fehler(title)").eq("changed_by", targetUserId);
  const attendanceQuery = admin.from("attendance").select("*").eq("user_id", targetUserId);
  const commentQuery = admin.from("task_comments").select("*, tasks(title)").eq("user_id", targetUserId);
  const stromkreisQuery = admin.from("stromkreis_history").select("*, stromkreise(circuit_code)").eq("changed_by", targetUserId);

  if (dateFrom) {
    taskQuery.gte("created_at", dateFrom);
    cableQuery.gte("created_at", dateFrom);
    fehlerQuery.gte("created_at", dateFrom);
    attendanceQuery.gte("date", dateFrom);
    commentQuery.gte("created_at", dateFrom);
    stromkreisQuery.gte("created_at", dateFrom);
  }
  if (dateTo) {
    taskQuery.lte("created_at", dateTo);
    cableQuery.lte("created_at", dateTo);
    fehlerQuery.lte("created_at", dateTo);
    attendanceQuery.lte("date", dateTo);
    commentQuery.lte("created_at", dateTo);
    stromkreisQuery.lte("created_at", dateTo);
  }

  const [tasks, cables, fehlers, attendance, comments, stromkreise] = await Promise.all([
    taskQuery.order("created_at", { ascending: false }).limit(500),
    cableQuery.order("created_at", { ascending: false }).limit(500),
    fehlerQuery.order("created_at", { ascending: false }).limit(500),
    attendanceQuery.order("date", { ascending: false }).limit(500),
    commentQuery.order("created_at", { ascending: false }).limit(500),
    stromkreisQuery.order("created_at", { ascending: false }).limit(500)
  ]);

  const activity = [
    ...(tasks.data || []).map(t => ({ ...t, type: 'task_history', timestamp: t.created_at, ref: t.tasks?.title })),
    ...(cables.data || []).map(c => ({ ...c, type: 'cable_history', timestamp: c.created_at, ref: c.cables?.name })),
    ...(fehlers.data || []).map(f => ({ ...f, type: 'fehler_history', timestamp: f.created_at, ref: f.fehler?.title })),
    ...(attendance.data || []).map(a => ({ ...a, type: 'attendance', timestamp: a.date, ref: `${a.status} ${a.start_time || ''}-${a.end_time || ''}` })),
    ...(comments.data || []).map(cm => ({ ...cm, type: 'comment', timestamp: cm.created_at, ref: cm.tasks?.title })),
    ...(stromkreise.data || []).map(sk => {
      let friendlyAction = sk.action;
      if (sk.action === "SUBMITTED") friendlyAction = `Submitted execution for sub-cable: ${sk.sub_cable || ''}`;
      else if (sk.action === "APPROVED") friendlyAction = `Approved execution for sub-cable: ${sk.sub_cable || ''}`;
      else if (sk.action === "REJECTED") friendlyAction = `Rejected execution for sub-cable: ${sk.sub_cable || ''}`;
      else if (sk.action === "UNDO_SUBMIT") friendlyAction = `Undid submission for sub-cable: ${sk.sub_cable || ''}`;
      else if (sk.action === "UNDO_APPROVE") friendlyAction = `Undid approval for sub-cable: ${sk.sub_cable || ''}`;

      return {
        ...sk,
        type: 'stromkreis_history',
        timestamp: sk.created_at,
        ref: sk.stromkreise?.circuit_code || 'Obwód',
        action: friendlyAction
      };
    })
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return res.status(200).json({ ok: true, data: activity });
}
