import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerSupabaseClient, createServiceSupabaseClient, isAuthRequiredError } from '@/lib/supabaseServer';
import { requireRequesterProfile } from '@/lib/requesterProfile';

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
    const serviceClient = createServiceSupabaseClient();
    const templateId = req.query.id as string;

    if (!templateId || !isUuid(templateId)) {
      return res.status(400).json({
        ok: false,
        error: { code: 'BAD_REQUEST', message: 'Valid template ID is required' },
      });
    }

    // 1. Fetch source template
    const { data: sourceTpl, error: tError } = await serviceClient
      .from('project_progress_templates')
      .select('*')
      .eq('id', templateId)
      .single();

    if (tError || !sourceTpl) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Source template not found' },
      });
    }

    const newName = typeof req.body?.name === 'string' && req.body.name.trim()
      ? req.body.name.trim()
      : `${sourceTpl.name} (Kopie)`;

    // 2. Insert new user template
    const { data: newTpl, error: nError } = await serviceClient
      .from('project_progress_templates')
      .insert({
        company_id: requester.company_id || null,
        name: newName,
        description: sourceTpl.description,
        is_system: false,
        created_by: userId,
      })
      .select()
      .single();

    if (nError || !newTpl) {
      return res.status(400).json({
        ok: false,
        error: { code: 'DUPLICATE_FAILED', message: nError?.message || 'Failed to duplicate template' },
      });
    }

    // 3. Fetch all nodes of source template
    const { data: sourceNodes } = await serviceClient
      .from('project_progress_template_nodes')
      .select('*')
      .eq('template_id', templateId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    const nodes = sourceNodes || [];
    const idMap = new Map<string, string>(); // oldNodeId -> newNodeId

    // Recursive copier
    async function copyLevel(parentOldId: string | null, parentNewId: string | null) {
      const levelNodes = nodes.filter((n: any) => (n.parent_id || null) === parentOldId);
      for (const n of levelNodes) {
        const { data: insertedNode } = await serviceClient
          .from('project_progress_template_nodes')
          .insert({
            template_id: newTpl.id,
            parent_id: parentNewId,
            node_type: n.node_type,
            name: n.name,
            description: n.description,
            weight: n.weight,
            sort_order: n.sort_order,
          })
          .select()
          .single();

        if (insertedNode) {
          idMap.set(n.id, insertedNode.id);
          await copyLevel(n.id, insertedNode.id);
        }
      }
    }

    await copyLevel(null, null);

    return res.status(201).json({ ok: true, data: newTpl });
  } catch (err: any) {
    if (isAuthRequiredError(err)) {
      return res.status(401).json({
        ok: false,
        error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
      });
    }
    console.error('Unhandled error in /api/progress-templates/[id]/duplicate:', err);
    return res.status(500).json({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: err?.message || 'Internal server error' },
    });
  }
}
