import type { RawCategoryInput } from './types';
import type { CalculatedCategory, CalculatedWorkItem, AllocationStatus } from '@repo/shared';
import { computeItemCategoryContribution, computeItemProjectContribution } from './itemCalculator';

export function calculateCategory(category: RawCategoryInput): CalculatedCategory {
  const categoryWeight = Math.max(0, category.weight);
  const subproject = category.subproject || 'General';
  let totalAllocation = 0;
  let rawCategoryProgress = 0;

  const items: CalculatedWorkItem[] = (category.items || []).map((item, index) => {
    const itemWeight = Math.max(0, item.weight);
    const itemProgress = Math.min(100, Math.max(0, item.progress));
    
    totalAllocation += itemWeight;

    const contributionToProject = computeItemProjectContribution(categoryWeight, itemWeight, itemProgress);
    const effectiveWeightFraction = (categoryWeight / 100) * (itemWeight / 100);

    rawCategoryProgress += (itemWeight / 100) * itemProgress;

    return {
      id: item.id,
      parentId: category.id,
      subproject: item.subproject || subproject,
      nodeType: 'WORK_ITEM',
      name: item.name,
      description: item.description ?? null,
      weight: itemWeight,
      progress: itemProgress,
      isLeaf: true,
      sortOrder: item.sortOrder ?? index,
      children: [],
      allocation: 100,
      allocationStatus: 'BALANCED',
      effectiveWeightFraction,
      contributionToProject,
      completedAt: item.completedAt ?? null,
      completedBy: item.completedBy ?? null,
      completedByName: item.completedByName ?? null,
    };
  });

  const categoryProgress = Number(rawCategoryProgress.toFixed(2));
  const categoryContribution = Number(((categoryWeight / 100) * rawCategoryProgress).toFixed(2));
  const roundedAllocation = Number(totalAllocation.toFixed(2));

  let allocationStatus: AllocationStatus = 'BALANCED';
  if (roundedAllocation < 100) {
    allocationStatus = 'UNDER_ALLOCATED';
  } else if (roundedAllocation > 100) {
    allocationStatus = 'OVER_ALLOCATED';
  }

  return {
    id: category.id,
    parentId: null,
    subproject,
    nodeType: 'CATEGORY',
    name: category.name,
    description: category.description ?? null,
    weight: categoryWeight,
    progress: categoryProgress,
    isLeaf: false,
    contribution: categoryContribution,
    contributionToProject: categoryContribution,
    allocation: roundedAllocation,
    allocationStatus,
    effectiveWeightFraction: categoryWeight / 100,
    sortOrder: category.sortOrder ?? 0,
    children: items,
    items,
    completedAt: null,
    completedBy: null,
  };
}
