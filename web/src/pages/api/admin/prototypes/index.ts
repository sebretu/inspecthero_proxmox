import type { NextApiRequest, NextApiResponse } from "next";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const supabase = getSupabaseAdminClient();
  const { category, search, active, status } = req.query;

  try {
    // 1. Fetch categories with counts
    const { data: categoriesData, error: catError } = await supabase
      .from("prototype_categories")
      .select("*")
      .order("name", { ascending: true });

    if (catError) throw catError;

    // 2. Fetch prototypes
    let query = supabase
      .from("prototype_symbols")
      .select("*")
      .order("created_at", { ascending: false });

    if (category && typeof category === "string" && category !== "all") {
      query = query.eq("category", category);
    }

    if (active === "true") {
      query = query.eq("active", true);
    } else if (active === "false") {
      query = query.eq("active", false);
    }

    if (status && typeof status === "string") {
      query = query.eq("embedding_status", status);
    }

    if (search && typeof search === "string" && search.trim() !== "") {
      const q = `%${search.trim()}%`;
      query = query.or(`filename.ilike.${q},category.ilike.${q},notes.ilike.${q},id.eq.${search.trim()}`);
    }

    const { data: prototypes, error: protoError } = await query;
    if (protoError) throw protoError;

    // Calculate category counts
    const countsMap: Record<string, { total: number; active: number }> = {};
    (categoriesData || []).forEach((c) => {
      countsMap[c.slug] = { total: 0, active: 0 };
    });

    (prototypes || []).forEach((p) => {
      if (!countsMap[p.category]) {
        countsMap[p.category] = { total: 0, active: 0 };
      }
      countsMap[p.category].total += 1;
      if (p.active) {
        countsMap[p.category].active += 1;
      }
    });

    // Generate public storage URLs for prototypes
    const enrichedPrototypes = (prototypes || []).map((p) => {
      let publicUrl = "";
      if (p.storage_path) {
        const { data: urlData } = supabase.storage
          .from("prototype-library")
          .getPublicUrl(p.storage_path);
        publicUrl = urlData?.publicUrl || "";
      }
      return {
        ...p,
        public_url: publicUrl,
        has_embedding: Array.isArray(p.embedding) && p.embedding.length > 0
      };
    });

    return res.status(200).json({
      ok: true,
      categories: categoriesData || [],
      category_counts: countsMap,
      prototypes: enrichedPrototypes,
      total_count: enrichedPrototypes.length
    });
  } catch (err: any) {
    console.error("[api/admin/prototypes/index] Error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
