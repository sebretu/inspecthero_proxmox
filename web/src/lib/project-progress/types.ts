import type { SubprojectSummary } from '@repo/shared';

export type AllocationStatus = 'BALANCED' | 'UNDER_ALLOCATED' | 'OVER_ALLOCATED';

export interface RawWorkItemInput {
  id: string;
  parentId?: string | null;
  subproject?: string;
  name: string;
  description?: string | null;
  weight: number;    // 0 - 100 within category
  progress: number;  // 0 - 100
  sortOrder?: number;
  completedAt?: string | null;
  completedBy?: string | null;
  completedByName?: string | null;
}

export interface RawCategoryInput {
  id: string;
  subproject?: string;
  name: string;
  description?: string | null;
  weight: number;    // 0 - 100 within project/subproject
  sortOrder?: number;
  items: RawWorkItemInput[];
}

export interface ProjectCalculationInput {
  projectId: string;
  projectName?: string;
  currentSubproject?: string;
  availableSubprojects?: string[];
  subprojectSummaries?: SubprojectSummary[];
  categories: RawCategoryInput[];
}
