import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerSupabaseClient, createServiceSupabaseClient, isAuthRequiredError } from '@/lib/supabaseServer';
import { requireRequesterProfile, isAdminRole } from '@/lib/requesterProfile';

type ApiOk<T = any> = { ok: true; data: T };
type ApiErr = { ok: false; error: { code: string; message: string; meta?: any } };

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
  try {
    const { client, userId } = await createServerSupabaseClient(req);
    const requester = await requireRequesterProfile(client, userId);
    const serviceClient = createServiceSupabaseClient();

    // --- GET /api/progress-templates ---
    if (req.method === 'GET') {
      let query = serviceClient
        .from('project_progress_templates')
        .select('*, project_progress_template_nodes(id, parent_id, weight)')
        .order('is_system', { ascending: false })
        .order('created_at', { ascending: true });

      if (requester.company_id) {
        query = query.or(`is_system.eq.true,company_id.eq.${requester.company_id}`);
      } else {
        query = query.eq('is_system', true);
      }

      const { data: templates, error: tError } = await query;

      if (tError) {
        return res.status(400).json({
          ok: false,
          error: { code: 'SUPABASE_ERROR', message: tError.message },
        });
      }

      const formatted = (templates || []).map((t: any) => {
        const nodes = t.project_progress_template_nodes || [];
        const rootNodes = nodes.filter((n: any) => !n.parent_id);
        const totalWeight = rootNodes.reduce((sum: number, n: any) => sum + Number(n.weight || 0), 0);

        return {
          id: t.id,
          companyId: t.company_id,
          name: t.name,
          description: t.description,
          isSystem: Boolean(t.is_system),
          createdAt: t.created_at,
          updatedAt: t.updated_at,
          categoryCount: rootNodes.length,
          nodeCount: nodes.length,
          totalWeight: Number(totalWeight.toFixed(2)),
        };
      });

      return res.status(200).json({ ok: true, data: formatted });
    }

    // --- POST /api/progress-templates ---
    if (req.method === 'POST') {
      const { name, description = null, nodes = [] } = req.body || {};
      const trimmedName = typeof name === 'string' ? name.trim() : '';

      if (!trimmedName) {
        return res.status(400).json({
          ok: false,
          error: { code: 'INVALID_NAME', message: 'Template name is required' },
        });
      }

      // Create template
      const { data: createdTpl, error: cError } = await serviceClient
        .from('project_progress_templates')
        .insert({
          company_id: requester.company_id || null,
          name: trimmedName,
          description: description ? String(description).trim() : null,
          is_system: false,
          created_by: userId,
        })
        .select()
        .single();

      if (cError || !createdTpl) {
        return res.status(400).json({
          ok: false,
          error: { code: 'INSERT_FAILED', message: cError?.message || 'Failed to create template' },
        });
      }

      // Insert nodes recursively if provided
      if (Array.isArray(nodes) && nodes.length > 0) {
        const idMap = new Map<string, string>(); // tempId -> realDbId

        async function insertNodeLevel(nodeList: any[], parentDbId: string | null = null) {
          for (const n of nodeList) {
            const tempId = n.tempId || n.id;
            const weight = Number(n.weight) || 0;
            const sortOrder = Number(n.sortOrder) || 0;

            const { data: insertedNode } = await serviceClient
              .from('project_progress_template_nodes')
              .insert({
                template_id: createdTpl.id,
                parent_id: parentDbId,
                node_type: parentDbId ? 'WORK_ITEM' : 'CATEGORY',
                name: String(n.name).trim(),
                description: n.description ? String(n.description).trim() : null,
                weight,
                sort_order: sortOrder,
              })
              .select()
              .single();

            if (insertedNode) {
              if (tempId) idMap.set(tempId, insertedNode.id);
              if (Array.isArray(n.children) && n.children.length > 0) {
                await insertNodeLevel(n.children, insertedNode.id);
              }
            }
          }
        }

        await insertNodeLevel(nodes, null);
      }

      return res.status(201).json({ ok: true, data: createdTpl });
    }

    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({
      ok: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: `Method ${req.method} not allowed` },
    });
  } catch (err: any) {
    if (isAuthRequiredError(err)) {
      return res.status(401).json({
        ok: false,
        error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
      });
    }
    console.error('Unhandled error in /api/progress-templates:', err);
    return res.status(500).json({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: err?.message || 'Internal server error' },
    });
  }
}
