#!/usr/bin/env node
// Test script to verify tile stitching for specific plans
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const planIds = [
    "10a04057-48f6-4e0a-aa7e-5e99caf6beaf",
    "430ae194-cfd6-4368-82d7-32403799ea42",
    "476a3e6b-bd50-48cb-b8e1-9aab8edafb47"
];

async function testPlanTiles(planId) {
    const tilesDir = path.join(process.cwd(), "private_tiles", planId);
    const metaPath = path.join(tilesDir, "meta.json");

    if (!fs.existsSync(metaPath)) {
        console.log(`[${planId.slice(0, 8)}] ❌ No meta.json`);
        return;
    }

    const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    console.log(`[${planId.slice(0, 8)}] Meta: ${meta.imageWidth}x${meta.imageHeight}, zoom ${meta.minZoom}-${meta.maxZoom}`);

    // Test loading a sample tile from each zoom level
    for (let z = meta.minZoom; z <= meta.maxZoom; z++) {
        const tilePath = path.join(tilesDir, String(z), "0", "0.png");
        if (!fs.existsSync(tilePath)) {
            console.log(`[${planId.slice(0, 8)}] ❌ Missing tile z${z}/0/0.png`);
            continue;
        }

        try {
            const img = sharp(tilePath);
            const imgMeta = await img.metadata();
            console.log(`[${planId.slice(0, 8)}] ✅ z${z}/0/0.png: ${imgMeta.width}x${imgMeta.height} ${imgMeta.format} channels:${imgMeta.channels}`);
        } catch (e) {
            console.log(`[${planId.slice(0, 8)}] ❌ z${z}/0/0.png: Failed to read - ${e.message}`);
        }
    }

    // Test stitching at zoom 1 (should be small)
    const z = 1;
    const lim = meta.limits[String(z)];
    if (!lim) {
        console.log(`[${planId.slice(0, 8)}] ❌ No limits for zoom ${z}`);
        return;
    }

    console.log(`[${planId.slice(0, 8)}] Testing stitch at z${z}: ${lim.maxX + 1}x${lim.maxY + 1} tiles`);

    try {
        const canvas = sharp({
            create: {
                width: (lim.maxX + 1) * meta.tileSize,
                height: (lim.maxY + 1) * meta.tileSize,
                channels: 4,
                background: { r: 255, g: 255, b: 255, alpha: 1 }
            }
        });

        const compositeOps = [];
        for (let x = 0; x <= lim.maxX; x++) {
            for (let y = 0; y <= lim.maxY; y++) {
                const tilePath = path.join(tilesDir, String(z), String(x), `${y}.png`);
                if (fs.existsSync(tilePath)) {
                    compositeOps.push({
                        input: tilePath,
                        top: y * meta.tileSize,
                        left: x * meta.tileSize
                    });
                }
            }
        }

        const result = await canvas.composite(compositeOps).jpeg({ quality: 80 }).toBuffer();
        console.log(`[${planId.slice(0, 8)}] ✅ Stitched ${compositeOps.length} tiles → ${result.length} bytes JPEG`);

        // Save test output
        const outPath = path.join(process.cwd(), `test_${planId.slice(0, 8)}.jpg`);
        fs.writeFileSync(outPath, result);
        console.log(`[${planId.slice(0, 8)}] ✅ Saved to ${outPath}`);

    } catch (e) {
        console.log(`[${planId.slice(0, 8)}] ❌ Stitch failed: ${e.message}`);
    }

    console.log("");
}

async function main() {
    for (const planId of planIds) {
        await testPlanTiles(planId);
    }
}

main().catch(console.error);
