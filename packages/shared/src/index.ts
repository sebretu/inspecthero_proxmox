export type TaskStatus = 'OPEN' | 'IN_PROGRESS' | 'DONE_WAITING_APPROVAL' | 'APPROVED' | 'REJECTED';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type TaskMarker = {
  plan_id: string;
  x_norm: number; // 0..1
  y_norm: number; // 0..1
};

export function clamp01(v: number) {
  if (Number.isNaN(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
