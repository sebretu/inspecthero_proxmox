import { createServerSupabaseClient, isAuthRequiredError } from "@/lib/supabaseServer";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const { client, userId } = await createServerSupabaseClient(req);
    const adminClient = getSupabaseAdminClient();
    const { id } = req.query;

    if (!id || typeof id !== "string") {
      return res.status(400).json({ ok: false, error: { message: "Company ID is required", code: "BAD_REQUEST" } });
    }

    // POST /api/companies/[id]/members - add user to company
    if (req.method === "POST") {
      if (!userId) {
        return res.status(401).json({ ok: false, error: { message: "Missing auth user", code: "AUTH_INVALID" } });
      }

      const { data: requester, error: requesterError } = await client
        .from("profiles")
        .select("id, role")
        .eq("id", userId)
        .single();

      if (requesterError) {
        return res.status((requesterError as any).status || 400).json({
          ok: false,
          error: { message: requesterError.message, code: requesterError.code, meta: requesterError.details },
        });
      }

      if (requester?.role !== "ADMIN") {
        return res.status(403).json({ ok: false, error: { message: "Only admins can modify companies", code: "FORBIDDEN" } });
      }

      const { user_id } = req.body;

      if (!user_id) {
        return res.status(400).json({ ok: false, error: { message: "user_id is required", code: "BAD_REQUEST" } });
      }

      // Update user's company_id via admin client to bypass potential RLS
      const { data, error } = await adminClient
        .from("profiles")
        .update({ company_id: id })
        .eq("id", user_id)
        .select("id, full_name, email, role, company_id")
        .single();

      if (error) {
        return res.status((error as any).status || 400).json({
          ok: false,
          error: { message: error.message, code: error.code, meta: error.details },
        });
      }

      return res.status(200).json({ ok: true, data });
    }

    return res.status(405).json({ ok: false, error: { message: "Method not allowed", code: "METHOD_NOT_ALLOWED" } });
  } catch (err) {
    if (isAuthRequiredError(err)) {
      return res.status(401).json({ ok: false, error: { message: "Missing Bearer token", code: "AUTH_REQUIRED" } });
    }

    console.error("Error in /api/companies/[id]/members:", err);
    return res.status(500).json({
      ok: false,
      error: {
        message: err instanceof Error ? err.message : "Internal server error",
        code: "SERVER_ERROR",
      },
    });
  }
}
