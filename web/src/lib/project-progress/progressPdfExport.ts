import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type { ProjectProgressOverview, CalculatedCategory, ProgressTreeNode } from "@repo/shared";

export type PdfLanguage = "de" | "pl" | "en";

interface GeneratePdfOptions {
  overview: ProjectProgressOverview;
  projectName?: string;
  subproject?: string;
  tenantName?: string;
  language?: PdfLanguage | string;
}

const PDF_I18N = {
  de: {
    reportTitle: "PROJEKTFORTSCHRITTSBERICHT",
    stand: "Stand",
    projectLabel: "Projekt (Hauptprojekt):",
    tenantLabel: "Mieter / Ausbau:",
    scopeLabel: "Bereich / Geschoss:",
    allFloors: "Alle Geschosse (Gesamt)",
    categoriesLabel: "Kategorien",
    tradesLabel: "Gewerke gesamt",
    statusBadge: "GESAMTSTATUS",
    tableTitle: "UBERSICHT GEWERKE & KATEGORIEN",
    colTrade: "Gewerk / Kategorie",
    colWeight: "Gewichtung",
    colProgress: "Fortschritt",
    colContrib: "Beitrag",
    sig1: "Freigabe / Unterschrift Projektleiter:",
    sig2: "Unterschrift Nachunternehmer / Bauherr:",
    pageStr: "Seite",
    ofStr: "von",
  },
  pl: {
    reportTitle: "RAPORT POSTEPU PRAC PROJEKTU",
    stand: "Stan na",
    projectLabel: "Projekt (Glowny):",
    tenantLabel: "Nadrzedny Najemca:",
    scopeLabel: "Zakres / Pietro:",
    allFloors: "Wszystkie pietra (Calosc)",
    categoriesLabel: "Kategorie",
    tradesLabel: "Lacznie prac",
    statusBadge: "STATUS CALKOWITY",
    tableTitle: "ZESTAWIENIE BRANZY I KATEGORII",
    colTrade: "Branza / Kategoria",
    colWeight: "Waga",
    colProgress: "Postep",
    colContrib: "Udzial",
    sig1: "Zatwierdzenie / Podpis Kierownika Projektu:",
    sig2: "Podpis Podwykonawcy / Inwestora:",
    pageStr: "Strona",
    ofStr: "z",
  },
  en: {
    reportTitle: "PROJECT PROGRESS REPORT",
    stand: "As of",
    projectLabel: "Main Project:",
    tenantLabel: "Tenant / Fit-out:",
    scopeLabel: "Scope / Floor:",
    allFloors: "All Floors (Total)",
    categoriesLabel: "Categories",
    tradesLabel: "Total items",
    statusBadge: "OVERALL STATUS",
    tableTitle: "OVERVIEW TRADES & CATEGORIES",
    colTrade: "Trade / Category",
    colWeight: "Weight",
    colProgress: "Progress",
    colContrib: "Contribution",
    sig1: "Approved / Project Manager Signature:",
    sig2: "Contractor / Client Signature:",
    pageStr: "Page",
    ofStr: "of",
  },
};

/**
 * Robust sanitizer to ensure text is 100% WinAnsi / Latin-1 compatible for standard PDF fonts.
 * Maps Polish diacritics and replaces non-encodable Unicode symbols (bullets, em-dashes, emoji).
 */
