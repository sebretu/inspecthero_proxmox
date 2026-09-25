import { franc } from "franc-min";
import type { Language } from "./translations";

const DEFAULT_LIBRETRANSLATE_URL = "https://libretranslate.com/translate";
const DEFAULT_MYMEMORY_URL = "https://api.mymemory.translated.net/get";
const CACHE_LIMIT = 400;

const translationCache = new Map<string, string>();

const ISO3_TO_ISO2: Record<string, string> = {
  eng: "en",
  pol: "pl",
  deu: "de",
  ger: "de",
  slk: "sk",
  slo: "sk",
};

type TranslationProvider = "libretranslate" | "mymemory";

const translationProvider: TranslationProvider = (() => {
  const explicit = (process.env.TRANSLATE_PROVIDER || "").toLowerCase();
  if (explicit === "libretranslate") return "libretranslate";
  if (explicit === "mymemory") return "mymemory";
  if (process.env.TRANSLATE_API_URL || process.env.TRANSLATE_API_KEY) {
    return "libretranslate";
  }
  return "mymemory";
})();

function cacheKey(text: string, target: Language, source?: string | null) {
  return `${translationProvider}::${target}::${source || "auto"}::${text}`;
}

function remember(key: string, value: string) {
  translationCache.set(key, value);
  if (translationCache.size > CACHE_LIMIT) {
    const firstKey = translationCache.keys().next().value;
    if (firstKey) {
      translationCache.delete(firstKey);
    }
  }
}

function detectLanguageCode(text: string): string | null {
  if (!text || text.trim().length < 4) return null;
  try {
    const code = franc(text, { minLength: 4, only: Object.keys(ISO3_TO_ISO2) });
    if (!code || code === "und") return null;
    return ISO3_TO_ISO2[code] || null;
  } catch {
    return null;
  }
}

