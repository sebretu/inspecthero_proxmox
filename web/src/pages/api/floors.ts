import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabaseServer";
import { requireRequesterProfile, isAdminRole } from "@/lib/requesterProfile";

type ApiOk = { ok: true; data: any };
type ApiErr = { ok: false; error: { code: string; message: string; meta?: any } };

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
  if (req.method !== "GET" && req.method !== "POST" && req.method !== "PATCH" && req.method !== "DELETE") {
    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET, POST, PATCH or DELETE" } });
  }
  if (req.method === "PATCH") {
    const { id, name } = req.body ?? {};
    if (!id || typeof id !== "string") {
      return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing or invalid floor id" } });
    }
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing or invalid floor name" } });
    }
    const adminSupabase = createServiceSupabaseClient();
    const { data, error } = await adminSupabase
      .from("floors")
      .update({ name: name.trim() })
      .eq("id", id)
      .select("id,name,level,building_id,created_at,updated_at")
      .single();
    if (error) {
      return res.status((error as any).status || 400).json({
        ok: false,
        error: { code: "SUPABASE", message: error.message, meta: { code: (error as any).code, details: (error as any).details } },
      });
    }
    return res.status(200).json({ ok: true, data });
  }

  if (req.method === "DELETE") {
    const { id } = req.query;
    if (!id || typeof id !== "string") {
      return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing floor id" } });
    }

    const adminSupabase = createServiceSupabaseClient();
    const { data, error } = await adminSupabase
      .from("floors")
      .delete()
      .eq("id", id)
      .select("id")
      .single();

    if (error) {
      return res.status((error as any).status || 400).json({
        ok: false,
        error: { code: "SUPABASE", message: error.message, meta: { code: (error as any).code, details: (error as any).details } },
      });
    }

    return res.status(200).json({ ok: true, data });
  }

  let supabase: any;
  let userId: string | null = null;
  try {
    ({ client: supabase, userId } = createServerSupabaseClient(req));
  } catch (e: any) {
    return res.status(401).json({ ok: false, error: { code: "AUTH_INVALID", message: "Missing Bearer token" } });
  }

  let requester;
  try {
    requester = await requireRequesterProfile(supabase, userId);
  } catch (err: any) {
    return res.status(err?.status || 403).json({
      ok: false,
      error: { code: err?.code || "PROFILE_ERROR", message: err?.message || "Unable to load profile" },
    });
  }

  const isGlobalAdmin = isAdminRole(requester.role);

  if (req.method === "GET") {
    const projectId = (req.query.projectId as string) || "";
    if (!projectId) {
      return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing query: projectId" } });
    }

    const fetchClient = isGlobalAdmin ? createServiceSupabaseClient() : supabase;

    const { data: buildings, error: buildingError } = await fetchClient
      .from("buildings")
      .select("id")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });

    if (buildingError) {
      return res.status((buildingError as any).status || 400).json({
        ok: false,
        error: {
          code: "SUPABASE",
          message: buildingError.message,
          meta: { code: (buildingError as any).code, details: (buildingError as any).details },
        },
      });
    }

    const buildingIds = (buildings || []).map((b: any) => b.id).filter(Boolean);
    if (buildingIds.length === 0) {
      return res.status(200).json({ ok: true, data: [] });
    }

    const { data, error } = await fetchClient
      .from("floors")
      .select("id,building_id,name,level,created_at,updated_at")
      .in("building_id", buildingIds)
      .order("level", { ascending: true });

    if (error) {
      return res.status((error as any).status || 400).json({
        ok: false,
        error: { code: "SUPABASE", message: error.message, meta: { code: (error as any).code, details: (error as any).details } },
      });
    }

    return res.status(200).json({ ok: true, data: data ?? [] });
  }

  const { projectId, buildingId: bodyBuildingId, name, level } = req.body ?? {};
  if (!name) {
    return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "name is required" } });
  }

  const normalizedProjectId = typeof projectId === "string" ? projectId : "";
  const normalizedBuildingId = typeof bodyBuildingId === "string" ? bodyBuildingId : "";

  if (!normalizedProjectId && !normalizedBuildingId) {
    return res
      .status(400)
      .json({ ok: false, error: { code: "BAD_REQUEST", message: "Provide projectId or buildingId" } });
  }

  if (!userId) {
    return res.status(401).json({ ok: false, error: { code: "AUTH_INVALID", message: "Missing Bearer token" } });
  }

  const adminSupabase = createServiceSupabaseClient();
  type BuildingRecord = { id: string; project_id: string };
  let buildingRecord: BuildingRecord | null = null;

  if (normalizedBuildingId) {
    const { data: building, error: buildingFetchError } = await adminSupabase
      .from("buildings")
      .select("id, project_id")
      .eq("id", normalizedBuildingId)
      .maybeSingle();

    if (buildingFetchError) {
      return res.status((buildingFetchError as any).status || 400).json({
        ok: false,
        error: {
          code: "SUPABASE",
          message: buildingFetchError.message,
          meta: { code: (buildingFetchError as any).code, details: (buildingFetchError as any).details },
        },
      });
    }

    if (!building) {
      return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Building not found" } });
    }

    if (normalizedProjectId && building.project_id !== normalizedProjectId) {
      return res.status(400).json({
        ok: false,
        error: { code: "BAD_REQUEST", message: "Building does not belong to provided project" },
      });
    }

    buildingRecord = building;
  } else {
    const { data: building, error: buildingLookupError } = await adminSupabase
      .from("buildings")
      .select("id, project_id")
      .eq("project_id", normalizedProjectId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (buildingLookupError) {
      return res.status((buildingLookupError as any).status || 400).json({
        ok: false,
        error: {
          code: "SUPABASE",
          message: buildingLookupError.message,
          meta: { code: (buildingLookupError as any).code, details: (buildingLookupError as any).details },
        },
      });
    }

    if (!building) {
      return res
        .status(400)
        .json({ ok: false, error: { code: "BAD_REQUEST", message: "Project has no buildings to attach floors to" } });
    }

    buildingRecord = building;
  }



  const targetProjectId = buildingRecord.project_id;

  if (!isGlobalAdmin) {
    const { data: membership, error: membershipError } = await adminSupabase
      .from("project_members")
      .select("id")
      .eq("project_id", targetProjectId)
      .eq("user_id", userId)
      .maybeSingle();

    if (membershipError) {
      return res.status((membershipError as any).status || 400).json({
        ok: false,
        error: {
          code: "SUPABASE",
          message: membershipError.message,
          meta: { code: (membershipError as any).code, details: (membershipError as any).details },
        },
      });
    }

    if (!membership) {
      return res
        .status(403)
        .json({ ok: false, error: { code: "FORBIDDEN", message: "You are not a member of this project" } });
    }
  }

  async function resolveLevelValue(): Promise<number> {
    if (level === undefined || level === null || String(level).trim() === "") {
      const { data: latestLevel, error: latestError } = await adminSupabase
        .from("floors")
        .select("level")
        .eq("building_id", buildingRecord!.id)
        .order("level", { ascending: false })
        .limit(1);

      if (latestError) {
        throw latestError;
      }

      const baseLevel = latestLevel?.[0]?.level ?? -1;
      const normalizedBase = Number.isFinite(baseLevel) ? baseLevel : -1;
      return normalizedBase + 1;
    }

    const levelNumber = Number(level);
    if (!Number.isFinite(levelNumber)) {
      throw Object.assign(new Error("Invalid level"), { status: 400, code: "BAD_REQUEST" });
    }
    return Math.floor(levelNumber);
  }

  let levelValue: number;
  try {
    levelValue = await resolveLevelValue();
  } catch (levelErr: any) {
    const status = levelErr?.status || (levelErr?.code === "BAD_REQUEST" ? 400 : 400);
    const message = levelErr?.message || "Unable to determine level";
    return res.status(status).json({ ok: false, error: { code: levelErr?.code || "LEVEL", message } });
  }

  const { data, error } = await adminSupabase
    .from("floors")
    .insert({
      building_id: buildingRecord.id,
      name,
      level: levelValue,
    })
    .select("id,name,level")
    .single();

  if (error) {
    const pgCode = (error as any).code;
    if (pgCode === "23505") {
      const { data: existing } = await adminSupabase
        .from("floors")
        .select("id,name,level")
        .eq("building_id", buildingRecord.id)
        .eq("level", levelValue)
        .maybeSingle();

      if (existing) {
        return res.status(200).json({ ok: true, data: existing });
      }
    }

    return res.status((error as any).status || 400).json({
      ok: false,
      error: { code: "SUPABASE", message: error.message, meta: { code: (error as any).code, details: (error as any).details } },
    });
  }

  return res.status(200).json({ ok: true, data });
}
