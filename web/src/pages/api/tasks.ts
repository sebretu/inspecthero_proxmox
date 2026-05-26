import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { requireRequesterProfile, isAdminRole } from "@/lib/requesterProfile";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

type ApiOk = { ok: true; data: any; meta?: any };
type ApiErr = { ok: false; error: { code: string; message: string; meta?: any } };

type NotificationSettings = {
  notify_on_create: boolean;
  notify_on_status: boolean;
  notify_on_assign: boolean;
};

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

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  notify_on_create: true,
  notify_on_status: true,
  notify_on_assign: true,
};

function getFunctionsBaseUrl() {
  if (process.env.SUPABASE_FUNCTIONS_URL) return process.env.SUPABASE_FUNCTIONS_URL;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  return supabaseUrl ? `${supabaseUrl}/functions/v1` : "";
}

async function sendNotificationEmail(input: { to: string; subject: string; html: string }) {
  const baseUrl = getFunctionsBaseUrl();
  if (!baseUrl) return;

  const authToken = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";
  if (!authToken) return;

  await fetch(`${baseUrl}/notify-task`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify(input),
  });
}

async function loadNotificationSettings(supabase: any, userId: string | null): Promise<NotificationSettings> {
  if (!userId) return DEFAULT_NOTIFICATION_SETTINGS;
  const { data } = await supabase.from("profiles").select("notification_settings").eq("id", userId).single();
  return (data as any)?.notification_settings || DEFAULT_NOTIFICATION_SETTINGS;
}

let cachedAdminClient: ReturnType<typeof getSupabaseAdminClient> | null = null;
function getAdminClientSafely() {
  if (cachedAdminClient) return cachedAdminClient;
  try {
    cachedAdminClient = getSupabaseAdminClient();
  } catch (err) {
    console.error("[tasks api] cannot init admin client", err);
    cachedAdminClient = null;
  }
  return cachedAdminClient;
}