async function translateWithLibreTranslate(text: string, target: Language, source?: string | null): Promise<string> {
  const apiUrl = process.env.TRANSLATE_API_URL || DEFAULT_LIBRETRANSLATE_URL;
  const body: Record<string, any> = {
    q: text,
    target,
    source: source || "auto",
    format: "text",
  };

  if (process.env.TRANSLATE_API_KEY) {
    body.api_key = process.env.TRANSLATE_API_KEY;
  }

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Translation request failed (${res.status}): ${detail || res.statusText}`);
  }

  const data = await res.json().catch(() => null);
  if (data && typeof data.translatedText === "string" && data.translatedText.length > 0) {
    return data.translatedText;
  }

  const maybeArray = Array.isArray(data) ? data : data?.data;
  if (Array.isArray(maybeArray) && maybeArray.length > 0 && typeof maybeArray[0]?.translatedText === "string") {
    return maybeArray[0].translatedText as string;
  }

  if (typeof data === "string" && data.trim().length > 0) {
    return data.trim();
  }

  return text;
}

function normalizeLangTag(value?: string | null) {
  if (!value) return "auto";
  return value.split("-")[0]?.toLowerCase() || value.toLowerCase();
}

/** Decode HTML entities returned by MyMemory (e.g. &uuml; → ü) */
function decodeHtmlEntities(text: string): string {
  if (!text) return "";
  return text
    .replace(/&auml;/gi, "ä").replace(/&Auml;/gi, "Ä")
    .replace(/&ouml;/gi, "ö").replace(/&Ouml;/gi, "Ö")
    .replace(/&uuml;/gi, "ü").replace(/&Uuml;/gi, "Ü")
    .replace(/&szlig;/gi, "ß")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&bull;/gi, "•")
    .replace(/&ndash;/gi, "–").replace(/&mdash;/gi, "—")
    .replace(/&hellip;/gi, "…")
    .replace(/&#(\d+);/g, (_: string, code: string) => {
      try {
        return String.fromCharCode(parseInt(code, 10));
      } catch { return _; }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_: string, hex: string) => {
      try {
        return String.fromCharCode(parseInt(hex, 16));
      } catch { return _; }
    });
}

/** 
 * Fixes common double-encoding issues (e.g. UTF-8 interpreted as Latin-1)
 * Ã¼ -> ü, Ã¤ -> ä, etc.
 */
export function fixUtf8Encoding(text: string): string {
  if (!text) return "";
  try {
    // Simple common replacements for German/Polish/Slovak
    return text
      .replace(/Ã¼/g, "ü").replace(/Ãœ/g, "Ü")
      .replace(/Ã¤/g, "ä").replace(/Ã„/g, "Ä")
      .replace(/Ã¶/g, "ö").replace(/Ã–/g, "Ö")
      .replace(/ÃŸ/g, "ß")
      .replace(/Ã³/g, "ó").replace(/Ã“/g, "Ó")
      .replace(/Ä…/g, "ą").replace(/Ä„/g, "Ą")
      .replace(/Ä‡/g, "ć").replace(/Ä†/g, "Ć")
      .replace(/Ä™/g, "ę").replace(/Ä˜/g, "Ę")
      .replace(/Å‚/g, "ł").replace(/Å/g, "Ł")
      .replace(/Å„/g, "ń").replace(/Åƒ/g, "Ń")
      .replace(/Å›/g, "ś").replace(/Åš/g, "Ś")
      .replace(/Å¼/g, "ż").replace(/Å»/g, "Ż")
      .replace(/Åº/g, "ź").replace(/Å¹/g, "Ź")
      // Handle CP437/850 mangling often found in older DB exports
      .replace(/„/g, "ä")
      .replace(/”/g, "ö")
      // Handle CP850 bytes mistakenly parsed as Latin-1 (control characters) from DATANORM import
      .replace(/\x84/g, "ä").replace(/\x8e/g, "Ä")
      .replace(/\x94/g, "ö").replace(/\x99/g, "Ö")
      .replace(/\x81/g, "ü").replace(/\x9a/g, "Ü")
      .replace(/\xe1/g, "ß")
      // Specific whitespace issues (sometimes parsing drops characters into spaces)
      .replace(/f\s*r\s+/gi, "für ")
      .replace(/hellgr\s*n/gi, "hellgrün")
      .replace(/Przisions/gi, "Präzisions")
      .replace(/f\.Leiterpl\./g, "für Leiterplatten")
      .replace(/Analogeing„nge/g, "Analogeingänge")
      .replace(/Befehlsger„te/g, "Befehlsgeräte")
      .replace(/gepr\s*ft/gi, "geprüft");
  } catch {
    return text;
  }
}

async function translateWithMyMemory(text: string, target: Language, source?: string | null): Promise<string> {
  const apiUrl = process.env.MYMEMORY_API_URL || DEFAULT_MYMEMORY_URL;
  const fallbackSource = normalizeLangTag(process.env.MYMEMORY_FALLBACK_SOURCE || "en");
  const fromRaw = normalizeLangTag(source);
  const detected = detectLanguageCode(text);
  const fromCandidate = fromRaw === "auto" ? null : fromRaw;
  const from = (fromCandidate || detected || fallbackSource).toLowerCase();
  const to = target.toLowerCase();

  if (from === to) {
    return text;
  }
  const params = new URLSearchParams({
    q: text,
    langpair: `${from}|${to}`,
  });

  if (process.env.MYMEMORY_EMAIL) {
    params.set("de", process.env.MYMEMORY_EMAIL);
  }

  try {
    const res = await fetch(`${apiUrl}?${params.toString()}`);
    if (!res.ok) {
      if (res.status === 429) {
        console.warn(`[translator] MyMemory quota exceeded (429), skipping translation for: "${text}"`);
        return text;
      }
      const detail = await res.text().catch(() => "");
      throw new Error(`MyMemory request failed (${res.status}): ${detail || res.statusText}`);
    }

    const data = await res.json().catch(() => null);

    // MyMemory returns 200 even for quotas, but usually sets a specific message in responseData
    if (data?.responseStatus === 429) {
      console.warn(`[translator] MyMemory quota exceeded (429 in body), skipping translation for: "${text}"`);
      return text;
    }

    const translated = data?.responseData?.translatedText;
    // Check if the translated text is literally the quota warning
    if (typeof translated === "string" && translated.includes("MYMEMORY WARNING")) {
      console.warn(`[translator] MyMemory quota warning detected in text, skipping translation for: "${text}"`);
      return text;
    }

    if (typeof translated === "string" && translated.trim()) {
      return fixUtf8Encoding(decodeHtmlEntities(translated));
    }

    const fallback = data?.matches?.find((match: any) => typeof match?.translation === "string" && match.match >= 0.75)?.translation;
    if (typeof fallback === "string" && fallback.trim()) {
      return fixUtf8Encoding(decodeHtmlEntities(fallback));
    }

    throw new Error("Empty translation result");
  } catch (error: any) {
    console.warn(`[translator] MyMemory fallback to original text due to error: ${error?.message || String(error)}`);
    return text;
  }
}

async function translateOne(text: string, target: Language, source?: string | null): Promise<string> {
  if (translationProvider === "libretranslate") {
    return translateWithLibreTranslate(text, target, source);
  }
  return translateWithMyMemory(text, target, source);
}

export async function translateTexts(
  texts: string[],
  target: Language,
  options?: { sourceLang?: string | null }
): Promise<string[]> {
  const results = new Array(texts.length).fill("");
  const pending: Array<{ idx: number; text: string; key: string }> = [];

  texts.forEach((raw, idx) => {
    const text = (raw ?? "").toString();
    if (!text.trim()) {
      results[idx] = text;
      return;
    }
    const key = cacheKey(text, target, options?.sourceLang);
    if (translationCache.has(key)) {
      results[idx] = translationCache.get(key) as string;
      return;
    }
    pending.push({ idx, text, key });
  });

  if (pending.length === 0) {
    return results;
  }

  await Promise.all(
    pending.map(async ({ idx, text, key }) => {
      const translatedText = await translateOne(text, target, options?.sourceLang);
      remember(key, translatedText);
      results[idx] = translatedText;
    })
  );

  return results;
}
