export type ProgressNodeType = 'CATEGORY' | 'WORK_ITEM';

export type AllocationStatus = 'BALANCED' | 'UNDER_ALLOCATED' | 'OVER_ALLOCATED';

export interface ProgressNodeDb {
  id: string;
  company_id: string;
  project_id: string;
  parent_id: string | null;
  subproject: string;
  node_type: ProgressNodeType;
  name: string;
  description: string | null;
  weight: number;
  progress: number;
  sort_order: number;
  completed_at: string | null;
  completed_by: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProgressHistoryDb {
  id: string;
  node_id: string;
  project_id: string;
  company_id: string;
  user_id: string | null;
  action: 'CREATE' | 'UPDATE_WEIGHT' | 'UPDATE_PROGRESS' | 'TOGGLE_COMPLETE' | 'UPDATE_INFO' | 'DELETE' | 'APPLY_TEMPLATE';
  old_weight: number | null;
  new_weight: number | null;
  old_progress: number | null;
  new_progress: number | null;
  details: Record<string, any> | null;
  created_at: string;
  profiles?: {
    full_name: string;
    email: string;
  } | null;
}

export interface ProgressTreeNode {
  id: string;
  parentId: string | null;
  subproject: string;
  nodeType: ProgressNodeType;
  name: string;
  description: string | null;
  weight: number; // 0 - 100 relative to parent (or subproject if root)
  progress: number; // 0 - 100 (manual for leaf, calculated for parent)
  isLeaf: boolean;
  sortOrder: number;
  children: ProgressTreeNode[];
  allocation: number; // sum of children weights
  allocationStatus: AllocationStatus;
  effectiveWeightFraction: number; // e.g. 0.20 * 0.30 = 0.06 (6% of subproject)
  contributionToProject: number; // in percent of current subproject (e.g. 3.0%)
  completedAt: string | null;
  completedBy: string | null;
  completedByName?: string | null;
}

export interface CalculatedWorkItem extends ProgressTreeNode {}

export interface CalculatedCategory extends ProgressTreeNode {
  contribution: number; // alias for contributionToProject
  items: CalculatedWorkItem[]; // direct children alias
}

export interface SubprojectSummary {
  name: string;
  progress: number;
  allocation: number;
  categoryCount: number;
}

export interface ProjectProgressOverview {
  projectId: string;
  projectName?: string;
  currentSubproject: string;
  availableSubprojects: string[];
  subprojectSummaries: SubprojectSummary[];
  projectProgress: number; // 0 - 100 (Progress of the selected subproject)
  projectAllocation: number; // sum of category weights in current subproject
  projectAllocationStatus: AllocationStatus;
  explanation: string;
  treeNodes: ProgressTreeNode[];
  categories: CalculatedCategory[]; // backwards-compatible alias
}

export interface ProgressTemplateNode {
  id: string;
  templateId: string;
  parentId: string | null;
  nodeType: ProgressNodeType;
  name: string;
  description: string | null;
  weight: number;
  sortOrder: number;
  children?: ProgressTemplateNode[];
}

export interface ProgressTemplate {
  id: string;
  companyId: string | null;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
  nodes?: ProgressTemplateNode[];
  categoryCount?: number;
  nodeCount?: number;
  totalWeight?: number;
}

export interface CreateProgressNodeDto {
  projectId: string;
  parentId?: string | null;
  subproject?: string;
  nodeType?: ProgressNodeType;
  name: string;
  description?: string | null;
  weight: number;
  progress?: number;
  sortOrder?: number;
}

export interface UpdateProgressNodeDto {
  name?: string;
  description?: string | null;
  weight?: number;
  progress?: number;
  sortOrder?: number;
  subproject?: string;
}
