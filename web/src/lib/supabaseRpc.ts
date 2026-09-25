import type { SupabaseClient } from '@supabase/supabase-js';

export type AppErrorCode =
  | 'AUTH_INVALID'
  | 'AUTH_EXPIRED'
  | 'RLS_FORBIDDEN'
  | 'NOT_FOUND'
  | 'SUPABASE';

export class AppError extends Error {
  constructor(public code: AppErrorCode, message: string, public meta?: any) {
    super(message);
  }
}

export function mapSupabaseError(err: any): AppError {
  const status = err?.status ?? err?.code;
  if (status === 401) return new AppError('AUTH_EXPIRED', 'Session expired', { status });
  if (status === 403) return new AppError('RLS_FORBIDDEN', 'Forbidden by RLS', { status });
  if (status === 404) return new AppError('NOT_FOUND', 'Not found', { status });
  return new AppError('SUPABASE', err?.message ?? 'Supabase error', { status });
}

export async function rpcListTasks(client: SupabaseClient<any>, args: {
  p_project_id: string;
  p_limit?: number;
  p_offset?: number;
  p_plan_id?: string;
  p_status?: string;
  p_q?: string;
  p_assigned_user_id?: string;
  p_due_from?: string;
  p_due_to?: string;
}) {
  const res = await Promise.resolve(client.rpc('list_tasks', args));
  if (res?.error) throw mapSupabaseError(res.error);
  return res?.data;
}

export async function rpcGetTask(client: SupabaseClient<any>, args: {
  p_task_id: string;
}) {
  const res = await Promise.resolve(client.rpc('get_task', args));
  if (res?.error) throw mapSupabaseError(res.error);
  return res?.data;
}
