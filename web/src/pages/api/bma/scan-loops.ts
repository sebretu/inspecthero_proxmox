import { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "fs/promises";
import path from "path";

// DOMMatrix Polyfill for Node.js
if (typeof global.DOMMatrix === 'undefined') {
  (global as any).DOMMatrix = class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    constructor(arg: any) {
      if (typeof arg === 'string') return;
      if (Array.isArray(arg)) {
        this.a = arg[0]; this.b = arg[1]; this.c = arg[2];
        this.d = arg[3]; this.e = arg[4]; this.f = arg[5];
      }
    }
  };
}

const COLORS = [
  "#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", 
  "#06b6d4", "#f97316", "#84cc16", "#a855f7", "#6366f1", "#14b8a6",
];

export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  let supabase;
  try {
    const result = createServerSupabaseClient(req);
    supabase = result.client;
    if (!result.userId) return res.status(401).json({ ok: false, error: "Unauthorized" });
  } catch {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const { fileData, projectId, planId, dryRun } = req.body;
  if (!fileData || !projectId || !planId) {
    return res.status(400).json({ ok: false, error: "Missing data" });
  }

  try {
    const admin = getSupabaseAdminClient();

    // 0. Load scale and meta
    const { data: settings } = await admin.from("bma_settings").select("*").eq("project_id", projectId).single();
    const scale = settings?.scale_px_per_meter || 100;
    
    // Fetch plan dimensions from DB as primary source or fallback
    const { data: planData } = await admin.from("plans").select("image_width, image_height").eq("id", planId).single();
    let planW = planData?.image_width || 1000;
    let planH = planData?.image_height || 1000;

    // Try to refine with meta.json if available
    try {
      const metaPath = path.join(process.cwd(), "public", "tiles", planId, "meta.json");
      const rawMeta = await fs.readFile(metaPath, "utf8");
      const meta = JSON.parse(rawMeta);
      planW = meta.gridW * meta.tileSize;
      planH = meta.gridH * meta.tileSize;
      console.log(`[scan-loops] Plan dimensions from meta.json: ${planW}x${planH}`);
    } catch (e) {
      console.warn(`[scan-loops] Using database dimensions for plan ${planId}: ${planW}x${planH}`);
    }

    const buffer = Buffer.from(fileData, 'base64');
    const data = new Uint8Array(buffer);
    const loadingTask = pdfjs.getDocument({ data });
    const pdf = await loadingTask.promise;

    const deviceRegex = /((?:[A-Z]{1,3})?\s*\d{1,4}(?:\s*[./]\s*\d{1,4}){1,3}|[A-Z]{1,3}\s*\d{1,4}|PA10\s*S\d|BMA|BMZ|FIZ|HM|ÜG|FSD|SDA|NSL|\bS\d{1,4}\b)/g;
    const loopRegex = /Loop\s*(\d+)/i;

    const extractedLoops: any[] = [];
    const extractedDevices: any[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      textContent.items.forEach((item: any) => {
        if (!item.str) return;
        const loopMatch = item.str.match(loopRegex);
        if (loopMatch) extractedLoops.push({ name: item.str.trim(), y: item.transform[5], x: item.transform[4] });
        
        const deviceMatch = item.str.match(deviceRegex);
        if (deviceMatch) {
          const name = item.str.trim().toUpperCase();
          if (name.startsWith("S") && !name.includes("/")) return;
          extractedDevices.push({ name, y: item.transform[5], x: item.transform[4] });
        }
      });
    }

    const rawRows: Map<number, any[]> = new Map();
    extractedDevices.forEach(dev => {
      let found = false;
      for (const [y, row] of rawRows.entries()) {
        if (Math.abs(dev.y - y) < 40) {
          row.push(dev);
          found = true;
          break;
        }
      }
      if (!found) rawRows.set(dev.y, [dev]);
    });

    const { data: dbDevices } = await admin.from('bma_devices').select('id, name, x, y').eq('plan_id', planId);
    const nameToDev = new Map<string, any>();
    dbDevices?.forEach(d => nameToDev.set(d.name.toUpperCase(), d));
    
    const bmzDev = dbDevices?.find(d => d.name.toUpperCase() === "BMZ") || dbDevices?.find(d => d.name.toUpperCase().includes("BMZ"));

    const { data: dbConns } = await admin.from('bma_connections').select('id, name').eq('project_id', projectId);
    const existingConns = new Map<string, string>();
    dbConns?.forEach(c => existingConns.set(c.name, c.id));

    const loopToRows: Map<number, number[]> = new Map();
    for (const [y, row] of rawRows.entries()) {
      let closestLoopIdx = -1;
      let minDist = Infinity;
      for (let i = 0; i < extractedLoops.length; i++) {
        const dist = Math.abs(extractedLoops[i].y - y);
        if (dist < minDist) { minDist = dist; closestLoopIdx = i; }
      }
      if (closestLoopIdx !== -1 && minDist < 250) {
        if (!loopToRows.has(closestLoopIdx)) loopToRows.set(closestLoopIdx, []);
        loopToRows.get(closestLoopIdx)!.push(y);
      }
    }

    const connectionsResult = [];
    const routesToInsert: any[] = [];
    const connsToInsert: any[] = [];
    const connIdsToClear: string[] = [];

    for (let i = 0; i < extractedLoops.length; i++) {
      const loop = extractedLoops[i];
      const color = COLORS[i % COLORS.length];
      const rowYs = loopToRows.get(i) || [];
      if (rowYs.length === 0) continue;

      rowYs.sort((a, b) => b - a);
      const loopSequence: any[] = [];
      rowYs.forEach((y, idx) => {
        const rowDevices = [...rawRows.get(y)!];
        rowDevices.sort((a, b) => a.x - b.x);
        if (idx % 2 !== 0) rowDevices.reverse();
        rowDevices.forEach(d => {
          if (!loopSequence.find(existing => existing.name === d.name)) loopSequence.push(d);
        });
      });

      const sequenceNames = loopSequence.map(d => d.name);
      if (bmzDev) {
        if (sequenceNames[0] !== bmzDev.name) sequenceNames.unshift(bmzDev.name);
        if (sequenceNames[sequenceNames.length - 1] !== bmzDev.name) sequenceNames.push(bmzDev.name);
      }

      if (sequenceNames.length < 2) continue;

      if (dryRun) {
        connectionsResult.push({
          name: loop.name, color,
          devices: sequenceNames.filter(name => nameToDev.has(name))
        });
      } else {
        let connId = existingConns.get(loop.name);
        if (!connId) connsToInsert.push({ project_id: projectId, name: loop.name, color, type: 'Loop' });
        else connIdsToClear.push(connId);
        connectionsResult.push(loop.name);
        (loop as any).processedInfo = { loopName: loop.name, sequenceNames };
      }
    }

    if (!dryRun) {
      if (connIdsToClear.length > 0) {
          await admin.from('bma_routes').delete().in('connection_id', connIdsToClear);
          console.log(`[scan-loops] Cleared existing routes for ${connIdsToClear.length} connections`);
      }
      
      if (connsToInsert.length > 0) {
        const { data: newConns } = await admin.from('bma_connections').insert(connsToInsert).select('id, name');
        newConns?.forEach(c => existingConns.set(c.name, c.id));
        console.log(`[scan-loops] Created ${connsToInsert.length} new connections`);
      }

      for (let i = 0; i < extractedLoops.length; i++) {
        const loop = extractedLoops[i] as any;
        if (!loop.processedInfo) continue;
        const { loopName, sequenceNames } = loop.processedInfo;
        const connId = existingConns.get(loopName);
        if (!connId) continue;

        const sequenceDevs = sequenceNames.map((n: string) => nameToDev.get(n)).filter((d: any) => !!d);
        console.log(`[scan-loops] Processing ${loopName}: scale=${scale}, planW=${planW}, planH=${planH}`);
        
        for (let j = 0; j < sequenceDevs.length - 1; j++) {
          const s = sequenceDevs[j];
          const t = sequenceDevs[j+1];
          
          const dx = (t.x - s.x) * planW;
          const dy = (t.y - s.y) * planH;
          const pxDist = Math.sqrt(dx * dx + dy * dy);
          const meters = Math.ceil((pxDist / scale) * 1.1);

          routesToInsert.push({ 
            connection_id: connId, 
            source_device_id: s.id, 
            target_device_id: t.id, 
            project_id: projectId,
            length_meters: meters
          });
        }
      }

      if (routesToInsert.length > 0) {
          const { error: insErr } = await admin.from('bma_routes').insert(routesToInsert);
          if (insErr) {
              console.error("[scan-loops] Insert error:", insErr);
              throw insErr;
          }
          console.log(`[scan-loops] Successfully inserted ${routesToInsert.length} routes for project ${projectId}`);
      }
    }

    return res.status(200).json({ ok: true, data: { connections: connectionsResult, routesCreated: routesToInsert.length } });
  } catch (err: any) {
    console.error('[scan-loops] Fatal error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
