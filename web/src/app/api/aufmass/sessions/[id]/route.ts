import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dummy.supabase.co";
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "dummy";
  return createClient(supabaseUrl, supabaseServiceKey);
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('aufmass_sessions')
      .select('*, profiles!aufmass_sessions_created_by_fkey(full_name)')
      .eq('id', id)
      .single();

    if (error) throw error;
    return NextResponse.json({ ok: true, data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
