import type { NextApiRequest, NextApiResponse } from "next";
import net from "net";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { requireRequesterProfile } from "@/lib/requesterProfile";

type ApiOk = { ok: true; data: any };
type ApiErr = { ok: false; error: { code: string; message: string } };

function readJsonBody(req: NextApiRequest): any {
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  return req.body;
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/**
 * Send ZPL string to a Zebra printer via raw TCP on port 9100.
 * Returns a promise that resolves on success or rejects on error/timeout.
 */
function sendZpl(zpl: string, host: string, port: number, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let done = false;

    const finish = (err?: Error) => {
      if (done) return;
      done = true;
      socket.destroy();
      if (err) reject(err);
      else resolve();
    };

    socket.setTimeout(timeoutMs);
    socket.on("timeout", () => finish(new Error(`Printer timeout after ${timeoutMs}ms`)));
    socket.on("error",   (err) => finish(err));

    socket.connect(port, host, () => {
      socket.write(Buffer.from(zpl, "utf8"), (err) => {
        if (err) finish(err);
        else finish();
      });
    });
  });
}

/**
 * Build a ZPL label for a cable.
 * Contains a QR code (native ZPL BQ command — no image) and the cable name.
 */
function buildZpl(cable: { id: string; name: string }): string {
  const appUrl = process.env.APP_URL || "https://inspecthero.pl";
  const qrData = `${appUrl}/cables/${cable.id}`;
  // Sanitize name for ZPL (strip ^ and ~ which are ZPL control chars)
  const safeName = cable.name.replace(/[^~]/g, (c) => (c === "^" ? "" : c)).slice(0, 60);

  return [
    "^XA",
    "^CI28",                      // UTF-8 encoding
    "^FO50,50",
    "^BQN,2,6",                   // QR code — native ZPL, no image
    `^FDLA,${qrData}^FS`,
    "^FO50,220",
    "^A0N,36,36",
    `^FD${safeName}^FS`,
    "^FO50,270",
    "^A0N,22,22",
    `^FD${cable.id.slice(0, 8).toUpperCase()}^FS`,
    "^XZ",
  ].join("\n");
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiOk | ApiErr>
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use POST" } });
  }

  let supabase: any;
  let userId: string | null = null;
  try {
    ({ client: supabase, userId } = createServerSupabaseClient(req));
  } catch {
    return res.status(401).json({ ok: false, error: { code: "AUTH_INVALID", message: "Missing Bearer token" } });
  }

  try {
    await requireRequesterProfile(supabase, userId);
  } catch (err: any) {
    return res.status(err?.status || 403).json({
      ok: false,
      error: { code: err?.code || "PROFILE_ERROR", message: err?.message || "Unable to load profile" },
    });
  }

  const body = readJsonBody(req);
  const cableId = String(body?.cableId || "").trim();

  if (!cableId || !isUuid(cableId)) {
    return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing/invalid cableId (uuid)" } });
  }

  // Fetch cable
  const { data: cable, error: cableErr } = await supabase
    .from("cables")
    .select("id, name")
    .eq("id", cableId)
    .single();

  if (cableErr || !cable) {
    return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Cable not found" } });
  }

  // Read printer config from env
  const printerIp   = process.env.ZEBRA_PRINTER_IP;
  const printerPort = Number(process.env.ZEBRA_PRINTER_PORT || "9100");

  if (!printerIp) {
    return res.status(503).json({
      ok: false,
      error: { code: "PRINTER_NOT_CONFIGURED", message: "ZEBRA_PRINTER_IP is not set in environment" },
    });
  }

  const zpl = buildZpl(cable);

  try {
    await sendZpl(zpl, printerIp, printerPort);
  } catch (err: any) {
    console.error("[cable-print] TCP send failed:", err?.message);
    return res.status(502).json({
      ok: false,
      error: { code: "PRINTER_ERROR", message: err?.message || "Failed to send to printer" },
    });
  }

  return res.status(200).json({ ok: true, data: { sent: true, cableId, printer: printerIp } });
}
