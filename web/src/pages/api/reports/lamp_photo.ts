import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";

const STORAGE_DIR = "/app/private_reports/lamp_types";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const filename = req.query.filename as string;
  if (!filename) return res.status(400).json({ error: "Missing filename" });

  const safeName = path.basename(filename);
  const filePath = path.join(STORAGE_DIR, safeName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }

  const stat = fs.statSync(filePath);
  const ext = path.extname(safeName).toLowerCase();
  const contentType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";

  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": stat.size,
    "Cache-Control": "public, max-age=86400",
  });

  const readStream = fs.createReadStream(filePath);
  readStream.pipe(res);
}
