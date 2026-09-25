import type { NextApiRequest, NextApiResponse } from "next";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = getSupabaseAdminClient();

  // Export Prototype Library
  if (req.method === "GET") {
    try {
      const { data: categories } = await supabase.from("prototype_categories").select("*");
      const { data: prototypes } = await supabase.from("prototype_symbols").select("*");

      const exportPackage = {
        exported_at: new Date().toISOString(),
        version: "1.0",
        categories: categories || [],
        prototypes: (prototypes || []).map((p) => ({
          category: p.category,
          filename: p.filename,
          storage_path: p.storage_path,
          embedding: p.embedding,
          embedding_version: p.embedding_version,
          dimensions: p.dimensions,
          resolution: p.resolution,
          version: p.version,
          active: p.active,
          notes: p.notes,
          checksum: p.checksum,
        })),
      };

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="prototype_library_export_${Date.now()}.json"`);
      return res.status(200).send(JSON.stringify(exportPackage, null, 2));
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  // Import Prototype Library
  if (req.method === "POST") {
    try {
      const importData = req.body;
      if (!importData || !Array.isArray(importData.prototypes)) {
        return res.status(400).json({ ok: false, error: "Invalid import package format" });
      }

      const importedList = [];
      for (const protoItem of importData.prototypes) {
        const { data: inserted, error: insertErr } = await supabase
          .from("prototype_symbols")
          .insert({
            category: protoItem.category || "socket",
            filename: protoItem.filename || "imported_symbol.png",
            storage_path: protoItem.storage_path || `imported/${Date.now()}_symbol.png`,
            embedding: protoItem.embedding || null,
            embedding_version: protoItem.embedding_version || "v1",
            embedding_status: Array.isArray(protoItem.embedding) && protoItem.embedding.length > 0 ? "generated" : "pending",
            dimensions: protoItem.dimensions || "256x256",
            resolution: protoItem.resolution || "72 DPI",
            version: protoItem.version || 1,
            active: protoItem.active !== false,
            notes: protoItem.notes || "Imported prototype",
            checksum: protoItem.checksum || null,
          })
          .select()
          .single();

        if (!insertErr && inserted) {
          importedList.push(inserted);
        }
      }

      return res.status(200).json({
        ok: true,
        imported_count: importedList.length,
        message: `Successfully imported ${importedList.length} prototype symbols.`,
      });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
