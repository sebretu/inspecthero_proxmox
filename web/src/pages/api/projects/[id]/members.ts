import { createServerSupabaseClient, isAuthRequiredError } from "@/lib/supabaseServer";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { NextApiRequest, NextApiResponse } from "next";

function isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    try {
        const { client, userId } = await createServerSupabaseClient(req);
        const adminClient = getSupabaseAdminClient();
        const { id: projectId } = req.query;

        if (!projectId || typeof projectId !== "string" || !isUuid(projectId)) {
            return res.status(400).json({ ok: false, error: { message: "Valid Project ID is required", code: "BAD_REQUEST" } });
        }

        // GET /api/projects/[id]/members - list project members
        if (req.method === "GET") {
            const { data, error } = await client
                .from("project_members")
                .select(`
          user_id,
          role,
          profiles:profiles!user_id (
            id,
            full_name,
            email,
            role
          )
        `)
                .eq("project_id", projectId);

            if (error) {
                return res.status((error as any).status || 400).json({
                    ok: false,
                    error: { message: error.message, code: error.code, meta: error.details },
                });
            }

            return res.status(200).json({ ok: true, data: data || [] });
        }

        if (!userId) {
            return res.status(401).json({ ok: false, error: { message: "Missing auth user", code: "AUTH_INVALID" } });
        }

        const { data: requester, error: requesterError } = await client
            .from("profiles")
            .select("id, role")
            .eq("id", userId)
            .single();

        if (requesterError || requester?.role !== "ADMIN") {
            return res.status(requesterError ? ((requesterError as any).status || 400) : 403).json({
                ok: false,
                error: { message: requesterError?.message || "Only admins can modify project members", code: requesterError?.code || "FORBIDDEN" },
            });
        }

        // POST /api/projects/[id]/members - add user to project
        if (req.method === "POST") {
            const { user_id, role = "USER" } = req.body;

            if (!user_id || !isUuid(user_id)) {
                return res.status(400).json({ ok: false, error: { message: "Valid user_id is required", code: "BAD_REQUEST" } });
            }

            const { data, error } = await adminClient
                .from("project_members")
                .upsert({
                    project_id: projectId,
                    user_id: user_id,
                    role: role,
                    added_by: userId
                }, { onConflict: "project_id,user_id" })
                .select()
                .single();

            if (error) {
                return res.status((error as any).status || 400).json({
                    ok: false,
                    error: { message: error.message, code: error.code, meta: error.details },
                });
            }

            return res.status(200).json({ ok: true, data });
        }

        // DELETE /api/projects/[id]/members - remove user from project
        if (req.method === "DELETE") {
            const { user_id } = req.query;

            if (!user_id || typeof user_id !== "string" || !isUuid(user_id)) {
                return res.status(400).json({ ok: false, error: { message: "Valid user_id is required", code: "BAD_REQUEST" } });
            }

            const { error } = await adminClient
                .from("project_members")
                .delete()
                .eq("project_id", projectId)
                .eq("user_id", user_id);

            if (error) {
                return res.status((error as any).status || 400).json({
                    ok: false,
                    error: { message: error.message, code: error.code, meta: error.details },
                });
            }

            return res.status(200).json({ ok: true });
        }

        res.setHeader("Allow", "GET, POST, DELETE");
        return res.status(405).json({ ok: false, error: { message: "Method not allowed", code: "METHOD_NOT_ALLOWED" } });
    } catch (err) {
        if (isAuthRequiredError(err)) {
            return res.status(401).json({ ok: false, error: { message: "Missing Bearer token", code: "AUTH_REQUIRED" } });
        }

        console.error(`Error in /api/projects/[id]/members:`, err);
        return res.status(500).json({
            ok: false,
            error: {
                message: err instanceof Error ? err.message : "Internal server error",
                code: "SERVER_ERROR",
            },
        });
    }
}
