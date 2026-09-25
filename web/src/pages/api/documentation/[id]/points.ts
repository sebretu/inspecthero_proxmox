import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { requireRequesterProfile, isAdminRole } from "@/lib/requesterProfile";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let supabase: any;
  let userId: string | null = null;
  try {
    ({ client: supabase, userId } = createServerSupabaseClient(req));
  } catch {
    return res.status(401).json({ ok: false, error: { code: "AUTH_INVALID", message: "Missing or invalid token" } });
  }

  let requester: { id: string; role: string | null };
  try {
    requester = await requireRequesterProfile(supabase, userId);
  } catch (err: any) {
    return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Unable to load profile" } });
  }

  if (!isAdminRole(requester.role)) {
    return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Nur Administratoren haben Zugriff auf Dokumentation." } });
  }

  const docId = typeof req.query.id === "string" ? req.query.id.trim() : "";
  if (!docId) {
    return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing documentation id" } });
  }

  const adminClient = getSupabaseAdminClient();

  // POST: Add new callout point
  if (req.method === "POST") {
    try {
      const {
        point_number,
        title = "",
        description = "",
        x_norm,
        y_norm,
        callout_x_norm,
        callout_y_norm,
        color = "#00C8FF",
        photos = [],
      } = req.body || {};

      if (typeof x_norm !== "number" || typeof y_norm !== "number") {
        return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Współrzędne punktu (x_norm, y_norm) są wymagane." } });
      }

      // If point_number not passed, compute max + 1
      let num = point_number;
      if (!num) {
        const { data: existingPoints } = await adminClient
          .from("photo_doc_points")
          .select("point_number")
          .eq("documentation_id", docId)
          .order("point_number", { ascending: false })
          .limit(1);
        num = (existingPoints?.[0]?.point_number || 0) + 1;
      }

      const { data, error } = await adminClient
        .from("photo_doc_points")
        .insert({
          documentation_id: docId,
          point_number: num,
          title: String(title || `Punkt ${num}`).trim(),
          description: description ? String(description).trim() : null,
          x_norm,
          y_norm,
          callout_x_norm: typeof callout_x_norm === "number" ? callout_x_norm : null,
          callout_y_norm: typeof callout_y_norm === "number" ? callout_y_norm : null,
          color: color || "#00C8FF",
          photos: Array.isArray(photos) ? photos : [],
        })
        .select("*")
        .single();

      if (error) {
        return res.status(500).json({ ok: false, error: { code: "DB_ERROR", message: error.message } });
      }

      // Update doc's updated_at
      await adminClient
        .from("photo_documentations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", docId);

      return res.status(201).json({ ok: true, data });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: { code: "SERVER_ERROR", message: err.message } });
    }
  }

  // PATCH: Update point (by pointId in body or query)
  if (req.method === "PATCH") {
    try {
      const { pointId, point_number, title, description, x_norm, y_norm, callout_x_norm, callout_y_norm, color, photos } = req.body || {};
      const targetPointId = pointId || (typeof req.query.pointId === "string" ? req.query.pointId.trim() : null);

      if (!targetPointId) {
        return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing pointId" } });
      }

      const updates: Record<string, any> = { updated_at: new Date().toISOString() };
      if (point_number !== undefined) updates.point_number = point_number;
      if (title !== undefined) updates.title = String(title).trim();
      if (description !== undefined) updates.description = description ? String(description).trim() : null;
      if (x_norm !== undefined) updates.x_norm = x_norm;
      if (y_norm !== undefined) updates.y_norm = y_norm;
      if (callout_x_norm !== undefined) updates.callout_x_norm = callout_x_norm;
      if (callout_y_norm !== undefined) updates.callout_y_norm = callout_y_norm;
      if (color !== undefined) updates.color = color;
      if (photos !== undefined) updates.photos = photos;

      const { data, error } = await adminClient
        .from("photo_doc_points")
        .update(updates)
        .eq("id", targetPointId)
        .eq("documentation_id", docId)
        .select("*")
        .single();

      if (error) {
        return res.status(500).json({ ok: false, error: { code: "DB_ERROR", message: error.message } });
      }

      await adminClient
        .from("photo_documentations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", docId);

      return res.status(200).json({ ok: true, data });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: { code: "SERVER_ERROR", message: err.message } });
    }
  }

  // DELETE: Delete point & renumber remaining sequentially
  if (req.method === "DELETE") {
    try {
      const pointId = typeof req.query.pointId === "string" ? req.query.pointId.trim() : (req.body?.pointId || "");
      if (!pointId) {
        return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing pointId" } });
      }

      const { error } = await adminClient
        .from("photo_doc_points")
        .delete()
        .eq("id", pointId)
        .eq("documentation_id", docId);

      if (error) {
        return res.status(500).json({ ok: false, error: { code: "DB_ERROR", message: error.message } });
      }

      // Renumber all remaining points sequentially (e.g. if #11 deleted, #12 becomes #11, #13 becomes #12)
      const { data: remainingPoints } = await adminClient
        .from("photo_doc_points")
        .select("id, point_number, title")
        .eq("documentation_id", docId)
        .order("point_number", { ascending: true })
        .order("created_at", { ascending: true });

      if (remainingPoints && remainingPoints.length > 0) {
        for (let i = 0; i < remainingPoints.length; i++) {
          const expectedNum = i + 1;
          const pt = remainingPoints[i];
          if (pt.point_number !== expectedNum) {
            let updatedTitle = pt.title;
            if (/^Punkt\s*#?\d+$/i.test(pt.title) || /^Point\s*#?\d+$/i.test(pt.title)) {
              updatedTitle = pt.title.replace(/\d+$/, String(expectedNum));
            }
            await adminClient
              .from("photo_doc_points")
              .update({ point_number: expectedNum, title: updatedTitle })
              .eq("id", pt.id);
          }
        }
      }

      await adminClient
        .from("photo_documentations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", docId);

      return res.status(200).json({ ok: true, data: { deleted: true } });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: { code: "SERVER_ERROR", message: err.message } });
    }
  }

  return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } });
}
