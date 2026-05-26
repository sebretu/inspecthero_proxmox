import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");
    const photoId = searchParams.get("photoId");
    
    if (!sessionId) return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });

    let query = supabase
        .from('aufmass_versions')
        .select('*')
        .eq('session_id', sessionId);

    if (photoId) {
        query = query.eq('photo_id', photoId);
    } else {
        query = query.is('photo_id', null);
    }

    const { data, error } = await query.order('version_number', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ ok: true, data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { session_id, photo_id, data, created_by } = body;

    if (!session_id || !data) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get highest version number
    let versionQuery = supabase
        .from('aufmass_versions')
        .select('version_number')
        .eq('session_id', session_id);

    if (photo_id) {
        versionQuery = versionQuery.eq('photo_id', photo_id);
    } else {
        versionQuery = versionQuery.is('photo_id', null);
    }

    const { data: latestVersionData } = await versionQuery
        .order('version_number', { ascending: false })
        .limit(1);

    const nextVersionNumber = (latestVersionData && latestVersionData.length > 0) ? latestVersionData[0].version_number + 1 : 1;

    const { data: newVersion, error } = await supabase.from('aufmass_versions').insert([{
      session_id,
      photo_id: photo_id || null,
      version_number: nextVersionNumber,
      data,
      created_by
    }]).select().single();

    if (error) throw error;

    return NextResponse.json({ ok: true, data: newVersion });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
