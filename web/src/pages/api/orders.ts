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
        console.log('[orders api] userId from token:', userId);
        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const supabase = getAdminClient();

        // Get user role
        const { data: profile, error: profileErr } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", userId)
            .single();

        console.log('[orders api] profile:', profile, 'profileErr:', profileErr);
        const isAdmin = profile?.role === "ADMIN" || profile?.role === "admin";

        if (req.method === "GET") {
            const projectId = req.query.projectId as string;
            const taskId = req.query.taskId as string;
            const status = req.query.status as string;

            let query = supabase
                .from("orders")
                .select(`
          *,
          user:profiles(id, full_name, role),
            items:order_items(
              id,
              quantity,
              custom_name,
              custom_unit,
              task_id,
              material:materials(id, name, display_name, unit, category, article_number)
            )
        `)
                .order("created_at", { ascending: false });

            if (projectId) {
                query = query.eq("project_id", projectId);
            }

            if (taskId) {
                query = query.eq("task_id", taskId);
            }

            if (status) {
                query = query.eq("status", status);
            } else {
                query = query.neq("status", "CART");
            }

            if (!isAdmin) {
                // Normal users only see their own orders
                query = query.eq("user_id", userId);
            }

            const { data: orders, error } = await query;

            if (error) throw error;

            const fixedOrders = (orders || []).map((order: any) => ({
                ...order,
                items: (order.items || []).map((item: any) => ({
                    ...item,
                    custom_name: fixUtf8Encoding(item.custom_name),
                    material: item.material ? {
                        ...item.material,
                        name: fixUtf8Encoding(item.material.name),
                        display_name: item.material.display_name ? fixUtf8Encoding(item.material.display_name) : null,
                        category: fixUtf8Encoding(item.material.category)
                    } : null
                }))
            }));

            return res.status(200).json({ ok: true, data: fixedOrders });
        }

        if (req.method === "POST") {
            const { projectId, items } = req.body;

            if (!projectId) {
                return res.status(400).json({ error: "projectId is required" });
            }

            if (!items || !Array.isArray(items) || items.length === 0) {
                return res.status(400).json({ error: "Order must contain at least one item" });
            }

            // Check if project exists and user has access (either assigned or admin)
            // For now, simpler check - project must exist
            const { data: projectData, error: projErr } = await supabase
                .from("projects")
                .select("id")
                .eq("id", projectId)
                .single();

            if (projErr || !projectData) {
                return res.status(404).json({ error: "Project not found" });
            }

            // 1. Find or create the CART order
            let order;
            const targetStatus = req.body.status || "CART";

            if (targetStatus === "CART") {
                const { data: existingCart, error: cartErr } = await supabase
                    .from("orders")
                    .select("id")
                    .eq("user_id", userId)
                    .eq("project_id", projectId)
                    .eq("status", "CART")
                    .maybeSingle();

                if (existingCart) {
                    order = existingCart;
                }
            }

            if (!order) {
                const { data: newOrder, error: orderErr } = await supabase
                    .from("orders")
                    .insert({
                        project_id: projectId,
                        user_id: userId,
                        status: targetStatus,
                        // We no longer link the whole order to one task if it's a common cart
                        task_id: targetStatus === "CART" ? null : (req.body.taskId || null),
                    })
                    .select()
                    .single();

                if (orderErr) throw orderErr;
                order = newOrder;
            }

            // If we are submitting a PENDING order from a specific task, we should remove those items from the common CART
            if (targetStatus !== "CART" && req.body.taskId) {
                const { data: existingCart } = await supabase
                    .from("orders")
                    .select("id")
                    .eq("user_id", userId)
                    .eq("project_id", projectId)
                    .eq("status", "CART")
                    .maybeSingle();

                if (existingCart) {
                    await supabase
                        .from("order_items")
                        .delete()
                        .eq("order_id", existingCart.id)
                        .eq("task_id", req.body.taskId);
                }
            }

            // 2. Prepare order items
            const insertItems = items.map((item: any) => {
                if (!item.quantity || item.quantity <= 0) {
                    throw new Error("Invalid quantity");
                }

                const baseItem: any = {
                    order_id: order.id,
                    quantity: item.quantity,
                    material_id: null,
                    custom_name: null,
                    custom_unit: null,
                    task_id: req.body.taskId || item.taskId || null, // Per-item taskId
                };

                if (item.materialId) {
                    baseItem.material_id = item.materialId;
                } else if (item.customName) {
                    baseItem.custom_name = item.customName;
                    baseItem.custom_unit = item.customUnit || "szt.";
                } else {
                    throw new Error("Item must have either materialId or customName");
                }

                return baseItem;
            });

            if (targetStatus === "CART" && req.body.taskId) {
                // Remove existing items for this task in the common cart before applying the new ones
                await supabase
                    .from("order_items")
                    .delete()
                    .eq("order_id", order.id)
                    .eq("task_id", req.body.taskId);
            }

            if (items.length > 0) {
                // 3. Insert items
                const { error: itemsErr } = await supabase
                    .from("order_items")
                    .insert(insertItems);

                if (itemsErr) {
                    // Rollback the order if items fail and order was just created
                    // Note: In common cart, deleting the order if this task's insertion fails is risky, 
                    // but we keep it safe for now if there are other tasks' items. Wait, don't delete order for CART!
                    if (targetStatus !== "CART") {
                        await supabase.from("orders").delete().eq("id", order.id);
                    }
                    throw itemsErr;
                }
            }

            return res.status(200).json({ ok: true, data: order });
        }

        if (req.method === "PATCH") {
            // Only admins can update order statuses
            if (!isAdmin) {
                return res.status(403).json({ error: "Forbidden: Admins only" });
            }

            const { orderId, status } = req.body;

            if (!orderId || !status) {
                return res.status(400).json({ error: "orderId and status are required" });
            }

            const allowedStatuses = ["PENDING", "APPROVED", "REJECTED", "DELIVERED", "CART"];
            if (!allowedStatuses.includes(status)) {
                return res.status(400).json({ error: "Invalid status" });
            }

            // Users can only update their own orders, and only if they are in 'CART' status
            // (Admins can update any order to any status)
            if (!isAdmin) {
                const { data: existingOrder } = await supabase
                    .from("orders")
                    .select("user_id, status")
                    .eq("id", orderId)
                    .single();

                if (!existingOrder || existingOrder.user_id !== userId) {
                    return res.status(403).json({ error: "Forbidden: You can only update your own orders" });
                }

                if (existingOrder.status !== "CART") {
                    return res.status(403).json({ error: "Forbidden: You can only update orders in CART status" });
                }
            }

            const { data: order, error } = await supabase
                .from("orders")
                .update({
                    status,
                    updated_at: new Date().toISOString()
                })
                .eq("id", orderId)
                .select()
                .single();

            if (error) throw error;
            return res.status(200).json({ ok: true, data: order });
        }

        if (req.method === "DELETE") {
            if (!isAdmin) {
                return res.status(403).json({ ok: false, error: { message: "Forbidden: Admins only" } });
            }

            const id = req.query.id as string;
            if (!id) {
                return res.status(400).json({ ok: false, error: { message: "Missing order id" } });
            }

            // Delete order items first (if no cascade), then order
            await supabase.from("order_items").delete().eq("order_id", id);
            const { error } = await supabase.from("orders").delete().eq("id", id);
            if (error) throw error;

            return res.status(200).json({ ok: true, data: { deleted: id } });
        }

        res.setHeader("Allow", ["GET", "POST", "PATCH", "DELETE"]);
        return res.status(405).json({ error: `Method ${req.method} not allowed` });
    } catch (error: any) {
        console.error("Orders API error:", error);
        return res.status(500).json({ error: error.message || "Internal server error" });
    }
}
