import { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let supabase;
  try {
    const result = createServerSupabaseClient(req);
    supabase = result.client;
    if (!result.userId) return res.status(401).json({ ok: false, error: "Unauthorized" });
  } catch {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const { projectId, planId } = req.query;

  if (req.method === "GET") {
    if (!projectId || !planId) return res.status(400).json({ ok: false, error: "Missing parameters" });
    const { data, error } = await supabase
      .from('bma_snapshots')
      .select('id, name, type, created_at')
      .eq('project_id', projectId)
      .eq('plan_id', planId)
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(200).json({ ok: true, data });
  }

  if (req.method === "POST") {
    const { projectId, planId, name, type = 'full' } = req.body;
    if (!projectId || !planId || !name) return res.status(400).json({ ok: false, error: "Missing data" });

    const admin = getSupabaseAdminClient();
    const snapshotData: any = {};

    // 1. Fetch devices for THIS plan
    const { data: devices } = await admin.from('bma_devices').select('*').eq('plan_id', planId);
    const deviceIds = devices?.map(d => d.id) || [];

    if (type === 'full' || type === 'devices') {
      snapshotData.devices = devices || [];
    }

    if (type === 'full' || type === 'routes') {
      // CHUNKING: Prevent 502 errors from extremely long query strings (PostgREST/Cloudflare limit)
      const chunkSize = 50;
      const allRoutesMap = new Map();
      
      console.log(`[snapshots] Fetching routes for ${deviceIds.length} devices in chunks of ${chunkSize}`);

      for (let i = 0; i < deviceIds.length; i += chunkSize) {
        const chunk = deviceIds.slice(i, i + chunkSize);
        
        const [bySource, byTarget] = await Promise.all([
          admin.from('bma_routes').select('*').in('source_device_id', chunk),
          admin.from('bma_routes').select('*').in('target_device_id', chunk)
        ]);

        if (bySource.error) console.error(`[snapshots] Source chunk error at ${i}:`, bySource.error.message);
        if (byTarget.error) console.error(`[snapshots] Target chunk error at ${i}:`, byTarget.error.message);

        [...(bySource.data || []), ...(byTarget.data || [])].forEach(r => {
          allRoutesMap.set(r.id, r);
        });
      }

      const routes = Array.from(allRoutesMap.values());
      const connIds = [...new Set(routes?.map(r => r.connection_id))];
      
      // Also chunk connection fetching just in case
      const connections: any[] = [];
      for (let i = 0; i < connIds.length; i += chunkSize) {
        const chunk = connIds.slice(i, i + chunkSize);
        const { data: conns } = await admin.from('bma_connections').select('*').in('id', chunk);
        if (conns) connections.push(...conns);
      }
      
      snapshotData.routes = routes || [];
      snapshotData.connections = connections || [];
      console.log(`[snapshots] Captured ${routes.length} routes and ${connections.length} connections for snapshot ${name}`);
    }

    const { data: snapshot, error } = await admin
      .from('bma_snapshots')
      .insert({
        project_id: projectId,
        plan_id: planId,
        name,
        type,
        data: snapshotData
      })
      .select()
      .single();

    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(200).json({ ok: true, data: snapshot });
  }

  if (req.method === "DELETE") {
     const { id } = req.query;
     if (!id) return res.status(400).json({ ok: false, error: "Missing ID" });
     const { error } = await supabase.from('bma_snapshots').delete().eq('id', id);
     if (error) return res.status(500).json({ ok: false, error: error.message });
     return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
