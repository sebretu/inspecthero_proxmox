import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { createClient } from "@supabase/supabase-js";

export const runtime = 'edge';

export async function POST(req: Request) {
  try {
    // 1. Auth check
    const authHeader = req.headers.get('authorization') || "";
    const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      return new Response('Unauthorized: Missing token', { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response('Unauthorized: Invalid token', { status: 401 });
    }

    // 2. Check admin role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role?.toUpperCase() !== "ADMIN") {
      return new Response('Forbidden: Admins only', { status: 403 });
    }

    // 3. Process message
    const { message } = await req.json();
    if (!message) {
      return new Response('Bad Request: Missing message', { status: 400 });
    }

    // 4. Stream AI response
    // We use toTextStreamResponse() to get pure text chunks as requested
    const result = await streamText({
      model: openai('gpt-4o-mini'),
      messages: [
        { role: 'system', content: 'You are a professional AI Assistant for the InspectHero platform administrator. Answer concisely and helpfuly.' },
        { role: 'user', content: message },
      ],
    });

    return result.toTextStreamResponse();
  } catch (error: any) {
    console.error('AI Stream Error:', error);
    return new Response(error.message || 'Internal Server Error', { status: 500 });
  }
}
