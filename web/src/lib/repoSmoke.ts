import { clamp01 } from '@repo/shared';

export function repoSmoke(x: number) {
  const v = clamp01(x);
  // AppError is not available in generated types here; return a simple meta-like object
  return { v } as any;
}
