const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables from inspecthero-web.env
const envPath = '/home/ubuntu/inspecthero-web.env';
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const val = match[2].trim().replace(/^["']|["']$/g, '');
      process.env[key] = val;
    }
  });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing Supabase credentials!");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function deduplicateCables() {
  console.log("Fetching all cable connections from bma_connections...");
  const { data: connections, error } = await supabase
    .from("bma_connections")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to fetch connections:", error);
    process.exit(1);
  }

  console.log(`Found ${connections.length} total connections in DB.`);

  // Separate cables into standard cables (K-) and free lines (L-)
  const usedNumbers = new Set();
  let maxKNum = 0;
  let maxLNum = 0;

  // First pass: Find existing max numbers and identify duplicates
  const updates = [];

  for (const c of connections) {
    const m = c.metadata || {};
    const isFree = c.type === 'FREE_LINE' || m.is_free_line;
    const defaultPrefix = isFree ? 'L' : 'K';

    let cableNum = (m.cable_number || c.name || '').trim();
    if (!cableNum) continue;

    const key = cableNum.toLowerCase();

    if (usedNumbers.has(key)) {
      // DUPLICATE FOUND! Mark for re-numbering
      console.log(`Duplicate found: ID ${c.id}, Name/Num: "${cableNum}", Plan: ${m.source_plan_id || c.plan_id}`);
      updates.push({ conn: c, prefix: defaultPrefix, oldNum: cableNum });
    } else {
      usedNumbers.add(key);
      // Track max number for K- and L-
      const match = cableNum.match(/^(K|L)[-_]?(\d+)/i);
      if (match) {
        const pfx = match[1].toUpperCase();
        const num = parseInt(match[2], 10);
        if (!isNaN(num)) {
          if (pfx === 'K' && num > maxKNum) maxKNum = num;
          if (pfx === 'L' && num > maxLNum) maxLNum = num;
        }
      }
    }
  }

  if (updates.length === 0) {
    console.log("🎉 No duplicate cable numbers found in the database! All cable numbers are already 100% unique.");
    return;
  }

  console.log(`\nFound ${updates.length} duplicates to fix. Re-numbering...`);

  for (const item of updates) {
    const { conn, prefix, oldNum } = item;
    let nextNum;
    if (prefix === 'K') {
      maxKNum++;
      nextNum = `K-${String(maxKNum).padStart(3, '0')}`;
    } else {
      maxLNum++;
      nextNum = `L-${String(maxLNum).padStart(3, '0')}`;
    }

    // Ensure generated nextNum isn't somehow already in usedNumbers
    while (usedNumbers.has(nextNum.toLowerCase())) {
      if (prefix === 'K') { maxKNum++; nextNum = `K-${String(maxKNum).padStart(3, '0')}`; }
      else { maxLNum++; nextNum = `L-${String(maxLNum).padStart(3, '0')}`; }
    }

    usedNumbers.add(nextNum.toLowerCase());

    const newMetadata = {
      ...(conn.metadata || {}),
      cable_number: nextNum
    };

    console.log(`  Updating ID ${conn.id}: "${oldNum}" -> "${nextNum}"`);

    const { error: updateErr } = await supabase
      .from("bma_connections")
      .update({
        name: nextNum,
        metadata: newMetadata
      })
      .eq("id", conn.id);

    if (updateErr) {
      console.error(`  Failed to update ID ${conn.id}:`, updateErr.message);
    } else {
      console.log(`  ✅ Successfully updated ID ${conn.id} to "${nextNum}"`);
    }
  }

  console.log("\n🎉 All duplicate cable numbers have been successfully deduplicated and updated in the DB!");
}

deduplicateCables();
