import { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUserId } from "@/lib/supabaseServer";
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
        const userId = await getAuthenticatedUserId(req);
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
            const { data: categories, error } = await supabase
                .from("material_categories")
                .select("*")
                .order("name", { ascending: true });

            if (error) throw error;
            return res.status(200).json({ ok: true, data: categories || [] });
        }

        if (req.method === "POST") {
            if (!isAdmin) {
                return res.status(403).json({ ok: false, error: { message: "Forbidden: Admins only" } });
            }

            const { name } = req.body;
            if (!name || name.trim() === "") {
                return res.status(400).json({ ok: false, error: { message: "Category name is required" } });
            }

            // Check if exists
            const { data: existing } = await supabase
                .from("material_categories")
                .select("id, name")
                .ilike("name", name.trim())
                .maybeSingle();

            if (existing) {
                return res.status(200).json({ ok: true, data: existing });
            }

            const { data: newCategory, error } = await supabase
                .from("material_categories")
                .insert({ name: name.trim() })
                .select()
                .single();

            if (error) throw error;
            return res.status(200).json({ ok: true, data: newCategory });
        }

        if (req.method === "DELETE") {
            if (!isAdmin) {
                return res.status(403).json({ ok: false, error: { message: "Forbidden: Admins only" } });
            }

            const id = req.query.id as string;
            if (!id) {
                return res.status(400).json({ ok: false, error: { message: "Missing category ID" } });
            }

            const { error } = await supabase
                .from("material_categories")
                .delete()
                .eq("id", id);

            if (error) throw error;
            return res.status(200).json({ ok: true, data: { success: true } });
        }

        if (req.method === "PUT") {
            if (!isAdmin) {
                return res.status(403).json({ ok: false, error: { message: "Forbidden: Admins only" } });
            }

            const { id, name: newName } = req.body;
            if (!id || !newName || newName.trim() === "") {
                return res.status(400).json({ ok: false, error: { message: "Category ID and new name are required" } });
            }

            // Get old name first
            const { data: existing, error: fetchError } = await supabase
                .from("material_categories")
                .select("name")
                .eq("id", id)
                .single();

            if (fetchError || !existing) {
                return res.status(404).json({ ok: false, error: { message: "Category not found" } });
            }

            const oldName = existing.name;
            const trimmedNew = newName.trim();

            // Update category name
            const { data: updatedCat, error: updateError } = await supabase
                .from("material_categories")
                .update({ name: trimmedNew })
                .eq("id", id)
                .select()
                .single();

            if (updateError) throw updateError;

            // Cascade update materials that had the old category name
            await supabase
                .from("materials")
                .update({ category: trimmedNew })
                .eq("category", oldName);

            return res.status(200).json({ ok: true, data: updatedCat });
        }

        res.setHeader("Allow", ["GET", "POST", "PUT", "DELETE"]);
        return res.status(405).json({ ok: false, error: { message: `Method ${req.method} not allowed` } });
    } catch (error: any) {
        console.error("Material Categories API error:", error);
        return res.status(500).json({ ok: false, error: { message: error.message || "Internal server error" } });
    }
}
