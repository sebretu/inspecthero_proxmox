import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";

type ApiOk = { ok: true; data: any };
type ApiErr = { ok: false; error: { code: string; message: string; meta?: any } };

function asInt(v: any, def: number) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(1, Math.trunc(n)) : def;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET" } });
  }

  let supabase: any;
    try {
      ({ client: supabase } = createServerSupabaseClient(req));
  } catch (e: any) {
    return res.status(401).json({ ok: false, error: { code: "AUTH_INVALID", message: "Missing Bearer token" } });
  }

  const limit = Math.min(asInt(req.query.limit, 200), 1000);

  // DEV: na razie zwracamy aktywne profile (company/user filters dorobimy później)
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, is_active, company_id")
    .eq("is_active", true)
    .order("full_name", { ascending: true })
    .limit(limit);

  if (error) {
    return res.status((error as any).status || 400).json({
      ok: false,
      error: {
        code: "SUPABASE",
        message: error.message,
        meta: { code: (error as any).code, details: (error as any).details },
      },
    });
  }

  return res.status(200).json({ ok: true, data: data ?? [] });
}

