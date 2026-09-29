import type { NextApiRequest, NextApiResponse } from "next";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { createClient } from "@supabase/supabase-js";

export type MaterialItem = {
  id: string;
  material_id?: string | null;
  name: string;
  article_number?: string | null;
  category?: string | null;
  quantity: number;
  unit: string;
  photo_url?: string | null;
  storage_path?: string | null;
  notes?: string | null;
};

export type MaterialPin = {
  id: string;
  plan_id: string;
  project_id?: string | null;
  x_norm: number;
  y_norm: number;
  title?: string | null;
  status?: "PENDING" | "ORDERED" | "DELIVERED" | string;
  notes?: string | null;
  photo_url?: string | null;
  storage_path?: string | null;
  items: MaterialItem[];
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
  author_name?: string | null;
};

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

  // Helper to parse items from payload or description fallback
  const parseItems = (val: any): MaterialItem[] => {
    if (Array.isArray(val)) return val;
    if (typeof val === "string") {
      try {
        const parsed = JSON.parse(val);
        if (Array.isArray(parsed)) return parsed;
        if (parsed && Array.isArray(parsed.items)) return parsed.items;
      } catch {}
    }
    return [];
  };

  // GET: Fetch all material pins for this plan
  if (req.method === "GET") {
    try {
      // 1. Try fetching from plan_material_pins
      const { data: matData, error: matErr } = await adminClient
        .from("plan_material_pins")
        .select("*")
        .eq("plan_id", planId)
        .order("created_at", { ascending: true });

      let pins: any[] = [];

      if (!matErr && matData) {
        pins = matData.map((p) => ({
          ...p,
          items: parseItems(p.items),
        }));
      } else {
        // 2. Fallback to plan_photo_pins where pin_type = 'material'
        const { data: photoData, error: photoErr } = await adminClient
          .from("plan_photo_pins")
          .select("id, plan_id, x_norm, y_norm, image_url, storage_path, description, pin_type, created_by, created_at")
          .eq("plan_id", planId)
          .eq("pin_type", "material")
          .order("created_at", { ascending: true });

        if (!photoErr && photoData) {
          pins = photoData.map((p) => {
            let parsedItems: MaterialItem[] = [];
            let title = "";
            let notes = "";
            let status = "PENDING";

            if (p.description) {
              try {
                const j = JSON.parse(p.description);
                if (Array.isArray(j)) {
                  parsedItems = j;
                } else if (typeof j === "object" && j !== null) {
                  parsedItems = Array.isArray(j.items) ? j.items : [];
                  title = j.title || "";
                  notes = j.notes || "";
                  status = j.status || "PENDING";
                }
              } catch {
                notes = p.description;
              }
            }

            return {
              id: p.id,
              plan_id: p.plan_id,
              x_norm: p.x_norm,
              y_norm: p.y_norm,
              title: title || undefined,
              status,
              notes: notes || undefined,
              photo_url: p.image_url,
              storage_path: p.storage_path,
              items: parsedItems,
              created_by: p.created_by,
              created_at: p.created_at,
            };
          });
        }
      }

      // Populate author names
      const userIds = Array.from(new Set(pins.map((p) => p.created_by).filter(Boolean)));
      const profileMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await adminClient
          .from("profiles")
          .select("id, full_name")
          .in("id", userIds);
        if (profiles) {
          profiles.forEach((pr) => {
            profileMap[pr.id] = pr.full_name;
          });
        }
      }

      const enriched = pins.map((p) => ({
        ...p,
        author_name: p.created_by ? profileMap[p.created_by] || null : null,
      }));

      return res.status(200).json({ ok: true, data: enriched });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to fetch material pins" });
    }
  }

  // POST: Create a new material pin
  if (req.method === "POST") {
    try {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const {
        x_norm,
        y_norm,
        title,
        notes,
        status = "PENDING",
        photo_url,
        storage_path,
        items = [],
        project_id,
      } = body || {};

      const x = Number(x_norm);
      const y = Number(y_norm);

      if (isNaN(x) || x < 0 || x > 1 || isNaN(y) || y < 0 || y > 1) {
        return res.status(400).json({ error: "x_norm and y_norm must be valid numbers between 0 and 1" });
      }

      const validItems: MaterialItem[] = (Array.isArray(items) ? items : []).map((it, idx) => ({
        id: it.id || `item-${Date.now()}-${idx}-${Math.random().toString(16).slice(2, 6)}`,
        material_id: it.material_id || null,
        name: String(it.name || "").trim(),
        article_number: it.article_number ? String(it.article_number).trim() : null,
        category: it.category ? String(it.category).trim() : null,
        quantity: Math.max(0.1, Number(it.quantity) || 1),
        unit: it.unit ? String(it.unit).trim() : "St",
        photo_url: it.photo_url || null,
        storage_path: it.storage_path || null,
        notes: it.notes ? String(it.notes).trim() : null,
      })).filter((it) => it.name.length > 0);

      // Try inserting into plan_material_pins first
      const { data: insData, error: insErr } = await adminClient
        .from("plan_material_pins")
        .insert({
          plan_id: planId,
          project_id: project_id || null,
          x_norm: x,
          y_norm: y,
          title: title ? String(title).trim() : null,
          status,
          notes: notes ? String(notes).trim() : null,
          photo_url: photo_url || null,
          storage_path: storage_path || null,
          items: validItems,
          created_by: user.id,
        })
        .select()
        .single();

      if (!insErr && insData) {
        return res.status(201).json({
          ok: true,
          data: {
            ...insData,
            items: parseItems(insData.items),
          },
        });
      }

      // Fallback: insert into plan_photo_pins with pin_type = 'material'
      const payloadDesc = JSON.stringify({
        title: title ? String(title).trim() : undefined,
        status,
        notes: notes ? String(notes).trim() : undefined,
        items: validItems,
      });

      const { data: fbData, error: fbErr } = await adminClient
        .from("plan_photo_pins")
        .insert({
          plan_id: planId,
          x_norm: x,
          y_norm: y,
          image_url: photo_url || (validItems.find((it) => it.photo_url)?.photo_url || null),
          storage_path: storage_path || null,
          description: payloadDesc,
          pin_type: "material",
          created_by: user.id,
        })
        .select()
        .single();

      if (fbErr) {
        return res.status(500).json({ error: fbErr.message });
      }

      return res.status(201).json({
        ok: true,
        data: {
          id: fbData.id,
          plan_id: fbData.plan_id,
          x_norm: fbData.x_norm,
          y_norm: fbData.y_norm,
          title: title || undefined,
          status,
          notes: notes || undefined,
          photo_url: fbData.image_url,
          storage_path: fbData.storage_path,
          items: validItems,
          created_by: fbData.created_by,
          created_at: fbData.created_at,
        },
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to create material pin" });
    }
  }

  // PATCH: Update an existing material pin
  if (req.method === "PATCH") {
    try {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const { id, title, notes, status, photo_url, storage_path, items, x_norm, y_norm } = body || {};

      if (!id) return res.status(400).json({ error: "Missing pin id" });

      const updates: any = { updated_at: new Date().toISOString() };
      if (title !== undefined) updates.title = title ? String(title).trim() : null;
      if (notes !== undefined) updates.notes = notes ? String(notes).trim() : null;
      if (status !== undefined) updates.status = status;
      if (photo_url !== undefined) updates.photo_url = photo_url;
      if (storage_path !== undefined) updates.storage_path = storage_path;
      if (x_norm !== undefined) updates.x_norm = Number(x_norm);
      if (y_norm !== undefined) updates.y_norm = Number(y_norm);

      if (items !== undefined) {
        updates.items = (Array.isArray(items) ? items : []).map((it, idx) => ({
          id: it.id || `item-${Date.now()}-${idx}-${Math.random().toString(16).slice(2, 6)}`,
          material_id: it.material_id || null,
          name: String(it.name || "").trim(),
          article_number: it.article_number ? String(it.article_number).trim() : null,
          category: it.category ? String(it.category).trim() : null,
          quantity: Math.max(0.1, Number(it.quantity) || 1),
          unit: it.unit ? String(it.unit).trim() : "St",
          photo_url: it.photo_url || null,
          storage_path: it.storage_path || null,
          notes: it.notes ? String(it.notes).trim() : null,
        })).filter((it) => it.name.length > 0);
      }

      // Try updating plan_material_pins
      const { data: upData, error: upErr } = await adminClient
        .from("plan_material_pins")
        .update(updates)
        .eq("id", id)
        .eq("plan_id", planId)
        .select()
        .single();

      if (!upErr && upData) {
        return res.status(200).json({
          ok: true,
          data: {
            ...upData,
            items: parseItems(upData.items),
          },
        });
      }

      // Fallback: update plan_photo_pins
      const photoUpdates: any = {};
      if (x_norm !== undefined) photoUpdates.x_norm = Number(x_norm);
      if (y_norm !== undefined) photoUpdates.y_norm = Number(y_norm);
      if (photo_url !== undefined) photoUpdates.image_url = photo_url;
      if (storage_path !== undefined) photoUpdates.storage_path = storage_path;

      // Fetch existing pin description
      const { data: existing } = await adminClient
        .from("plan_photo_pins")
        .select("description, image_url")
        .eq("id", id)
        .single();

      let prevObj: any = {};
      if (existing?.description) {
        try {
          prevObj = JSON.parse(existing.description);
        } catch {
          prevObj = { notes: existing.description };
        }
      }

      const mergedDesc = JSON.stringify({
        ...prevObj,
        ...(title !== undefined ? { title } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(items !== undefined ? { items: updates.items } : {}),
      });

      photoUpdates.description = mergedDesc;

      const { data: fbUp, error: fbUpErr } = await adminClient
        .from("plan_photo_pins")
        .update(photoUpdates)
        .eq("id", id)
        .select()
        .single();

      if (fbUpErr) {
        return res.status(500).json({ error: fbUpErr.message });
      }

      return res.status(200).json({
        ok: true,
        data: {
          id: fbUp.id,
          plan_id: fbUp.plan_id,
          x_norm: fbUp.x_norm,
          y_norm: fbUp.y_norm,
          photo_url: fbUp.image_url,
          items: updates.items || prevObj.items || [],
        },
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to update material pin" });
    }
  }

  // DELETE: Remove a material pin
  if (req.method === "DELETE") {
    try {
      const pinId = (req.query.pinId as string) || (req.body?.id as string);
      if (!pinId) return res.status(400).json({ error: "Missing pinId" });

      // Try deleting from plan_material_pins
      await adminClient.from("plan_material_pins").delete().eq("id", pinId).eq("plan_id", planId);

      // Also try deleting from plan_photo_pins
      await adminClient.from("plan_photo_pins").delete().eq("id", pinId).eq("plan_id", planId);

      return res.status(200).json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to delete material pin" });
    }
  }

  res.setHeader("Allow", ["GET", "POST", "PATCH", "DELETE"]);
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}
