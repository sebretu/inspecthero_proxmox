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
    const { templateId, subproject = 'General' } = req.body || {};

    if (!projectId || !isUuid(projectId)) {
      return res.status(400).json({
        ok: false,
        error: { code: 'BAD_REQUEST', message: 'Valid projectId is required' },
      });
    }

    if (!templateId || !isUuid(templateId)) {
      return res.status(400).json({
        ok: false,
        error: { code: 'BAD_REQUEST', message: 'Valid templateId is required' },
      });
    }

    const serviceClient = createServiceSupabaseClient();

    // 1. Verify project access
    const { data: project, error: pError } = await serviceClient
      .from('projects')
      .select('id, name, company_id')
      .eq('id', projectId)
      .single();

    if (pError || !project) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Project not found or access denied' },
      });
    }

    if (!isAdmin && requester.company_id && project.company_id && project.company_id !== requester.company_id) {
      const { data: membership } = await serviceClient
        .from('project_members')
        .select('id')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .maybeSingle();

      if (!membership) {
        return res.status(403).json({
          ok: false,
          error: { code: 'FORBIDDEN', message: 'Project access denied' },
        });
      }
    }

    // 2. Fetch template and its nodes
    const { data: template, error: tError } = await serviceClient
      .from('project_progress_templates')
      .select('*')
      .eq('id', templateId)
      .single();

    if (tError || !template) {
      return res.status(404).json({
        ok: false,
        error: { code: 'TEMPLATE_NOT_FOUND', message: 'Template not found' },
      });
    }

    const { data: templateNodes, error: nError } = await serviceClient
      .from('project_progress_template_nodes')
      .select('*')
      .eq('template_id', templateId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (nError || !templateNodes || templateNodes.length === 0) {
      return res.status(400).json({
        ok: false,
        error: { code: 'EMPTY_TEMPLATE', message: 'Template has no defined nodes' },
      });
    }

    const targetSubproject = (typeof subproject === 'string' && subproject.trim() ? subproject.trim() : 'General');
    const { selectedCategoryIds, normalizeWeights = true, mode = 'append' } = req.body || {};

    // Make sure subproject is registered in project_subprojects
    const companyId = project?.company_id || null;
    try {
      await serviceClient
        .from('project_subprojects')
        .upsert(
          {
            project_id: projectId,
            company_id: companyId,
            name: targetSubproject,
            created_by: userId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'project_id,name' }
        );
    } catch (sErr) {
      console.error('Error ensuring subproject exists:', sErr);
    }

    if (mode === 'replace') {
      // Delete existing nodes for this subproject
      await serviceClient
        .from('project_progress_nodes')
        .delete()
        .eq('project_id', projectId)
        .eq('subproject', targetSubproject);
    }

    // Determine top-level categories to import
    let topCategories = (templateNodes || []).filter((n: any) => !n.parent_id);
    if (Array.isArray(selectedCategoryIds) && selectedCategoryIds.length > 0) {
      const allowedSet = new Set(selectedCategoryIds);
      topCategories = topCategories.filter((c: any) => allowedSet.has(c.id));
    }

    if (topCategories.length === 0) {
      return res.status(400).json({
        ok: false,
        error: { code: 'NO_CATEGORIES_SELECTED', message: 'No categories were selected for import' },
      });
    }

    // 3. Copy template nodes into project_progress_nodes recursively
    const idMap = new Map<string, string>(); // templateNodeId -> projectNodeId
    let insertedCount = 0;

    async function copyTree(parentTemplateId: string | null, parentProjectNodeId: string | null) {
      let levelNodes: any[] = [];
      if (parentTemplateId === null) {
        levelNodes = topCategories;
      } else {
        levelNodes = (templateNodes || []).filter((n: any) => n.parent_id === parentTemplateId);
      }

      for (const n of levelNodes) {
        const rawType = String(n.node_type || '').toUpperCase();
        const safeNodeType = (rawType.includes('CAT') || !parentProjectNodeId) ? 'CATEGORY' : 'WORK_ITEM';

        const { data: insertedNode, error: insErr } = await serviceClient
          .from('project_progress_nodes')
          .insert({
            project_id: projectId,
            company_id: companyId,
            parent_id: parentProjectNodeId,
            subproject: targetSubproject,
            node_type: safeNodeType,
            name: n.name,
            description: n.description,
            weight: Number(n.weight) || 0,
            progress: 0,
            sort_order: Number(n.sort_order) || 0,
            created_by: userId,
            updated_by: userId,
          })
          .select()
          .single();

        if (insErr) {
          console.error("Error inserting progress node from template:", insErr, n);
        }

        if (insertedNode) {
          insertedCount++;
          idMap.set(n.id, insertedNode.id);
          await copyTree(n.id, insertedNode.id);
        }
      }
    }

    await copyTree(null, null);

    // If normalizeWeights was applied, proportionally scale ALL top-level categories to exactly 100.0%
    if (normalizeWeights) {
      const { data: allTopNodes } = await serviceClient
        .from('project_progress_nodes')
        .select('id, weight')
        .eq('project_id', projectId)
        .eq('subproject', targetSubproject)
        .is('parent_id', null)
        .order('sort_order', { ascending: true });

      if (allTopNodes && allTopNodes.length > 0) {
        const totalRaw = allTopNodes.reduce((sum, n) => sum + (Number(n.weight) || 0), 0);
        const baseTotal = totalRaw > 0 ? totalRaw : allTopNodes.length;
        let runningSum = 0;

        for (let i = 0; i < allTopNodes.length; i++) {
          const node = allTopNodes[i];
          let newWeight = Math.round(((Number(node.weight) / baseTotal) * 100.0) * 10) / 10;
          if (i === allTopNodes.length - 1) {
            newWeight = Math.max(0, Math.round((100.0 - runningSum) * 10) / 10);
          } else {
            runningSum += newWeight;
          }

          await serviceClient
            .from('project_progress_nodes')
            .update({ weight: newWeight, updated_at: new Date().toISOString() })
            .eq('id', node.id);
        }
      }
    }

    // 4. Record history
    try {
      await serviceClient.from('project_progress_history').insert({
        node_id: idMap.values().next().value || projectId,
        project_id: projectId,
        company_id: project.company_id,
        user_id: userId,
        action: 'APPLY_TEMPLATE',
        details: {
          template_id: template.id,
          template_name: template.name,
          subproject: targetSubproject,
          inserted_nodes_count: insertedCount,
          normalized_weights: normalizeWeights,
        },
      });
    } catch (hErr) {
      console.error('Failed to log apply template audit history:', hErr);
    }

    return res.status(200).json({
      ok: true,
      data: {
        applied: true,
        templateName: template.name,
        subproject: targetSubproject,
        nodesCreated: insertedCount,
      },
    });
  } catch (err: any) {
    if (isAuthRequiredError(err)) {
      return res.status(401).json({
        ok: false,
        error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
      });
    }
    console.error('Unhandled error in /api/projects/[id]/progress/apply-template:', err);
    return res.status(500).json({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: err?.message || 'Internal server error' },
    });
  }
}
