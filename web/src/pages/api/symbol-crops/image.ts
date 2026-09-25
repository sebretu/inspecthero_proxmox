import type { NextApiRequest, NextApiResponse } from "next";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const { path: imagePath } = req.query;

  if (!imagePath || typeof imagePath !== "string") {
    return res.status(400).json({ error: "Missing path parameter" });
  }

  const admin = getSupabaseAdminClient();

  try {
    const { data, error } = await admin.storage
      .from("symbol-crops")
      .download(imagePath);

    if (error || !data) {
      console.error(`[Image Proxy] Failed to download ${imagePath}:`, error?.message);
      return res.status(404).json({ error: "Image not found" });
    }

    const buffer = Buffer.from(await data.arrayBuffer());

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=604800, immutable"); // Cache for 7 days
    return res.status(200).send(buffer);
  } catch (err: any) {
    console.error("[Image Proxy] Server error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
