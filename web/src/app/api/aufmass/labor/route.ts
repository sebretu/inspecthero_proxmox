import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dummy.supabase.co";
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "dummy";
  return createClient(supabaseUrl, supabaseServiceKey);
}

export async function GET(req: Request) {
  try {
    const supabase = getSupabase();
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");
    const photoId = searchParams.get("photoId");
    
    if (!sessionId) return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });

    let query = supabase
        .from('aufmass_labor')
        .select('*')
        .eq('session_id', sessionId);

    if (photoId) {
      if (photoId === "none") {
        query = query.is('photo_id', null);
      } else {
        query = query.eq('photo_id', photoId);
      }
    }

    const { data, error } = await query.order('created_at', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ ok: true, data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = getSupabase();
    const body = await req.json();
    const { session_id, photo_id, worker_count, estimated_hours, description } = body;

    if (!session_id || worker_count === undefined || estimated_hours === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const total_calculated_hours = worker_count * estimated_hours;

    const { data, error } = await supabase.from('aufmass_labor').insert([{
      session_id,
      photo_id: photo_id || null,
      worker_count,
      estimated_hours,
      total_calculated_hours,
      description
    }]).select().single();

    if (error) throw error;

    return NextResponse.json({ ok: true, data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
    try {
        const supabase = getSupabase();
        const body = await req.json();
        const { id, worker_count, estimated_hours, description } = body;

        if (!id) return NextResponse.json({ error: 'Missing labor ID' }, { status: 400 });

        const updates: any = {};
        if (worker_count !== undefined) updates.worker_count = worker_count;
        if (estimated_hours !== undefined) updates.estimated_hours = estimated_hours;
        if (description !== undefined) updates.description = description;

        // Fetch current values to calculate total if needed
        if (worker_count !== undefined || estimated_hours !== undefined) {
            const { data: current } = await supabase.from('aufmass_labor').select('worker_count, estimated_hours').eq('id', id).single();
            if (current) {
                const wc = worker_count !== undefined ? worker_count : current.worker_count;
                const eh = estimated_hours !== undefined ? estimated_hours : current.estimated_hours;
                updates.total_calculated_hours = wc * eh;
            }
        }

        const { data, error } = await supabase.from('aufmass_labor').update(updates).eq('id', id).select().single();

        if (error) throw error;

        return NextResponse.json({ ok: true, data });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const supabase = getSupabase();
        const { searchParams } = new URL(req.url);
        const id = searchParams.get("id");

        if (!id) return NextResponse.json({ error: 'Missing labor ID' }, { status: 400 });

        const { error } = await supabase.from('aufmass_labor').delete().eq('id', id);

        if (error) throw error;

        return NextResponse.json({ ok: true, data: { success: true } });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
