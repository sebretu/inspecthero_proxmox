import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerSupabaseClient, createServiceSupabaseClient, isAuthRequiredError } from '@/lib/supabaseServer';
import { requireRequesterProfile, isAdminRole } from '@/lib/requesterProfile';
import { calculateTreeProjectProgress, type RawProgressNode } from '@/lib/project-progress/treeCalculator';
import type { SubprojectSummary } from '@repo/shared';

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
    let requestedSubproject = (req.query.subproject as string) || 'General';

    if (!projectId || !isUuid(projectId)) {
      return res.status(400).json({
        ok: false,
        error: { code: 'BAD_REQUEST', message: 'Valid projectId is required' },
      });
    }

    // 1. Verify project access
    const serviceClient = createServiceSupabaseClient();
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

    // Check project access: Admins have global access; other users must belong to same company or project_members
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

    // --- GET /api/projects/:id/progress ---
    if (req.method === 'GET') {
      const { data: allProjectNodes, error: nError } = await serviceClient
        .from('project_progress_nodes')
        .select('*')
        .eq('project_id', projectId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (nError) {
        return res.status(400).json({
          ok: false,
          error: { code: 'SUPABASE_ERROR', message: nError.message },
        });
      }

      const allNodes = allProjectNodes || [];

      // Fetch permanently saved subprojects from project_subprojects table
      // Fetch permanently saved subprojects from project_subprojects table
      const { data: dbSubprojects } = await serviceClient
        .from('project_subprojects')
        .select('id, name, parent_group, parent_id')
        .eq('project_id', projectId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      const groupMap = new Map<string, string>();
      const distinctGroups = new Set<string>();

      (dbSubprojects || []).forEach((s: any) => {
        if (s.name && typeof s.name === 'string' && s.name.trim()) {
          const cleanName = s.name.trim();
          if (s.parent_group && typeof s.parent_group === 'string' && s.parent_group.trim()) {
            let cleanGroup = s.parent_group.trim();
            if (cleanGroup.toLowerCase() === 'saporro' || cleanGroup.toLowerCase() === 'sapporo') {
              cleanGroup = 'Sapporo';
            }
            groupMap.set(cleanName.toLowerCase(), cleanGroup);
            distinctGroups.add(cleanGroup);
          }
        }
      });

      // Extract unique subprojects from db and nodes (excluding any deprecated (Główny) entries)
      const subprojectsSet = new Set<string>();

      (dbSubprojects || []).forEach((s: any) => {
        if (s.name && typeof s.name === 'string' && s.name.trim()) {
          const clean = s.name.trim();
          if (!clean.includes('(Główny)') && !clean.includes('Gesamt')) {
            if (clean.toLowerCase() !== 'general') {
              subprojectsSet.add(clean);
            }
          }
        }
      });

      let hasExplicitGeneralNodes = false;
      allNodes.forEach((n: any) => {
        if (n.subproject && typeof n.subproject === 'string' && n.subproject.trim()) {
          const subTrim = n.subproject.trim();
          if (subTrim.toLowerCase() === 'general') {
            hasExplicitGeneralNodes = true;
          } else if (!subTrim.includes('(Główny)') && !subTrim.includes('Gesamt')) {
            subprojectsSet.add(subTrim);
          }

          // Infer parent group if not explicitly in groupMap
          if (!groupMap.has(subTrim.toLowerCase())) {
            distinctGroups.forEach((grp) => {
              if (subTrim.toLowerCase().includes(grp.toLowerCase())) {
                groupMap.set(subTrim.toLowerCase(), grp);
              }
            });
          }
        }
      });

      // If no other subprojects exist, or if explicit General nodes exist, include General
      if (subprojectsSet.size === 0 || hasExplicitGeneralNodes) {
        subprojectsSet.add('General');
      }

      const availableSubprojects = Array.from(subprojectsSet);

      if (requestedSubproject === 'ALL' || (requestedSubproject === 'General' && !hasExplicitGeneralNodes && availableSubprojects.length > 0 && availableSubprojects[0] !== 'General')) {
        requestedSubproject = availableSubprojects[0] || 'General';
      }

      // Fetch completed_by profiles if any exist
      const completedByUserIds = Array.from(
        new Set(allNodes.map((n: any) => n.completed_by).filter(Boolean))
      );
      const profileMap = new Map<string, string>();
      if (completedByUserIds.length > 0) {
        const { data: profiles } = await serviceClient
          .from('profiles')
          .select('id, full_name')
          .in('id', completedByUserIds);
        (profiles || []).forEach((p: any) => profileMap.set(p.id, p.full_name));
      }

      const rawNodesMapped: RawProgressNode[] = allNodes.map((n: any) => ({
        id: n.id,
        parentId: n.parent_id || null,
        subproject: n.subproject || 'General',
        nodeType: n.node_type || (n.parent_id ? 'WORK_ITEM' : 'CATEGORY'),
        name: n.name,
        description: n.description,
        weight: Number(n.weight),
        progress: Number(n.progress),
        sortOrder: n.sort_order,
        completedAt: n.completed_at,
        completedBy: n.completed_by,
        completedByName: n.completed_by ? profileMap.get(n.completed_by) ?? null : null,
      }));

      // Find if requested subproject is a Group Gesamt scope (e.g. "Grundfos (Główny)" or "Grundfos Gesamt")
      const isGesamtScope =
        requestedSubproject.toLowerCase().includes('(główny)') ||
        requestedSubproject.toLowerCase().includes('(gesamt)') ||
        requestedSubproject.toLowerCase().includes('gesamt');

      let activeNodesForCalculation = rawNodesMapped;
      if (isGesamtScope) {
        // Extract base group name e.g. "Grundfos" from "Grundfos (Główny)"
        const baseGroupName = requestedSubproject
          .replace(/\(główny\)/i, '')
          .replace(/\(gesamt\)/i, '')
          .replace(/gesamt/i, '')
          .trim()
          .toLowerCase();

        if (baseGroupName) {
          // Collect nodes belonging to any subproject matching this group either by parent_group or name
          const groupChildNodes = rawNodesMapped.filter((n) => {
            const nodeSub = (n.subproject || '').toLowerCase().trim();
            const nodeGroup = (groupMap.get(nodeSub) || '').toLowerCase();
            return (
              nodeGroup === baseGroupName ||
              nodeSub.startsWith(baseGroupName) ||
              nodeSub.includes(baseGroupName)
            );
          });

          if (groupChildNodes.length > 0) {
            // Remap subproject to requestedSubproject so tree calculator aggregates them
            activeNodesForCalculation = groupChildNodes.map((n) => ({
              ...n,
              subproject: requestedSubproject,
            }));
          }
        }
      }

      // Compute Subproject Summaries across the whole project
      const subprojectSummaries: SubprojectSummary[] = availableSubprojects.map((subName) => {
        const isSubGesamt =
          subName.toLowerCase().includes('(główny)') ||
          subName.toLowerCase().includes('(gesamt)') ||
          subName.toLowerCase().includes('gesamt');

        let nodesForSub = rawNodesMapped;
        if (isSubGesamt) {
          const baseName = subName
            .replace(/\(główny\)/i, '')
            .replace(/\(gesamt\)/i, '')
            .replace(/gesamt/i, '')
            .trim()
            .toLowerCase();

          if (baseName) {
            const matchingNodes = rawNodesMapped.filter((n) => {
              const nodeSub = (n.subproject || '').toLowerCase().trim();
              const nodeGroup = (groupMap.get(nodeSub) || '').toLowerCase();
              return (
                nodeGroup === baseName ||
                nodeSub.startsWith(baseName) ||
                nodeSub.includes(baseName)
              );
            });
            if (matchingNodes.length > 0) {
              nodesForSub = matchingNodes.map((n) => ({ ...n, subproject: subName }));
            }
          }
        }

        const subOverview = calculateTreeProjectProgress({
          projectId,
          projectName: project.name,
          currentSubproject: subName,
          availableSubprojects,
          rawNodes: nodesForSub,
        });

        // Determine parent group for this subproject
        let pGrp = groupMap.get(subName.toLowerCase()) || null;
        if (!pGrp) {
          distinctGroups.forEach((grp) => {
            if (subName.toLowerCase().includes(grp.toLowerCase())) {
              pGrp = grp;
            }
          });
        }

        return {
          name: subName,
          progress: subOverview.projectProgress,
          allocation: subOverview.projectAllocation,
          categoryCount: subOverview.treeNodes.length,
          parentGroup: pGrp,
        };
      });

      const overview = calculateTreeProjectProgress({
        projectId,
        projectName: project.name,
        currentSubproject: requestedSubproject,
        availableSubprojects,
        subprojectSummaries,
        rawNodes: activeNodesForCalculation,
      });

      let activeParentGroup = groupMap.get(requestedSubproject.toLowerCase()) || null;
      if (!activeParentGroup) {
        distinctGroups.forEach((grp) => {
          if (requestedSubproject.toLowerCase().includes(grp.toLowerCase())) {
            activeParentGroup = grp;
          }
        });
      }

      // If still not matched, check if requestedSubproject itself is a group
      if (!activeParentGroup && requestedSubproject !== 'General') {
        const words = requestedSubproject.split(' ');
        const candidate = words.find((w) => ['grundfos', 'sapporo', 'praxis', 'lidl'].includes(w.toLowerCase()));
        if (candidate) {
          activeParentGroup = candidate.charAt(0).toUpperCase() + candidate.slice(1);
        }
      }

      (overview as any).activeParentGroup = activeParentGroup;

      return res.status(200).json({ ok: true, data: overview });
    }

    // --- POST /api/projects/:id/progress ---
    if (req.method === 'POST') {
      const {
        name,
        weight,
        progress = 0,
        parentId = null,
        subproject = 'General',
        nodeType = 'WORK_ITEM',
        description = null,
        sortOrder = 0,
      } = req.body || {};

      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({
          ok: false,
          error: { code: 'INVALID_INPUT', message: 'Name is required' },
        });
      }

      const numWeight = Number(weight);
      if (Number.isNaN(numWeight) || numWeight < 0 || numWeight > 100) {
        return res.status(400).json({
          ok: false,
          error: { code: 'INVALID_WEIGHT', message: 'Weight must be a number between 0 and 100' },
        });
      }

      const numProgress = Number(progress);
      if (Number.isNaN(numProgress) || numProgress < 0 || numProgress > 100) {
        return res.status(400).json({
          ok: false,
          error: { code: 'INVALID_PROGRESS', message: 'Progress must be a number between 0 and 100' },
        });
      }

      const isCategory = !parentId;
      const actualNodeType = isCategory ? 'CATEGORY' : (nodeType || 'WORK_ITEM');

      const isCompleted = numProgress >= 100;
      const insertPayload: any = {
        project_id: projectId,
        company_id: project.company_id,
        parent_id: parentId || null,
        subproject: (subproject && typeof subproject === 'string' ? subproject.trim() : 'General') || 'General',
        node_type: actualNodeType,
        name: name.trim(),
        description: description ? String(description).trim() : null,
        weight: numWeight,
        progress: numProgress,
        sort_order: Number(sortOrder) || 0,
        created_by: userId,
        updated_by: userId,
        completed_at: isCompleted ? new Date().toISOString() : null,
        completed_by: isCompleted ? userId : null,
      };

      const { data: inserted, error: iError } = await serviceClient
        .from('project_progress_nodes')
        .insert(insertPayload)
        .select()
        .single();

      if (iError || !inserted) {
        return res.status(400).json({
          ok: false,
          error: { code: 'INSERT_FAILED', message: iError?.message || 'Failed to create progress node' },
        });
      }

      // Record audit history
      try {
        await serviceClient.from('project_progress_history').insert({
          node_id: inserted.id,
          project_id: projectId,
          company_id: project.company_id,
          user_id: userId,
          action: 'CREATE',
          new_weight: numWeight,
          new_progress: numProgress,
          details: { name: inserted.name, node_type: actualNodeType, parent_id: parentId, subproject: inserted.subproject },
        });
      } catch (hErr) {
        console.error('Failed to log project progress audit history:', hErr);
      }

      return res.status(201).json({ ok: true, data: inserted });
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
    console.error('Unhandled error in /api/projects/[id]/progress:', err);
    return res.status(500).json({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: err?.message || 'Internal server error' },
    });
  }
}