async function ensureProjectMembership(projectId: string | null | undefined, userId: string | null | undefined, addedBy: string | null) {
  if (!projectId || !userId) return;
  const admin = getAdminClientSafely();
  if (!admin) return;
  try {
    await admin
      .from("project_members")
      .upsert(
        {
          project_id: projectId,
          user_id: userId,
          role: "USER",
          added_by: addedBy,
        },
        { onConflict: "project_id,user_id" }
      )
      .select("id")
      .single();
  } catch (err) {
    console.error("[tasks api] ensureProjectMembership failed", err);
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
  let supabase: any;
  let userId: string | null = null;

  try {
    ({ client: supabase, userId } = createServerSupabaseClient(req));
  } catch (e: any) {
    return res.status(401).json({ ok: false, error: { code: 'AUTH_INVALID', message: 'Missing Bearer token' } });
  }

  let requester: { id: string; role: string | null };
  try {
    requester = await requireRequesterProfile(supabase, userId);
  } catch (err: any) {
    return res.status(err?.status || 403).json({
      ok: false,
      error: {
        code: err?.code || "PROFILE_ERROR",
        message: err?.message || "Unable to load profile",
      },
    });
  }

  const isAdmin = isAdminRole(requester.role);
  console.log('[tasks api] User role check:', { userId: requester.id, role: requester.role, isAdmin });

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
    const excludeStatus = typeof req.query.excludeStatus === "string" ? req.query.excludeStatus.trim() : "";
    const priority = typeof req.query.priority === "string" ? req.query.priority.trim() : "";
    const assignedUserId = typeof req.query.assigned_user_id === "string" ? req.query.assigned_user_id.trim() : "";
    const dueFrom = typeof req.query.due_from === "string" ? req.query.due_from.trim() : "";
    const dueTo = typeof req.query.due_to === "string" ? req.query.due_to.trim() : "";
    const sort = typeof req.query.sort === "string" ? req.query.sort.trim() : "";
    const isQuestionStr = typeof req.query.is_question === "string" ? req.query.is_question.trim() : "";

    let query = supabase
      .from("tasks")
      .select("*")
      .eq("project_id", projectId)
      .range(offset, offset + limit - 1)
      .order("created_at", { ascending: false });

    if (planId) query = query.eq("plan_id", planId);
    if (status) query = query.eq("status", status as any);
    if (excludeStatus) query = query.neq("status", excludeStatus as any);
    if (priority) query = query.eq("priority", priority as any);
    if (isQuestionStr === "true") query = query.eq("is_question", true);
    else if (isQuestionStr === "false") query = query.eq("is_question", false);

    if (isAdmin) {
      // Admins can see everything, or filter by specific user if requested
      if (assignedUserId) query = query.eq("assigned_user_id", assignedUserId);
    } else {
      // Regular users: See tasks assigned to ONLY THEM or CREATED BY THEM
      // This ensures they see their own work and tasks delegated to them.
      // Note: we use .or() which creates a group of conditions.
      const uid = requester.id;
      query = query.or(`assigned_user_id.eq.${uid},created_by.eq.${uid}`);
    }
    if (dueFrom) query = query.gte("due_date", dueFrom);
    if (dueTo) query = query.lte("due_date", dueTo);
    if (q) query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`);

    if (sort === "due_asc") {
      query = query.order("due_date", { ascending: true, nullsFirst: false });
    } else if (sort === "due_desc") {
      query = query.order("due_date", { ascending: false, nullsFirst: false });
    } else if (sort === "priority_desc") {
      query = query.order("priority", { ascending: false });
    }

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
    const due_date_raw = body?.due_date;
    const due_date = due_date_raw == null ? null : String(due_date_raw).trim() || null;

    const priority = String(body?.priority || "MEDIUM").trim();
    const status = String(body?.status || "OPEN").trim();
    const is_question = Boolean(body?.is_question);
    const assigned_raw = typeof body?.assigned_user_id === "string" ? body.assigned_user_id.trim() : "";
    if (assigned_raw && !isUuid(assigned_raw)) {
      res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "assigned_user_id must be uuid" } });
      return;
    }

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

    // created_by = auth.uid() z JWT
    const created_by = userId;
    if (!created_by) {
      res.status(401).json({
        ok: false,
        error: { code: "AUTH_INVALID", message: "Cannot determine user from token" },
      });
      return;
    }

    const assigned_user_id = isAdmin || is_question ? assigned_raw || null : requester.id;
    if (!isAdmin && !assigned_user_id && !is_question) {
      res.status(403).json({
        ok: false,
        error: { code: "FORBIDDEN", message: "Only authenticated users can create tasks" },
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
      assigned_user_id,
      due_date,
      is_question,
    };

    const insertClient = isAdmin ? getAdminClientSafely() || supabase : supabase;
    const { data, error } = await insertClient.from("tasks").insert(payload).select("*").single();

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

    if (data?.assigned_user_id) {
      await ensureProjectMembership(project_id, data.assigned_user_id, created_by);
      const { data: profile } = await supabase
        .from("profiles")
        .select("email, notification_settings")
        .eq("id", data.assigned_user_id)
        .single();

      const settings = (profile as any)?.notification_settings || DEFAULT_NOTIFICATION_SETTINGS;
      if (profile?.email && settings.notify_on_create) {
        await sendNotificationEmail({
          to: profile.email,
          subject: "New task assigned",
          html: `<p>You have a new task: <b>${data.title}</b></p>`,
        });
      }
    }

    const creationHistoryClient = getAdminClientSafely();
    if (creationHistoryClient && data?.id) {
      try {
        await creationHistoryClient.from("task_history").insert({
          task_id: data.id,
          changed_by: created_by,
          action: "Task created",
          new_value: {
            title: data.title,
            description: data.description,
            status: data.status,
            priority: data.priority,
            due_date: data.due_date,
            assigned_user_id: data.assigned_user_id,
            is_question: data.is_question,
          },
        });
      } catch (historyErr) {
        console.error("[tasks api] failed to log creation history", historyErr);
      }
    } else if (!creationHistoryClient) {
      console.warn("[tasks api] cannot log creation history - admin client missing");
    }

    res.status(200).json({ ok: true, data });
    return;
  }

  // PATCH /api/tasks (update)
  if (req.method === "PATCH") {
    const body = readJsonBody(req);

    const id = String(body?.id || "").trim();
    if (!id || !isUuid(id)) {
      res.status(400).json({
        ok: false,
        error: { code: "BAD_REQUEST", message: "Missing/invalid id (uuid)" },
      });
      return;
    }

    // changed_by = auth.uid() z JWT
    const changed_by = userId;
    if (!changed_by) {
      res.status(401).json({
        ok: false,
        error: { code: "AUTH_INVALID", message: "Cannot determine user from token" },
      });
      return;
    }

    // patch jako jsonb (tylko pola, które chcesz zmienić)
    const patch: any = {};
    if (body.title !== undefined) {
      const nextTitle = String(body.title).trim();
      if (!nextTitle) {
        return res.status(400).json({
          ok: false,
          error: { code: "BAD_REQUEST", message: "Title cannot be empty" },
        });
      }
      patch.title = nextTitle;
    }
    if (body.description !== undefined) {
      if (body.description === null) {
        patch.description = null;
      } else {
        const nextDescription = String(body.description).trim();
        patch.description = nextDescription === "" ? null : nextDescription;
      }
    }
    if (body.priority !== undefined) patch.priority = String(body.priority);
    if (body.status !== undefined) patch.status = String(body.status);
    if (body.due_date !== undefined) {
      const rawDue = body.due_date;
      let due: string | null = null;
      if (rawDue !== null && rawDue !== undefined) {
        const str = String(rawDue).trim();
        due = str === "" ? null : str;
      }
      patch.due_date = due;
    }
    if (body.assigned_user_id !== undefined) {
      const assigned = typeof body.assigned_user_id === "string" ? body.assigned_user_id.trim() : "";
      patch.assigned_user_id = assigned ? assigned : null;
    }
    if (body.assigned_company_id !== undefined) {
      const assignedCompany = typeof body.assigned_company_id === "string" ? body.assigned_company_id.trim() : "";
      patch.assigned_company_id = assignedCompany ? assignedCompany : null;
    }
    if (body.is_question !== undefined) {
      patch.is_question = Boolean(body.is_question);
    }

    const patchKeys = Object.keys(patch);
    if (!isAdmin) {
      const allowedUserFields = new Set(["status", "priority", "due_date", "title", "description"]);
      const forbiddenFields = patchKeys.filter((field) => !allowedUserFields.has(field));
      if (forbiddenFields.length > 0) {
        return res.status(403).json({
          ok: false,
          error: { code: "FORBIDDEN", message: "Users can only update status, priority, due_date, title or description" },
        });
      }

      if (!patchKeys.some((field) => allowedUserFields.has(field))) {
        return res.status(400).json({
          ok: false,
          error: { code: "BAD_REQUEST", message: "No editable fields provided" },
        });
      }
    }

    try {
      const { data: prevTask, error: prevTaskError } = await supabase
        .from("tasks")
        .select("status, assigned_user_id, created_by, is_question, title, project_id, priority, due_date, assigned_company_id, description")
        .eq("id", id)
        .single();

      if (prevTaskError || !prevTask) {
        return res.status((prevTaskError as any)?.status || 404).json({
          ok: false,
          error: {
            code: "SUPABASE",
            message: prevTaskError?.message || "Task not found",
            meta: { code: (prevTaskError as any)?.code, details: (prevTaskError as any)?.details },
          },
        });
      }

      // Questions (is_question=true) can be edited by any authenticated user — they are not restricted to the assignee.
      // Regular tasks can be edited by the assigned user, the creator, or an admin.
      const isQuestion = Boolean(prevTask.is_question);
      console.log('[tasks api] Permission check:', { isAdmin, isQuestion, taskAssignedTo: prevTask.assigned_user_id, taskCreatedBy: prevTask.created_by, requesterId: requester.id });
      if (!isAdmin && !isQuestion && prevTask.assigned_user_id !== requester.id && prevTask.created_by !== requester.id) {
        console.log('[tasks api] BLOCKED: Non-admin trying to edit task not assigned to them and not created by them');
        return res.status(403).json({
          ok: false,
          error: { code: "FORBIDDEN", message: "You do not have access to this task" },
        });
      }
      console.log('[tasks api] Permission check PASSED');

      if (patch.status !== undefined) {
        const fromStatus = (prevTask.status || "").toUpperCase();
        const toStatus = String(patch.status || "").toUpperCase();

        if (!isAdmin) {
          const allowedTransitions: Record<string, string[]> = {
            OPEN: ["IN_PROGRESS", "DONE_WAITING_APPROVAL"],
            IN_PROGRESS: ["DONE_WAITING_APPROVAL"],
          };

          const sameStatus = fromStatus === toStatus;
          if (!sameStatus && !allowedTransitions[fromStatus]?.includes(toStatus)) {
            return res.status(403).json({
              ok: false,
              error: { code: "FORBIDDEN", message: "Status change not allowed" },
            });
          }
        }


        if (toStatus === "DONE_WAITING_APPROVAL") {
          const { data: afterPhotos, error: afterError } = await supabase
            .from("task_photos")
            .select("id")
            .eq("task_id", id)
            .eq("photo_type", "AFTER")
            .limit(1);

          if (afterError) {
            return res.status((afterError as any)?.status || 400).json({
              ok: false,
              error: {
                code: "SUPABASE",
                message: afterError.message,
                meta: { code: (afterError as any)?.code, details: (afterError as any)?.details },
              },
            });
          }

          if (!afterPhotos || afterPhotos.length === 0) {
            return res.status(400).json({
              ok: false,
              error: {
                code: "AFTER_PHOTO_REQUIRED",
                message: "Dodaj zdjęcie po wykonaniu pracy zanim zgłosisz zadanie do akceptacji.",
              },
            });
          }

          // Notify all admins in the project
          const { data: admins } = await supabase
            .from("profiles")
            .select("email, notification_settings")
            .eq("role", "ADMIN")
            .eq("company_id", prevTask.assigned_company_id || null);

          if (admins && Array.isArray(admins)) {
            for (const admin of admins) {
              const settings = (admin as any)?.notification_settings || DEFAULT_NOTIFICATION_SETTINGS;
              if (admin.email && settings.notify_on_status !== false) {
                await sendNotificationEmail({
                  to: admin.email,
                  subject: "Zadanie zgłoszone do akceptacji",
                  html: `<p>Użytkownik zgłosił zadanie <b>${prevTask.title}</b> do akceptacji.</p>`
                });
              }
            }
          }
        }

        patch.status = toStatus;
      }

      const { data, error } = await (supabase as any).rpc("update_task_api", {
        p_id: id,
        p_changed_by: changed_by,
        p_patch: patch,
      });

      if (error) throw error;

      const { data: nextTask } = await supabase
        .from("tasks")
        .select("status, assigned_user_id, title, project_id, priority, due_date, assigned_company_id, description")
        .eq("id", id)
        .single();

      const statusChanged = prevTask?.status && nextTask?.status && prevTask.status !== nextTask.status;
      const assignedChanged = prevTask?.assigned_user_id !== nextTask?.assigned_user_id;

      const trackedFields = [
        "title",
        "description",
        "status",
        "priority",
        "due_date",
        "assigned_user_id",
        "assigned_company_id",
      ] as const;

      const changedFields: string[] = [];
      const oldValue: Record<string, any> = {};
      const newValue: Record<string, any> = {};

      for (const field of trackedFields) {
        const before = (prevTask as any)?.[field] ?? null;
        const after = (nextTask as any)?.[field] ?? null;
        const same = before === after;
        if (same) continue;
        changedFields.push(field);
        oldValue[field] = before;
        newValue[field] = after;
      }

      if (changedFields.length > 0) {
        const adminClient = getAdminClientSafely();
        if (adminClient) {
          try {
            const fieldLabels: Record<string, string> = {
              title: "Title",
              description: "Description",
              status: "Status",
              priority: "Priority",
              due_date: "Due date",
              assigned_user_id: "Assignee",
              assigned_company_id: "Company",
            };

            const friendlyFields = changedFields.map((field) => fieldLabels[field] || field);

            let newAssigneeName = newValue.assigned_user_id;
            if (changedFields.includes("assigned_user_id") && newValue.assigned_user_id) {
              try {
                const { data: p } = await adminClient.from("profiles").select("full_name").eq("id", newValue.assigned_user_id).single();
                if (p?.full_name) newAssigneeName = p.full_name;
              } catch (e) { }
            }

            const preview = (value: any, max = 140) => {
              if (value === null || value === undefined) return "";
              const str = String(value).trim();
              if (!str) return "";
              return str.length > max ? `${str.slice(0, max)}...` : str;
            };

            const summaryParts: string[] = [];
            if (changedFields.includes("title")) {
              const titlePreview = preview(newValue.title, 80);
              summaryParts.push(titlePreview ? `Title -> ${titlePreview}` : "Title updated");
            }
            if (changedFields.includes("description")) {
              summaryParts.push(newValue.description ? `Description updated` : "Description cleared");
            }
            if (changedFields.includes("status")) {
              summaryParts.push(`Status -> ${newValue.status}`);
            }
            if (changedFields.includes("priority")) {
              summaryParts.push(`Priority -> ${newValue.priority}`);
            }
            if (changedFields.includes("due_date")) {
              summaryParts.push(newValue.due_date ? `Due date -> ${newValue.due_date}` : "Due date removed");
            }
            if (changedFields.includes("assigned_user_id")) {
              summaryParts.push(newValue.assigned_user_id ? `Assigned to ${newAssigneeName}` : "Unassigned");
            }

            const actionText = summaryParts.length
              ? summaryParts.join(" | ")
              : friendlyFields.length === 1
                ? `${friendlyFields[0]} updated`
                : `Updated ${friendlyFields.join(", ")}`;

            await adminClient.from("task_history").insert({
              task_id: id,
              changed_by,
              action: actionText,
              old_value: Object.keys(oldValue).length ? oldValue : null,
              new_value: Object.keys(newValue).length ? newValue : null,
            });
          } catch (historyErr) {
            console.error("[tasks api] failed to log history", historyErr);
          }
        } else {
          console.warn("[tasks api] cannot log history - admin client missing");
        }
      }

      if (assignedChanged && nextTask?.assigned_user_id) {
        await ensureProjectMembership(nextTask.project_id, nextTask.assigned_user_id, requester.id);
      }

      if (nextTask?.assigned_user_id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("email, notification_settings")
          .eq("id", nextTask.assigned_user_id)
          .single();

        const settings = (profile as any)?.notification_settings || DEFAULT_NOTIFICATION_SETTINGS;

        if (profile?.email && assignedChanged && settings.notify_on_assign) {
          await sendNotificationEmail({
            to: profile.email,
            subject: "Task assigned",
            html: `<p>You have been assigned: <b>${nextTask.title}</b></p>`,
          });
        }

        if (profile?.email && statusChanged && settings.notify_on_status) {
          await sendNotificationEmail({
            to: profile.email,
            subject: "Task status changed",
            html: `<p>Status updated for <b>${nextTask.title}</b>: ${prevTask?.status} -> ${nextTask.status}</p>`,
          });
        }
      }

      res.status(200).json({ ok: true, data });
      return;
    } catch (e: any) {
      res.status(400).json({
        ok: false,
        error: {
          code: "SUPABASE",
          message: e?.message || "Supabase error",
          meta: { code: e?.code, details: e?.details },
        },
      });
      return;
    }
  }

  // DELETE /api/tasks?id=...
  if (req.method === "DELETE") {
    if (!isAdmin) {
      res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Only admins can delete tasks" } });
      return;
    }

    const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
    if (!id || !isUuid(id)) {
      res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing or invalid id (uuid)" } });
      return;
    }

    const adminForDelete = getAdminClientSafely();
    const deleteClient = adminForDelete || supabase;

    const { error } = await deleteClient.from("tasks").delete().eq("id", id);
    if (error) {
      res.status(400).json({ ok: false, error: { code: "SUPABASE", message: error.message } });
      return;
    }

    res.status(200).json({ ok: true, data: { deleted: id } });
    return;
  }

  res.setHeader("Allow", "GET, POST, PATCH, DELETE");
  res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET, POST, PATCH or DELETE" } });
}
