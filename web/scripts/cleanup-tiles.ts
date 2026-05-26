
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});

const TILES_DIR = path.join(process.cwd(), "private_tiles");

async function main() {
    console.log("Fetching plans from database...");
    const { data: plans, error } = await supabase
        .from("plans")
        .select("id");

    if (error) {
        console.error("Error fetching plans:", error);
        process.exit(1);
    }

    const validPlanIds = new Set(plans.map((p) => p.id));
    console.log(`Found ${validPlanIds.size} plans in database.`);

    if (!fs.existsSync(TILES_DIR)) {
        console.error(`Tiles directory does not exist: ${TILES_DIR}`);
        process.exit(1);
    }

    const dirs = fs.readdirSync(TILES_DIR);
    let removedCount = 0;

    for (const dir of dirs) {
        const fullPath = path.join(TILES_DIR, dir);
        if (!fs.statSync(fullPath).isDirectory()) continue;

        if (!validPlanIds.has(dir)) {
            console.log(`Removing unused tile directory: ${dir}`);
            fs.rmSync(fullPath, { recursive: true, force: true });
            removedCount++;
        } else {
            // console.log(`Keeping active tile directory: ${dir}`);
        }
    }

    console.log(`Cleanup complete. Removed ${removedCount} unused directories.`);
}

main();
