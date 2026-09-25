import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { requireRequesterProfile, isAdminRole } from "@/lib/requesterProfile";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "1mb",
    },
  },
};

type ApiOk = { ok: true; data: any; meta?: any };
type ApiErr = { ok: false; error: { code: string; message: string; meta?: any } };

function readJsonBody(req: NextApiRequest): any {
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }
  return req.body;
}

function bad(res: NextApiResponse<ApiOk | ApiErr>, message: string, meta?: any) {
  return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message, meta } });
}

function supaErr(res: NextApiResponse<ApiOk | ApiErr>, error: any) {
  return res.status(error?.status || 400).json({
    ok: false,
    error: {
      code: "SUPABASE",
      message: error?.message || "supabase error",
      meta: { code: error?.code, details: error?.details },
    },
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
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

  async function ensureTaskAccess(taskId: string) {
    if (isAdmin) return;
    const { data, error } = await supabase
      .from("tasks")
      .select("assigned_user_id, created_by, is_question")
      .eq("id", taskId)
      .single();

    if (error) {
      throw {
        status: (error as any).status || 400,
        code: (error as any).code || "SUPABASE",
        message: error.message,
        meta: { code: (error as any).code, details: (error as any).details },
      };
    }

    // Questions are open to all authenticated users — skip assignee check.
    if (data?.is_question) return;

    if (data?.assigned_user_id !== requester.id && data?.created_by !== requester.id) {
      throw { status: 403, code: "FORBIDDEN", message: "You do not have access to this task" };
    }
  }

  // GET /api/task-comments?taskId=...
  if (req.method === "GET") {
    const taskId = String(req.query.taskId || "").trim();
    if (!taskId) return bad(res, "Missing query: taskId");

    try {
      await ensureTaskAccess(taskId);
    } catch (err: any) {
      const status = err?.status || 400;
      return res.status(status).json({ ok: false, error: { code: err?.code || "FORBIDDEN", message: err?.message || "Access denied", meta: err?.meta } });
    }

    const { data, error } = await (supabase as any)
      .from("task_comments")
      .select("id, task_id, user_id, comment, created_at")
      .eq("task_id", taskId)
      .order("created_at", { ascending: true });

    if (error) return supaErr(res, error);
    return res.status(200).json({ ok: true, data: data ?? [] });
  }

  // POST /api/task-comments
  // body: { task_id, comment }
  if (req.method === "POST") {
    const body = readJsonBody(req);

    const task_id = String(body?.task_id || "").trim();
    const comment = String(body?.comment || "").trim();

    if (!task_id) return bad(res, "Missing task_id");
    if (!userId) return bad(res, "Cannot determine user from token");
    if (!comment) return bad(res, "Missing comment");

    try {
      await ensureTaskAccess(task_id);
    } catch (err: any) {
      const status = err?.status || 400;
      return res.status(status).json({ ok: false, error: { code: err?.code || "FORBIDDEN", message: err?.message || "Access denied", meta: err?.meta } });
    }

    const ins = await (supabase as any)
      .from("task_comments")
      .insert({
        task_id,
        user_id: userId,
        comment,
      } as any)
      .select("*")
      .single();

    if (ins.error) return supaErr(res, ins.error);

    return res.status(200).json({ ok: true, data: ins.data });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET or POST" } });
}
