#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing Supabase credentials");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
    const tilesDir = path.join(process.cwd(), "private_tiles");

    if (!fs.existsSync(tilesDir)) {
        console.error("private_tiles directory not found");
        process.exit(1);
    }

    const planDirs = fs.readdirSync(tilesDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

    console.log(`Found ${planDirs.length} plan directories`);

    for (const planId of planDirs) {
        const metaPath = path.join(tilesDir, planId, "meta.json");

        if (!fs.existsSync(metaPath)) {
            console.log(`[${planId}] No meta.json, skipping`);
            continue;
        }

        try {
            const metaContent = fs.readFileSync(metaPath, "utf-8");
            const meta = JSON.parse(metaContent);

            if (meta.imageWidth && meta.imageHeight) {
                console.log(`[${planId}] Already has dimensions: ${meta.imageWidth}x${meta.imageHeight}`);

                // Update database
                const { error } = await supabase
                    .from("plans")
                    .update({
                        image_width: meta.imageWidth,
                        image_height: meta.imageHeight
                    })
                    .eq("id", planId);

                if (error) {
                    console.error(`[${planId}] Database update failed:`, error.message);
                } else {
                    console.log(`[${planId}] Database updated successfully`);
                }
            } else {
                // Calculate from grid dimensions and tile size
                const { gridW, gridH, tileSize = 256 } = meta;
                if (gridW && gridH) {
                    const imageWidth = gridW * tileSize;
                    const imageHeight = gridH * tileSize;

                    console.log(`[${planId}] Calculated dimensions: ${imageWidth}x${imageHeight} from grid ${gridW}x${gridH}`);

                    // Update meta.json
                    meta.imageWidth = imageWidth;
                    meta.imageHeight = imageHeight;
                    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");
                    console.log(`[${planId}] Updated meta.json`);

                    // Update database
                    const { error } = await supabase
                        .from("plans")
                        .update({
                            image_width: imageWidth,
                            image_height: imageHeight
                        })
                        .eq("id", planId);

                    if (error) {
                        console.error(`[${planId}] Database update failed:`, error.message);
                    } else {
                        console.log(`[${planId}] Database updated successfully`);
                    }
                } else {
                    console.error(`[${planId}] Cannot calculate dimensions - missing gridW/gridH`);
                }
            }
        } catch (e) {
            console.error(`[${planId}] Error:`, e.message);
        }
    }

    console.log("Done!");
}

main().catch(console.error);
