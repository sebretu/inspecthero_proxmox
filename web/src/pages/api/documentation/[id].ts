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

  const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
  if (!id) {
    return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing documentation id" } });
  }

  const adminClient = getSupabaseAdminClient();

  // GET: Single documentation with all points
  if (req.method === "GET") {
    try {
      const { data: doc, error: docErr } = await adminClient
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
            *
          )
        `)
        .eq("id", id)
        .single();

      if (docErr || !doc) {
        return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Dokumentation nicht gefunden" } });
      }

      // Sort points by point_number and auto-repair any gaps sequentially
      if (Array.isArray(doc.photo_doc_points)) {
        doc.photo_doc_points.sort((a: any, b: any) => (a.point_number || 0) - (b.point_number || 0));
        for (let i = 0; i < doc.photo_doc_points.length; i++) {
          const expectedNum = i + 1;
          const pt = doc.photo_doc_points[i];
          if (pt.point_number !== expectedNum) {
            let updatedTitle = pt.title;
            if (/^Punkt\s*#?\d+$/i.test(pt.title) || /^Point\s*#?\d+$/i.test(pt.title)) {
              updatedTitle = pt.title.replace(/\d+$/, String(expectedNum));
            }
            pt.point_number = expectedNum;
            pt.title = updatedTitle;
            await adminClient
              .from("photo_doc_points")
              .update({ point_number: expectedNum, title: updatedTitle })
              .eq("id", pt.id);
          }
        }
      }

      return res.status(200).json({ ok: true, data: doc });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: { code: "SERVER_ERROR", message: err.message } });
    }
  }

  // PATCH: Update documentation
  if (req.method === "PATCH") {
    try {
      const updates: Record<string, any> = { updated_at: new Date().toISOString() };
      const { title, description, location, project_id, author_name, company_name, main_image_url, main_image_path, main_image_width, main_image_height, metadata } = req.body || {};

      if (title !== undefined) updates.title = String(title).trim();
      if (description !== undefined) updates.description = description ? String(description).trim() : null;
      if (location !== undefined) updates.location = location ? String(location).trim() : null;
      if (project_id !== undefined) updates.project_id = project_id || null;
      if (author_name !== undefined) updates.author_name = author_name ? String(author_name).trim() : null;
      if (company_name !== undefined) updates.company_name = company_name ? String(company_name).trim() : null;
      if (main_image_url !== undefined) updates.main_image_url = main_image_url;
      if (main_image_path !== undefined) updates.main_image_path = main_image_path;
      if (main_image_width !== undefined) updates.main_image_width = main_image_width;
      if (main_image_height !== undefined) updates.main_image_height = main_image_height;
      if (metadata !== undefined) updates.metadata = metadata;

      const { data, error } = await adminClient
        .from("photo_documentations")
        .update(updates)
        .eq("id", id)
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
            *
          )
        `)
        .single();

      if (error) {
        return res.status(500).json({ ok: false, error: { code: "DB_ERROR", message: error.message } });
      }

      return res.status(200).json({ ok: true, data });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: { code: "SERVER_ERROR", message: err.message } });
    }
  }

  // DELETE: Delete documentation and its storage assets
  if (req.method === "DELETE") {
    try {
      const { data: doc } = await adminClient
        .from("photo_documentations")
        .select("main_image_path, photo_doc_points(photos)")
        .eq("id", id)
        .single();

      // Delete storage files if present
      if (doc) {
        const pathsToDelete: string[] = [];
        if (doc.main_image_path) pathsToDelete.push(doc.main_image_path);

        if (Array.isArray(doc.photo_doc_points)) {
          for (const pt of doc.photo_doc_points) {
            if (Array.isArray(pt.photos)) {
              for (const ph of pt.photos) {
                if (ph?.storage_path) pathsToDelete.push(ph.storage_path);
              }
            }
          }
        }

        if (pathsToDelete.length > 0) {
          await adminClient.storage.from("documentation-photos").remove(pathsToDelete).catch(() => {});
        }
      }

      const { error } = await adminClient
        .from("photo_documentations")
        .delete()
        .eq("id", id);

      if (error) {
        return res.status(500).json({ ok: false, error: { code: "DB_ERROR", message: error.message } });
      }

      return res.status(200).json({ ok: true, data: { deleted: true } });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: { code: "SERVER_ERROR", message: err.message } });
    }
  }

  return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } });
}
