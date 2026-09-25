import { NextResponse } from "next/server";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";

function getAuditBaseDir(): string {
  const candidates = [
    "/app/ai-symbol-audit",
    "/home/ubuntu/ai-symbol-audit",
    path.join(process.cwd(), "..", "ai-symbol-audit"),
    path.join(process.cwd(), "ai-symbol-audit"),
    "/ai-symbol-audit",
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return c;
    }
  }
  return candidates[0];
}

function getDatasetDir(): string {
  const base = getAuditBaseDir();
  return path.join(base, "dataset");
}

function getExpandedDir(): string {
  const base = getAuditBaseDir();
  return path.join(base, "crops_expanded_100");
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action") || "list";
    const datasetDir = getDatasetDir();
    const expandedDir = getExpandedDir();

    const trainImgDir = path.join(datasetDir, "images", "train");
    const valImgDir = path.join(datasetDir, "images", "val");
    const trainLblDir = path.join(datasetDir, "labels", "train");
    const valLblDir = path.join(datasetDir, "labels", "val");

    const expandedImgDir = expandedDir;
    const expandedLblDir = path.join(expandedDir, "labels");

    if (action === "list") {
      const items: any[] = [];

      // 1. Expanded 100 crops
      try {
        if (fs.existsSync(expandedImgDir)) {
          const expFiles = await fsp.readdir(expandedImgDir);
          for (const file of expFiles.sort()) {
            if (file.endsWith(".png")) {
              const id = file.replace(".png", "");
              const lblPath = path.join(expandedLblDir, `${id}.txt`);
              let hasLabel = false;
              let boxCount = 0;
              try {
                if (fs.existsSync(lblPath)) {
                  const content = await fsp.readFile(lblPath, "utf-8");
                  const lines = content.trim().split("\n").filter((l) => l.trim().length > 0);
                  if (lines.length > 0) {
                    hasLabel = true;
                    boxCount = lines.length;
                  }
                }
              } catch {}
              items.push({ id, filename: file, split: "expanded_100", hasLabel, boxCount, status: hasLabel ? "gotowe" : "brak" });
            }
          }
        }
      } catch (err: any) {
        console.error("Error reading expandedImgDir:", err);
      }

      // 2. Train images
      try {
        if (fs.existsSync(trainImgDir)) {
          const trainFiles = await fsp.readdir(trainImgDir);
          for (const file of trainFiles.sort()) {
            if (file.endsWith(".png")) {
              const id = file.replace(".png", "");
              const lblPath = path.join(trainLblDir, `${id}.txt`);
              let hasLabel = false;
              let boxCount = 0;
              try {
                if (fs.existsSync(lblPath)) {
                  const content = await fsp.readFile(lblPath, "utf-8");
                  const lines = content.trim().split("\n").filter((l) => l.trim().length > 0);
                  if (lines.length > 0) {
                    hasLabel = true;
                    boxCount = lines.length;
                  }
                }
              } catch {}
              items.push({ id, filename: file, split: "train", hasLabel, boxCount, status: hasLabel ? "gotowe" : "brak" });
            }
          }
        }
      } catch (err: any) {
        console.error("Error reading trainImgDir:", err);
      }

      // 3. Val images
      try {
        if (fs.existsSync(valImgDir)) {
          const valFiles = await fsp.readdir(valImgDir);
          for (const file of valFiles.sort()) {
            if (file.endsWith(".png")) {
              const id = file.replace(".png", "");
              const lblPath = path.join(valLblDir, `${id}.txt`);
              let hasLabel = false;
              let boxCount = 0;
              try {
                if (fs.existsSync(lblPath)) {
                  const content = await fsp.readFile(lblPath, "utf-8");
                  const lines = content.trim().split("\n").filter((l) => l.trim().length > 0);
                  if (lines.length > 0) {
                    hasLabel = true;
                    boxCount = lines.length;
                  }
                }
              } catch {}
              items.push({ id, filename: file, split: "val", hasLabel, boxCount, status: hasLabel ? "gotowe" : "brak" });
            }
          }
        }
      } catch (err: any) {
        console.error("Error reading valImgDir:", err);
      }

      return NextResponse.json({
        total: items.length,
        expandedCount: items.filter((i) => i.split === "expanded_100").length,
        trainCount: items.filter((i) => i.split === "train").length,
        valCount: items.filter((i) => i.split === "val").length,
        images: items,
        datasetDir,
        expandedDir,
      });
    }

    if (action === "image") {
      const split = searchParams.get("split");
      const id = searchParams.get("id");
      if (!split || !id || !["train", "val", "expanded_100"].includes(split)) {
        return new NextResponse("Invalid split or id", { status: 400 });
      }

      let imgPath = "";
      if (split === "expanded_100") {
        imgPath = path.join(expandedDir, `${id}.png`);
      } else {
        imgPath = path.join(datasetDir, "images", split, `${id}.png`);
      }

      if (!fs.existsSync(imgPath)) {
        return new NextResponse("Image not found: " + imgPath, { status: 404 });
      }

      const fileBuffer = await fsp.readFile(imgPath);
      return new NextResponse(fileBuffer, {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    if (action === "labels") {
      const split = searchParams.get("split");
      const id = searchParams.get("id");
      if (!split || !id || !["train", "val", "expanded_100"].includes(split)) {
        return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
      }

      let lblPath = "";
      if (split === "expanded_100") {
        lblPath = path.join(expandedDir, "labels", `${id}.txt`);
      } else {
        lblPath = path.join(datasetDir, "labels", split, `${id}.txt`);
      }

      const boxes: any[] = [];
      try {
        if (fs.existsSync(lblPath)) {
          const content = await fsp.readFile(lblPath, "utf-8");
          const lines = content.trim().split("\n");
          for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length === 5) {
              boxes.push({
                class_id: parseInt(parts[0], 10),
                x_center: parseFloat(parts[1]),
                y_center: parseFloat(parts[2]),
                width: parseFloat(parts[3]),
                height: parseFloat(parts[4]),
              });
            }
          }
        }
      } catch {}

      return NextResponse.json({ id, split, boxes });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: any) {
    console.error("[symbol-annotator GET] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action = "save", split, id, boxes, note } = body;
    const datasetDir = getDatasetDir();
    const expandedDir = getExpandedDir();

    if (action === "save") {
      if (!split || !id || !["train", "val", "expanded_100"].includes(split) || !Array.isArray(boxes)) {
        return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
      }

      let lblDir = "";
      if (split === "expanded_100") {
        lblDir = path.join(expandedDir, "labels");
      } else {
        lblDir = path.join(datasetDir, "labels", split);
      }

      if (!fs.existsSync(lblDir)) {
        await fsp.mkdir(lblDir, { recursive: true });
      }
      const lblPath = path.join(lblDir, `${id}.txt`);

      const lines: string[] = [];
      for (const b of boxes) {
        const cid = parseInt(b.class_id, 10);
        const xc = parseFloat(b.x_center);
        const yc = parseFloat(b.y_center);
        const w = parseFloat(b.width);
        const h = parseFloat(b.height);

        if (isNaN(cid) || cid < 0 || cid > 6) continue;
        if (isNaN(xc) || isNaN(yc) || isNaN(w) || isNaN(h)) continue;
        lines.push(`${cid} ${xc.toFixed(6)} ${yc.toFixed(6)} ${w.toFixed(6)} ${h.toFixed(6)}`);
      }

      await fsp.writeFile(lblPath, lines.join("\n") + (lines.length > 0 ? "\n" : ""), "utf-8");
      return NextResponse.json({ success: true, savedPath: lblPath, boxCount: lines.length });
    }

    if (action === "review") {
      const reviewFile = path.join(datasetDir, "..", "annotation_review.json");
      let reviewData: any = { version: "1.0", review_items: [] };
      try {
        if (fs.existsSync(reviewFile)) {
          const raw = await fsp.readFile(reviewFile, "utf-8");
          reviewData = JSON.parse(raw);
        }
      } catch {}
      reviewData.review_items = reviewData.review_items || [];
      reviewData.review_items.push({ id, split, note, created_at: new Date().toISOString() });
      try {
        await fsp.writeFile(reviewFile, JSON.stringify(reviewData, null, 2), "utf-8");
      } catch {}
      return NextResponse.json({ success: true, reviewItemCount: reviewData.review_items.length });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
