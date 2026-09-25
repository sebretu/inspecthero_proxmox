import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const PROJECT_ID = '55555555-5555-5555-5555-555555555555';

export async function GET(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const auth = req.headers.get('authorization') || '';
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : null;

  if (!token) {
    return NextResponse.json(
      { ok: false, error: { code: 'AUTH_INVALID', message: 'Missing Bearer token' } },
      { status: 401 }
    );
  }

  const supabase = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });

  const { data, error } = await supabase
    .from('tasks')
    .select('id, x_norm, y_norm, title, status, assigned_user_id')
    .eq('project_id', PROJECT_ID)
    .limit(10);

  if (error) {
    return NextResponse.json({ ok: false, error: { code: 'DB_ERROR', message: error.message } }, { status: 400 });
  }

  return NextResponse.json({ ok: true, data: data || [] });
}
