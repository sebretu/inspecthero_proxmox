import type { NextApiRequest, NextApiResponse } from "next";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { createClient } from "@supabase/supabase-js";
import fs from "fs/promises";
import path from "path";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const auth = req.headers.authorization || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : null;

  if (!token) return res.status(401).json({ error: "Missing Bearer token" });

  const supabase = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return res.status(401).json({ error: "AUTH_INVALID" });

  const planId = req.query.id as string;
  const { versionId } = req.body;

  if (!planId || !versionId) return res.status(400).json({ error: "Missing planId or versionId" });

  const adminClient = getSupabaseAdminClient();

  try {
    // 1. Fetch the version
    const { data: targetVersion, error: err } = await adminClient
      .from('plan_versions')
      .select('id, status')
      .eq('id', versionId)
      .eq('plan_id', planId)
      .single();

    if (err || !targetVersion) return res.status(404).json({ error: "Version not found" });

    if (targetVersion.status !== 'archived') {
      return res.status(400).json({ error: "Only archived versions can be deleted." });
    }

    // 2. Delete the version
    await adminClient
      .from("plan_versions")
      .delete()
      .eq("id", versionId);

    // 3. Remove tiles from disk
    const webRoot = process.cwd();
    const tilesDir = path.join(webRoot, "private_tiles", versionId);
    await fs.rm(tilesDir, { recursive: true, force: true }).catch(() => {});

    // 4. Audit
    await adminClient.from("audit_events").insert({
      event_type: "archived_version_deleted",
      user_id: user.id,
      resource_id: planId,
      resource_type: "plan",
      metadata: { version_id: versionId }
    });

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("[delete-archived] error:", err);
    return res.status(500).json({ error: err.message });
  }
}
