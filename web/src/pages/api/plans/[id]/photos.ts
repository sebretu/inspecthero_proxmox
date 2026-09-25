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

  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return res.status(401).json({ error: "AUTH_INVALID" });

  const planId = req.query.id as string;
  if (!planId) return res.status(400).json({ error: "Missing planId" });

  const adminClient = getSupabaseAdminClient();

  // Check user role
  const { data: profile } = await adminClient
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .maybeSingle();

  const role = (profile?.role || "").toUpperCase();
  const isAdmin = role === "ADMIN";

  // All authenticated users can add montage photo pins (POST)
  // Editing and deleting are checked per-item (creator or admin)

  // GET /api/plans/[id]/photos
  if (req.method === "GET") {
    try {
      const { data, error } = await adminClient
        .from("plan_photo_pins")
        .select("id, plan_id, x_norm, y_norm, image_url, storage_path, description, pin_type, created_by, created_at")
        .eq("plan_id", planId)
        .order("created_at", { ascending: true });

      if (error) {
        if (error.message?.includes("does not exist") || error.code === "42P01") {
          return res.status(200).json({ ok: true, data: [] });
        }
        return res.status(500).json({ error: error.message });
      }

      // Populate creator profile names
      const userIds = Array.from(new Set((data || []).map((p) => p.created_by).filter(Boolean)));
      let profileMap: Record<string, string> = {};
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

      const enriched = (data || []).map((pin) => ({
        ...pin,
        pin_type: pin.pin_type || "photo",
        author_name: profileMap[pin.created_by] || null,
      }));

      return res.status(200).json({ ok: true, data: enriched });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to fetch photo pins" });
    }
  }

  // POST /api/plans/[id]/photos
  if (req.method === "POST") {
    try {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const { x_norm, y_norm, image_url, storage_path, description, pin_type } = body || {};

      const x = Number(x_norm);
      const y = Number(y_norm);

      if (isNaN(x) || x < 0 || x > 1 || isNaN(y) || y < 0 || y > 1) {
        return res.status(400).json({ error: "x_norm and y_norm must be valid numbers between 0 and 1" });
      }

      const img = image_url && typeof image_url === "string" && image_url.trim() ? image_url.trim() : null;
      const desc = description && typeof description === "string" && description.trim() ? description.trim() : null;
      const type = pin_type === "montage" ? "montage" : pin_type === "damage" ? "damage" : "photo";

      if (!img && !desc) {
        return res.status(400).json({ error: "Either a photo or a description is required" });
      }

      const row = {
        plan_id: planId,
        x_norm: x,
        y_norm: y,
        image_url: img,
        storage_path: storage_path ? String(storage_path).trim() : null,
        description: desc,
        pin_type: type,
        created_by: user.id,
      };

      const { data: inserted, error: insertErr } = await adminClient
        .from("plan_photo_pins")
        .insert(row)
        .select("id, plan_id, x_norm, y_norm, image_url, storage_path, description, pin_type, created_by, created_at")
        .single();

      if (insertErr) {
        if (insertErr.message?.includes("does not exist") || insertErr.code === "42P01") {
          return res.status(503).json({ error: "Tabela plan_photo_pins nie istnieje w bazie danych." });
        }
        return res.status(500).json({ error: insertErr.message });
      }

      return res.status(200).json({
        ok: true,
        data: {
          ...inserted,
          pin_type: inserted.pin_type || type,
          author_name: profile?.full_name || null,
        },
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to create photo pin" });
    }
  }

  // PATCH /api/plans/[id]/photos
  if (req.method === "PATCH") {
    try {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const { id: photoId, description, x_norm, y_norm, pin_type } = body || {};
      if (!photoId) return res.status(400).json({ error: "Missing photoId" });

      const updates: any = { updated_at: new Date().toISOString() };
      if (description !== undefined) updates.description = description ? String(description).trim() : null;
      if (x_norm !== undefined) updates.x_norm = Number(x_norm);
      if (y_norm !== undefined) updates.y_norm = Number(y_norm);
      if (pin_type !== undefined) updates.pin_type = (pin_type === "montage" || pin_type === "damage") ? pin_type : "photo";

      const { data: updated, error: updateErr } = await adminClient
        .from("plan_photo_pins")
        .update(updates)
        .eq("id", photoId)
        .eq("plan_id", planId)
        .select("id, plan_id, x_norm, y_norm, image_url, storage_path, description, pin_type, created_by, created_at")
        .single();

      if (updateErr) return res.status(500).json({ error: updateErr.message });

      return res.status(200).json({
        ok: true,
        data: {
          ...updated,
          author_name: profile?.full_name || null,
        },
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to update photo pin" });
    }
  }

  // DELETE /api/plans/[id]/photos?photoId=...
  if (req.method === "DELETE") {
    try {
      const photoId = String(req.query.photoId || "").trim();
      if (!photoId) return res.status(400).json({ error: "Missing photoId" });

      const { data: existing, error: fetchErr } = await adminClient
        .from("plan_photo_pins")
        .select("id, created_by, storage_path")
        .eq("id", photoId)
        .eq("plan_id", planId)
        .maybeSingle();

      if (fetchErr) return res.status(500).json({ error: fetchErr.message });
      if (!existing) return res.status(404).json({ error: "Photo pin not found" });

      if (!isAdmin && existing.created_by !== user.id) {
        return res.status(403).json({ error: "FORBIDDEN: You can only delete your own montage pins" });
      }

      // Delete file from storage if stored in task-photos
      if (existing.storage_path) {
        try {
          await adminClient.storage.from("task-photos").remove([existing.storage_path]);
        } catch {
          // ignore storage delete errors
        }
      }

      const { error: delErr } = await adminClient
        .from("plan_photo_pins")
        .delete()
        .eq("id", photoId);

      if (delErr) return res.status(500).json({ error: delErr.message });

      return res.status(200).json({ ok: true, deleted: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to delete photo pin" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
