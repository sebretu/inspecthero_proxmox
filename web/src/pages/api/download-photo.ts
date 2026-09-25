import type { NextApiRequest, NextApiResponse } from "next";
// @ts-ignore
import fetch from "node-fetch";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { url, filename } = req.query;

  if (!url || typeof url !== "string") {
    return res.status(400).send("Missing parameter: url");
  }

  // Ensure safe filename format
  const safeFilename = typeof filename === "string" 
    ? filename.trim().replace(/[^a-zA-Z0-9\s._-]+/g, "").replace(/\s+/g, "_")
    : "photo.jpg";

  try {
    // If the URL is relative, prepend the app URL or host
    let targetUrl = url;
    if (url.startsWith("/")) {
      const host = req.headers.host || "localhost:3000";
      const protocol = req.headers["x-forwarded-proto"] || "http";
      targetUrl = `${protocol}://${host}${url}`;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(targetUrl);
    } catch {
      return res.status(400).send("Invalid URL format");
    }

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return res.status(400).send("Unsupported protocol");
    }

    const hostname = parsedUrl.hostname.toLowerCase();
    // Block private/loopback/cloud-metadata hostnames & IP ranges (SSRF defense)
    const isPrivateOrLoopback =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      hostname.startsWith("169.254.") || // Cloud metadata IP
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname));

    if (isPrivateOrLoopback && !url.startsWith("/")) {
      return res.status(403).send("Access to private/internal addresses is forbidden");
    }

    const response = await fetch(targetUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const buffer = await response.buffer();

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}"`);
    return res.status(200).send(buffer);
  } catch (error: any) {
    console.error("Error downloading photo", error);
    return res.status(500).send(`Error downloading photo: ${error.message}`);
  }
}
