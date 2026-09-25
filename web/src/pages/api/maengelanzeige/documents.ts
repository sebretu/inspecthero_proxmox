import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let supabase: any;
  let userId: string | null = null;
  try {
    const result = createServerSupabaseClient(req);
    supabase = result.client;
    userId = result.userId;
    if (!userId) return res.status(401).json({ ok: false, error: { message: "Unauthorized" } });
  } catch {
    return res.status(401).json({ ok: false, error: { message: "Unauthorized" } });
  }

  const admin = getSupabaseAdminClient();

  // GET: List documents by projectId
  if (req.method === "GET") {
    const projectId = String(req.query.projectId || "").trim();
    if (!projectId) {
      return res.status(400).json({ ok: false, error: { message: "Missing projectId" } });
    }

    try {
      const { data: docs, error } = await admin
        .from("maengelanzeige_documents")
        .select(`
          *,
          maengelanzeige_items (
            id,
            is_selected,
            status
          )
        `)
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (error) {
        return res.status(500).json({ ok: false, error: { message: error.message } });
      }

      const formatted = (docs || []).map((doc: any) => {
        const items = doc.maengelanzeige_items || [];
        const itemsCount = items.length;
        const selectedCount = items.filter((i: any) => i.is_selected).length;
        const doneCount = items.filter((i: any) => i.status === "DONE" && i.is_selected).length;
        const { maengelanzeige_items, ...rest } = doc;
        return {
          ...rest,
          items_count: itemsCount,
          selected_count: selectedCount,
          done_count: doneCount,
        };
      });

      return res.status(200).json({ ok: true, data: formatted });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: { message: err.message } });
    }
  }

  // PATCH: Update document (title or status)
  if (req.method === "PATCH") {
    const { id, title, status } = req.body || {};
    if (!id) {
      return res.status(400).json({ ok: false, error: { message: "Missing document id" } });
    }

    try {
      const updates: any = { updated_at: new Date().toISOString() };
      if (typeof title === "string" && title.trim()) updates.title = title.trim();
      if (typeof status === "string" && status.trim()) updates.status = status.trim();

      const { data, error } = await admin
        .from("maengelanzeige_documents")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json({ ok: true, data });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: { message: err.message } });
    }
  }

  // POST: Create a new manual document (Mängelliste)
  if (req.method === "POST") {
    const { projectId, title } = req.body || {};
    if (!projectId || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ ok: false, error: { message: "Missing projectId or title" } });
    }

    try {
      const cleanTitle = title.trim();
      const { data, error } = await admin
        .from("maengelanzeige_documents")
        .insert({
          project_id: projectId,
          title: cleanTitle,
          file_name: `${cleanTitle}.pdf`,
          storage_bucket: "maengelanzeige-documents",
          storage_path: `manual/${projectId}/${Date.now()}_manual.pdf`,
          total_pages: 1,
          status: "ACTIVE",
          uploaded_by: userId,
        })
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json({
        ok: true,
        data: {
          ...data,
          items_count: 0,
          selected_count: 0,
          done_count: 0,
        },
      });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: { message: err.message } });
    }
  }

  // DELETE: Remove document
  if (req.method === "DELETE") {
    const id = String(req.query.id || req.body?.id || "").trim();
    if (!id) {
      return res.status(400).json({ ok: false, error: { message: "Missing document id" } });
    }

    try {
      // Get document to delete file from storage
      const { data: doc } = await admin
        .from("maengelanzeige_documents")
        .select("storage_bucket, storage_path")
        .eq("id", id)
        .single();

      if (doc?.storage_path) {
        await admin.storage
          .from(doc.storage_bucket || "maengelanzeige")
          .remove([doc.storage_path])
          .catch(() => {});
      }

      const { error } = await admin.from("maengelanzeige_documents").delete().eq("id", id);
      if (error) throw error;

      return res.status(200).json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: { message: err.message } });
    }
  }

  res.setHeader("Allow", ["GET", "POST", "PATCH", "DELETE"]);
  return res.status(405).json({ ok: false, error: { message: "Method Not Allowed" } });
}
