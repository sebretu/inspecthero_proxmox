/**
 * Toggle item progress between 0% and 100%.
 * If progress is already 100%, toggling sets it to 0%.
 * If progress is < 100% (e.g. 0%, 50%, 65%), toggling marks it 100%.
 */
export function toggleItemCompletion(currentProgress: number): number {
  return currentProgress >= 100 ? 0 : 100;
}

/**
 * Compute the project contribution of a single work item in percent.
 * Formula: (category_weight / 100) * (work_weight / 100) * (completion / 100) * 100
 *        = (category_weight * work_weight * completion) / 10000
 */
export function computeItemProjectContribution(
  categoryWeight: number,
  workWeight: number,
  completion: number
): number {
  const catW = Math.max(0, categoryWeight);
  const workW = Math.max(0, workWeight);
  const comp = Math.min(100, Math.max(0, completion));

  const contribution = (catW * workW * comp) / 10000;
  return Number(contribution.toFixed(2));
}

/**
 * Compute the category contribution of a single work item in percent.
 * Formula: (work_weight / 100) * completion
 */
export function computeItemCategoryContribution(
  workWeight: number,
  completion: number
): number {
  const workW = Math.max(0, workWeight);
  const comp = Math.min(100, Math.max(0, completion));

  const contribution = (workW / 100) * comp;
  return Number(contribution.toFixed(2));
}
