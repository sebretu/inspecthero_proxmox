import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerSupabaseClient, createServiceSupabaseClient, isAuthRequiredError } from '@/lib/supabaseServer';
import { requireRequesterProfile, isAdminRole } from '@/lib/requesterProfile';
import type { ProgressTemplateNode } from '@repo/shared';

type ApiOk<T = any> = { ok: true; data: T };
type ApiErr = { ok: false; error: { code: string; message: string; meta?: any } };

function isUuid(val: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
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

    // 1. Fetch template
    const { data: template, error: tError } = await serviceClient
      .from('project_progress_templates')
      .select('*')
      .eq('id', templateId)
      .single();

    if (tError || !template) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Template not found' },
      });
    }

    // Security check: must be system template or belongs to user's company
    if (!template.is_system && requester.company_id && template.company_id && template.company_id !== requester.company_id) {
      return res.status(403).json({
        ok: false,
        error: { code: 'FORBIDDEN', message: 'Access denied to this template' },
      });
    }

    // --- GET /api/progress-templates/:id ---
    if (req.method === 'GET') {
      const { data: rawNodes, error: nError } = await serviceClient
        .from('project_progress_template_nodes')
        .select('*')
        .eq('template_id', templateId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (nError) {
        return res.status(400).json({
          ok: false,
          error: { code: 'SUPABASE_ERROR', message: nError.message },
        });
      }

      // Build tree
      const nodes = rawNodes || [];
      function buildTree(parentId: string | null): ProgressTemplateNode[] {
        return nodes
          .filter((n: any) => (n.parent_id || null) === parentId)
          .map((n: any) => ({
            id: n.id,
            templateId: n.template_id,
            parentId: n.parent_id,
            nodeType: n.node_type,
            name: n.name,
            description: n.description,
            weight: Number(n.weight),
            sortOrder: n.sort_order,
            children: buildTree(n.id),
          }));
      }

      const tree = buildTree(null);
      const rootNodes = nodes.filter((n: any) => !n.parent_id);
      const totalWeight = rootNodes.reduce((sum: number, n: any) => sum + Number(n.weight || 0), 0);

      return res.status(200).json({
        ok: true,
        data: {
          id: template.id,
          companyId: template.company_id,
          name: template.name,
          description: template.description,
          isSystem: Boolean(template.is_system),
          createdAt: template.created_at,
          updatedAt: template.updated_at,
          categoryCount: rootNodes.length,
          nodeCount: nodes.length,
          totalWeight: Number(totalWeight.toFixed(2)),
          nodes: tree,
        },
      });
    }

    // --- PATCH /api/progress-templates/:id ---
    if (req.method === 'PATCH') {
      if (template.is_system) {
        return res.status(403).json({
          ok: false,
          error: { code: 'SYSTEM_TEMPLATE_PROTECTED', message: 'System templates cannot be modified directly. Please duplicate it first.' },
        });
      }

      const { name, description } = req.body || {};
      const updates: any = { updated_at: new Date().toISOString() };

      if (name !== undefined) {
        if (typeof name !== 'string' || !name.trim()) {
          return res.status(400).json({
            ok: false,
            error: { code: 'INVALID_NAME', message: 'Name cannot be empty' },
          });
        }
        updates.name = name.trim();
      }

      if (description !== undefined) {
        updates.description = description ? String(description).trim() : null;
      }

      const { data: updated, error: uError } = await serviceClient
        .from('project_progress_templates')
        .update(updates)
        .eq('id', templateId)
        .select()
        .single();

      if (uError || !updated) {
        return res.status(400).json({
          ok: false,
          error: { code: 'UPDATE_FAILED', message: uError?.message || 'Failed to update template' },
        });
      }

      return res.status(200).json({ ok: true, data: updated });
    }

    // --- DELETE /api/progress-templates/:id ---
    if (req.method === 'DELETE') {
      if (template.is_system) {
        return res.status(403).json({
          ok: false,
          error: { code: 'SYSTEM_TEMPLATE_PROTECTED', message: 'System templates cannot be deleted.' },
        });
      }

      const { error: dError } = await serviceClient
        .from('project_progress_templates')
        .delete()
        .eq('id', templateId);

      if (dError) {
        return res.status(400).json({
          ok: false,
          error: { code: 'DELETE_FAILED', message: dError.message },
        });
      }

      return res.status(200).json({ ok: true, data: { id: templateId, deleted: true } });
    }

    res.setHeader('Allow', ['GET', 'PATCH', 'DELETE']);
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
    console.error('Unhandled error in /api/progress-templates/[id]:', err);
    return res.status(500).json({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: err?.message || 'Internal server error' },
    });
  }
}
