import type {
  ProgressTreeNode,
  CalculatedCategory,
  CalculatedWorkItem,
  AllocationStatus,
  ProjectProgressOverview,
  SubprojectSummary,
} from '@repo/shared';

export interface RawProgressNode {
  id: string;
  parentId?: string | null;
  subproject?: string;
  nodeType?: 'CATEGORY' | 'WORK_ITEM';
  name: string;
  description?: string | null;
  weight: number;
  progress?: number;
  sortOrder?: number;
  completedAt?: string | null;
  completedBy?: string | null;
  completedByName?: string | null;
}

/**
 * Calculates allocation status for a given sum of child weights.
 */
export function getAllocationStatus(totalAllocation: number): AllocationStatus {
  const rounded = Number(totalAllocation.toFixed(2));
  if (rounded === 100) return 'BALANCED';
  if (rounded < 100) return 'UNDER_ALLOCATED';
  return 'OVER_ALLOCATED';
}

/**
 * Recursively builds and calculates the N-level progress tree from flat nodes.
 */
export function buildAndCalculateProgressTree(
  rawNodes: RawProgressNode[],
  parentEffectiveFraction = 1.0,
  parentId: string | null = null
): ProgressTreeNode[] {
  const directChildren = rawNodes.filter((n) => {
    const p = n.parentId || null;
    return p === parentId;
  });

  // Sort by sortOrder then name
  directChildren.sort((a, b) => {
    const sA = a.sortOrder ?? 0;
    const sB = b.sortOrder ?? 0;
    if (sA !== sB) return sA - sB;
    return a.name.localeCompare(b.name);
  });

  return directChildren.map((childRaw) => {
    const weight = Number(Number(childRaw.weight || 0).toFixed(2));
    const effectiveWeightFraction = parentEffectiveFraction * (weight / 100);

    // Recursively calculate children
    const childTreeNodes = buildAndCalculateProgressTree(
      rawNodes,
      effectiveWeightFraction,
      childRaw.id
    );

    const isLeaf = childTreeNodes.length === 0;

    let computedProgress = 0;
    let totalAllocation = 0;

    if (isLeaf) {
      computedProgress = Number(Number(childRaw.progress || 0).toFixed(2));
      totalAllocation = 100;
    } else {
      let weightedSum = 0;
      childTreeNodes.forEach((c) => {
        totalAllocation += c.weight;
        weightedSum += (c.weight / 100) * c.progress;
      });
      computedProgress = Number(weightedSum.toFixed(2));
    }

    const allocationStatus = isLeaf ? 'BALANCED' : getAllocationStatus(totalAllocation);
    const contributionToProject = Number((effectiveWeightFraction * computedProgress).toFixed(2));

    const treeNode: ProgressTreeNode = {
      id: childRaw.id,
      parentId: childRaw.parentId || null,
      subproject: childRaw.subproject || 'General',
      nodeType: childRaw.nodeType || (parentId === null ? 'CATEGORY' : 'WORK_ITEM'),
      name: childRaw.name,
      description: childRaw.description || null,
      weight,
      progress: computedProgress,
      isLeaf,
      sortOrder: childRaw.sortOrder ?? 0,
      children: childTreeNodes,
      allocation: Number(totalAllocation.toFixed(2)),
      allocationStatus,
      effectiveWeightFraction,
      contributionToProject,
      completedAt: childRaw.completedAt || null,
      completedBy: childRaw.completedBy || null,
      completedByName: childRaw.completedByName || null,
    };

    return treeNode;
  });
}

/**
 * Converts ProgressTreeNode back to legacy CalculatedCategory format for backward compatibility.
 */
export function convertTreeToCalculatedCategories(roots: ProgressTreeNode[]): CalculatedCategory[] {
  return roots.map((root) => {
    const flatItems: CalculatedWorkItem[] = [];

    function collectItems(node: ProgressTreeNode) {
      node.children.forEach((ch) => {
        flatItems.push(ch);
        collectItems(ch);
      });
    }
    collectItems(root);

    const cat: CalculatedCategory = {
      ...root,
      contribution: root.contributionToProject,
      items: root.children, // direct children
    };

    return cat;
  });
}

/**
 * Calculates complete project overview for a given subproject.
 */
/**
 * Calculates complete project overview for a given subproject or combined tenant.
 */
