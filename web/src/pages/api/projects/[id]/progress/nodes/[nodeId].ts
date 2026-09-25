import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerSupabaseClient, createServiceSupabaseClient, isAuthRequiredError } from '@/lib/supabaseServer';
import { requireRequesterProfile, isAdminRole } from '@/lib/requesterProfile';

type ApiOk<T = any> = { ok: true; data: T };
type ApiErr = { ok: false; error: { code: string; message: string; meta?: any } };

function isUuid(val: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
  try {
    const { client, userId } = await createServerSupabaseClient(req);
    const requester = await requireRequesterProfile(client, userId);
    const isAdmin = isAdminRole(requester.role);
    const projectId = req.query.id as string;
    const nodeId = req.query.nodeId as string;

    if (!projectId || !isUuid(projectId) || !nodeId || !isUuid(nodeId)) {
      return res.status(400).json({
        ok: false,
        error: { code: 'BAD_REQUEST', message: 'Valid projectId and nodeId are required' },
      });
    }

    const serviceClient = createServiceSupabaseClient();

    // 1. Fetch current node
    const { data: existingNode, error: fetchErr } = await serviceClient
      .from('project_progress_nodes')
      .select('*')
      .eq('id', nodeId)
      .eq('project_id', projectId)
      .single();

    if (fetchErr || !existingNode) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Progress node not found or access denied' },
      });
    }

    // Check project access: Admins have global access; other users must belong to same company or project_members
    if (!isAdmin && requester.company_id && existingNode.company_id && existingNode.company_id !== requester.company_id) {
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

    // --- GET /api/projects/:id/progress/nodes/:nodeId (Fetch history for this node) ---
    if (req.method === 'GET') {
      const { data: history, error: hError } = await serviceClient
        .from('project_progress_history')
        .select('*, profiles:user_id(full_name, email)')
        .eq('node_id', nodeId)
        .order('created_at', { ascending: false });

      if (hError) {
        return res.status(400).json({
          ok: false,
          error: { code: 'SUPABASE_ERROR', message: hError.message },
        });
      }

      return res.status(200).json({ ok: true, data: history || [] });
    }

    // --- PATCH /api/projects/:id/progress/nodes/:nodeId ---
    if (req.method === 'PATCH') {
      const { name, description, weight, progress, sortOrder, subproject } = req.body || {};
      const updates: any = { updated_by: userId, updated_at: new Date().toISOString() };
      const actionsToLog: Array<{
        action: string;
        old_weight?: number;
        new_weight?: number;
        old_progress?: number;
        new_progress?: number;
        details?: any;
      }> = [];

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

      if (subproject !== undefined) {
        updates.subproject = subproject ? String(subproject).trim() : 'General';
      }

      if (sortOrder !== undefined) {
        updates.sort_order = Number(sortOrder) || 0;
      }

      if (weight !== undefined) {
        const numWeight = Number(weight);
        if (Number.isNaN(numWeight) || numWeight < 0 || numWeight > 100) {
          return res.status(400).json({
            ok: false,
            error: { code: 'INVALID_WEIGHT', message: 'Weight must be between 0 and 100' },
          });
        }
        if (numWeight !== Number(existingNode.weight)) {
          updates.weight = numWeight;
          actionsToLog.push({
            action: 'UPDATE_WEIGHT',
            old_weight: Number(existingNode.weight),
            new_weight: numWeight,
          });
        }
      }

      if (progress !== undefined) {
        const numProgress = Number(progress);
        if (Number.isNaN(numProgress) || numProgress < 0 || numProgress > 100) {
          return res.status(400).json({
            ok: false,
            error: { code: 'INVALID_PROGRESS', message: 'Progress must be between 0 and 100' },
          });
        }
        if (numProgress !== Number(existingNode.progress)) {
          updates.progress = numProgress;

          const wasComplete = Number(existingNode.progress) >= 100;
          const isNowComplete = numProgress >= 100;

          if (isNowComplete && !wasComplete) {
            updates.completed_at = new Date().toISOString();
            updates.completed_by = userId;
            actionsToLog.push({
              action: 'TOGGLE_COMPLETE',
              old_progress: Number(existingNode.progress),
              new_progress: numProgress,
            });
          } else if (!isNowComplete && wasComplete) {
            updates.completed_at = null;
            updates.completed_by = null;
            actionsToLog.push({
              action: 'TOGGLE_COMPLETE',
              old_progress: Number(existingNode.progress),
              new_progress: numProgress,
            });
          } else {
            actionsToLog.push({
              action: 'UPDATE_PROGRESS',
              old_progress: Number(existingNode.progress),
              new_progress: numProgress,
            });
          }
        }
      }

      if (Object.keys(updates).length <= 2) {
        return res.status(200).json({ ok: true, data: existingNode });
      }

      const { data: updatedNode, error: uError } = await serviceClient
        .from('project_progress_nodes')
        .update(updates)
        .eq('id', nodeId)
        .select()
        .single();

      if (uError || !updatedNode) {
        return res.status(400).json({
          ok: false,
          error: { code: 'UPDATE_FAILED', message: uError?.message || 'Failed to update progress node' },
        });
      }

      // Record logs
      if (actionsToLog.length === 0 && (updates.name || updates.description !== undefined || updates.subproject !== undefined)) {
        actionsToLog.push({
          action: 'UPDATE_INFO',
          details: { name: updates.name, description: updates.description, subproject: updates.subproject },
        });
      }

      for (const log of actionsToLog) {
        try {
          await serviceClient.from('project_progress_history').insert({
            node_id: nodeId,
            project_id: projectId,
            company_id: existingNode.company_id,
            user_id: userId,
            action: log.action,
            old_weight: log.old_weight ?? null,
            new_weight: log.new_weight ?? null,
            old_progress: log.old_progress ?? null,
            new_progress: log.new_progress ?? null,
            details: log.details ?? null,
          });
        } catch (hErr) {
          console.error('Audit history log error:', hErr);
        }
      }

      return res.status(200).json({ ok: true, data: updatedNode });
    }

    // --- DELETE /api/projects/:id/progress/nodes/:nodeId ---
    if (req.method === 'DELETE') {
      const parentId = existingNode.parent_id;
      const subproject = existingNode.subproject;
      const wasCategory = !parentId;

      // 1. Delete all descendants if any (recursive child items)
      const { data: directChildren } = await serviceClient
        .from('project_progress_nodes')
        .select('id')
        .eq('parent_id', nodeId);

      if (directChildren && directChildren.length > 0) {
        const childIds = directChildren.map((c) => c.id);
        const { data: grandChildren } = await serviceClient
          .from('project_progress_nodes')
          .select('id')
          .in('parent_id', childIds);

        const allDescendantIds = [...childIds, ...(grandChildren || []).map((g) => g.id)];
        if (allDescendantIds.length > 0) {
          await serviceClient
            .from('project_progress_nodes')
            .delete()
            .in('id', allDescendantIds);
        }
      }

      const { error: dError } = await serviceClient
        .from('project_progress_nodes')
        .delete()
        .eq('id', nodeId);

      if (dError) {
        return res.status(400).json({
          ok: false,
          error: { code: 'DELETE_FAILED', message: dError.message },
        });
      }

      // 2. Automatically recalculate & balance remaining siblings equally to 100%
      try {
        if (!wasCategory && parentId) {
          // Find remaining siblings under the same parent
          const { data: siblings } = await serviceClient
            .from('project_progress_nodes')
            .select('id, weight')
            .eq('project_id', projectId)
            .eq('parent_id', parentId)
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: true });

          if (siblings && siblings.length > 0) {
            const count = siblings.length;
            let runningSum = 0;
            for (let i = 0; i < count; i++) {
              let newW = Math.round((100.0 / count) * 10) / 10;
              if (i === count - 1) {
                newW = Math.max(0, Math.round((100.0 - runningSum) * 10) / 10);
              } else {
                runningSum += newW;
              }
              await serviceClient
                .from('project_progress_nodes')
                .update({ weight: newW, updated_by: userId, updated_at: new Date().toISOString() })
                .eq('id', siblings[i].id);
            }
          }
        } else if (wasCategory) {
          // Find remaining top-level categories under this subproject
          const { data: remainingCats } = await serviceClient
            .from('project_progress_nodes')
            .select('id, weight')
            .eq('project_id', projectId)
            .eq('subproject', subproject)
            .is('parent_id', null)
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: true });

          if (remainingCats && remainingCats.length > 0) {
            const count = remainingCats.length;
            let runningSum = 0;
            for (let i = 0; i < count; i++) {
              let newW = Math.round((100.0 / count) * 10) / 10;
              if (i === count - 1) {
                newW = Math.max(0, Math.round((100.0 - runningSum) * 10) / 10);
              } else {
                runningSum += newW;
              }
              await serviceClient
                .from('project_progress_nodes')
                .update({ weight: newW, updated_by: userId, updated_at: new Date().toISOString() })
                .eq('id', remainingCats[i].id);
            }
          }
        }
      } catch (rebErr) {
        console.error('Auto rebalance error on delete:', rebErr);
      }

      try {
        await serviceClient.from('project_progress_history').insert({
          node_id: nodeId,
          project_id: projectId,
          company_id: existingNode.company_id,
          user_id: userId,
          action: 'DELETE',
          details: { name: existingNode.name, node_type: existingNode.node_type },
        });
      } catch (hErr) {
        console.error('Audit history log error on delete:', hErr);
      }

      return res.status(200).json({ ok: true, data: { id: nodeId, deleted: true } });
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
    console.error('Unhandled error in /api/projects/[id]/progress/nodes/[nodeId]:', err);
    return res.status(500).json({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: err?.message || 'Internal server error' },
    });
  }
}
