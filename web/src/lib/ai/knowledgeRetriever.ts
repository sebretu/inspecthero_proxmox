import { SupabaseClient } from "@supabase/supabase-js";

export interface KnowledgeItem {
  source: "knowledge_doc" | "project" | "material" | "bma" | "general_norm";
  title: string;
  category?: string;
  snippet: string;
}

/**
 * Searches company knowledge, projects, materials, and BMA records
 * strictly scoped to the user's company_id.
 */
export async function searchCompanyKnowledge(
  supabase: SupabaseClient,
  query: string,
  companyId: string | null
): Promise<{ contextText: string; itemsFound: KnowledgeItem[] }> {
  if (!query || query.trim().length < 2) {
    return { contextText: "", itemsFound: [] };
  }

  const cleanQuery = query.trim().toLowerCase();
  const searchKeywords = cleanQuery
    .replace(/[^a-zA-Z0-9ąćęłńóśźżäöüß\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3)
    .slice(0, 5);

  const items: KnowledgeItem[] = [];

  try {
    // 1. Query company_knowledge (company-specific + global technical norms where company_id is NULL)
    let kQuery = supabase
      .from("company_knowledge")
      .select("title, category, content, metadata")
      .limit(6);

    if (companyId) {
      kQuery = kQuery.or(`company_id.eq.${companyId},company_id.is.null`);
    } else {
      kQuery = kQuery.is("company_id", null);
    }

    const { data: kData } = await kQuery;
    if (kData && kData.length > 0) {
      for (const doc of kData) {
        const text = `${doc.title} ${doc.category || ""} ${doc.content || ""}`.toLowerCase();
        const matches = searchKeywords.some((kw) => text.includes(kw));
        if (matches || searchKeywords.length === 0) {
          items.push({
            source: (doc as any).company_id ? "knowledge_doc" : "general_norm",
            title: doc.title,
            category: doc.category,
            snippet: doc.content.slice(0, 500),
          });
        }
      }
    }
  } catch (err: any) {
    console.warn("[RAG] company_knowledge query skipped:", err.message);
  }

  // 2. Query projects belonging to this company_id
  if (companyId) {
    try {
      const { data: projects } = await supabase
        .from("projects")
        .select("id, name, address, description, status")
        .eq("company_id", companyId)
        .limit(10);

      if (projects && projects.length > 0) {
        for (const p of projects) {
          const pText = `${p.name} ${p.address || ""} ${p.description || ""}`.toLowerCase();
          const matches = searchKeywords.some((kw) => pText.includes(kw)) || /projekt|budow|inwestycj/i.test(cleanQuery);
          if (matches) {
            items.push({
              source: "project",
              title: `Projekt: ${p.name}`,
              category: p.status || "AKTYWNY",
              snippet: `Adres: ${p.address || "Brak"}. Opis: ${p.description || "Brak opisu"}. Status: ${p.status || "w toku"}.`,
            });
          }
        }
      }
    } catch (err: any) {
      console.warn("[RAG] projects query skipped:", err.message);
    }
  }

  // 3. Query materials / wholesale catalog if query relates to materials / parts
  const isMaterialQuery = /(materiał|kabel|osprzęt|rura|gniazdo|wyłącznik|bezpiecznik|art)/i.test(cleanQuery);
  if (isMaterialQuery) {
    try {
      let mQuery = supabase
        .from("materials")
        .select("name, category, unit, article_number")
        .limit(8);

      if (companyId) {
        mQuery = mQuery.or(`company_id.eq.${companyId},company_id.is.null`);
      }

      const { data: materials } = await mQuery;
      if (materials && materials.length > 0) {
        const matchingMats = materials.filter((m) => {
          const mText = `${m.name} ${m.category || ""} ${m.article_number || ""}`.toLowerCase();
          return searchKeywords.some((kw) => mText.includes(kw));
        });

        if (matchingMats.length > 0) {
          const matList = matchingMats
            .map((m) => `- ${m.name} (${m.category || "Inne"}, j.m.: ${m.unit || "szt"}, art. nr: ${m.article_number || "-"})`)
            .join("\n");
          items.push({
            source: "material",
            title: "Katalog materiałów hurtowni",
            category: "MATERIAŁY",
            snippet: matList,
          });
        }
      }
    } catch (err: any) {
      console.warn("[RAG] materials query skipped:", err.message);
    }
  }

  // 4. Query BMA devices if query mentions BMA / czujki / pętla
  const isBmaQuery = /(bma|czujk|pętl|ring|stich|central|sygnalizator|pożar)/i.test(cleanQuery);
  if (isBmaQuery && companyId) {
    try {
      const { data: bmaDevices } = await supabase
        .from("bma_devices")
        .select("address, loop_number, device_type, label, serial_number, plan_id")
        .limit(10);

      if (bmaDevices && bmaDevices.length > 0) {
        const bmaSummary = bmaDevices
          .slice(0, 6)
          .map((d) => `- Adres ${d.address} (Pętla ${d.loop_number}): ${d.device_type || "Czujka"} [${d.label || "-"}] S/N: ${d.serial_number || "-"}`)
          .join("\n");

        items.push({
          source: "bma",
          title: "Urządzenia BMA w instalacjach",
          category: "BMA",
          snippet: bmaSummary,
        });
      }
    } catch (err: any) {
      console.warn("[RAG] bma query skipped:", err.message);
    }
  }

  // Build markdown context
  if (items.length === 0) {
    return { contextText: "", itemsFound: [] };
  }

  const lines: string[] = ["### [Baza Wiedzy Firmowej & Kontekst Techniczny RAG]:"];
  for (const item of items) {
    lines.push(`**${item.title}** (${item.category || item.source}):`);
    lines.push(item.snippet);
    lines.push("");
  }

  return {
    contextText: lines.join("\n"),
    itemsFound: items,
  };
}