export function calculateTreeProjectProgress(params: {
  projectId: string;
  projectName?: string;
  currentSubproject?: string;
  availableSubprojects?: string[];
  subprojectSummaries?: SubprojectSummary[];
  rawNodes: RawProgressNode[];
}): ProjectProgressOverview {
  const {
    projectId,
    projectName = 'Projekt',
    currentSubproject = 'General',
    availableSubprojects = ['General'],
    subprojectSummaries = [],
    rawNodes,
  } = params;

  const cleanCurrentSub = (currentSubproject || 'General').toLowerCase().trim();
  const baseGroupName = cleanCurrentSub
    .replace(/\(.*\)/g, '')
    .replace(/gesamt/g, '')
    .replace(/wszystkie/g, '')
    .replace(/\ball\b/g, '')
    .trim();

  // Find all distinct subprojects present in the raw nodes
  const allSubNames = Array.from(new Set(rawNodes.map((n) => n.subproject || 'General')));

  // Check if currentSubproject represents a combined tenant group with multiple floors
  const matchingSubprojects = allSubNames.filter((subName) => {
    const s = subName.toLowerCase().trim();
    if (s === cleanCurrentSub) return true;
    if (baseGroupName && baseGroupName !== 'general' && (s.includes(baseGroupName) || s.startsWith(baseGroupName))) {
      return true;
    }
    return false;
  });

  const isMultiFloorTenant = matchingSubprojects.length > 1 && (
    cleanCurrentSub.includes('gesamt') ||
    cleanCurrentSub.includes('wszystkie') ||
    cleanCurrentSub.endsWith(' (all)') ||
    cleanCurrentSub === 'all' ||
    cleanCurrentSub === baseGroupName ||
    !allSubNames.includes(currentSubproject)
  );

  if (isMultiFloorTenant) {
    // 1. Calculate each subproject tree independently
    const floorTrees: { subName: string; roots: ProgressTreeNode[]; progress: number; itemsCount: number }[] = [];
    const numFloors = matchingSubprojects.length;

    matchingSubprojects.forEach((subName) => {
      const nodesForSub = rawNodes.filter((n) => (n.subproject || 'General') === subName);
      const roots = buildAndCalculateProgressTree(nodesForSub, 1.0, null);
      let floorProg = 0;
      roots.forEach((r) => {
        floorProg += r.contributionToProject;
      });
      floorProg = Number(floorProg.toFixed(2));

      let itemsCount = 0;
      function count(list: ProgressTreeNode[]) {
        list.forEach((node) => {
          if (node.nodeType === 'WORK_ITEM' || !node.children || node.children.length === 0) {
            itemsCount++;
          }
          if (node.children && node.children.length > 0) count(node.children);
        });
      }
      count(roots);

      floorTrees.push({ subName, roots, progress: floorProg, itemsCount });
    });

    // 2. Average tenant progress
    const combinedAvgProgress = Number(
      (floorTrees.reduce((acc, f) => acc + f.progress, 0) / numFloors).toFixed(2)
    );

    // 3. Merge categories across all floors to maintain exact 100% allocation
    const categoryMap = new Map<
      string,
      {
        name: string;
        description?: string | null;
        weights: number[];
        progresses: number[];
        allChildren: ProgressTreeNode[];
        sortOrder: number;
        id: string;
      }
    >();

    floorTrees.forEach(({ roots }) => {
      roots.forEach((cat) => {
        const key = cat.name.trim().toLowerCase();
        if (!categoryMap.has(key)) {
          categoryMap.set(key, {
            name: cat.name,
            description: cat.description,
            weights: [cat.weight],
            progresses: [cat.progress],
            allChildren: [...cat.children],
            sortOrder: cat.sortOrder,
            id: cat.id,
          });
        } else {
          const entry = categoryMap.get(key)!;
          entry.weights.push(cat.weight);
          entry.progresses.push(cat.progress);
          entry.allChildren.push(...cat.children);
        }
      });
    });

    // 4. Build balanced merged root tree nodes
    const mergedTreeNodes: ProgressTreeNode[] = [];
    let mergedTotalAllocation = 0;
    let mergedTotalProgress = 0;

    Array.from(categoryMap.values())
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .forEach((entry) => {
        // Average weight across floors
        const avgWeight = Number(
          (entry.weights.reduce((a, b) => a + b, 0) / numFloors).toFixed(2)
        );
        // Weighted progress
        const totalWeightInCat = entry.weights.reduce((a, b) => a + b, 0);
        let weightedCatProgress = 0;
        if (totalWeightInCat > 0) {
          weightedCatProgress = entry.weights.reduce(
            (acc, w, idx) => acc + (w / totalWeightInCat) * entry.progresses[idx],
            0
          );
        }
        weightedCatProgress = Number(weightedCatProgress.toFixed(2));

        const effectiveWeightFraction = avgWeight / 100;
        const contributionToProject = Number(
          (effectiveWeightFraction * weightedCatProgress).toFixed(2)
        );

        mergedTotalAllocation += avgWeight;
        mergedTotalProgress += contributionToProject;

        // Group child items by name to avoid duplicate flat lists
        const childItemMap = new Map<string, { node: ProgressTreeNode; weights: number[]; progresses: number[] }>();
        entry.allChildren.forEach((child) => {
          const cKey = child.name.trim().toLowerCase();
          if (!childItemMap.has(cKey)) {
            childItemMap.set(cKey, { node: child, weights: [child.weight], progresses: [child.progress] });
          } else {
            const cEntry = childItemMap.get(cKey)!;
            cEntry.weights.push(child.weight);
            cEntry.progresses.push(child.progress);
          }
        });

        const mergedChildren: ProgressTreeNode[] = Array.from(childItemMap.values()).map(({ node, weights, progresses }) => {
          const avgChildWeight = Number((weights.reduce((a, b) => a + b, 0) / weights.length).toFixed(2));
          const avgChildProg = Number((progresses.reduce((a, b) => a + b, 0) / progresses.length).toFixed(2));
          return {
            ...node,
            weight: avgChildWeight,
            progress: avgChildProg,
            contributionToProject: Number(((avgChildWeight / 100) * avgChildProg).toFixed(2)),
          };
        });

        const mergedCatNode: ProgressTreeNode = {
          id: entry.id,
          parentId: null,
          subproject: currentSubproject,
          nodeType: 'CATEGORY',
          name: entry.name,
          description: entry.description || null,
          weight: avgWeight,
          progress: weightedCatProgress,
          isLeaf: mergedChildren.length === 0,
          sortOrder: entry.sortOrder,
          children: mergedChildren,
          allocation: 100,
          allocationStatus: 'BALANCED',
          effectiveWeightFraction,
          contributionToProject,
          completedAt: null,
          completedBy: null,
          completedByName: null,
        };

        mergedTreeNodes.push(mergedCatNode);
      });

    mergedTotalAllocation = Number(mergedTotalAllocation.toFixed(2));
    mergedTotalProgress = Number(combinedAvgProgress.toFixed(2));

    const categories = convertTreeToCalculatedCategories(mergedTreeNodes);
    let totalItemsCount = 0;
    floorTrees.forEach((f) => {
      totalItemsCount += f.itemsCount;
    });

    const overviewResult: ProjectProgressOverview = {
      projectId,
      projectName,
      currentSubproject,
      availableSubprojects,
      subprojectSummaries,
      projectProgress: mergedTotalProgress,
      projectAllocation: 100.0,
      projectAllocationStatus: 'BALANCED',
      explanation: `Zbilansowany stan najemcy (${matchingSubprojects.join(', ')}). Średni postęp: ${mergedTotalProgress.toFixed(1)}%.`,
      categories,
      treeNodes: mergedTreeNodes,
    };

    (overviewResult as any).totalItemsCount = totalItemsCount;
    (overviewResult as any).floorBreakdown = floorTrees.map((f) => ({
      name: f.subName,
      progress: f.progress,
      itemsCount: f.itemsCount,
    }));

    return overviewResult;
  }

  // Standard single subproject calculation
  const subprojectNodes = rawNodes.filter((n) => {
    const nodeSub = (n.subproject || 'General').toLowerCase().trim();
    return nodeSub === cleanCurrentSub;
  });

  // Build N-level tree
  const treeNodes = buildAndCalculateProgressTree(subprojectNodes, 1.0, null);

  let projectTotalAllocation = 0;
  let projectTotalProgress = 0;

  treeNodes.forEach((rootCat) => {
    projectTotalAllocation += rootCat.weight;
    projectTotalProgress += rootCat.contributionToProject;
  });

  projectTotalAllocation = Number(projectTotalAllocation.toFixed(2));
  projectTotalProgress = Number(projectTotalProgress.toFixed(2));

  const projectAllocationStatus = getAllocationStatus(projectTotalAllocation);

  let explanation = '';
  if (projectAllocationStatus === 'UNDER_ALLOCATED') {
    const diff = (100 - projectTotalAllocation).toFixed(1);
    explanation = `Gewichtung nicht vollständig verteilt – ${diff}% nicht zugeordnet (Summe = ${projectTotalAllocation}%).`;
  } else if (projectAllocationStatus === 'OVER_ALLOCATED') {
    const diff = (projectTotalAllocation - 100).toFixed(1);
    explanation = `Gewichtung überschreitet 100% (Summe = ${projectTotalAllocation}% – Überschuss von ${diff}%).`;
  } else {
    explanation = `Wagi kategorii są idealnie zbilansowane (100.0%). Postęp podprojektu ${currentSubproject} wynosi ${projectTotalProgress.toFixed(1)}%.`;
  }

  const categories = convertTreeToCalculatedCategories(treeNodes);

  // Count total work items across all categories
  let totalItemsCount = 0;
  function countItems(nodes: ProgressTreeNode[]) {
    nodes.forEach((n) => {
      if (n.nodeType === 'WORK_ITEM' || (!n.children || n.children.length === 0)) {
        totalItemsCount++;
      }
      if (n.children && n.children.length > 0) {
        countItems(n.children);
      }
    });
  }
  countItems(treeNodes);

  const overviewResult: ProjectProgressOverview = {
    projectId,
    projectName,
    currentSubproject,
    availableSubprojects,
    subprojectSummaries,
    projectProgress: projectTotalProgress,
    projectAllocation: projectTotalAllocation,
    projectAllocationStatus,
    explanation,
    categories,
    treeNodes,
  };

  (overviewResult as any).totalItemsCount = totalItemsCount;

  return overviewResult;
}
