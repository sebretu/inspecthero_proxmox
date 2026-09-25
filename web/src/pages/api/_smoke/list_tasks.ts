import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { rpcListTasks, mapSupabaseError, AppError } from '@/lib/supabaseRpc';

const PROJECT_ID = '55555555-5555-5555-5555-555555555555';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let supabase;
  try {
    ({ client: supabase } = createServerSupabaseClient(req));
  } catch (e: any) {
    return res.status(401).json({ ok: false, error: { code: 'AUTH_INVALID', message: 'Missing Bearer token' } });
  }

  try {
    const data = await rpcListTasks(supabase as any, {
      p_project_id: PROJECT_ID,
      p_limit: 10,
      p_offset: 0
    });
    return res.status(200).json({ ok: true, data });
  } catch (e: any) {
    const err = e instanceof AppError ? e : mapSupabaseError(e);
    const status =
      err.code === 'RLS_FORBIDDEN' ? 403 :
      err.code === 'AUTH_EXPIRED' ? 401 :
      400;
    return res.status(status).json({ ok: false, error: { code: err.code, message: err.message, meta: err.meta } });
  }
}
