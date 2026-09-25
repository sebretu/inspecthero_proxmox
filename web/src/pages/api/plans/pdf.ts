import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const id = String(req.query.id || "").trim();
    if (!id) return res.status(400).send("Missing query: id");

    let supabase: any;
    try {
      ({ client: supabase } = createServerSupabaseClient(req));
    } catch (e: any) {
      return res.status(401).send("Unauthorized");
    }

    const { data: plan, error } = await supabase
      .from("plans")
      .select("storage_bucket, storage_path")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("[plans/pdf] db error:", error.message);
      return res.status(500).send("DB error");
    }
    if (!plan) {
      console.warn("[plans/pdf] plan not found");
      return res.status(404).send("Plan not found");
    }

    const planRow = plan as any;
    const { data, error: dlErr } = await supabase.storage.from(planRow.storage_bucket).download(planRow.storage_path as string);

    if (dlErr || !data) {
      console.error("[plans/pdf] storage download error:", dlErr?.message || "no data");
      return res.status(404).send("PDF not found in storage");
    }

    const buf = Buffer.from(await data.arrayBuffer());
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${id}.pdf"`);
    res.setHeader("Content-Length", String(buf.length));
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(buf);
  } catch (e: any) {
    console.error("[plans/pdf] fatal:", e?.message || e);
    return res.status(500).send("Server error");
  }
}
