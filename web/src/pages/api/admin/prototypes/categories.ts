import type { NextApiRequest, NextApiResponse } from "next";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = getSupabaseAdminClient();

  if (req.method === "GET") {
    try {
      const { data: categories, error } = await supabase
        .from("prototype_categories")
        .select("*")
        .order("name", { ascending: true });

      if (error) throw error;
      return res.status(200).json({ ok: true, categories: categories || [] });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  if (req.method === "POST") {
    try {
      const { name, slug, description } = req.body || {};
      if (!name || !name.trim()) {
        return res.status(400).json({ ok: false, error: "Category name is required" });
      }

      const categorySlug = (slug || name).toLowerCase().replace(/[^a-z0-9_]/g, "_");

      const { data: inserted, error } = await supabase
        .from("prototype_categories")
        .insert({
          slug: categorySlug,
          name: name.trim(),
          description: description || null,
        })
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json({ ok: true, category: inserted });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  if (req.method === "PUT") {
    try {
      const { id, name, description } = req.body || {};
      if (!id || !name) {
        return res.status(400).json({ ok: false, error: "ID and name are required" });
      }

      const { data: updated, error } = await supabase
        .from("prototype_categories")
        .update({ name: name.trim(), description: description || null, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json({ ok: true, category: updated });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  if (req.method === "DELETE") {
    try {
      const { id } = req.query;
      if (!id || typeof id !== "string") {
        return res.status(400).json({ ok: false, error: "Category ID required" });
      }

      const { error } = await supabase.from("prototype_categories").delete().eq("id", id);
      if (error) throw error;

      return res.status(200).json({ ok: true, message: "Category deleted" });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  res.setHeader("Allow", ["GET", "POST", "PUT", "DELETE"]);
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
