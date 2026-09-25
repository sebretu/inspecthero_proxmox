import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

interface MatchResult {
  id: string;
  symbol_type: string;
  clip_prompt: any;
  similarity: number;
}

export interface SymbolMatchOutput {
  best: {
    id: string;
    symbol_type: string;
    similarity: number;
    second_similarity: number;
    gap: number;
    confidenceScore: number;
  } | null;
  matches: Array<{
    id: string;
    symbol_type: string;
    similarity: number;
  }>;
}

/**
 * Two-stage Vector Matching:
 * Stage A: Candidate retrieval (match_limit: 10)
 * Stage B: Weighted confidence scoring + similarity gap computation
 */
export async function matchSymbol(
  vector: number[],
  allowedSymbolTypes?: string[]
): Promise<SymbolMatchOutput> {
  const supabase = getSupabaseAdminClient();

  try {
    const { data, error } = await supabase.rpc("get_similar_symbols", {
      query_embedding: vector,
      match_limit: 10
    });

    if (error) {
      throw error;
    }

    let matches = (data || []) as MatchResult[];

    if (allowedSymbolTypes && allowedSymbolTypes.length > 0) {
      const filtered = matches.filter(m => allowedSymbolTypes.includes(m.symbol_type));
      if (filtered.length > 0) {
        matches = filtered;
      }
    }

    if (matches.length === 0) {
      return { best: null, matches: [] };
    }

    const topMatch = matches[0];
    const secondMatch = matches.find(m => m.symbol_type !== topMatch.symbol_type);

    const bestSim = Number(Number(topMatch.similarity).toFixed(4));
    const secondSim = secondMatch ? Number(Number(secondMatch.similarity).toFixed(4)) : 0;
    const gap = Number((bestSim - secondSim).toFixed(4));
    const confidenceScore = Number((bestSim * 0.70 + gap * 0.30).toFixed(4));

    const best = {
      id: topMatch.id,
      symbol_type: topMatch.symbol_type,
      similarity: bestSim,
      second_similarity: secondSim,
      gap,
      confidenceScore
    };

    const formattedMatches = matches.map(m => ({
      id: m.id,
      symbol_type: m.symbol_type,
      similarity: Number(Number(m.similarity).toFixed(4))
    }));

    return {
      best,
      matches: formattedMatches
    };
  } catch (err: any) {
    console.error("[symbolMatcher] Error querying database:", err.message);
    throw err;
  }
}
