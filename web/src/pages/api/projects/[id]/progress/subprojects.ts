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

    if (!projectId || !isUuid(projectId)) {
      return res.status(400).json({
        ok: false,
        error: { code: 'BAD_REQUEST', message: 'Valid projectId is required' },
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

    // --- GET /api/projects/:id/progress/subprojects ---
    if (req.method === 'GET') {
      const { data: list, error: lError } = await serviceClient
        .from('project_subprojects')
        .select('*')
        .eq('project_id', projectId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (lError) {
        return res.status(400).json({
          ok: false,
          error: { code: 'SUPABASE_ERROR', message: lError.message },
        });
      }

      return res.status(200).json({ ok: true, data: list || [] });
    }

    // --- POST /api/projects/:id/progress/subprojects ---
    if (req.method === 'POST') {
      const { name, description = null, parent_group = null, parent_id = null, batch = null } = req.body || {};

      if (Array.isArray(batch) && batch.length > 0) {
        const results = [];
        for (const item of batch) {
          const itemTrimmed = typeof item === 'string' ? item.trim() : (typeof item?.name === 'string' ? item.name.trim() : '');
          if (!itemTrimmed) continue;
          const itemGroup = typeof item === 'object' && item?.parent_group ? String(item.parent_group).trim() : (parent_group ? String(parent_group).trim() : null);

          const { data: ins } = await serviceClient
            .from('project_subprojects')
            .upsert(
              {
                project_id: projectId,
                company_id: project.company_id,
                name: itemTrimmed,
                parent_group: itemGroup,
                parent_id: parent_id || null,
                description: description ? String(description).trim() : null,
                created_by: userId,
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'project_id,name' }
            )
            .select()
            .single();

          if (ins) results.push(ins);
        }

        return res.status(201).json({ ok: true, data: results });
      }

      const trimmedName = typeof name === 'string' ? name.trim() : '';

      if (!trimmedName) {
        return res.status(400).json({
          ok: false,
          error: { code: 'INVALID_NAME', message: 'Subproject name is required' },
        });
      }

      const { data: inserted, error: iError } = await serviceClient
        .from('project_subprojects')
        .upsert(
          {
            project_id: projectId,
            company_id: project.company_id,
            name: trimmedName,
            parent_group: parent_group ? String(parent_group).trim() : null,
            parent_id: parent_id || null,
            description: description ? String(description).trim() : null,
            created_by: userId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'project_id,name' }
        )
        .select()
        .single();

      if (iError || !inserted) {
        return res.status(400).json({
          ok: false,
          error: { code: 'INSERT_FAILED', message: iError?.message || 'Failed to save subproject' },
        });
      }

      return res.status(201).json({ ok: true, data: inserted });
    }

    // --- PATCH /api/projects/:id/progress/subprojects ---
    if (req.method === 'PATCH') {
      const { id, name, newName, parent_group, parent_id, description } = req.body || {};

      const cleanName = String(newName || name || '').trim();
      const cleanGroup = parent_group !== undefined ? (parent_group ? String(parent_group).trim() : null) : undefined;

      if (!cleanName && (!id || !isUuid(id))) {
        return res.status(400).json({
          ok: false,
          error: { code: 'BAD_REQUEST', message: 'Subproject id or name is required' },
        });
      }

      // Upsert into project_subprojects
      const upsertPayload: any = {
        project_id: projectId,
        company_id: project.company_id,
        name: cleanName,
        created_by: userId,
        updated_at: new Date().toISOString(),
      };
      if (id && isUuid(id)) upsertPayload.id = id;
      if (cleanGroup !== undefined) upsertPayload.parent_group = cleanGroup;
      if (parent_id !== undefined) upsertPayload.parent_id = parent_id || null;
      if (description !== undefined) upsertPayload.description = description || null;

      const { data: updated, error: uError } = await serviceClient
        .from('project_subprojects')
        .upsert(upsertPayload, { onConflict: 'project_id,name' })
        .select()
        .single();

      if (uError) {
        return res.status(400).json({
          ok: false,
          error: { code: 'UPDATE_FAILED', message: uError.message },
        });
      }

      // If parent_group is specified, ensure [Tenant] (Główny) also exists in project_subprojects
      if (cleanGroup) {
        const rootTenantName = `${cleanGroup} (Główny)`;
        await serviceClient.from('project_subprojects').upsert(
          {
            project_id: projectId,
            company_id: project.company_id,
            name: rootTenantName,
            parent_group: cleanGroup,
            created_by: userId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'project_id,name' }
        );
      }

      // If renamed, update existing progress nodes
      if (newName && name && String(newName).trim() !== String(name).trim()) {
        await serviceClient
          .from('project_progress_nodes')
          .update({ subproject: String(newName).trim() })
          .eq('project_id', projectId)
          .eq('subproject', String(name).trim());
      }

      return res.status(200).json({ ok: true, data: updated });
    }

    // --- DELETE /api/projects/:id/progress/subprojects ---
    if (req.method === 'DELETE') {
      const { name } = req.body || req.query;
      const targetName = typeof name === 'string' ? name.trim() : '';

      if (!targetName) {
        return res.status(400).json({
          ok: false,
          error: { code: 'INVALID_NAME', message: 'Subproject name is required' },
        });
      }

      // Delete from project_subprojects
      await serviceClient
        .from('project_subprojects')
        .delete()
        .eq('project_id', projectId)
        .ilike('name', targetName);

      // Also delete nodes belonging to this subproject
      await serviceClient
        .from('project_progress_nodes')
        .delete()
        .eq('project_id', projectId)
        .ilike('subproject', targetName);

      return res.status(200).json({ ok: true, data: { deleted: true, name: targetName } });
    }

    res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
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
    console.error('Unhandled error in /api/projects/[id]/progress/subprojects:', err);
    return res.status(500).json({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: err?.message || 'Internal server error' },
    });
  }
}
