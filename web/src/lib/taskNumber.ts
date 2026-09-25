export function getTaskNumericLabel(taskId?: string | null): string {
  if (!taskId) return "";
  const hex = taskId.replace(/[^0-9a-f]/gi, "");
  if (!hex) return "";
  const chunk = hex.slice(-5);
  const decimal = parseInt(chunk, 16);
  if (!Number.isFinite(decimal)) return "";
  const normalized = (decimal % 9000) + 1000;
  return String(normalized);
}
