import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

type ApiOk = { ok: true; data: any };
type ApiErr = { ok: false; error: { code: string; message: string; meta?: any } };

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || null;

  // DELETE MUSI iść service-role (żeby nie walczyć z workflow triggerem i RLS)
  const supabase = createClient(url, service || anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
  if (!id || !isUuid(id)) {
    return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing/invalid id (uuid)" } });
  }

  // GET /api/task?id=...
  if (req.method === "GET") {
    const { data, error } = await supabase.from("tasks").select("*").eq("id", id).single();
    if (error) {
      return res.status((error as any).status || 400).json({
        ok: false,
        error: { code: "SUPABASE", message: error.message, meta: { code: (error as any).code, details: (error as any).details } },
      });
    }
    return res.status(200).json({ ok: true, data });
  }

  // DELETE /api/task?id=...
  if (req.method === "DELETE") {
    // bezpieczeństwo: jeśli nie ma service key, to nie kasujemy
    if (!service) {
      return res.status(400).json({
        ok: false,
        error: { code: "BAD_REQUEST", message: "DELETE requires SUPABASE_SERVICE_ROLE_KEY" },
      });
    }

    const del = await supabase.from("tasks").delete().eq("id", id).select("id").single();
    if (del.error) {
      return res.status((del.error as any).status || 400).json({
        ok: false,
        error: { code: "SUPABASE", message: del.error.message, meta: { code: (del.error as any).code, details: (del.error as any).details } },
      });
    }

    return res.status(200).json({ ok: true, data: del.data });
  }

  res.setHeader("Allow", "GET, DELETE");
  return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET or DELETE" } });
}
