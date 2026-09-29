import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !service) {
  console.error("Missing env vars: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const targetUserId = 'd26bd143-c58a-4a65-8285-072c7599637b'; // Christian Thiele

  // Fetch all relevant history in parallel
  const taskQuery = admin.from("task_history").select("*, tasks(title)").eq("changed_by", targetUserId);
  const cableQuery = admin.from("cable_history").select("*, cables(name)").eq("user_id", targetUserId);
  const fehlerQuery = admin.from("fehler_history").select("*, fehler(title)").eq("changed_by", targetUserId);
  const attendanceQuery = admin.from("attendance").select("*").eq("user_id", targetUserId);
  const commentQuery = admin.from("task_comments").select("*, tasks(title)").eq("user_id", targetUserId);
  const stromkreisQuery = admin.from("stromkreis_history").select("*, stromkreise(circuit_code)").eq("changed_by", targetUserId);

  const [tasks, cables, fehlers, attendance, comments, stromkreise] = await Promise.all([
    taskQuery.order("created_at", { ascending: false }).limit(500),
    cableQuery.order("created_at", { ascending: false }).limit(500),
    fehlerQuery.order("created_at", { ascending: false }).limit(500),
    attendanceQuery.order("date", { ascending: false }).limit(500),
    commentQuery.order("created_at", { ascending: false }).limit(500),
    stromkreisQuery.order("created_at", { ascending: false }).limit(500)
  ]);

  if (stromkreise.error) {
    console.error("stromkreisQuery error:", stromkreise.error);
  }

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

  console.log("Activity items fetched:", activity.length);
  console.log("Stromkreis history items in activity list:", activity.filter(a => a.type === 'stromkreis_history'));
}

main().catch(err => {
  console.error("Unhandled exception:", err);
});
