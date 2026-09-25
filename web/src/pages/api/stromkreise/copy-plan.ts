import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { requireRequesterProfile } from "@/lib/requesterProfile";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(str: string): boolean {
  return typeof str === "string" && UUID_REGEX.test(str);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: { message: "Method not allowed" } });
  }

  let supabase: any;
  let userId: string | null = null;

  try {
    ({ client: supabase, userId } = createServerSupabaseClient(req));
  } catch {
    return res.status(401).json({ ok: false, error: { message: "Unauthorized" } });
  }

  try {
    await requireRequesterProfile(supabase, userId);
  } catch {
    return res.status(403).json({ ok: false, error: { message: "Profile error" } });
  }

  const { sourcePlanId, targetPlanId, projectId, mode = "replace" } = req.body || {};

  if (!sourcePlanId || !isUuid(sourcePlanId)) {
    return res.status(400).json({ ok: false, error: { message: "Invalid or missing sourcePlanId" } });
  }
  if (!targetPlanId || !isUuid(targetPlanId)) {
    return res.status(400).json({ ok: false, error: { message: "Invalid or missing targetPlanId" } });
  }
  if (!projectId || !isUuid(projectId)) {
    return res.status(400).json({ ok: false, error: { message: "Invalid or missing projectId" } });
  }
  if (sourcePlanId === targetPlanId) {
    return res.status(400).json({ ok: false, error: { message: "Plan źródłowy i docelowy nie mogą być takie same." } });
  }

  // Verify access to project
  const { data: proj, error: projErr } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .single();

  if (projErr || !proj) {
    return res.status(403).json({ ok: false, error: { message: "Brak dostępu do projektu" } });
  }

  const admin = getSupabaseAdminClient();

  // 1. Fetch source and target plan details for descriptive backup naming
  const [sourcePlanRes, targetPlanRes] = await Promise.all([
    admin.from("plans").select("id, version, floors(name, buildings(name))").eq("id", sourcePlanId).single(),
    admin.from("plans").select("id, version, floors(name, buildings(name))").eq("id", targetPlanId).single(),
  ]);

  const sData = sourcePlanRes.data as any;
  const sourcePlanName = sData
    ? [
        Array.isArray(sData.floors) ? sData.floors[0]?.buildings?.name : (Array.isArray(sData.floors?.buildings) ? sData.floors.buildings[0]?.name : sData.floors?.buildings?.name),
        Array.isArray(sData.floors) ? sData.floors[0]?.name : sData.floors?.name
      ].filter(Boolean).join(" - ") || `Plan v${sData.version || "1"}`
    : `Plan ${sourcePlanId.substring(0, 8)}`;

  // 2. Fetch markers from source plan (READ-ONLY: source plan is never modified or deleted)
  const { data: sourceMarkers, error: sourceErr } = await admin
    .from("stromkreise")
    .select("*")
    .eq("project_id", projectId)
    .eq("plan_id", sourcePlanId);

  if (sourceErr) {
    return res.status(500).json({ ok: false, error: { message: "Błąd podczas odczytu markerów źródłowych: " + sourceErr.message } });
  }

  if (!sourceMarkers || sourceMarkers.length === 0) {
    return res.status(400).json({
      ok: false,
      error: { message: "Wybrany plan źródłowy nie zawiera żadnych markerów do skopiowania." },
    });
  }

  // 3. Fetch current markers on target plan for the MANDATORY AUTOMATIC BACKUP
  const { data: currentTargetMarkers, error: targetErr } = await admin
    .from("stromkreise")
    .select("*")
    .eq("project_id", projectId)
    .eq("plan_id", targetPlanId);

  if (targetErr) {
    return res.status(500).json({ ok: false, error: { message: "Błąd podczas odczytu obecnych markerów planu: " + targetErr.message } });
  }

  // 4. MANDATORY AUTO-BACKUP: Create a snapshot before making ANY changes
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timeStr = now.toTimeString().split(" ")[0].substring(0, 5);
  const backupName = `Auto-Backup przed kopiowaniem z "${sourcePlanName}" (${dateStr} ${timeStr})`;

  const { error: backupErr } = await admin
    .from("stromkreis_snapshots")
    .insert({
      project_id: projectId,
      plan_id: targetPlanId,
      name: backupName,
      data: {
        markers: currentTargetMarkers || [],
        source_plan_id: sourcePlanId,
        source_plan_name: sourcePlanName,
        copied_at: now.toISOString(),
        mode,
      },
      created_by: userId,
    });

  if (backupErr) {
    return res.status(500).json({
      ok: false,
      error: { message: "Nie udało się utworzyć kopii zapasowej (Backup): " + backupErr.message },
    });
  }

  // 5. If mode is "replace", delete existing markers on target plan (they are safely stored in the backup snapshot)
  if (mode === "replace" && currentTargetMarkers && currentTargetMarkers.length > 0) {
    const { error: delErr } = await admin
      .from("stromkreise")
      .delete()
      .eq("project_id", projectId)
      .eq("plan_id", targetPlanId);

    if (delErr) {
      return res.status(500).json({
        ok: false,
        error: { message: "Błąd podczas czyszczenia poprzednich markerów docelowych: " + delErr.message },
      });
    }
  }

  // 6. Map and sanitize source markers for insertion into target plan
  const markersToInsert = sourceMarkers.map((m: any) => {
    const { id, created_at, ...rest } = m;
    const clean: any = {
      ...rest,
      project_id: projectId,
      plan_id: targetPlanId,
    };

    // Clean/map legacy shapes/types if needed
    if (clean.type === "line" || clean.type === "arrow" || clean.type === "text") {
      clean.metadata = clean.metadata || {};
      clean.metadata.realType = clean.type;
      clean.type = clean.type === "text" ? "special" : "socket";
    }
    if (clean.marker_shape === "line" || clean.marker_shape === "arrow" || clean.marker_shape === "text") {
      clean.metadata = clean.metadata || {};
      clean.metadata.realType = clean.marker_shape;
      clean.marker_shape = "circle";
    }

    return clean;
  });

  const { error: insErr } = await admin
    .from("stromkreise")
    .insert(markersToInsert);

  if (insErr) {
    return res.status(500).json({
      ok: false,
      error: { message: "Błąd podczas wstawiania skopiowanych markerów: " + insErr.message },
    });
  }

  return res.status(200).json({
    ok: true,
    data: {
      copiedCount: markersToInsert.length,
      backupName,
      sourcePlanName,
    },
  });
}
