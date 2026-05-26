import { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { getUserIdFromRequest } from "@/lib/supabaseServer";
import { fixUtf8Encoding } from "@/lib/translator";

function getAdminClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    return createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false }
    });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        const userId = getUserIdFromRequest(req);
        if (!userId) {
            return res.status(401).json({ ok: false, error: { message: "Unauthorized" } });
        }

        const supabase = getAdminClient();

        // Get user role
        const { data: profile } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", userId)
            .single();

        const isAdmin = profile?.role === "ADMIN" || profile?.role === "admin";

        if (req.method === "GET") {
            const { search, page, limit, favoritesOnly } = req.query;
            const p = parseInt(page as string) || 1;
            const l = parseInt(limit as string) || 200;
            const from = (p - 1) * l;
            const to = from + l - 1;

            let query = supabase
                .from("materials")
                .select("*", { count: "exact" })
                .order("name", { ascending: true });

            if (favoritesOnly === 'true') {
                query = query.eq("is_favorite", true);
            }

            if (search) {
                const words = (search as string).split(/\s+/).filter(w => w.length > 0);
                for (const word of words) {
                    const safeWord = word.replace(/,/g, "");
                    if (safeWord) {
                        query = query.or(`name.ilike.%${safeWord}%,display_name.ilike.%${safeWord}%,category.ilike.%${safeWord}%,article_number.ilike.%${safeWord}%`);
                    }
                }
            }

            const { data: materials, error, count } = await query.range(from, to);

            if (error) throw error;
            const fixedMaterials = (materials || []).map(m => ({
                ...m,
                name: fixUtf8Encoding(m.name),
                display_name: m.display_name ? fixUtf8Encoding(m.display_name) : null,
                unit: fixUtf8Encoding(m.unit),
                category: fixUtf8Encoding(m.category),
                article_number: fixUtf8Encoding(m.article_number),
                is_favorite: !!m.is_favorite
            }));
            return res.status(200).json({ ok: true, data: { items: fixedMaterials, total: count || 0 } });
        }

        if (req.method === "POST") {
            const { name, display_name, unit, category, article_number, is_favorite } = req.body;
            if (!name || !unit) {
                return res.status(400).json({ ok: false, error: { message: "Name and unit are required" } });
            }

            let existingQuery = supabase
                .from("materials")
                .select("id, name, display_name, unit, category, article_number, is_favorite");

            if (article_number && article_number.trim() !== "") {
                existingQuery = existingQuery.or(`name.ilike."${name.trim()}",article_number.eq."${article_number.trim()}"`);
            } else {
                existingQuery = existingQuery.ilike("name", name.trim());
            }

            const { data: existing } = await existingQuery.maybeSingle();

            if (existing) {
                const shouldUpdate = article_number && !existing.article_number;
                const shouldUpdateDisplayName = display_name && !existing.display_name;
                const shouldUpdateFavorite = typeof is_favorite === "boolean" && existing.is_favorite !== is_favorite;

                if (shouldUpdate || shouldUpdateFavorite || shouldUpdateDisplayName) {
                    const { data: updated, error: updateErr } = await supabase
                        .from("materials")
                        .update({
                            article_number: shouldUpdate ? article_number.trim() : existing.article_number,
                            display_name: shouldUpdateDisplayName ? display_name.trim() : existing.display_name,
                            category: category && !existing.category ? category.trim() : existing.category,
                            is_favorite: shouldUpdateFavorite ? is_favorite : existing.is_favorite
                        })
                        .eq("id", existing.id)
                        .select()
                        .single();
                    if (!updateErr) return res.status(200).json({ ok: true, data: updated });
                }
                return res.status(200).json({ ok: true, data: existing });
            }

            const { data: material, error } = await supabase
                .from("materials")
                .insert({
                    name: name.trim(),
                    display_name: display_name ? display_name.trim() : null,
                    unit: unit.trim(),
                    category: category ? category.trim() : null,
                    article_number: article_number ? article_number.trim() : null,
                    is_favorite: typeof is_favorite === "boolean" ? is_favorite : false
                })
                .select()
                .single();

            if (error) throw error;
            return res.status(200).json({ ok: true, data: material });
        }

        if (req.method === "PUT") {
            if (!isAdmin) {
                return res.status(403).json({ ok: false, error: { message: "Forbidden: Admins only" } });
            }

            const { id, name, display_name, unit, category, article_number, is_favorite } = req.body;
            if (!id || !name || !unit) {
                return res.status(400).json({ ok: false, error: { message: "ID, name and unit are required" } });
            }

            const { data: existing } = await supabase
                .from("materials")
                .select("id")
                .ilike("name", name.trim())
                .neq("id", id)
                .maybeSingle();

            if (existing) {
                return res.status(400).json({ ok: false, error: { message: "Material with this name already exists" } });
            }

            const updateData: any = {
                name: name.trim(),
                unit: unit.trim(),
            };

            if (display_name !== undefined) updateData.display_name = display_name ? display_name.trim() : null;
            if (category !== undefined) updateData.category = category ? category.trim() : null;
            if (article_number !== undefined) updateData.article_number = article_number ? article_number.trim() : null;
            if (is_favorite !== undefined) updateData.is_favorite = typeof is_favorite === "boolean" ? is_favorite : false;

            const { data: material, error } = await supabase
                .from("materials")
                .update(updateData)
                .eq("id", id)
                .select()
                .single();

            if (error) throw error;
            return res.status(200).json({ ok: true, data: material });
        }

        if (req.method === "DELETE") {
            if (!isAdmin) {
                return res.status(403).json({ ok: false, error: { message: "Forbidden: Admins only" } });
            }

            const id = req.query.id as string;
            if (!id) {
                return res.status(400).json({ ok: false, error: { message: "Missing material ID" } });
            }

            const { error } = await supabase
                .from("materials")
                .delete()
                .eq("id", id);

            if (error) throw error;
            return res.status(200).json({ ok: true, data: { success: true } });
        }

        res.setHeader("Allow", ["GET", "POST", "PUT", "DELETE"]);
        return res.status(405).json({ ok: false, error: { message: `Method ${req.method} not allowed` } });
    } catch (error: any) {
        console.error("Materials API error:", error);
        return res.status(500).json({ ok: false, error: { message: error.message || "Internal server error" } });
    }
}
