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

    // 2. Fetch Devices from bma_devices
    const { data: rawDevices, error: devErr } = await supabase
      .from("bma_devices")
      .select("*")
      .eq("plan_id", planId);

    // 2b. Fetch manual symbols from plan_bma_symbols to combine with devices
    const { data: manualSymbols } = await supabase
      .from("plan_bma_symbols")
      .select("*")
      .eq("plan_id", planId);

    const BMA_SYMBOL_TYPES = new Set([
      "detector_blue",
      "detector_red",
      "sirene",
      "dis_signalgeber",
      "bma_melder"
    ]);

    const isBmaSymbolWithNumber = (s: any) => {
      if (!s) return false;
      const isBmaType =
        BMA_SYMBOL_TYPES.has(s.symbol_type) ||
        (typeof s.symbol_type === "string" && (s.symbol_type.startsWith("detector_") || s.symbol_type.includes("bma")));
      if (!isBmaType) return false;

      const loop = (s.loop_number || "").trim();
      const addr = (s.address || "").trim();
      const label = (s.label || "").trim();
      return (loop !== "" && addr !== "") || loop !== "" || addr !== "" || /\d/.test(label);
    };

    const devices = [...(rawDevices || [])];
    const existingKeys = new Set(
      devices.map(d => `${(d.loop_number || "").trim()}_${(d.address || "").trim()}`.toLowerCase())
    );

    (manualSymbols || []).filter(isBmaSymbolWithNumber).forEach((s: any) => {
      const loop = (s.loop_number || "").trim();
      const addr = (s.address || "").trim();
      const key = `${loop}_${addr}`.toLowerCase();

      let parsedDesc: any = {};
      try {
        if (typeof s.description === "string" && s.description.startsWith("{")) {
          parsedDesc = JSON.parse(s.description);
        } else if (s.description) {
          parsedDesc = { desc: s.description };
        }
      } catch {}

      const serial = parsedDesc.serial_number || parsedDesc.serialNumber || null;
      const photos = Array.isArray(parsedDesc.photos) ? parsedDesc.photos : [];

      if (loop && addr && existingKeys.has(key)) {
        // If device already exists in bma_devices, augment metadata if missing
        const existingIdx = devices.findIndex(
          d => `${(d.loop_number || "").trim()}_${(d.address || "").trim()}`.toLowerCase() === key
        );
        if (existingIdx !== -1) {
          const d = devices[existingIdx];
          const currMeta = d.metadata || {};
          devices[existingIdx] = {
            ...d,
            metadata: {
              ...currMeta,
              serial_number: currMeta.serial_number || serial || null,
              photos: currMeta.photos && currMeta.photos.length > 0 ? currMeta.photos : photos,
              symbol_type: currMeta.symbol_type || s.symbol_type,
            }
          };
        }
      } else {
        // Add manual symbol as a device
        const name = loop && addr ? `${loop}/${addr}` : s.label || s.symbol_type;
        devices.push({
          id: `manual-${s.id}`,
          project_id: plan.project_id,
          plan_id: planId,
          loop_number: loop || null,
          address: addr || null,
          name,
          type: s.symbol_type === "detector_blue" ? "DETECTOR_BLUE" : s.symbol_type === "sirene" ? "SIREN" : s.symbol_type === "dis_signalgeber" ? "SIGNAL" : "DETECTOR",
          x: s.x_norm,
          y: s.y_norm,
          metadata: {
            serial_number: serial,
            photos,
            symbol_type: s.symbol_type,
            description: parsedDesc.desc || s.description || null,
            is_manual_symbol: true
          }
        });
      }
    });

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

    const deviceIds = new Set(devices.map(d => d.id));
    const routes = (allRoutes || []).filter(r => deviceIds.has(r.source_device_id));

    console.log(`[public-plan API] Stats: devices=${devices.length}, connections=${connections?.length || 0}, routes=${routes?.length || 0}`);

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
