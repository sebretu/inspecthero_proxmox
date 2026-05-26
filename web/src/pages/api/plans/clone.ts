import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { requireRequesterProfile, isAdminRole } from "@/lib/requesterProfile";

type ApiOk = { ok: true; data: any };
type ApiErr = { ok: false; error: { code: string; message: string; meta?: any } };

async function ensureProjectMembership(admin: any, projectId: string, userIds: string[]) {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueUserIds.length === 0) return;

  // 1. Fetch existing project members for this project
  const { data: existingMembers } = await admin
    .from("project_members")
    .select("user_id")
    .eq("project_id", projectId)
    .in("user_id", uniqueUserIds);

  const existingUserIds = new Set((existingMembers || []).map((m: any) => m.user_id));

  // 2. Identify user IDs that need to be added
  const usersToAdd = uniqueUserIds.filter(id => !existingUserIds.has(id));
  if (usersToAdd.length === 0) return;

  // 3. Add them as project members
  const memberInserts = usersToAdd.map(userId => ({
    project_id: projectId,
    user_id: userId,
    role: "USER"
  }));

  await admin.from("project_members").insert(memberInserts);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use POST" } });
  }

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
  if (!isAdmin) {
    return res.status(403).json({
      ok: false,
      error: { code: "FORBIDDEN", message: "Only admins can move or clone plans" },
    });
  }

  const { planId, targetProjectId, targetBuildingId, targetFloorId, cloneTasks, mode = "clone" } = req.body;

  if (!planId || !targetProjectId || !targetFloorId) {
    return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing required fields: planId, targetProjectId, targetFloorId" } });
  }

  const admin = getSupabaseAdminClient();

  try {
    // 1. Fetch original plan
    const { data: origPlan, error: origError } = await admin
      .from("plans")
      .select("*")
      .eq("id", planId)
      .single();

    if (origError || !origPlan) {
      return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Original plan not found" } });
    }

    let finalBuildingId = targetBuildingId;
    let finalFloorId = targetFloorId;

    // --- AUTO CREATE BUILDING LOGIC ---
    if (targetBuildingId === "auto_create") {
      // A. Fetch original floor's building details
      const { data: origFloor } = await admin
        .from("floors")
        .select("building_id")
        .eq("id", origPlan.floor_id)
        .single();

      if (!origFloor) {
        return res.status(404).json({ ok: false, error: { code: "FLOOR_NOT_FOUND", message: "Original floor not found" } });
      }

      const { data: origBuilding, error: bldError } = await admin
        .from("buildings")
        .select("name, code")
        .eq("id", origFloor.building_id)
        .single();

      if (bldError || !origBuilding) {
        return res.status(404).json({ ok: false, error: { code: "BUILDING_NOT_FOUND", message: "Original building not found" } });
      }

      // B. Check if same name building already exists in target project
      const { data: existingBuilding } = await admin
        .from("buildings")
        .select("id")
        .eq("project_id", targetProjectId)
        .eq("name", origBuilding.name)
        .maybeSingle();

      if (existingBuilding) {
        finalBuildingId = existingBuilding.id;
      } else {
        // C. Create the new building automatically
        const { data: newBuilding, error: createBldErr } = await admin
          .from("buildings")
          .insert({
            project_id: targetProjectId,
            name: origBuilding.name,
            code: origBuilding.code
          })
          .select("id")
          .single();

        if (createBldErr || !newBuilding) {
          return res.status(400).json({ ok: false, error: { code: "BUILDING_CREATE_FAILED", message: createBldErr?.message || "Failed to auto-create target building" } });
        }
        finalBuildingId = newBuilding.id;
      }

      // Force floor to auto-create if building is being automatically created
      finalFloorId = "auto_create";
    }

    // --- AUTO CREATE FLOOR LOGIC ---
    if (finalFloorId === "auto_create") {
      // A. Fetch original floor details
      const { data: origFloor, error: floorError } = await admin
        .from("floors")
        .select("name, level")
        .eq("id", origPlan.floor_id)
        .single();

      if (floorError || !origFloor) {
        return res.status(404).json({ ok: false, error: { code: "FLOOR_NOT_FOUND", message: "Original floor details not found" } });
      }

      // B. Check if same level floor already exists in target building
      const { data: existingFloor } = await admin
        .from("floors")
        .select("id")
        .eq("building_id", finalBuildingId)
        .eq("level", origFloor.level)
        .maybeSingle();

      if (existingFloor) {
        finalFloorId = existingFloor.id;
      } else {
        // C. Auto create the new floor
        const { data: newFloor, error: createFloorErr } = await admin
          .from("floors")
          .insert({
            building_id: finalBuildingId,
            name: origFloor.name,
            level: origFloor.level
          })
          .select("id")
          .single();

        if (createFloorErr || !newFloor) {
          return res.status(400).json({ ok: false, error: { code: "FLOOR_CREATE_FAILED", message: createFloorErr?.message || "Failed to auto-create target floor" } });
        }
        finalFloorId = newFloor.id;
      }
    }

    // 2. Find the highest version for this target floor to set new version
    const { data: existingVersions, error: versionError } = await admin
      .from("plans")
      .select("version")
      .eq("floor_id", finalFloorId)
      .order("version", { ascending: false })
      .limit(1);

    const newVersion = existingVersions && existingVersions.length > 0 ? existingVersions[0].version + 1 : 1;

    if (mode === "move") {
      // --- MOVE MODE ---
      // A. Update the plan table
      const { data: updatedPlan, error: updatePlanError } = await admin
        .from("plans")
        .update({
          project_id: targetProjectId,
          floor_id: finalFloorId,
          version: newVersion,
          is_current: true, // Make it active on target floor
        })
        .eq("id", planId)
        .select("*")
        .single();

      if (updatePlanError || !updatedPlan) {
        return res.status(400).json({ ok: false, error: { code: "MOVE_FAILED", message: updatePlanError?.message || "Failed to move plan" } });
      }

      // B. Fetch task users before updating, or update directly and then ensure membership
      const { data: tasks, error: tasksError } = await admin
        .from("tasks")
        .select("assigned_user_id, created_by")
        .eq("plan_id", planId);

      if (!tasksError && tasks && tasks.length > 0) {
        const userIds = tasks.flatMap((t: any) => [t.assigned_user_id, t.created_by]).filter(Boolean);
        await ensureProjectMembership(admin, targetProjectId, userIds);
      }

      // C. Update all tasks associated with this plan to have the new project_id
      const { error: updateTasksError } = await admin
        .from("tasks")
        .update({ project_id: targetProjectId })
        .eq("plan_id", planId);

      if (updateTasksError) {
        return res.status(400).json({ ok: false, error: { code: "TASKS_MOVE_FAILED", message: updateTasksError.message } });
      }

      return res.status(200).json({ ok: true, data: updatedPlan });
    } else {
      // --- CLONE MODE ---
      // 3. Create the cloned plan row
      const clonedPlanData = {
        project_id: targetProjectId,
        floor_id: finalFloorId,
        version: newVersion,
        status: origPlan.status,
        pdf_path: origPlan.pdf_path,
        image_path: origPlan.image_path,
        image_width: origPlan.image_width,
        image_height: origPlan.image_height,
        storage_bucket: origPlan.storage_bucket,
        storage_path: origPlan.storage_path,
        is_current: true,
        uploaded_by: origPlan.uploaded_by,
        processing_error: origPlan.processing_error,
      };

      const { data: createdPlan, error: createError } = await admin
        .from("plans")
        .insert(clonedPlanData)
        .select("*")
        .single();

      if (createError || !createdPlan) {
        return res.status(400).json({ ok: false, error: { code: "CREATE_FAILED", message: createError?.message || "Failed to create cloned plan" } });
      }

      // 4. (Optional) Clone tasks/markers
      if (cloneTasks) {
        const { data: tasks, error: tasksError } = await admin
          .from("tasks")
          .select("*")
          .eq("plan_id", planId);

        if (!tasksError && tasks && tasks.length > 0) {
          // A. Ensure all assignees/creators of these tasks are members of the target project
          const userIds = tasks.flatMap((t: any) => [t.assigned_user_id, t.created_by]).filter(Boolean);
          await ensureProjectMembership(admin, targetProjectId, userIds);

          // B. Clone tasks into target project
          const clonedTasksData = tasks.map(t => ({
            project_id: targetProjectId,
            plan_id: createdPlan.id,
            x_norm: t.x_norm,
            y_norm: t.y_norm,
            title: t.title,
            description: t.description,
            priority: t.priority,
            status: t.status,
            due_date: t.due_date,
            assigned_company_id: t.assigned_company_id,
            assigned_user_id: t.assigned_user_id,
            created_by: t.created_by,
          }));

          await admin.from("tasks").insert(clonedTasksData);
        }
      }

      return res.status(200).json({ ok: true, data: createdPlan });
    }
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: { code: "SERVER_ERROR", message: err.message || "Internal server error" } });
  }
}
