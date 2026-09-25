import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let supabase;
  try {
    ({ client: supabase } = createServerSupabaseClient(req));
  } catch {
    return res.status(401).json({ ok: false, error: { message: "Unauthorized" } });
  }

  if (req.method === "GET") {
    const projectId = String(req.query.projectId || "").trim();
    const planId = String(req.query.planId || "").trim();
    if (!projectId) return res.status(400).json({ ok: false, error: { message: "Missing projectId" } });

    const admin = getSupabaseAdminClient();
    let query = admin.from("bma_devices").select("*").eq("project_id", projectId);
    if (planId) query = query.eq("plan_id", planId);

    const { data: rawDevices, error } = await query;
    if (error) return res.status(400).json({ ok: false, error: { message: error.message } });

    // Also fetch manual symbols from plan_bma_symbols
    let manualSymbols: any[] = [];
    if (planId) {
      const { data: syms } = await admin.from("plan_bma_symbols").select("*").eq("plan_id", planId);
      manualSymbols = syms || [];
    } else {
      const { data: projectPlans } = await admin.from("plans").select("id").eq("project_id", projectId);
      const planIds = (projectPlans || []).map((p: any) => p.id);
      if (planIds.length > 0) {
        const { data: syms } = await admin.from("plan_bma_symbols").select("*").in("plan_id", planIds);
        manualSymbols = syms || [];
      }
    }

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
        const name = loop && addr ? `${loop}/${addr}` : s.label || s.symbol_type;
        devices.push({
          id: `manual-${s.id}`,
          project_id: projectId,
          plan_id: s.plan_id,
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

    return res.status(200).json({ ok: true, data: devices });
  }

  if (req.method === "POST") {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { data, error } = await supabase.from("bma_devices").insert(body).select("*");
    if (error) return res.status(400).json({ ok: false, error: { message: error.message } });
    return res.status(200).json({ ok: true, data });
  }

  if (req.method === "PATCH") {
    console.log("[devices PATCH] Start handler");
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    console.log("[devices PATCH] Body:", body);
    const { id, ...updates } = body;
    if (!id) return res.status(400).json({ ok: false, error: { message: "Missing id" } });

    const admin = getSupabaseAdminClient();

    // Handle manual symbol updates
    if (typeof id === "string" && id.startsWith("manual-")) {
      const realSymId = id.replace("manual-", "");
      const { data: sym, error: symFetchErr } = await admin.from("plan_bma_symbols").select("*").eq("id", realSymId).single();
      if (symFetchErr || !sym) {
        return res.status(404).json({ ok: false, error: { message: "Manual symbol not found" } });
      }
      let descObj: any = {};
      try {
        if (typeof sym.description === "string" && sym.description.startsWith("{")) {
          descObj = JSON.parse(sym.description);
        } else if (sym.description) {
          descObj = { desc: sym.description };
        }
      } catch {}

      if (updates.metadata) {
        if (updates.metadata.serial_number !== undefined) descObj.serial_number = updates.metadata.serial_number;
        if (updates.metadata.photos !== undefined) descObj.photos = updates.metadata.photos;
      }

      const { data: updatedSym, error: symUpdErr } = await admin
        .from("plan_bma_symbols")
        .update({ description: JSON.stringify(descObj), updated_at: new Date().toISOString() })
        .eq("id", realSymId)
        .select("*")
        .single();

      if (symUpdErr) return res.status(400).json({ ok: false, error: { message: symUpdErr.message } });

      const name = sym.loop_number && sym.address ? `${sym.loop_number}/${sym.address}` : sym.label || sym.symbol_type;
      return res.status(200).json({
        ok: true,
        data: {
          id: `manual-${updatedSym.id}`,
          project_id: sym.plan_id,
          plan_id: updatedSym.plan_id,
          loop_number: updatedSym.loop_number,
          address: updatedSym.address,
          name,
          type: updatedSym.symbol_type === "detector_blue" ? "DETECTOR_BLUE" : updatedSym.symbol_type === "sirene" ? "SIREN" : updatedSym.symbol_type === "dis_signalgeber" ? "SIGNAL" : "DETECTOR",
          x: updatedSym.x_norm,
          y: updatedSym.y_norm,
          metadata: {
            serial_number: descObj.serial_number || null,
            photos: descObj.photos || [],
            symbol_type: updatedSym.symbol_type,
            description: descObj.desc || null,
            is_manual_symbol: true
          }
        }
      });
    }

    // Fetch the device first to check project_id and current metadata
    const { data: device, error: fetchErr } = await supabase.from("bma_devices").select("*").eq("id", id).single();
    if (fetchErr || !device) {
      console.error("[devices PATCH] Device not found:", id, fetchErr);
      return res.status(404).json({ ok: false, error: { message: "Device not found" } });
    }

    const { userId } = createServerSupabaseClient(req);
    console.log("[devices PATCH] User ID:", userId);
    
    const { data: profile, error: profErr } = await supabase.from("profiles").select("role").eq("id", userId).single();
    if (profErr) console.error("[devices PATCH] Profile fetch error:", profErr);
    
    const role = (profile?.role || "").toUpperCase();
    console.log("[devices PATCH] User role:", role);
    const isAdmin = role === "ADMIN";

    if (!isAdmin) {
      console.warn("[devices PATCH] Non-admin attempt:", userId, role);
      // Standard users can ONLY update metadata
      const keys = Object.keys(updates);
      if (keys.length > 1 || keys[0] !== "metadata") {
        return res.status(403).json({ ok: false, error: { message: "Users can only update metadata (photos/serial)" } });
      }
    }

    // Use admin client to bypass RLS since users don't have UPDATE permission on the table
    const { data, error } = await admin.from("bma_devices").update(updates).eq("id", id).select("*").single();

    if (error) {
      console.error("[devices PATCH] Error updating device:", error);
      return res.status(400).json({ ok: false, error: { message: error.message } });
    }
    console.log("[devices PATCH] Success for device:", id);
    return res.status(200).json({ ok: true, data });
  }

  if (req.method === "DELETE") {
    const id = String(req.query.id || "").trim();
    const planId = String(req.query.planId || "").trim();
    const projectId = String(req.query.projectId || "").trim();

    if (!id && !planId && !projectId) {
      return res.status(400).json({ ok: false, error: { message: "Missing filter parameter (id, planId, or projectId)" } });
    }

    const admin = getSupabaseAdminClient();

    if (id && id.startsWith("manual-")) {
      const symId = id.replace("manual-", "");
      const { error } = await admin.from("plan_bma_symbols").delete().eq("id", symId);
      if (error) {
        console.error("[devices DELETE manual] Error:", error);
        return res.status(400).json({ ok: false, error: { message: error.message } });
      }
      return res.status(200).json({ ok: true });
    }

    // Use admin client to bypass RLS since users don't have DELETE permission on the table
    const { error } = await admin.from("bma_devices").delete().match(
      id ? { id } : planId ? { plan_id: planId } : { project_id: projectId }
    );
    
    if (error) {
      console.error("[devices DELETE] Error:", error);
      return res.status(400).json({ ok: false, error: { message: error.message } });
    }
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ ok: false, error: { message: "Method not allowed" } });
}