export function sanitizePdfText(input: any): string {
  if (input === null || input === undefined) return "";
  let str = String(input);

  // Replace common unicode bullets and symbols
  str = str
    .replace(/[■◆●]/g, "")
    .replace(/[•]/g, "- ")
    .replace(/[–—]/g, "-")
    .replace(/[„“”«»]/g, '"')
    .replace(/[’‘`]/g, "'")
    .replace(/[✓✔☑]/g, "[OK]")
    .replace(/[⚠️⚡❄️💨🧯♨️🌳🔋]/g, "");

  // Map Polish / Slavic characters to clean Latin letters for WinAnsi safety
  const charMap: Record<string, string> = {
    ą: "a", Ą: "A",
    ć: "c", Ć: "C",
    ę: "e", Ę: "E",
    ł: "l", Ł: "L",
    ń: "n", Ń: "N",
    ó: "o", Ó: "O",
    ś: "s", Ś: "S",
    ź: "z", Ź: "Z",
    ż: "z", Ż: "Z",
  };

  str = str.replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, (m) => charMap[m] || m);

  // Fallback for any other diacritics (accents etc) while keeping German ä, ö, ü, ß if valid
  let safeStr = "";
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code >= 32 && code <= 126) {
      safeStr += str[i];
    } else if (code >= 160 && code <= 255) {
      safeStr += str[i];
    } else {
      safeStr += " ";
    }
  }

  return safeStr.trim();
}

export async function generateProjectProgressPdf({
  overview,
  projectName = "Projekt",
  subproject = "Hauptbau / General",
  tenantName,
  language = "de",
}: GeneratePdfOptions): Promise<Uint8Array> {
  const langKey = (language && language.toLowerCase().startsWith("pl")
    ? "pl"
    : language && language.toLowerCase().startsWith("en")
    ? "en"
    : "de") as "de" | "pl" | "en";

  const t = PDF_I18N[langKey] || PDF_I18N.de;

  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const PAGE_WIDTH = 595.28; // A4 portrait width
  const PAGE_HEIGHT = 841.89; // A4 portrait height
  const MARGIN = 36;
  const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;

  // Clean subproject name based on selected language
  let cleanSub = subproject || "General";
  const lowerClean = cleanSub.toLowerCase();
  if (lowerClean.includes("wszystkie") || lowerClean.includes("gesamt") || lowerClean.endsWith(" (all)") || lowerClean === "all" || lowerClean.endsWith(" (total)")) {
    const base = cleanSub.replace(/\(.*\)/g, "").replace(/wszystkie/gi, "").replace(/gesamt/gi, "").replace(/\ball\b/gi, "").trim();
    if (langKey === "de") {
      cleanSub = base ? `${base} (Alle Geschosse / Gesamt)` : "Alle Geschosse (Gesamt)";
    } else if (langKey === "en") {
      cleanSub = base ? `${base} (All Floors / Total)` : "All Floors (Total)";
    } else {
      cleanSub = base ? `${base} (Wszystkie pietra / Calosc)` : "Wszystkie pietra (Calosc)";
    }
  }

  const safeProjectName = sanitizePdfText(projectName);
  const safeSubproject = sanitizePdfText(cleanSub);

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const checkAddPage = (requiredSpace: number) => {
    if (y - requiredSpace < MARGIN + 25) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
      // Minimal header on subsequent pages
      page.drawText(`${safeProjectName} | ${safeSubproject} - ${t.reportTitle}`, {
        x: MARGIN,
        y: y - 5,
        size: 8,
        font: fontRegular,
        color: rgb(0.45, 0.5, 0.55),
      });
      page.drawLine({
        start: { x: MARGIN, y: y - 10 },
        end: { x: PAGE_WIDTH - MARGIN, y: y - 10 },
        thickness: 0.5,
        color: rgb(0.85, 0.88, 0.92),
      });
      y -= 25;
    }
  };

  // 1. EXECUTIVE DARK NAVY HEADER
  page.drawRectangle({
    x: MARGIN,
    y: y - 48,
    width: CONTENT_WIDTH,
    height: 48,
    color: rgb(0.06, 0.11, 0.18),
  });

  // Left accent line
  page.drawRectangle({
    x: MARGIN,
    y: y - 48,
    width: 4,
    height: 48,
    color: rgb(0.14, 0.55, 0.95), // Vibrant Blue Accent
  });

  page.drawText(t.reportTitle, {
    x: MARGIN + 16,
    y: y - 28,
    size: 13,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  const localeCode = langKey === "pl" ? "pl-PL" : langKey === "en" ? "en-US" : "de-DE";
  const dateStr = new Date().toLocaleDateString(localeCode, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  page.drawText(sanitizePdfText(`${t.stand}: ${dateStr}`), {
    x: PAGE_WIDTH - MARGIN - 135,
    y: y - 28,
    size: 8,
    font: fontRegular,
    color: rgb(0.72, 0.78, 0.85),
  });

  y -= 64;

  // 2. PROJECT & KPI SUMMARY CARD
  const floorBreakdown: { name: string; progress: number; itemsCount: number }[] =
    (overview as any).floorBreakdown || [];
  const hasFloorBreakdown = floorBreakdown.length > 0;
  const kpiBoxHeight = hasFloorBreakdown ? 78 : 66;

  page.drawRectangle({
    x: MARGIN,
    y: y - kpiBoxHeight,
    width: CONTENT_WIDTH,
    height: kpiBoxHeight,
    color: rgb(0.97, 0.98, 0.99),
    borderColor: rgb(0.85, 0.88, 0.92),
    borderWidth: 1,
  });

  // Left: Metadata details
  const activeTenant =
    tenantName ||
    (overview as any).activeParentGroup ||
    (safeSubproject.toLowerCase().includes("grundfos")
      ? "Grundfos"
      : safeSubproject.toLowerCase().includes("sapporo")
      ? "Sapporo"
      : "");

  page.drawText(t.projectLabel, { x: MARGIN + 14, y: y - 17, size: 8, font: fontBold, color: rgb(0.35, 0.4, 0.45) });
  page.drawText(safeProjectName, { x: MARGIN + 115, y: y - 17, size: 8.5, font: fontBold, color: rgb(0.08, 0.12, 0.18) });

  if (activeTenant) {
    page.drawText(t.tenantLabel, { x: MARGIN + 14, y: y - 31, size: 8, font: fontBold, color: rgb(0.35, 0.4, 0.45) });
    page.drawText(sanitizePdfText(activeTenant), { x: MARGIN + 115, y: y - 31, size: 8.5, font: fontBold, color: rgb(0.1, 0.45, 0.85) });
  }

  page.drawText(t.scopeLabel, { x: MARGIN + 14, y: y - (activeTenant ? 45 : 31), size: 8, font: fontBold, color: rgb(0.35, 0.4, 0.45) });
  page.drawText(safeSubproject, { x: MARGIN + 115, y: y - (activeTenant ? 45 : 31), size: 8, font: fontRegular, color: rgb(0.1, 0.15, 0.2) });

  const catCount = overview.categories?.length || 0;
  const itemCount = (overview as any).totalItemsCount || (overview as any).itemCount || 0;
  page.drawText(`${t.categoriesLabel}: ${catCount}   |   ${t.tradesLabel}: ${itemCount}`, {
    x: MARGIN + 14,
    y: y - (hasFloorBreakdown ? 58 : (activeTenant ? 57 : 46)),
    size: 7.5,
    font: fontRegular,
    color: rgb(0.45, 0.5, 0.55),
  });

  // Floor breakdown mini pills if present
  if (hasFloorBreakdown) {
    let pillX = MARGIN + 14;
    const pillY = y - 72;
    floorBreakdown.forEach((fb) => {
      const fbClean = sanitizePdfText(`${fb.name}: ${Math.round(fb.progress)}%`);
      page.drawRectangle({
        x: pillX,
        y: pillY - 2,
        width: 145,
        height: 12,
        color: rgb(0.9, 0.94, 0.98),
        borderColor: rgb(0.75, 0.84, 0.94),
        borderWidth: 0.5,
      });
      page.drawText(fbClean, {
        x: pillX + 6,
        y: pillY + 1.5,
        size: 7,
        font: fontBold,
        color: rgb(0.1, 0.35, 0.7),
      });
      pillX += 152;
    });
  }

  // Right: Overall Progress Badge
  const overallProg = Math.round(overview.projectProgress ?? (overview as any).totalProgress ?? 0);
  const badgeWidth = 96;
  const badgeHeight = 52;
  const badgeX = PAGE_WIDTH - MARGIN - badgeWidth - 10;
  const badgeY = y - (kpiBoxHeight / 2) - (badgeHeight / 2);

  page.drawRectangle({
    x: badgeX,
    y: badgeY,
    width: badgeWidth,
    height: badgeHeight,
    color: rgb(0.06, 0.11, 0.18),
  });

  page.drawText(t.statusBadge, {
    x: badgeX + 12,
    y: badgeY + 36,
    size: 7,
    font: fontBold,
    color: rgb(0.65, 0.72, 0.8),
  });

  page.drawText(`${overallProg}%`, {
    x: badgeX + (overallProg === 100 ? 14 : 22),
    y: badgeY + 12,
    size: 20,
    font: fontBold,
    color: overallProg === 100 ? rgb(0.2, 0.85, 0.45) : rgb(0.2, 0.8, 0.65),
  });

  y -= (kpiBoxHeight + 18);

  // 3. TABLE TITLE & HEADER
  page.drawText(t.tableTitle, {
    x: MARGIN,
    y: y,
    size: 9.5,
    font: fontBold,
    color: rgb(0.08, 0.12, 0.18),
  });

  y -= 14;

  const drawTableHeader = () => {
    page.drawRectangle({
      x: MARGIN,
      y: y - 18,
      width: CONTENT_WIDTH,
      height: 18,
      color: rgb(0.12, 0.17, 0.24),
    });

    page.drawText(t.colTrade, { x: MARGIN + 10, y: y - 12.5, size: 7.5, font: fontBold, color: rgb(1, 1, 1) });
    page.drawText(t.colWeight, { x: MARGIN + 315, y: y - 12.5, size: 7.5, font: fontBold, color: rgb(1, 1, 1) });
    page.drawText(t.colProgress, { x: MARGIN + 385, y: y - 12.5, size: 7.5, font: fontBold, color: rgb(1, 1, 1) });
    page.drawText(t.colContrib, { x: MARGIN + 455, y: y - 12.5, size: 7.5, font: fontBold, color: rgb(1, 1, 1) });
    y -= 19;
  };

  drawTableHeader();

  // 4. PRINT BALANCED CATEGORIES & WORK ITEMS
  const printNode = (node: ProgressTreeNode | CalculatedCategory, depth: number) => {
    checkAddPage(20);

    const isCategory = depth === 0;
    const isParent = Boolean(node.children && node.children.length > 0);
    const rowHeight = isCategory ? 19 : 16;

    // Category background
    if (isCategory) {
      page.drawRectangle({
        x: MARGIN,
        y: y - rowHeight + 3,
        width: CONTENT_WIDTH,
        height: rowHeight,
        color: rgb(0.93, 0.95, 0.97),
      });
    }

    const indent = MARGIN + 10 + depth * 12;
    const prefix = depth === 0 ? "" : depth === 1 ? "- " : "  * ";
    const cleanName = sanitizePdfText(node.name || "");
    const rawName = `${prefix}${cleanName}`;
    const truncatedName = rawName.length > 50 ? rawName.slice(0, 47) + "..." : rawName;

    page.drawText(truncatedName, {
      x: indent,
      y: y - (isCategory ? 10 : 9),
      size: isCategory ? 8 : 7.5,
      font: isCategory || isParent ? fontBold : fontRegular,
      color: isCategory ? rgb(0.06, 0.1, 0.16) : rgb(0.2, 0.25, 0.3),
    });

    // Weight
    page.drawText(`${Number(node.weight || 0).toFixed(1)}%`, {
      x: MARGIN + 320,
      y: y - (isCategory ? 10 : 9),
      size: 7.5,
      font: fontRegular,
      color: rgb(0.35, 0.4, 0.45),
    });

    // Progress
    const prog = Math.round(Number(node.progress || 0));
    page.drawText(`${prog}%`, {
      x: MARGIN + 390,
      y: y - (isCategory ? 10 : 9),
      size: 7.5,
      font: prog === 100 ? fontBold : fontRegular,
      color: prog === 100 ? rgb(0.08, 0.55, 0.28) : rgb(0.15, 0.2, 0.25),
    });

    // Contribution
    const contrib = Number((node as any).contributionToProject || (node as any).contribution || 0).toFixed(1);
    page.drawText(`${contrib}%`, {
      x: MARGIN + 460,
      y: y - (isCategory ? 10 : 9),
      size: 7.5,
      font: fontRegular,
      color: rgb(0.4, 0.45, 0.5),
    });

    // Subtle line divider
    page.drawLine({
      start: { x: MARGIN, y: y - rowHeight + 3 },
      end: { x: PAGE_WIDTH - MARGIN, y: y - rowHeight + 3 },
      thickness: 0.5,
      color: rgb(0.88, 0.9, 0.93),
    });

    y -= rowHeight;

    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        printNode(child, depth + 1);
      }
    } else if ((node as any).items && (node as any).items.length > 0) {
      for (const item of (node as any).items) {
        printNode(item, depth + 1);
      }
    }
  };

  const categories = overview.categories || [];
  for (const cat of categories) {
    printNode(cat, 0);
  }

  // 5. FOOTER (NO SIGNATURES - CLEAN PAGE NUMBER ONLY)
  const totalPages = pdfDoc.getPageCount();
  const pages = pdfDoc.getPages();
  for (let i = 0; i < totalPages; i++) {
    const p = pages[i];
    p.drawLine({
      start: { x: MARGIN, y: MARGIN + 12 },
      end: { x: PAGE_WIDTH - MARGIN, y: MARGIN + 12 },
      thickness: 0.5,
      color: rgb(0.85, 0.88, 0.92),
    });
    p.drawText(`${t.pageStr} ${i + 1} ${t.ofStr} ${totalPages}`, {
      x: MARGIN,
      y: MARGIN,
      size: 7.5,
      font: fontRegular,
      color: rgb(0.5, 0.55, 0.6),
    });
    p.drawText(`${safeProjectName} | ${safeSubproject}`, {
      x: PAGE_WIDTH - MARGIN - 180,
      y: MARGIN,
      size: 7.5,
      font: fontRegular,
      color: rgb(0.5, 0.55, 0.6),
    });
  }

  return await pdfDoc.save();
}

/**
 * Trigger direct in-browser download of the PDF report.
 */
export async function downloadProjectProgressPdf(options: GeneratePdfOptions): Promise<void> {
  const pdfBytes = await generateProjectProgressPdf(options);
  const blob = new Blob([pdfBytes as unknown as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);

  const lang = (options.language || "de").toLowerCase();
  const prefix = lang.startsWith("pl")
    ? "Raport_Postepu_Prac"
    : lang.startsWith("en")
    ? "Project_Progress_Report"
    : "Projektfortschrittsbericht";

  const safeName = sanitizePdfText(options.subproject || options.projectName || "Projekt")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_");

  const fileName = `${prefix}_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`;

  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
