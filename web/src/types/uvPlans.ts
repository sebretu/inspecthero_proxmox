export interface UVPlanCircuit {
  id: string;
  circuit_code: string;
  description: string;
  breaker_current: number;
  breaker_curve: string;
  phases: number;
  has_rcd: boolean;
  rcd_group?: string;
  cable_type?: string;
  source?: "imported" | "manual";
  modified?: boolean;
  created_at?: string;
}

export interface UVPlanLocation {
  plan_id: string;
  x_norm: number;
  y_norm: number;
}

export interface UVPlan {
  id: string;
  project_id: string;
  name: string;
  pdf_filename?: string;
  circuits: UVPlanCircuit[];
  color?: string;
  location?: UVPlanLocation | null;
  created_at: string;
  updated_at: string;
  created_by?: string;
}
