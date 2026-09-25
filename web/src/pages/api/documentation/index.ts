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

  const adminClient = getSupabaseAdminClient();

  // GET: List all documentations
  if (req.method === "GET") {
    try {
      const projectId = typeof req.query.projectId === "string" ? req.query.projectId.trim() : null;
      let query = adminClient
        .from("photo_documentations")
        .select(`
          *,
          projects (
            id,
            name,
            companies (
              name
            )
          ),
          photo_doc_points (
            id,
            point_number,
            title,
            photos
          )
        `)
        .order("created_at", { ascending: false });

      if (projectId) {
        query = query.eq("project_id", projectId);
      }

      const { data, error } = await query;
      if (error) {
        return res.status(500).json({ ok: false, error: { code: "DB_ERROR", message: error.message } });
      }

      const formatted = (data || []).map((doc: any) => {
        const points = doc.photo_doc_points || [];
        const totalPhotos = points.reduce((acc: number, pt: any) => acc + (Array.isArray(pt.photos) ? pt.photos.length : 0), 0);
        return {
          ...doc,
          points_count: points.length,
          total_photos_count: totalPhotos,
        };
      });

      return res.status(200).json({ ok: true, data: formatted });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: { code: "SERVER_ERROR", message: err.message } });
    }
  }

  // POST: Create a new photo documentation
  if (req.method === "POST") {
    try {
      const {
        title,
        description,
        location,
        project_id,
        author_name,
        company_name,
        main_image_url,
        main_image_path,
        main_image_width,
        main_image_height,
        metadata = {},
      } = req.body || {};

      if (!title || typeof title !== "string" || !title.trim()) {
        return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Tytuł dokumentu jest wymagany." } });
      }
      if (!main_image_url || typeof main_image_url !== "string") {
        return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Zdjęcie główne jest wymagane." } });
      }

      const { data, error } = await adminClient
        .from("photo_documentations")
        .insert({
          title: title.trim(),
          description: description ? String(description).trim() : null,
          location: location ? String(location).trim() : null,
          project_id: project_id || null,
          author_name: author_name ? String(author_name).trim() : null,
          company_name: company_name ? String(company_name).trim() : null,
          main_image_url,
          main_image_path: main_image_path || null,
          main_image_width: typeof main_image_width === "number" ? main_image_width : null,
          main_image_height: typeof main_image_height === "number" ? main_image_height : null,
          metadata,
          created_by: requester.id,
        })
        .select(`
          *,
          projects (
            id,
            name,
            companies (
              name
            )
          )
        `)
        .single();

      if (error) {
        return res.status(500).json({ ok: false, error: { code: "DB_ERROR", message: error.message } });
      }

      return res.status(201).json({ ok: true, data });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: { code: "SERVER_ERROR", message: err.message } });
    }
  }

  return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } });
}
