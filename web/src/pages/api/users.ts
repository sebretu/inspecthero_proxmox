import { createServerSupabaseClient, isAuthRequiredError } from "@/lib/supabaseServer";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { NextApiRequest, NextApiResponse } from "next";
import { randomUUID } from "crypto";

type ApiOk<T> = { ok: true; data: T };
type ApiErr = { ok: false; error: { message: string; code?: string; meta?: any } };

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

async function confirmUserEmail(adminClient: ReturnType<typeof getSupabaseAdminClient>, userId: string) {
  await adminClient.auth.admin
    .updateUserById(userId, {
      email_confirm: true,
    })
    .catch((e) => {
      console.error("Failed to confirm auth email", e?.message || e);
    });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiOk<any> | ApiErr>
) {
  try {
    const { client, userId } = await createServerSupabaseClient(req);

    if (req.method === "GET") {
      const includeInactive = req.query.includeInactive === "true";

      let query = client
        .from("profiles")
        .select("id, full_name, email, role, company_id, is_active, created_at, has_vde_access, project_members!user_id(project_id)");

      if (!includeInactive) {
        query = query.eq("is_active", true);
      }

      const { data, error } = await query.order("created_at", { ascending: false });

      if (error) {
        return res.status(400).json({ ok: false, error: { message: error.message, code: error.code, meta: error.details } });
      }

      const formatted = (data || []).map((u: any) => ({
        ...u,
        project_ids: (u.project_members || []).map((pm: any) => pm.project_id),
      }));

      return res.status(200).json({ ok: true, data: formatted });
    }

    if (req.method === "POST") {
      const { email, full_name, company_id, role, password, project_id, project_ids, project_role, has_vde_access } = req.body || {};

      if (!email || !full_name) {
        return res.status(400).json({ ok: false, error: { message: "Email and full_name are required", code: "BAD_REQUEST" } });
      }

      const trimmedPassword = typeof password === "string" ? password.trim() : "";
      if (!trimmedPassword || trimmedPassword.length < 8) {
        return res.status(400).json({ ok: false, error: { message: "Password must be at least 8 characters", code: "BAD_REQUEST" } });
      }

      if (!userId) {
        return res.status(401).json({ ok: false, error: { message: "Missing auth user", code: "AUTH_INVALID" } });
      }

      const { data: requester, error: requesterError } = await client
        .from("profiles")
        .select("id, role")
        .eq("id", userId)
        .single();

      if (requesterError) {
        return res.status((requesterError as any).status || 400).json({
          ok: false,
          error: { message: requesterError.message, code: requesterError.code, meta: requesterError.details },
        });
      }

      if (requester?.role !== "ADMIN") {
        return res.status(403).json({ ok: false, error: { message: "Only admins can invite users", code: "FORBIDDEN" } });
      }

      const trimmedProjectId = typeof project_id === "string" ? project_id.trim() : "";
      const shouldAttachProject = trimmedProjectId.length > 0;
      if (shouldAttachProject && !isUuid(trimmedProjectId)) {
        return res.status(400).json({ ok: false, error: { message: "Invalid project_id", code: "BAD_REQUEST" } });
      }

      const normalizedProjectRole = typeof project_role === "string" && project_role.trim().length > 0
        ? project_role.trim().toUpperCase()
        : "USER";
      const allowedProjectRoles = new Set(["ADMIN", "MODERATOR", "USER"]);
      const projectRoleToUse = allowedProjectRoles.has(normalizedProjectRole) ? normalizedProjectRole : "USER";

      const adminClient = getSupabaseAdminClient();

      let authUserId: string | null = null;
      const createRes = await adminClient.auth.admin.createUser({
        email,
        password: trimmedPassword,
        email_confirm: true,
        user_metadata: { full_name },
      });

      if (createRes.error) {
        if (createRes.error.message?.toLowerCase().includes("already registered") || createRes.error.message?.toLowerCase().includes("already exists")) {
          const { data: userList } = await adminClient.auth.admin.listUsers();
          const existingUser = userList?.users.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
          authUserId = existingUser?.id || null;
          if (!authUserId) {
            return res.status(400).json({ ok: false, error: { message: "User already exists", code: "USER_EXISTS" } });
          }
          await adminClient.auth.admin.updateUserById(authUserId, {
            email_confirm: true,
            user_metadata: { full_name },
            password: trimmedPassword,
          });
        } else {
          return res.status((createRes.error as any).status || 400).json({
            ok: false,
            error: { message: createRes.error.message, code: createRes.error.status ? String(createRes.error.status) : "AUTH" },
          });
        }
      } else {
        authUserId = createRes.data?.user?.id || null;
      }

      if (!authUserId) {
        return res.status(500).json({ ok: false, error: { message: "Unable to determine auth user id", code: "AUTH_USER" } });
      }

      const { data, error } = await adminClient
        .from("profiles")
        .upsert(
          {
            id: authUserId,
            email,
            full_name,
            role: role || "USER",
            company_id: company_id || null,
            is_active: true,
            has_vde_access: !!has_vde_access,
          },
          { onConflict: "id" }
        )
        .select("id, full_name, email, role, company_id, is_active, created_at, has_vde_access")
        .single();

      if (error) {
        return res.status(400).json({ ok: false, error: { message: error.message, code: error.code, meta: error.details } });
      }

      const projectIdsToAttach = Array.isArray(project_ids) ? project_ids : (project_id ? [project_id] : []);
      if (projectIdsToAttach.length > 0) {
        const memberEntries = projectIdsToAttach.map(pid => ({
          project_id: pid,
          user_id: authUserId,
          role: projectRoleToUse,
          added_by: userId,
        }));

        const { error: memberError } = await adminClient
          .from("project_members")
          .upsert(memberEntries, { onConflict: "project_id,user_id" });

        if (memberError) {
          console.error("[users api] project member insert failed:", memberError);
          // Non-blocking for the user creation, but we log it
        }
      }

      await confirmUserEmail(adminClient, authUserId);

      return res.status(201).json({ ok: true, data });
    }

    if (req.method === "DELETE") {
      const targetId = typeof req.query.id === "string" ? req.query.id.trim() : "";

      if (!targetId || !isUuid(targetId)) {
        return res.status(400).json({
          ok: false,
          error: { message: "Missing or invalid user id", code: "BAD_REQUEST" },
        });
      }

      if (!userId) {
        return res.status(401).json({ ok: false, error: { message: "Missing auth user", code: "AUTH_INVALID" } });
      }

      const { data: requester, error: requesterError } = await client
        .from("profiles")
        .select("id, role")
        .eq("id", userId)
        .single();

      if (requesterError) {
        return res.status(requesterError.status || 400).json({
          ok: false,
          error: { message: requesterError.message, code: requesterError.code, meta: requesterError.details },
        });
      }

      if (requester?.role !== "ADMIN") {
        return res.status(403).json({ ok: false, error: { message: "Only admins can delete users", code: "FORBIDDEN" } });
      }

      if (targetId === userId) {
        return res.status(400).json({ ok: false, error: { message: "You cannot delete your own account", code: "SELF_DELETE" } });
      }

      const adminClient = getSupabaseAdminClient();

      const { data: targetProfile, error: targetProfileError } = await adminClient
        .from("profiles")
        .select("id, full_name, email, role, company_id, is_active, created_at")
        .eq("id", targetId)
        .single();

      if (targetProfileError) {
        return res.status((targetProfileError as any).status || 400).json({
          ok: false,
          error: { message: targetProfileError.message, code: targetProfileError.code, meta: targetProfileError.details },
        });
      }

      await adminClient.from("project_members").delete().eq("user_id", targetId);

      const scrubbedEmail = `deleted+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.invalid`;
      let softDeleted = false;

      const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(targetId);
      if (authDeleteError) {
        const normalizedMessage = authDeleteError.message?.toLowerCase() || "";
        const isCascadeFailure =
          normalizedMessage.includes("database error deleting user") || authDeleteError.code === "unexpected_failure";

        if (!isCascadeFailure) {
          return res.status((authDeleteError as any).status || 400).json({
            ok: false,
            error: { message: authDeleteError.message || "Failed to delete auth user", code: authDeleteError.code || "AUTH_DELETE" },
          });
        }

        softDeleted = true;

        const { error: profileUpdateError } = await adminClient
          .from("profiles")
          .update({
            email: scrubbedEmail,
            full_name: "Deleted User",
            company_id: targetProfile.company_id,
            is_active: false,
            updated_at: new Date().toISOString(),
          })
          .eq("id", targetId);

        if (profileUpdateError) {
          return res.status((profileUpdateError as any).status || 400).json({
            ok: false,
            error: { message: profileUpdateError.message, code: profileUpdateError.code, meta: profileUpdateError.details },
          });
        }

        const bannedUntil = new Date("9999-12-31T23:59:59.000Z").toISOString();
        const randomPassword = `x_${randomUUID().replace(/-/g, "")}`;
        const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(targetId, {
          email: scrubbedEmail,
          password: randomPassword,
          email_confirm: false,
          banned_until: bannedUntil,
          user_metadata: { full_name: "Deleted User" },
        } as any);

        if (authUpdateError) {
          return res.status((authUpdateError as any).status || 400).json({
            ok: false,
            error: { message: authUpdateError.message || "Failed to scrub auth user", code: authUpdateError.code || "AUTH_SCRUB" },
          });
        }
      } else {
        await adminClient.from("profiles").delete().eq("id", targetId);
      }

      return res.status(200).json({ ok: true, data: { ...targetProfile, softDeleted } });
    }

    if (req.method === "PATCH") {
      const { id, full_name, role, company_id, is_active, password, confirm_email, project_ids, project_role, has_vde_access } = req.body || {};

      if (!id) {
        return res.status(400).json({ ok: false, error: { message: "Missing user id", code: "BAD_REQUEST" } });
      }

      const trimmedPassword = typeof password === "string" ? password.trim() : "";
      if (trimmedPassword && trimmedPassword.length < 8) {
        return res.status(400).json({ ok: false, error: { message: "Password must be at least 8 characters", code: "BAD_REQUEST" } });
      }

      if (!userId) {
        return res.status(401).json({ ok: false, error: { message: "Missing auth user", code: "AUTH_INVALID" } });
      }

      const { data: requester, error: requesterError } = await client
        .from("profiles")
        .select("id, role")
        .eq("id", userId)
        .single();

      if (requesterError) {
        return res.status(requesterError.status || 400).json({
          ok: false,
          error: { message: requesterError.message, code: requesterError.code, meta: requesterError.details },
        });
      }

      if (requester?.role !== "ADMIN") {
        return res.status(403).json({ ok: false, error: { message: "Only admins can edit users", code: "FORBIDDEN" } });
      }

      const adminClient = getSupabaseAdminClient();
      const patch: Record<string, any> = {};
      if (full_name !== undefined) patch.full_name = full_name;
      if (role !== undefined) patch.role = role;
      if (company_id !== undefined) patch.company_id = company_id || null;
      if (is_active !== undefined) patch.is_active = !!is_active;
      if (has_vde_access !== undefined) patch.has_vde_access = !!has_vde_access;

      const shouldConfirmEmail =
        confirm_email === undefined ? Boolean(trimmedPassword) : Boolean(confirm_email);

      if (Object.keys(patch).length === 0 && !trimmedPassword && !shouldConfirmEmail) {
        return res.status(400).json({ ok: false, error: { message: "No changes provided", code: "BAD_REQUEST" } });
      }

      let profileData;
      if (Object.keys(patch).length > 0) {
        const { data, error } = await adminClient
          .from("profiles")
          .update(patch)
          .eq("id", id)
          .select("id, full_name, email, role, company_id, is_active, created_at, has_vde_access")
          .single();

        if (error) {
          return res.status(400).json({ ok: false, error: { message: error.message, code: error.code, meta: error.details } });
        }
        profileData = data;
      } else {
        const { data } = await adminClient
          .from("profiles")
          .select("id, full_name, email, role, company_id, is_active, created_at, has_vde_access")
          .eq("id", id)
          .single();
        profileData = data;
      }

      const authUpdate: { user_metadata?: Record<string, any>; password?: string } = {};
      if (full_name !== undefined) {
        authUpdate.user_metadata = { full_name };
      }
      if (trimmedPassword) {
        authUpdate.password = trimmedPassword;
      }

      if (authUpdate.user_metadata || authUpdate.password) {
        await adminClient.auth.admin.updateUserById(id, authUpdate).catch((error) => {
          console.error("Failed to update auth user", error?.message || error);
        });
      }

      if (Array.isArray(project_ids)) {
        // Simple sync: delete current memberships and insert new ones
        const { error: delError } = await adminClient.from("project_members").delete().eq("user_id", id);
        if (delError) {
          console.error("[users api] failed to clear memberships:", delError);
        } else if (project_ids.length > 0) {
          const roleToUse = project_role || "USER";
          const entries = project_ids.map((pid: string) => ({
            user_id: id,
            project_id: pid,
            role: roleToUse,
            added_by: userId,
          }));
          const { error: insError } = await adminClient.from("project_members").insert(entries);
          if (insError) {
            console.error("[users api] failed to insert new memberships:", insError);
          }
        }
      }

      const { data: updatedProfile, error: fetchError } = await adminClient
        .from("profiles")
        .select("id, full_name, email, role, company_id, is_active, created_at, has_vde_access, project_members!user_id(project_id)")
        .eq("id", id)
        .single();

      if (fetchError) {
        return res.status(400).json({ ok: false, error: { message: fetchError.message, code: fetchError.code } });
      }

      const formatted = {
        ...updatedProfile,
        project_ids: (updatedProfile.project_members || []).map((pm: any) => pm.project_id),
      };

      return res.status(200).json({ ok: true, data: formatted });
    }

    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return res.status(405).json({ ok: false, error: { message: "Method not allowed", code: "METHOD_NOT_ALLOWED" } });
  } catch (err) {
    if (isAuthRequiredError(err)) {
      return res.status(401).json({
        ok: false,
        error: { message: "Missing Bearer token", code: "AUTH_REQUIRED" },
      });
    }

    console.error("Error in /api/users:", err);
    return res.status(500).json({
      ok: false,
      error: {
        message: err instanceof Error ? err.message : "Internal server error",
        code: "SERVER_ERROR",
      },
    });
  }
}
