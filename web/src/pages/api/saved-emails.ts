import { createServerSupabaseClient, isAuthRequiredError } from "@/lib/supabaseServer";
import { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    try {
        const { client: supabase, userId } = await createServerSupabaseClient(req);

        if (!userId) {
            return res.status(401).json({ ok: false, error: { message: "Missing auth user", code: "AUTH_INVALID" } });
        }

        if (req.method === "GET") {
            const { data, error } = await supabase
                .from('saved_emails')
                .select('id, email')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return res.status(200).json({ data, ok: true });
        }

        if (req.method === "POST") {
            const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
            if (!email) {
                return res.status(400).json({ ok: false, error: { message: "Email is required", code: "BAD_REQUEST" } });
            }

            const { data, error } = await supabase
                .from('saved_emails')
                .insert({ email, user_id: userId })
                .select()
                .single();

            if (error) {
                // if unique violation, just return existing
                if (error.code === '23505') {
                    const existing = await supabase.from('saved_emails').select('*').eq('email', email).eq('user_id', userId).single();
                    return res.status(200).json({ data: existing.data, ok: true });
                }
                throw error;
            }
            return res.status(201).json({ data, ok: true });
        }

        if (req.method === "DELETE") {
            const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
            if (!id) {
                return res.status(400).json({ ok: false, error: { message: "ID is required", code: "BAD_REQUEST" } });
            }

            const { error } = await supabase
                .from('saved_emails')
                .delete()
                .eq('id', id)
                .eq('user_id', userId);

            if (error) throw error;
            return res.status(200).json({ ok: true });
        }

        return res.status(405).json({ ok: false, error: "Method not allowed" });
    } catch (err: any) {
        if (isAuthRequiredError(err)) {
            return res.status(401).json({
                ok: false,
                error: { message: "Missing Bearer token", code: "AUTH_REQUIRED" },
            });
        }
        console.error("Error in /api/saved-emails:", err);
        return res.status(500).json({
            ok: false,
            error: {
                message: err?.message || (typeof err === 'string' ? err : JSON.stringify(err)),
                code: "INTERNAL_SERVER_ERROR"
            }
        });
    }
}
