import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");
    
    if (!sessionId) return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });

    const { data, error } = await supabase
        .from('aufmass_markers')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ ok: true, data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { session_id, x, y, category, color, status, priority, icon, internal_notes, customer_visible_notes, linked_task_id, linked_map_x, linked_map_y, created_by } = body;

    if (!session_id || x === undefined || y === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { data, error } = await supabase.from('aufmass_markers').insert([{
      session_id,
      x,
      y,
      category,
      color,
      status,
      priority,
      icon,
      internal_notes,
      customer_visible_notes,
      linked_task_id,
      linked_map_x,
      linked_map_y,
      created_by
    }]).select().single();

    if (error) throw error;

    return NextResponse.json({ ok: true, data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
    try {
        const body = await req.json();
        const { id, x, y, category, color, status, priority, icon, internal_notes, customer_visible_notes, linked_task_id, linked_map_x, linked_map_y } = body;

        if (!id) return NextResponse.json({ error: 'Missing marker ID' }, { status: 400 });

        const updates: any = {};
        if (x !== undefined) updates.x = x;
        if (y !== undefined) updates.y = y;
        if (category !== undefined) updates.category = category;
        if (color !== undefined) updates.color = color;
        if (status !== undefined) updates.status = status;
        if (priority !== undefined) updates.priority = priority;
        if (icon !== undefined) updates.icon = icon;
        if (internal_notes !== undefined) updates.internal_notes = internal_notes;
        if (customer_visible_notes !== undefined) updates.customer_visible_notes = customer_visible_notes;
        if (linked_task_id !== undefined) updates.linked_task_id = linked_task_id;
        if (linked_map_x !== undefined) updates.linked_map_x = linked_map_x;
        if (linked_map_y !== undefined) updates.linked_map_y = linked_map_y;

        const { data, error } = await supabase.from('aufmass_markers').update(updates).eq('id', id).select().single();

        if (error) throw error;

        return NextResponse.json({ ok: true, data });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get("id");

        if (!id) return NextResponse.json({ error: 'Missing marker ID' }, { status: 400 });

        const { error } = await supabase.from('aufmass_markers').delete().eq('id', id);

        if (error) throw error;

        return NextResponse.json({ ok: true, data: { success: true } });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
