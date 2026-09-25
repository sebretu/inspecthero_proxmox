/**
 * Normalizes cable type strings by replacing commas with dots
 * to treat types like "3x2,5" and "3x2.5" as the same.
 */
export function normalizeCableType(type: string | null | undefined): string {
  if (!type) return "";
  return type.trim().replace(/,/g, ".");
}
