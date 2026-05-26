export type AppErrorCode =
  | 'AUTH_INVALID'
  | 'AUTH_EXPIRED'
  | 'RLS_FORBIDDEN'
  | 'NOT_FOUND'
  | 'OFFLINE'
  | 'SUPABASE'
  | 'UNKNOWN';

export class AppError extends Error {
  constructor(
    public code: AppErrorCode,
    message: string,
    public cause?: unknown,
    public meta?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function mapSupabaseError(err: any): AppError {
  const status = err?.status ?? err?.code;
  if (status === 401) return new AppError('AUTH_EXPIRED', 'Session expired', err);
  if (status === 403) return new AppError('RLS_FORBIDDEN', 'Forbidden by RLS', err);
  if (status === 404) return new AppError('NOT_FOUND', 'Not found', err);
  return new AppError('SUPABASE', err?.message ?? 'Supabase error', err, { status });
}
