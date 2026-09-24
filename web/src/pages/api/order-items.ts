import { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUserId } from "@/lib/supabaseServer";

function getAdminClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    return createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false }
    });
}

/**
 * /api/order-items
 * - PATCH: Edit an existing item (quantity, custom name/unit)
 * - POST: Add a new item to an order
 * - DELETE: Remove an item from an order
 * Admin only.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        const userId = await getAuthenticatedUserId(req);
        if (!userId) {
            return res.status(401).json({ ok: false, error: { message: "Unauthorized" } });
        }

        const supabase = getAdminClient();

        // Check admin role
        const { data: profile } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", userId)
            .single();

        const isAdmin = profile?.role === "ADMIN" || profile?.role === "admin";

        // Helper to check if user has access to this item's order
        const checkAccess = async (orderId: string) => {
            if (isAdmin) return true;
            const { data: order } = await supabase
                .from("orders")
                .select("user_id, status")
                .eq("id", orderId)
                .single();
            return order && order.user_id === userId && order.status === "CART";
        };

        if (req.method === "PATCH") {
            const { itemId, quantity, customName, customUnit } = req.body;
            if (!itemId) return res.status(400).json({ ok: false, error: { message: "itemId is required" } });

            const { data: currentItem } = await supabase.from("order_items").select("order_id").eq("id", itemId).single();
            if (!currentItem || !(await checkAccess(currentItem.order_id))) {
                return res.status(403).json({ ok: false, error: { message: "Forbidden: No access to this cart" } });
            }

            const updateData: Record<string, any> = {};
            if (quantity !== undefined) {
                const qty = Number(quantity);
                if (isNaN(qty) || qty < 0) return res.status(400).json({ ok: false, error: { message: "Invalid quantity" } });
                updateData.quantity = qty;
            }
            if (customName !== undefined) updateData.custom_name = customName ? customName.trim() : null;
            if (customUnit !== undefined) updateData.custom_unit = customUnit ? customUnit.trim() : null;

            if (Object.keys(updateData).length === 0) return res.status(400).json({ ok: false, error: { message: "Nothing to update" } });

            const { data: item, error } = await supabase.from("order_items").update(updateData).eq("id", itemId).select().single();
            if (error) throw error;
            return res.status(200).json({ ok: true, data: item });
        }

        if (req.method === "POST") {
            const { orderId, materialId, customName, customUnit, quantity, taskId } = req.body;
            if (!orderId) return res.status(400).json({ ok: false, error: { message: "orderId is required" } });
            if (!(await checkAccess(orderId))) return res.status(403).json({ ok: false, error: { message: "Forbidden: No access to this cart" } });

            const insertData: Record<string, any> = {
                order_id: orderId,
                material_id: materialId || null,
                custom_name: materialId ? null : (customName || "").trim(),
                custom_unit: materialId ? null : (customUnit || "szt.").trim(),
                quantity: Number(quantity) || 1,
                task_id: taskId || null
            };

            const { data: item, error } = await supabase.from("order_items").insert(insertData).select().single();
            if (error) throw error;
            return res.status(200).json({ ok: true, data: item });
        }

        if (req.method === "DELETE") {
            const id = req.query.id || req.body.id;
            if (!id) return res.status(400).json({ ok: false, error: { message: "id is required" } });

            const { data: currentItem } = await supabase.from("order_items").select("order_id").eq("id", id).single();
            if (!currentItem || !(await checkAccess(currentItem.order_id))) {
                return res.status(403).json({ ok: false, error: { message: "Forbidden: No access to this cart" } });
            }

            const { error } = await supabase.from("order_items").delete().eq("id", id);
            if (error) throw error;
            return res.status(200).json({ ok: true, data: { deleted: id } });
        }

        res.setHeader("Allow", ["PATCH", "POST", "DELETE"]);
        return res.status(405).json({ ok: false, error: { message: `Method ${req.method} not allowed` } });
    } catch (error: any) {
        console.error("Order items API error:", error);
        return res.status(500).json({ ok: false, error: { message: error.message || "Internal server error" } });
    }
}
