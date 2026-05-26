import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

type ApiOk = { ok: true; data: any; meta?: any };
type ApiErr = { ok: false; error: { code: string; message: string; meta?: any } };

function asInt(v: any, def: number) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : def;
}

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

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || null;

  // Ten klient (service/anon) używamy do GET/POST jak dotychczas.
  // PATCH robimy osobnym klientem “jako user” (Authorization Bearer), bo inaczej auth.uid() = null i trigger padnie.
  const supabase = createClient(url, service || anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // ------------------------
  // GET /api/tasks (list)
  // ------------------------
  if (req.method === "GET") {
    const projectId = String(req.query.projectId || "").trim();
    if (!projectId) {
      res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing query: projectId" } });
      return;
    }

    const planId = typeof req.query.planId === "string" ? req.query.planId.trim() : "";
    const limit = Math.min(Math.max(asInt(req.query.limit, 50) || 50, 1), 200);
    const offset = Math.max(asInt(req.query.offset, 0) || 0, 0);
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const status = typeof req.query.status === "string" ? req.query.status.trim() : "";

    let query = supabase
      .from("tasks")
      .select("*")
      .eq("project_id", projectId)
      .range(offset, offset + limit - 1)
      .order("created_at", { ascending: false });

    if (planId) query = query.eq("plan_id", planId);
    if (status) query = query.eq("status", status);
    if (q) query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`);

    const { data, error } = await query;

    if (error) {
      res.status((error as any).status || 400).json({
        ok: false,
        error: {
          code: "SUPABASE",
          message: error.message,
          meta: { code: (error as any).code, details: (error as any).details },
        },
      });
      return;
    }

    res.status(200).json({ ok: true, data: data ?? [], meta: { limit, offset, planId: planId || null } });
    return;
  }

  // ------------------------
  // POST /api/tasks (create)
  // ------------------------
  if (req.method === "POST") {
    const body = readJsonBody(req);

    const project_id = String(body?.project_id || "").trim();
    const plan_id = String(body?.plan_id || "").trim();
    const title = String(body?.title || "").trim();
    const description = body?.description == null ? null : String(body.description);

    const priority = String(body?.priority || "MEDIUM").trim();
    const status = String(body?.status || "OPEN").trim();

    const x_norm_raw = body?.x_norm;
    const y_norm_raw = body?.y_norm;
    const x_norm = typeof x_norm_raw === "number" ? x_norm_raw : Number(x_norm_raw);
    const y_norm = typeof y_norm_raw === "number" ? y_norm_raw : Number(y_norm_raw);

    if (!project_id) {
      res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing project_id" } });
      return;
    }
    if (!plan_id) {
      res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing plan_id" } });
      return;
    }
    if (!title) {
      res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing title" } });
      return;
    }
    if (!Number.isFinite(x_norm) || x_norm < 0 || x_norm > 1) {
      res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "x_norm must be number 0..1" } });
      return;
    }
    if (!Number.isFinite(y_norm) || y_norm < 0 || y_norm > 1) {
      res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "y_norm must be number 0..1" } });
      return;
    }

    // DEV: created_by z body (u Ciebie jest NOT NULL + FK)
    const created_by = body?.created_by ? String(body.created_by).trim() : "";
    if (!created_by || !isUuid(created_by)) {
      res.status(400).json({
        ok: false,
        error: { code: "BAD_REQUEST", message: "Missing created_by (DEV). Provide your profile UUID." },
      });
      return;
    }

    const payload: any = {
      project_id,
      plan_id,
      x_norm,
      y_norm,
      title,
      description,
      priority,
      status,
      created_by,
    };

    const { data, error } = await supabase.from("tasks").insert(payload).select("*").single();

    if (error) {
      res.status((error as any).status || 400).json({
        ok: false,
        error: {
          code: "SUPABASE",
          message: error.message,
          meta: { code: (error as any).code, details: (error as any).details },
        },
      });
      return;
    }

    res.status(200).json({ ok: true, data });
    return;
  }

  // ------------------------
  // PATCH /api/tasks (update)
  // ------------------------
  if (req.method === "PATCH") {
    const body = readJsonBody(req);

    const id = String(body?.id || "").trim();
    if (!id || !isUuid(id)) {
      res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing/invalid id (uuid)" } });
      return;
    }

    // 🔑 MUSI być JWT usera -> inaczej auth.uid() w triggerach = null -> task_history.changed_by wybucha
    const authHeader = String(req.headers.authorization || "").trim();
    if (!authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        ok: false,
        error: { code: "UNAUTHORIZED", message: "Missing Authorization: Bearer <access_token>" },
      });
      return;
    }

    // klient “w imieniu usera” (anon key + Authorization header)
    const supaUser = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: authHeader } },
    });

    const updates: any = {};
    if (body.title !== undefined) updates.title = String(body.title);
    if (body.description !== undefined) updates.description = body.description;
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.status !== undefined) updates.status = body.status;
    if (body.due_date !== undefined) updates.due_date = body.due_date || null;
    if (body.assigned_user_id !== undefined) updates.assigned_user_id = body.assigned_user_id || null;
    if (body.assigned_company_id !== undefined) updates.assigned_company_id = body.assigned_company_id || null;

    // (opcjonalnie) pozwól na przesuwanie na mapie
    if (body.x_norm !== undefined) updates.x_norm = body.x_norm;
    if (body.y_norm !== undefined) updates.y_norm = body.y_norm;
    if (body.plan_id !== undefined) updates.plan_id = body.plan_id;

    const { data, error } = await supaUser.from("tasks").update(updates).eq("id", id).select("*").single();

    if (error) {
      res.status((error as any).status || 400).json({
        ok: false,
        error: {
          code: "SUPABASE",
          message: error.message,
          meta: { code: (error as any).code, details: (error as any).details },
        },
      });
      return;
    }

    res.status(200).json({ ok: true, data });
    return;
  }

  res.setHeader("Allow", "GET, POST, PATCH");
  res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET, POST or PATCH" } });
}
