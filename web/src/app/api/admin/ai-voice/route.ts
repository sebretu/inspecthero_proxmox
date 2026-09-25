import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // 1. Auth check
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : null;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized: Missing token" }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized: Invalid token" }, { status: 401 });
    }

    // 2. Check admin or worker role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "Forbidden: User profile not found" }, { status: 403 });
    }

    // 3. Parse multipart form data
    const formData = await req.formData();
    const file = formData.get("file") as Blob | null;
    const language = (formData.get("language") as string) || "pl";

    if (!file) {
      return NextResponse.json({ error: "Bad Request: Missing audio file" }, { status: 400 });
    }

    // 4. Forward to Local AI /speech/transcribe
    const localAiUrl = process.env.LOCAL_AI_URL || "http://192.168.178.4:8000";
    const localAiKey = process.env.LOCAL_AI_KEY || "";

    const outgoingFormData = new FormData();
    outgoingFormData.append("file", file, "audio.webm");

    const queryParams = language ? `?language=${encodeURIComponent(language)}` : "";
    const targetUrl = `${localAiUrl}/speech/transcribe${queryParams}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout

    const headers: Record<string, string> = {};
    if (localAiKey) {
      headers["X-API-Key"] = localAiKey;
    }

    const localRes = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: outgoingFormData,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!localRes.ok) {
      const errText = await localRes.text();
      console.error("[ai-voice] Local AI speech transcribe error:", localRes.status, errText);
      return NextResponse.json(
        { error: `Błąd transkrypcji mowy (Status ${localRes.status})` },
        { status: 502 }
      );
    }

    const data = await localRes.json();
    return NextResponse.json({
      ok: true,
      text: data.text || "",
      language: data.language || language,
      duration_s: data.duration_s || 0,
      inference_time_ms: data.inference_time_ms || 0,
    });
  } catch (err: any) {
    console.error("[ai-voice] Exception:", err);
    return NextResponse.json(
      { error: err.name === "AbortError" ? "Przekroczono czas oczekiwania na transkrypcję (Timeout)" : (err.message || "Błąd serwera STT") },
      { status: 500 }
    );
  }
}
