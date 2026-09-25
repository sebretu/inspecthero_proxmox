import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";

function escapeXml(unsafe: string): string {
  if (!unsafe) return "";
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case "'": return "&apos;";
      case '"': return "&quot;";
      default: return c;
    }
  });
}

interface PositionConfig {
  relPos: number;
  function: string;
}

interface DeviceTypeInfo {
  slaveType: string;
  slaveTypeId: string;
  articleNumber: string;
  function: string;
  positions: PositionConfig[];
}

function getDeviceTypeInfo(serial: string): DeviceTypeInfo {
  const s = String(serial || "").trim();
  if (s.startsWith("2218")) {
    return {
      slaveType: "MTD 533X",
      slaveTypeId: "63",
      articleNumber: "30-5000003-01-05",
      function: "Detector",
      positions: [
        { relPos: 1, function: "Detector" }
      ]
    };
  } else if (s.startsWith("2226")) {
    return {
      slaveType: "MTD 533X-SCT",
      slaveTypeId: "47",
      articleNumber: "30-5000014-01-03",
      function: "Detector",
      positions: [
        { relPos: 1, function: "Detector" },
        { relPos: 2, function: "Output" }
      ]
    };
  } else if (s.startsWith("2234")) {
    return {
      slaveType: "BX-OI3",
      slaveTypeId: "30",
      articleNumber: "20-2100001-01-04",
      function: "InputOutput",
      positions: [
        { relPos: 1, function: "Input" },
        { relPos: 2, function: "Input" },
        { relPos: 3, function: "Input" },
        { relPos: 4, function: "Output" }
      ]
    };
  }
  // Default fallback if unknown or empty
  return {
    slaveType: "MTD 533X",
    slaveTypeId: "63",
    articleNumber: "30-5000003-01-05",
    function: "Detector",
    positions: [
      { relPos: 1, function: "Detector" }
    ]
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let supabase;
  try {
    ({ client: supabase } = createServerSupabaseClient(req));
  } catch {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const planId = String(req.query.planId || "").trim();
  const projectId = String(req.query.projectId || "").trim();

  if (!planId) return res.status(400).json({ ok: false, error: "Missing planId" });

  try {
    // Fetch bma_devices for this plan
    let query = supabase.from("bma_devices").select("*").eq("plan_id", planId);
    if (projectId) query = query.eq("project_id", projectId);
    
    const { data: devices, error } = await query;
    if (error) {
      console.error("[export-xml] DB fetch error:", error);
      return res.status(400).json({ ok: false, error: error.message });
    }

    // Build XML
    let xml = '<SlaveElements>\n';

    if (devices && devices.length > 0) {
      for (const dev of devices) {
        const serial = String(dev.metadata?.serial_number || "").trim();
        if (!serial) continue; // Skip if no serial number is present

        const typeInfo = getDeviceTypeInfo(serial);
        
        let indicatorNumber = "";
        let elementNumber = "";

        if (dev.name && dev.name.includes("/")) {
          const parts = dev.name.split("/");
          elementNumber = parts[0].trim();
          indicatorNumber = parts[1].trim();
        } else if (dev.name) {
          const numMatch = dev.name.match(/\d+/);
          if (numMatch) {
            elementNumber = numMatch[0];
          }
        }

        const deviceTime = dev.updated_at || dev.created_at || new Date().toISOString();

        xml += `  <Element Function="${escapeXml(typeInfo.function)}" SerialNumber="${escapeXml(serial)}" SlaveType="${escapeXml(typeInfo.slaveType)}" SlaveTypeId="${escapeXml(typeInfo.slaveTypeId)}" ArticleNumber="${escapeXml(typeInfo.articleNumber)}" Time="${escapeXml(deviceTime)}">\n`;

        // Render positions
        typeInfo.positions.forEach((pos) => {
          // Address (ElementNumber/IndicatorNumber) is only applied to relPos = 1
          const elNum = pos.relPos === 1 ? elementNumber : "";
          const indNum = pos.relPos === 1 ? indicatorNumber : "";
          xml += `    <Position relPos="${pos.relPos}" Function="${escapeXml(pos.function)}" ElementNumber="${escapeXml(elNum)}" IndicatorNumber="${escapeXml(indNum)}"/>\n`;
        });

        xml += "  </Element>\n";
      }
    }

    xml += "</SlaveElements>";

    // Set download headers
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="bma_export_${planId}.xml"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.status(200).send(xml);
  } catch (err: any) {
    console.error("[export-xml] error:", err);
    return res.status(500).json({ ok: false, error: err.message || "Internal server error" });
  }
}
