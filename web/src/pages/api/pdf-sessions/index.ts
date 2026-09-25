import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const { client: supabase, userId } = createServerSupabaseClient(req);
    if (!userId) throw new Error("Unauthorized");

    const { data, error } = await supabase
      .from("pdf_sessions")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("DB Select Error in index.ts:", error);
      throw error;
    }

    return res.status(200).json({ ok: true, data });
  } catch (err: any) {
    console.error("GET /api/pdf-sessions error:", err.message);
    return res.status(401).json({ ok: false, error: err.message });
  }
}
