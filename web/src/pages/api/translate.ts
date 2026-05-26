import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { requireRequesterProfile } from "@/lib/requesterProfile";
import { translateTexts, fixUtf8Encoding } from "@/lib/translator";
import type { Language } from "@/lib/translations";

const SUPPORTED_LANGS: Language[] = ["en", "pl", "de", "sk"];

type ApiOk = { ok: true; data: { translations: string[] } };
type ApiErr = { ok: false; error: { code: string; message: string; meta?: any } };

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use POST" } });
  }

  let supabase: any;
  let userId: string | null = null;
  try {
    ({ client: supabase, userId } = createServerSupabaseClient(req));
  } catch (e: any) {
    return res.status(401).json({ ok: false, error: { code: "AUTH_INVALID", message: "Missing Bearer token" } });
  }

  try {
    await requireRequesterProfile(supabase, userId);
  } catch (err: any) {
    return res.status(err?.status || 403).json({
      ok: false,
      error: { code: err?.code || "PROFILE_ERROR", message: err?.message || "Unable to load profile" },
    });
  }

  const body = req.body || {};
  const targetLang = body?.targetLang as Language | undefined;
  const sourceLang = typeof body?.sourceLang === "string" ? body.sourceLang : undefined;
  const texts = Array.isArray(body?.texts) ? body.texts : null;

  if (!targetLang || !SUPPORTED_LANGS.includes(targetLang)) {
    return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Invalid targetLang" } });
  }

  if (!texts || texts.length === 0) {
    return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "texts array is required" } });
  }

  const normalized = texts.map((text: any) => {
    if (text === null || text === undefined) return "";
    if (typeof text === "string") return text;
    if (typeof text === "number" || typeof text === "boolean") return String(text);
    return JSON.stringify(text);
  });

  try {
    const fixedTexts = normalized.map((t: string) => fixUtf8Encoding(t));
    const translations = await translateTexts(fixedTexts, targetLang, { sourceLang });
    return res.status(200).json({ ok: true, data: { translations } });
  } catch (err: any) {
    return res.status(500).json({
      ok: false,
      error: { code: "TRANSLATE_ERROR", message: err?.message || "Unable to translate" },
    });
  }
}
