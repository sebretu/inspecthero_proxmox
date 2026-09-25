import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerSupabaseClient, createServiceSupabaseClient, isAuthRequiredError } from '@/lib/supabaseServer';
import { requireRequesterProfile, isAdminRole } from '@/lib/requesterProfile';

type ApiOk<T = any> = { ok: true; data: T };
type ApiErr = { ok: false; error: { code: string; message: string; meta?: any } };

function isUuid(val: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({
      ok: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: `Method ${req.method} not allowed` },
    });
  }

  try {
    const { client, userId } = await createServerSupabaseClient(req);
    const requester = await requireRequesterProfile(client, userId);
    const isAdmin = isAdminRole(requester.role);
    const projectId = req.query.id as string;
    const { subproject = 'General', parentId = null, mode = 'equal' } = req.body || {};

    if (!projectId || !isUuid(projectId)) {
      return res.status(400).json({
        ok: false,
        error: { code: 'BAD_REQUEST', message: 'Valid projectId is required' },
      });
    }

    const serviceClient = createServiceSupabaseClient();
    const targetSubproject = (typeof subproject === 'string' && subproject.trim() ? subproject.trim() : 'General');

    let query = serviceClient
      .from('project_progress_nodes')
      .select('id, name, weight')
      .eq('project_id', projectId);

    if (parentId && isUuid(parentId)) {
      query = query.eq('parent_id', parentId);
    } else {
      query = query.eq('subproject', targetSubproject).is('parent_id', null);
    }

    const { data: nodes, error: nErr } = await query
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (nErr || !nodes || nodes.length === 0) {
      return res.status(400).json({
        ok: false,
        error: { code: 'NO_NODES', message: 'No items found to normalize' },
      });
    }

    const count = nodes.length;
    const totalWeight = nodes.reduce((sum, c) => sum + (Number(c.weight) || 0), 0);
    const isZeroWeight = totalWeight <= 0;
    const isEqualSplit = mode === 'equal' || isZeroWeight;

    let runningSum = 0;
    for (let i = 0; i < count; i++) {
      const node = nodes[i];
      let newWeight = 0;
      if (isEqualSplit) {
        newWeight = Math.round((100.0 / count) * 10) / 10;
      } else {
        newWeight = Math.round(((Number(node.weight) / totalWeight) * 100.0) * 10) / 10;
      }

      if (i === count - 1) {
        newWeight = Math.max(0, Math.round((100.0 - runningSum) * 10) / 10);
      } else {
        runningSum += newWeight;
      }

      await serviceClient
        .from('project_progress_nodes')
        .update({ weight: newWeight, updated_by: userId, updated_at: new Date().toISOString() })
        .eq('id', node.id);
    }

    return res.status(200).json({
      ok: true,
      data: {
        normalized: true,
        parentId: parentId || null,
        subproject: targetSubproject,
        itemCount: count,
      },
    });
  } catch (err: any) {
    if (isAuthRequiredError(err)) {
      return res.status(401).json({
        ok: false,
        error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
      });
    }
    console.error('Unhandled error in /api/projects/[id]/progress/normalize-weights:', err);
    return res.status(500).json({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: err?.message || 'Internal server error' },
    });
  }
}
