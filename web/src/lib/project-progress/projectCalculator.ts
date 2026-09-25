import type { ProjectCalculationInput } from './types';
import type { ProjectProgressOverview, CalculatedCategory, AllocationStatus, SubprojectSummary } from '@repo/shared';
import { calculateCategory } from './categoryCalculator';

export function calculateProjectProgress(input: ProjectCalculationInput): ProjectProgressOverview {
  let totalProjectAllocation = 0;
  let totalProjectProgress = 0;

  const categories: CalculatedCategory[] = (input.categories || []).map((cat) => {
    const calculatedCat = calculateCategory(cat);
    totalProjectAllocation += calculatedCat.weight;
    totalProjectProgress += calculatedCat.contribution;
    return calculatedCat;
  });

  const roundedProjectProgress = Number(totalProjectProgress.toFixed(2));
  const roundedProjectAllocation = Number(totalProjectAllocation.toFixed(2));

  let projectAllocationStatus: AllocationStatus = 'BALANCED';
  if (roundedProjectAllocation < 100) {
    projectAllocationStatus = 'UNDER_ALLOCATED';
  } else if (roundedProjectAllocation > 100) {
    projectAllocationStatus = 'OVER_ALLOCATED';
  }

  const currentSubproject = input.currentSubproject || 'General';

  // Generate explainability string
  let explanation = '';
  if (categories.length === 0) {
    explanation = `Brak zdefiniowanych kategorii dla podprojektu "${currentSubproject}".`;
  } else {
    const parts = categories.map(
      (c) => `${c.name} (${c.contribution.toFixed(1)}% z ${c.weight.toFixed(1)}%)`
    );
    explanation = `Postęp dla podprojektu "${currentSubproject}" wynosi ${roundedProjectProgress.toFixed(1)}%, na co składa się: ${parts.join(', ')}.`;
  }

  return {
    projectId: input.projectId,
    projectName: input.projectName,
    currentSubproject,
    availableSubprojects: input.availableSubprojects || ['General', 'Mieter-Ausbau'],
    subprojectSummaries: input.subprojectSummaries || [],
    projectProgress: roundedProjectProgress,
    projectAllocation: roundedProjectAllocation,
    projectAllocationStatus,
    explanation,
    treeNodes: categories,
    categories,
  };
}
