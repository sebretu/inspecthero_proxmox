import fs from 'fs/promises';
import path from 'path';

async function run() {
  const webRoot = "/home/ubuntu/building-task-manager/web";
  const planId = "0d4ccb3f-d8ab-4cce-bd74-fc15da3f510e";
  
  const metaPath = path.join(webRoot, "private_tiles", planId, "meta.json");
  try {
    const raw = await fs.readFile(metaPath, "utf8");
    console.log("=== meta.json ===");
    console.log(raw);
  } catch (err) {
    console.error("Failed to read meta.json:", err.message);
  }

  // Also check other version directories if they exist
  const dirs = [
    "9d27f347-b45b-4342-ac41-167a1877952f",
    "f3d96050-5359-47f8-a215-f57c46c08a5b",
    "aaf9c713-9850-498b-a3aa-aa531a2c4000",
    "7baebf5c-24d9-4947-b985-9a40f051428f"
  ];

  for (const d of dirs) {
    const p = path.join(webRoot, "private_tiles", d);
    try {
      await fs.access(p);
      console.log(`Directory ${d} EXISTS`);
      // read meta.json if exists
      const mPath = path.join(p, "meta.json");
      const mRaw = await fs.readFile(mPath, "utf8");
      console.log(`  meta.json for ${d}:`, mRaw.trim());
    } catch {
      console.log(`Directory ${d} DOES NOT exist`);
    }
  }
}

run();
