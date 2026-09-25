import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let supabase: any;
  let userId: string | null = null;

  try {
    ({ client: supabase, userId } = createServerSupabaseClient(req));
    if (!userId) throw new Error("Missing user");
  } catch {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const { id } = req.query;
  if (!id || typeof id !== "string") {
    return res.status(400).json({ ok: false, error: "Missing session ID" });
  }

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("pdf_sessions")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (error) {
      return res.status(404).json({ ok: false, error: "Session not found" });
    }

    return res.status(200).json({ ok: true, data });
  } else if (req.method === "PUT") {
    const body = req.body;
    
    // Tylko pola do zapisu
    const updatePayload: any = {
      updated_at: new Date().toISOString()
    };
    
    if (body.symbols !== undefined) updatePayload.symbols = body.symbols;
    if (body.texts !== undefined) updatePayload.texts = body.texts;
    if (body.cutouts !== undefined) updatePayload.cutouts = body.cutouts;
    if (body.zoom !== undefined) updatePayload.zoom = body.zoom;
    if (body.page_number !== undefined) updatePayload.page_number = body.page_number;

    const { data, error } = await supabase
      .from("pdf_sessions")
      .update(updatePayload)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }

    return res.status(200).json({ ok: true, data });
  } else if (req.method === "DELETE") {
    const { data: session, error: fetchErr } = await supabase
      .from("pdf_sessions")
      .select("pdf_url")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (fetchErr) {
      return res.status(404).json({ ok: false, error: "Session not found" });
    }

    const { error: delErr } = await supabase
      .from("pdf_sessions")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (delErr) {
      return res.status(500).json({ ok: false, error: delErr.message });
    }

    return res.status(200).json({ ok: true });
  } else {
    res.setHeader("Allow", "GET, PUT, DELETE");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
}
