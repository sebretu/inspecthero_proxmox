import { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  let supabase;
  try {
    const result = createServerSupabaseClient(req);
    supabase = result.client;
    if (!result.userId) return res.status(401).json({ ok: false, error: "Unauthorized" });
  } catch {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const { snapshotId } = req.body;
  if (!snapshotId) return res.status(400).json({ ok: false, error: "Missing snapshot ID" });

  try {
    const admin = getSupabaseAdminClient();

    // 1. Fetch snapshot
    const { data: snapshot, error: fetchErr } = await admin
      .from('bma_snapshots')
      .select('*')
      .eq('id', snapshotId)
      .single();

    if (fetchErr || !snapshot) throw new Error("Snapshot not found");

    const { plan_id: planId, type, data } = snapshot;
    const { devices, connections, routes } = data;

    // 2. RESTORE DEVICES FIRST
    // This is critical because routes depend on device IDs (Foreign Keys)
    if (type === 'full' || type === 'devices') {
      // Wipe only devices for this plan. 
      // NOTE: This will also wipe routes via CASCADE, so we must restore routes AFTER this.
      await admin.from('bma_devices').delete().eq('plan_id', planId);
      if (devices && devices.length > 0) {
        const { error: devErr } = await admin.from('bma_devices').insert(devices);
        if (devErr) throw devErr;
      }
    }

    // 3. RESTORE ROUTES SECOND
    if (type === 'full' || type === 'routes') {
      // If we are doing 'routes only', we must manually wipe routes for the existing devices
      if (type === 'routes') {
        const { data: currentDevices } = await admin.from('bma_devices').select('id').eq('plan_id', planId);
        const currentDeviceIds = currentDevices?.map(d => d.id) || [];
        if (currentDeviceIds.length > 0) {
          await admin.from('bma_routes').delete().in('source_device_id', currentDeviceIds);
        }
      }

      if (routes && routes.length > 0) {
        // Ensure connections exist
        if (connections && connections.length > 0) {
          const { error: connErr } = await admin.from('bma_connections').upsert(connections, { onConflict: 'id' });
          if (connErr) throw connErr;
        }
        // Insert routes
        const { error: routeErr } = await admin.from('bma_routes').insert(routes);
        if (routeErr) throw routeErr;
      }
    }

    return res.status(200).json({ ok: true, data: { success: true } });
  } catch (err: any) {
    console.error("[load-snapshot] Error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
