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
        .from('aufmass_materials')
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
    const { session_id, photo_id, article_number, item_name, quantity, unit, price, notes } = body;

    if (!session_id || !item_name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { data, error } = await supabase.from('aufmass_materials').insert([{
      session_id,
      photo_id: photo_id || null,
      article_number,
      item_name,
      quantity: quantity || 1,
      unit: unit || 'st.',
      price,
      notes
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
        const { id, article_number, item_name, quantity, unit, price, notes } = body;

        if (!id) return NextResponse.json({ error: 'Missing material ID' }, { status: 400 });

        const updates: any = {};
        if (article_number !== undefined) updates.article_number = article_number;
        if (item_name !== undefined) updates.item_name = item_name;
        if (quantity !== undefined) updates.quantity = quantity;
        if (unit !== undefined) updates.unit = unit;
        if (price !== undefined) updates.price = price;
        if (notes !== undefined) updates.notes = notes;

        const { data, error } = await supabase.from('aufmass_materials').update(updates).eq('id', id).select().single();

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

        if (!id) return NextResponse.json({ error: 'Missing material ID' }, { status: 400 });

        const { error } = await supabase.from('aufmass_materials').delete().eq('id', id);

        if (error) throw error;

        return NextResponse.json({ ok: true, data: { success: true } });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
