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

  // GET: Fetch items for a document
  if (req.method === "GET") {
    const documentId = String(req.query.documentId || "").trim();
    if (!documentId) {
      return res.status(400).json({ ok: false, error: { message: "Missing documentId" } });
    }

    try {
      // Check user role
      const { data: profile } = await admin
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();

      const userRole = (profile?.role || "").toUpperCase();
      const isAdmin = userRole === "ADMIN" || userRole === "MODERATOR";

      let query = admin
        .from("maengelanzeige_items")
        .select(`
          *,
          maengelanzeige_photos (*)
        `)
        .eq("document_id", documentId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (!isAdmin) {
        query = query.neq("status", "NOT_RELEVANT");
      }

      const { data: items, error } = await query;

      if (error) {
        return res.status(500).json({ ok: false, error: { message: error.message } });
      }

      const formatted = (items || []).map((item: any) => ({
        ...item,
        photos: (item.maengelanzeige_photos || []).map((p: any) => {
          let pt = p.photo_type;
          if (!pt) {
            if (p.caption?.startsWith("[VORHER]")) pt = "BEFORE";
            else if (p.caption?.startsWith("[NACHHER]")) pt = "AFTER";
            else pt = "BEFORE";
          }
          return {
            ...p,
            photo_type: pt,
          };
        }),
      }));

      return res.status(200).json({ ok: true, data: formatted });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: { message: err.message } });
    }
  }

  // PATCH: Update item (is_selected, our_documentation, user_documentation, status, trade_or_company, location, export toggles)
  if (req.method === "PATCH") {
    const {
      id,
      is_selected,
      our_documentation,
      user_documentation,
      export_include_before_photos,
      export_include_after_photos,
      export_include_admin_doc,
      export_include_user_doc,
      status,
      assigned_user_id,
      item_number,
      original_text,
      trade_or_company,
      location,
    } = req.body || {};
    const itemId = id || req.query.id;

    if (!itemId) {
      return res.status(400).json({ ok: false, error: { message: "Missing item id" } });
    }

    // Check user role
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();

    const userRole = (profile?.role || "").toUpperCase();
    const isAdmin = userRole === "ADMIN" || userRole === "MODERATOR";

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    // Workers can update user_documentation
    if (typeof user_documentation !== "undefined") updates.user_documentation = user_documentation;

    // Only Admin/Moderator can modify status, Admin documentation, original item text, trade, location, and export toggles
    if (isAdmin) {
      if (typeof status === "string") updates.status = status;
      if (typeof is_selected === "boolean") updates.is_selected = is_selected;
      if (typeof our_documentation !== "undefined") updates.our_documentation = our_documentation;
      if (typeof assigned_user_id !== "undefined") updates.assigned_user_id = assigned_user_id || null;
      if (typeof item_number === "string") updates.item_number = item_number.trim();
      if (typeof original_text === "string") updates.original_text = original_text.trim();
      if (typeof trade_or_company !== "undefined") updates.trade_or_company = trade_or_company ? trade_or_company.trim() : null;
      if (typeof location !== "undefined") updates.location = location ? location.trim() : null;
      if (typeof export_include_before_photos === "boolean") updates.export_include_before_photos = export_include_before_photos;
      if (typeof export_include_after_photos === "boolean") updates.export_include_after_photos = export_include_after_photos;
      if (typeof export_include_admin_doc === "boolean") updates.export_include_admin_doc = export_include_admin_doc;
      if (typeof export_include_user_doc === "boolean") updates.export_include_user_doc = export_include_user_doc;
    }

    try {
      let resUpdate = await admin
        .from("maengelanzeige_items")
        .update(updates)
        .eq("id", itemId)
        .select(`
          *,
          maengelanzeige_photos (*)
        `)
        .single();

      // If error due to missing new column, retry without the new columns
      if (resUpdate.error && resUpdate.error.message?.includes("column")) {
        const fallbackUpdates = { ...updates };
        delete fallbackUpdates.user_documentation;
        delete fallbackUpdates.export_include_before_photos;
        delete fallbackUpdates.export_include_after_photos;
        delete fallbackUpdates.export_include_admin_doc;
        delete fallbackUpdates.export_include_user_doc;

        resUpdate = await admin
          .from("maengelanzeige_items")
          .update(fallbackUpdates)
          .eq("id", itemId)
          .select(`
            *,
            maengelanzeige_photos (*)
          `)
          .single();
      }

      if (resUpdate.error) throw resUpdate.error;

      return res.status(200).json({
        ok: true,
        data: {
          ...resUpdate.data,
          photos: resUpdate.data.maengelanzeige_photos || [],
        },
      });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: { message: err.message } });
    }
  }

  // POST: Add a new manual item to document
  if (req.method === "POST") {
    const {
      document_id,
      project_id,
      item_number,
      original_text,
      our_documentation,
      status,
      is_selected,
      trade_or_company,
      location,
    } = req.body || {};

    if (!document_id || !project_id || !item_number || !original_text) {
      return res.status(400).json({ ok: false, error: { message: "Missing required fields" } });
    }

    try {
      const { data, error } = await admin
        .from("maengelanzeige_items")
        .insert({
          document_id,
          project_id,
          item_number: String(item_number).trim(),
          trade_or_company: trade_or_company ? String(trade_or_company).trim() : null,
          location: location ? String(location).trim() : null,
          page_number: 1,
          original_text: String(original_text).trim(),
          our_documentation: our_documentation || null,
          status: status || "OPEN",
          is_selected: typeof is_selected === "boolean" ? is_selected : true,
          ai_relevance: "RELEVANT",
        })
        .select()
        .single();

      if (error) throw error;

      return res.status(200).json({ ok: true, data: { ...data, photos: [] } });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: { message: err.message } });
    }
  }

  // DELETE: Delete an item
  if (req.method === "DELETE") {
    const id = String(req.query.id || req.body?.id || "").trim();
    if (!id) {
      return res.status(400).json({ ok: false, error: { message: "Missing item id" } });
    }

    try {
      const { error } = await admin.from("maengelanzeige_items").delete().eq("id", id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: { message: err.message } });
    }
  }

  res.setHeader("Allow", ["GET", "PATCH", "POST", "DELETE"]);
  return res.status(405).json({ ok: false, error: { message: "Method Not Allowed" } });
}
