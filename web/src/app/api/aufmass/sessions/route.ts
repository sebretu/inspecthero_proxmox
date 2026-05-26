import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");
    const taskId = searchParams.get("taskId");

    let query = supabase.from('aufmass_sessions').select('*, profiles!aufmass_sessions_created_by_fkey(full_name), task_photos(url), projects(name), plans(floors(name, buildings(name)))');

    if (projectId) query = query.eq('project_id', projectId);
    if (taskId) query = query.eq('task_id', taskId);

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ ok: true, data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { project_id, task_id, photo_id, plan_id, x_norm, y_norm, session_type, name, description, status, created_by, client_name, client_phone, client_email } = body;

    if (!project_id || !name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { data, error } = await supabase.from('aufmass_sessions').insert([{
      project_id,
      task_id,
      photo_id,
      plan_id,
      x_norm,
      y_norm,
      session_type: session_type || 'aufmass',
      name,
      description,
      client_name,
      client_phone,
      client_email,
      status: status || 'draft',
      created_by,
      updated_by: created_by
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
        const { id, name, description, status, plan_id, x_norm, y_norm, session_type, updated_by, is_active, client_name, client_phone, client_email } = body;

        if (!id) {
            return NextResponse.json({ error: 'Missing session ID' }, { status: 400 });
        }

        const updates: any = {};
        if (name !== undefined) updates.name = name;
        if (description !== undefined) updates.description = description;
        if (status !== undefined) updates.status = status;
        if (plan_id !== undefined) updates.plan_id = plan_id;
        if (x_norm !== undefined) updates.x_norm = x_norm;
        if (y_norm !== undefined) updates.y_norm = y_norm;
        if (session_type !== undefined) updates.session_type = session_type;
        if (client_name !== undefined) updates.client_name = client_name;
        if (client_phone !== undefined) updates.client_phone = client_phone;
        if (client_email !== undefined) updates.client_email = client_email;
        if (is_active !== undefined) updates.is_active = is_active;
        if (updated_by !== undefined) updates.updated_by = updated_by;

        const { data, error } = await supabase.from('aufmass_sessions').update(updates).eq('id', id).select().single();

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

        if (!id) return NextResponse.json({ error: 'Missing session ID' }, { status: 400 });

        const { error } = await supabase.from('aufmass_sessions').delete().eq('id', id);

        if (error) throw error;

        return NextResponse.json({ ok: true, data: { success: true } });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
