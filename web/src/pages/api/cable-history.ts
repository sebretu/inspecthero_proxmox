import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { requireRequesterProfile } from "@/lib/requesterProfile";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

type ApiOk = { ok: true; data: any };
type ApiErr = { ok: false; error: { code: string; message: string; meta?: any } };

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiOk | ApiErr>
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET" } });
  }

  let supabase: any;
  let userId: string | null = null;
  try {
    ({ client: supabase, userId } = createServerSupabaseClient(req));
  } catch {
    return res.status(401).json({ ok: false, error: { code: "AUTH_INVALID", message: "Missing Bearer token" } });
  }

  try {
    await requireRequesterProfile(supabase, userId);
  } catch (err: any) {
    return res.status(err?.status || 403).json({
      ok: false,
      error: { code: err?.code || "PROFILE_ERROR", message: err?.message || "Unable to load profile" },
    });
  }

  const cableId = typeof req.query.cableId === "string" ? req.query.cableId.trim() : "";
  if (!cableId || !isUuid(cableId)) {
    return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing/invalid cableId (uuid)" } });
  }

  // Use admin client so we can read history even with restrictive RLS
  let client = supabase;
  try {
    client = getSupabaseAdminClient();
  } catch {
    // fall back to user client — history insert policy allows true, select may still work
  }

  const { data, error } = await client
    .from("cable_history")
    .select(`
      id,
      cable_id,
      action,
      old_value,
      new_value,
      user_id,
      created_at,
      profiles ( id, full_name )
    `)
    .eq("cable_id", cableId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return res.status((error as any).status || 400).json({
      ok: false,
      error: { code: "SUPABASE", message: error.message },
    });
  }

  return res.status(200).json({ ok: true, data: data ?? [] });
}
