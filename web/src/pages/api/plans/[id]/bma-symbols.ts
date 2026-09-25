import type { NextApiRequest, NextApiResponse } from "next";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const auth = req.headers.authorization || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : null;

  if (!token) return res.status(401).json({ error: "Missing Bearer token" });

  const supabase = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) return res.status(401).json({ error: "AUTH_INVALID" });

  const planId = req.query.id as string;
  if (!planId) return res.status(400).json({ error: "Missing planId" });

  const adminClient = getSupabaseAdminClient();

  // GET: Fetch all BMA symbols for this plan
  if (req.method === "GET") {
    const { data, error } = await adminClient
      .from("plan_bma_symbols")
      .select("*")
      .eq("plan_id", planId)
      .order("created_at", { ascending: true });

    if (error) {
      if (error.message?.includes("does not exist") || error.code === "42P01") {
        return res.status(200).json({ symbols: [] });
      }
      return res.status(500).json({ error: error.message });
    }
    return res.status(200).json({ symbols: data ?? [] });
  }

  // Check user role: Only DELETE is strictly ADMIN-only
  if (req.method === "DELETE") {
    const { data: profile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const role = (profile?.role || "").toUpperCase();
    if (role !== "ADMIN") {
      return res.status(403).json({ error: "FORBIDDEN: Only administrators can delete plan symbols" });
    }
  }

  // POST: Create a new BMA symbol
  if (req.method === "POST") {
    const {
      symbol_type,
      x_norm,
      y_norm,
      label,
      loop_number,
      address,
      description,
    } = req.body;

    if (
      !symbol_type ||
      typeof x_norm !== "number" ||
      typeof y_norm !== "number"
    ) {
      return res.status(400).json({ error: "symbol_type, x_norm, y_norm are required" });
    }

    const row: any = {
      plan_id: planId,
      symbol_type,
      x_norm,
      y_norm,
      label: typeof label === "string" ? label.trim() : null,
      loop_number: typeof loop_number === "string" ? loop_number.trim() : null,
      address: typeof address === "string" ? address.trim() : null,
      description: typeof description === "string" ? description.trim() : null,
      created_by: user.id,
    };
    if (req.body.id) {
      row.id = req.body.id;
    }

    const { data, error } = await adminClient
      .from("plan_bma_symbols")
      .insert([row])
      .select("*")
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ symbol: data });
  }

  // PATCH: Update an existing BMA symbol
  if (req.method === "PATCH") {
    const symbolId = (req.query.symbolId as string) || req.body.id;
    if (!symbolId) return res.status(400).json({ error: "Missing symbolId" });

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (typeof req.body.symbol_type === "string") updates.symbol_type = req.body.symbol_type;
    if (typeof req.body.label !== "undefined") updates.label = req.body.label;
    if (typeof req.body.loop_number !== "undefined") updates.loop_number = req.body.loop_number;
    if (typeof req.body.address !== "undefined") updates.address = req.body.address;
    if (typeof req.body.description !== "undefined") updates.description = req.body.description;
    if (typeof req.body.x_norm === "number") updates.x_norm = req.body.x_norm;
    if (typeof req.body.y_norm === "number") updates.y_norm = req.body.y_norm;

    const { data, error } = await adminClient
      .from("plan_bma_symbols")
      .update(updates)
      .eq("id", symbolId)
      .select("*")
      .single();

    if (error) return res.status(500).json({ error: error.message });

    // Also sync to bma_devices if description was updated with serial_number or photos
    if (data && (updates.description !== undefined || updates.loop_number !== undefined || updates.address !== undefined)) {
      try {
        let descObj: any = {};
        if (typeof data.description === "string" && data.description.startsWith("{")) {
          descObj = JSON.parse(data.description);
        }
        const serial = descObj.serial_number || descObj.serialNumber || null;
        const photos = Array.isArray(descObj.photos) ? descObj.photos : [];

        if (data.loop_number && data.address) {
          const { data: matchedDevs } = await adminClient
            .from("bma_devices")
            .select("id, metadata")
            .eq("plan_id", data.plan_id)
            .eq("loop_number", data.loop_number)
            .eq("address", data.address);

          if (matchedDevs && matchedDevs.length > 0) {
            for (const d of matchedDevs) {
              const currentMeta = d.metadata || {};
              await adminClient
                .from("bma_devices")
                .update({
                  metadata: {
                    ...currentMeta,
                    serial_number: serial,
                    photos: photos.length > 0 ? photos : (currentMeta.photos || []),
                  },
                  updated_at: new Date().toISOString(),
                })
                .eq("id", d.id);
            }
          }
        }
      } catch (syncErr) {
        console.warn("[bma-symbols PATCH] Sync to bma_devices error:", syncErr);
      }
    }

    return res.status(200).json({ symbol: data });
  }

  // DELETE: Delete a BMA symbol
  if (req.method === "DELETE") {
    const symbolId = req.query.symbolId as string || req.body?.id;
    if (!symbolId) return res.status(400).json({ error: "Missing symbolId" });

    // Clean up any cable connections referencing this symbol in metadata
    try {
      const { data: conns } = await adminClient
        .from("bma_connections")
        .select("id, metadata");
      if (conns && conns.length > 0) {
        const toDeleteIds = conns
          .filter(
            (c) =>
              c.metadata?.source_symbol_id === symbolId ||
              c.metadata?.target_symbol_id === symbolId
          )
          .map((c) => c.id);
        if (toDeleteIds.length > 0) {
          await adminClient.from("bma_connections").delete().in("id", toDeleteIds);
        }
      }
    } catch {}

    const { error } = await adminClient
      .from("plan_bma_symbols")
      .delete()
      .eq("id", symbolId)
      .eq("plan_id", planId);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
