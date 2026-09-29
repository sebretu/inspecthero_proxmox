import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import {
  PlanCatalogItem,
  DEFAULT_PLAN_MATERIALS_CATALOG,
} from "@/lib/planMaterialCatalog";

// Determine storage paths
const PRIMARY_STORAGE_DIR = "/app/private_reports/plan_materials";
const FALLBACK_STORAGE_DIR = "/home/ubuntu/private_reports/plan_materials";
const LOCAL_STORAGE_DIR = path.join(process.cwd(), "public", "plan_materials");

function getStorageFilePath(): string {
  if (fs.existsSync("/app/private_reports")) {
    if (!fs.existsSync(PRIMARY_STORAGE_DIR)) {
      try {
        fs.mkdirSync(PRIMARY_STORAGE_DIR, { recursive: true });
      } catch {}
    }
    return path.join(PRIMARY_STORAGE_DIR, "catalog.json");
  }

  if (fs.existsSync("/home/ubuntu/private_reports")) {
    if (!fs.existsSync(FALLBACK_STORAGE_DIR)) {
      try {
        fs.mkdirSync(FALLBACK_STORAGE_DIR, { recursive: true });
      } catch {}
    }
    return path.join(FALLBACK_STORAGE_DIR, "catalog.json");
  }

  if (!fs.existsSync(LOCAL_STORAGE_DIR)) {
    try {
      fs.mkdirSync(LOCAL_STORAGE_DIR, { recursive: true });
    } catch {}
  }
  return path.join(LOCAL_STORAGE_DIR, "catalog.json");
}

function loadCatalog(): PlanCatalogItem[] {
  const filePath = getStorageFilePath();
  if (fs.existsSync(filePath)) {
    try {
      const data = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch (e) {
      console.error("[plan-materials catalog] error reading catalog file:", e);
    }
  }
  return DEFAULT_PLAN_MATERIALS_CATALOG;
}

function saveCatalog(items: PlanCatalogItem[]) {
  const filePath = getStorageFilePath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(items, null, 2), "utf8");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // ── GET: Return the full catalog ──
    if (req.method === "GET") {
      const items = loadCatalog();
      return res.status(200).json({ ok: true, data: items, items, count: items.length });
    }

    // ── POST: Add item or Reset action ──
    if (req.method === "POST") {
      const action = req.query.action as string;

      if (action === "reset") {
        saveCatalog(DEFAULT_PLAN_MATERIALS_CATALOG);
        return res.status(200).json({
          ok: true,
          data: DEFAULT_PLAN_MATERIALS_CATALOG,
          message: "Catalog reset to defaults",
          items: DEFAULT_PLAN_MATERIALS_CATALOG,
        });
      }

      const body = req.body || {};
      const items = loadCatalog();

      const newItem: PlanCatalogItem = {
        id: body.id || `mat_${crypto.randomUUID().slice(0, 8)}`,
        category: body.category || "sockets",
        name_pl: (body.name_pl || body.name || "").trim(),
        name_de: (body.name_de || body.name_pl || body.name || "").trim(),
        name_en: (body.name_en || body.name_pl || body.name || "").trim(),
        name_sk: (body.name_sk || body.name_pl || body.name || "").trim(),
        unit: body.unit || "szt",
        article_number: body.article_number || "",
        notes: body.notes || "",
        is_favorite: !!body.is_favorite,
        order_index: items.length + 1,
      };

      if (!newItem.name_pl && !newItem.name_de && !newItem.name_en && !newItem.name_sk) {
        return res.status(400).json({ ok: false, error: "Material name is required" });
      }

      const updated = [newItem, ...items];
      saveCatalog(updated);
      return res.status(201).json({ ok: true, data: updated, item: newItem, items: updated });
    }

    // ── PUT: Update item ──
    if (req.method === "PUT") {
      const body = req.body || {};
      const id = body.id || (req.query.id as string);
      if (!id) {
        return res.status(400).json({ ok: false, error: "Missing item id" });
      }

      const items = loadCatalog();
      const index = items.findIndex((i) => i.id === id);
      if (index === -1) {
        return res.status(404).json({ ok: false, error: "Material not found" });
      }

      const existing = items[index];
      const updatedItem: PlanCatalogItem = {
        ...existing,
        category: body.category !== undefined ? body.category : existing.category,
        name_pl: body.name_pl !== undefined ? body.name_pl.trim() : existing.name_pl,
        name_de: body.name_de !== undefined ? body.name_de.trim() : existing.name_de,
        name_en: body.name_en !== undefined ? body.name_en.trim() : existing.name_en,
        name_sk: body.name_sk !== undefined ? body.name_sk.trim() : existing.name_sk,
        unit: body.unit !== undefined ? body.unit : existing.unit,
        article_number: body.article_number !== undefined ? body.article_number : existing.article_number,
        notes: body.notes !== undefined ? body.notes : existing.notes,
        is_favorite: body.is_favorite !== undefined ? !!body.is_favorite : existing.is_favorite,
      };

      items[index] = updatedItem;
      saveCatalog(items);
      return res.status(200).json({ ok: true, data: items, item: updatedItem, items });
    }

    // ── DELETE: Delete item ──
    if (req.method === "DELETE") {
      const id = (req.query.id as string) || (req.body && req.body.id);
      if (!id) {
        return res.status(400).json({ ok: false, error: "Missing item id" });
      }

      const items = loadCatalog();
      const filtered = items.filter((i) => i.id !== id);
      if (filtered.length === items.length) {
        return res.status(404).json({ ok: false, error: "Material not found" });
      }

      saveCatalog(filtered);
      return res.status(200).json({ ok: true, data: filtered, message: "Material deleted", items: filtered });
    }

    res.setHeader("Allow", ["GET", "POST", "PUT", "DELETE"]);
    return res.status(405).json({ ok: false, error: `Method ${req.method} Not Allowed` });
  } catch (err: any) {
    console.error("[plan-materials catalog API] Uncaught error:", err);
    return res.status(500).json({ ok: false, error: err.message || "Internal server error" });
  }
}
