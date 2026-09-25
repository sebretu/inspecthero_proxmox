import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let supabase;
  try {
    ({ client: supabase } = createServerSupabaseClient(req));
  } catch {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const projectId = String(req.query.projectId || "").trim();
  const format = String(req.query.format || "json").toLowerCase();

  if (!projectId) return res.status(400).json({ ok: false, error: "Missing projectId" });

  try {
    const { data: devices } = await supabase.from("bma_devices").select("*").eq("project_id", projectId);
    const { data: connections } = await supabase.from("bma_connections").select("*").eq("project_id", projectId);
    const { data: routes } = await supabase.from("bma_routes").select("*").eq("project_id", projectId);

    const fullData = { devices, connections, routes };

    if (format === "json") {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="bma_export_${projectId}.json"`);
      return res.status(200).send(JSON.stringify(fullData, null, 2));
    }

    if (format === "csv") {
      let csv = "ID,Name,Type,X,Y,Metadata\n";
      devices?.forEach((d: any) => {
        csv += `${d.id},${d.name},${d.type},${d.x},${d.y},${JSON.stringify(d.metadata)}\n`;
      });
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="bma_devices_${projectId}.csv"`);
      return res.status(200).send(csv);
    }

    return res.status(400).json({ ok: false, error: "Unsupported format" });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
