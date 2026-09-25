import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

interface InputMessage {
  role?: string;
  content?: string;
  image?: string;
}

export async function POST(req: Request) {
  try {
    // 1. Auth check
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : null;

    if (!token) {
      return new Response("Unauthorized: Missing token", { status: 401 });
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
      return new Response("Unauthorized: Invalid token", { status: 401 });
    }

    // 2. Check profile role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile) {
      return new Response("Forbidden: User profile not found", { status: 403 });
    }

    // 3. Process & Validate messages / history
    const body = await req.json();
    let rawMessages: InputMessage[] = [];

    if (Array.isArray(body.messages)) {
      rawMessages = body.messages;
    } else if (typeof body.message === "string" && body.message.trim()) {
      rawMessages = [{ role: "user", content: body.message.trim(), image: body.image }];
    }

    if (rawMessages.length === 0) {
      return new Response("Bad Request: Missing message or messages array", { status: 400 });
    }

    // Sanitize & validate message list
    const MAX_HISTORY = 15;
    const MAX_CONTENT_LENGTH = 4000;

    const validatedMessages: { role: "user" | "assistant"; content: string; image?: string }[] = [];

    for (const msg of rawMessages.slice(-MAX_HISTORY)) {
      const role = msg.role?.toLowerCase() === "assistant" ? "assistant" : "user";
      let content = typeof msg.content === "string" ? msg.content.trim() : "";
      if (content.length > MAX_CONTENT_LENGTH) {
        content = content.slice(0, MAX_CONTENT_LENGTH) + "... [obcięto]";
      }
      const image = typeof msg.image === "string" && msg.image.length > 20 ? msg.image : undefined;

      if (content || image) {
        validatedMessages.push({ role, content: content || "Przeanalizuj to zdjęcie.", image });
      }
    }

    if (validatedMessages.length === 0 || validatedMessages[validatedMessages.length - 1].role !== "user") {
      return new Response("Bad Request: At least one user message is required", { status: 400 });
    }

    const latestUserMessage = validatedMessages[validatedMessages.length - 1];
    const priorTurns = validatedMessages.slice(0, -1);

    let systemPrompt =
      "Jesteś profesjonalnym Asystentem AI dla inżynierów i administratorów platformy InspectHero. Odpowiadaj rzeczowo, zwięźle i zgodnie z wiedzą techniczną. Formatuj odpowiedzi czytelnym Markdownem.";

    const localAiUrl = process.env.LOCAL_AI_URL || "http://192.168.178.4:8000";
    const localAiKey = process.env.LOCAL_AI_KEY || "";

    // 4. If image is attached, try Local AI /vision/scan-serial (via multipart FormData)
    let localSerialFound: string | null = null;
    if (latestUserMessage.image && localAiUrl) {
      try {
        const base64Data = latestUserMessage.image.replace(/^data:image\/[a-z]+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");
        const blob = new Blob([buffer], { type: "image/jpeg" });

        const formData = new FormData();
        formData.append("file", blob, "image.jpg");

        const serialController = new AbortController();
        const sTimeout = setTimeout(() => serialController.abort(), 6000);

        const serialRes = await fetch(`${localAiUrl}/vision/scan-serial`, {
          method: "POST",
          headers: {
            ...(localAiKey ? { "X-API-Key": localAiKey } : {}),
          },
          body: formData,
          signal: serialController.signal,
        });
        clearTimeout(sTimeout);

        if (serialRes.ok) {
          const sData = await serialRes.json();
          if (sData?.serialNumber) {
            localSerialFound = sData.serialNumber;
            systemPrompt += `\n[Informacja z lokalnego modułu OCR/Vision: Na załączonym zdjęciu rozpoznano numer seryjny: "${localSerialFound}"]`;
          }
        }
      } catch (e: any) {
        console.warn("[ai-stream] Local scan-serial check skipped:", e.message);
      }
    }

    // 5. If NO image is attached, try Local AI text /chat first
    if (!latestUserMessage.image && localAiUrl) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const contextParts: string[] = [];
        if (priorTurns.length > 0) {
          contextParts.push("Historia wcześniejszej rozmowy w tej sesji:");
          for (const turn of priorTurns) {
            contextParts.push(`${turn.role === "user" ? "Użytkownik" : "Asystent"}: ${turn.content}`);
          }
        }

        const localRequestBody: Record<string, any> = {
          message: latestUserMessage.content,
          system_prompt: systemPrompt,
          temperature: 0.7,
          max_tokens: 1500,
        };

        if (contextParts.length > 0) {
          localRequestBody.context = contextParts.join("\n");
        }

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (localAiKey) {
          headers["X-API-Key"] = localAiKey;
        }

        const localRes = await fetch(`${localAiUrl}/chat`, {
          method: "POST",
          headers,
          body: JSON.stringify(localRequestBody),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (localRes.ok) {
          const localData = await localRes.json();
          if (localData?.response) {
            const encoder = new TextEncoder();
            const customReadable = new ReadableStream({
              start(streamController) {
                streamController.enqueue(encoder.encode(localData.response));
                streamController.close();
              },
            });
            return new Response(customReadable, {
              headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "X-AI-Source": "local_ai",
              },
            });
          }
        }
      } catch (localErr: any) {
        console.warn("[ai-stream] Local AI text chat unreachable or failed, falling back to OpenAI:", localErr.message);
      }
    }

    // 6. Multimodal / Fallback with OpenAI streamText
    const openAiMessages: any[] = [
      { role: "system", content: systemPrompt },
    ];

    for (const m of validatedMessages) {
      if (m.image) {
        openAiMessages.push({
          role: m.role,
          content: [
            { type: "text", text: m.content || "Opisz lub przeanalizuj to zdjęcie." },
            { type: "image", image: m.image },
          ],
        });
      } else {
        openAiMessages.push({
          role: m.role,
          content: m.content,
        });
      }
    }

    const result = await streamText({
      model: openai("gpt-4o-mini"),
      messages: openAiMessages,
    });

    return result.toTextStreamResponse({
      headers: {
        "X-AI-Source": latestUserMessage.image ? "openai_vision" : "openai_fallback",
        ...(localSerialFound ? { "X-Local-Serial": localSerialFound } : {}),
      },
    });
  } catch (error: any) {
    console.error("AI Stream Error:", error);
    return new Response(error.message || "Internal Server Error", { status: 500 });
  }
}
