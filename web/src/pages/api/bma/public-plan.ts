import { NextApiRequest, NextApiResponse } from "next";
import { createServiceSupabaseClient } from "@/lib/supabaseServer";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const planId = req.query.planId as string;

  if (!planId) {
    return res.status(400).json({ ok: false, error: "Missing planId" });
  }

  try {
    const supabase = createServiceSupabaseClient();
    console.log(`[public-plan API] Fetching plan: ${planId}`);

    // 1. Fetch Plan details with relations
    const { data: plan, error: planError } = await supabase
      .from("plans")
      .select(`
        *,
        floors (
          *,
          buildings ( * )
        )
      `)
      .eq("id", planId)
      .single();

    if (planError || !plan) {
      console.error("[public-plan API] Plan not found or error:", { planError, planId });
      return res.status(404).json({ ok: false, error: planError?.message || "Plan not found" });
    }

    // Check if the plan is shared
    if (plan.is_archived !== true) {
      console.warn(`[public-plan API] Access denied: Plan ${planId} is not shared with team.`);
      return res.status(403).json({ ok: false, error: "Access Denied: This plan is not shared with the team." });
    }

    console.log(`[public-plan API] Found plan: ${plan.id}, project: ${plan.project_id}`);

    // 2. Fetch Devices
    const { data: devices, error: devErr } = await supabase
      .from("bma_devices")
      .select("*")
      .eq("plan_id", planId);

    // 3. Fetch Connections and Routes for this project
    const { data: connections, error: connErr } = await supabase
      .from("bma_connections")
      .select("*")
      .eq("project_id", plan.project_id);

    // Fetch all routes for the project and filter in memory to be robust
    const { data: allRoutes, error: routeErr } = await supabase
      .from("bma_routes")
      .select("*")
      .eq("project_id", plan.project_id);

    const deviceIds = new Set((devices || []).map(d => d.id));
    const routes = (allRoutes || []).filter(r => deviceIds.has(r.source_device_id));

    console.log(`[public-plan API] Stats: devices=${devices?.length || 0}, connections=${connections?.length || 0}, routes=${routes?.length || 0}`);

    return res.status(200).json({
      ok: true,
      data: {
        plan,
        devices: devices || [],
        connections: connections || [],
        routes: routes || []
      }
    });
  } catch (err: any) {
    console.error("[public-plan API] Critical error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
