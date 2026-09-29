export interface PlanCatalogItem {
  id: string;
  category: "sockets" | "switches" | "frames" | "lighting" | "cables" | "boxes" | "accessories" | "other" | string;
  name_pl: string;
  name_de: string;
  name_en: string;
  name_sk: string;
  unit: string;
  article_number?: string;
  notes?: string;
  is_favorite?: boolean;
  order_index?: number;
}

export const PLAN_MATERIAL_CATEGORIES = [
  { id: "sockets", name_pl: "Gniazda", name_de: "Steckdosen", name_en: "Sockets", name_sk: "Zásuvky", icon: "🔌" },
  { id: "switches", name_pl: "Wyłączniki", name_de: "Schalter", name_en: "Switches", name_sk: "Vypínače", icon: "💡" },
  { id: "frames", name_pl: "Ramki", name_de: "Abdeckrahmen", name_en: "Frames", name_sk: "Rámiky", icon: "🔲" },
  { id: "frames_bf", name_pl: "Ramki z polem opisowym (mit BF)", name_de: "Abdeckrahmen mit BF", name_en: "Frames with label field (mit BF)", name_sk: "Rámiky s popisom (mit BF)", icon: "🏷️" },
  { id: "lighting", name_pl: "Oświetlenie i Lampy", name_de: "Beleuchtung & Lampen", name_en: "Lighting & Lamps", name_sk: "Osvetlenie a lampy", icon: "🔦" },
  { id: "cables", name_pl: "Kable i Przewody", name_de: "Kabel & Leitungen", name_en: "Cables & Wires", name_sk: "Káble a vodiče", icon: "⚡" },
  { id: "boxes", name_pl: "Puszki instalacyjne", name_de: "Installationsdosen", name_en: "Installation Boxes", name_sk: "Inštalačné krabice", icon: "📦" },
  { id: "accessories", name_pl: "Złączki i Akcesoria", name_de: "Klemmen & Zubehör", name_en: "Connectors & Accessories", name_sk: "Svorky a príslušenstvo", icon: "🔧" },
  { id: "other", name_pl: "Inne materiały", name_de: "Sonstige Materialien", name_en: "Other Materials", name_sk: "Iné materiály", icon: "📋" },
];

export const DEFAULT_PLAN_MATERIALS_CATALOG: PlanCatalogItem[] = [
  // ── 1. GNIAZDA / STECKDOSEN / SOCKETS ──
  {
    id: "mat_socket_single",
    category: "sockets",
    name_pl: "Gniazdo pojedyncze 230V z uziemieniem",
    name_de: "Schukosteckdose 1-fach 230V mit Erdung",
    name_en: "Single 230V Socket with ground",
    name_sk: "Zásuvka 230V jednoduchá s uzemnením",
    unit: "szt",
    is_favorite: true,
    order_index: 1,
  },
  {
    id: "mat_socket_double",
    category: "sockets",
    name_pl: "Gniazdo podwójne 230V",
    name_de: "Schukosteckdose 2-fach 230V",
    name_en: "Double 230V Socket",
    name_sk: "Zásuvka 230V dvojitá",
    unit: "szt",
    is_favorite: true,
    order_index: 2,
  },
  {
    id: "mat_socket_ip44",
    category: "sockets",
    name_pl: "Gniazdo bryzgoszczelne IP44 z klapką",
    name_de: "Feuchtraum-Steckdose IP44 mit Klappdeckel",
    name_en: "Splashproof Socket IP44 with lid",
    name_sk: "Zásuvka IP44 s krytkou",
    unit: "szt",
    is_favorite: true,
    order_index: 3,
  },
  {
    id: "mat_socket_rj45",
    category: "sockets",
    name_pl: "Gniazdo sieciowe RJ45 kat. 6A podwójne",
    name_de: "Netzwerkdose RJ45 2-fach Cat.6A",
    name_en: "Network Socket RJ45 2-gang Cat.6A",
    name_sk: "Dátová zásuvka RJ45 2x Cat.6A",
    unit: "szt",
    is_favorite: false,
    order_index: 4,
  },
  {
    id: "mat_socket_cee16",
    category: "sockets",
    name_pl: "Gniazdo siłowe CEE 16A 5P 400V",
    name_de: "CEE-Steckdose 16A 5-polig 400V",
    name_en: "CEE Socket 16A 5P 400V",
    name_sk: "Zásuvka CEE 16A 5P 400V",
    unit: "szt",
    is_favorite: false,
    order_index: 5,
  },
  {
    id: "mat_socket_cee32",
    category: "sockets",
    name_pl: "Gniazdo siłowe CEE 32A 5P 400V",
    name_de: "CEE-Steckdose 32A 5-polig 400V",
    name_en: "CEE Socket 32A 5P 400V",
    name_sk: "Zásuvka CEE 32A 5P 400V",
    unit: "szt",
    is_favorite: false,
    order_index: 6,
  },
  {
    id: "mat_socket_usb",
    category: "sockets",
    name_pl: "Gniazdo USB ładowarka podtynkowa (A+C)",
    name_de: "USB-Ladesteckdose Unterputz (A+C)",
    name_en: "Flush-mount USB Charger Socket (A+C)",
    name_sk: "Nabíjacia zásuvka USB pod omietku (A+C)",
    unit: "szt",
    is_favorite: false,
    order_index: 7,
  },

  // ── 2. WYŁĄCZNIKI / SCHALTER / SWITCHES ──
  {
    id: "mat_switch_single",
    category: "switches",
    name_pl: "Wyłącznik 1-biegunowy pojedynczy",
    name_de: "Ausschalter 1-polig",
    name_en: "Single pole 1-way Switch",
    name_sk: "Vypínač jednoduchý č.1",
    unit: "szt",
    is_favorite: true,
    order_index: 10,
  },
  {
    id: "mat_switch_double",
    category: "switches",
    name_pl: "Wyłącznik świecznikowy podwójny",
    name_de: "Serienschalter 2-fach",
    name_en: "Double 2-gang Switch",
    name_sk: "Vypínač sériový dvojitý č.5",
    unit: "szt",
    is_favorite: true,
    order_index: 11,
  },
  {
    id: "mat_switch_2way",
    category: "switches",
    name_pl: "Wyłącznik schodowy",
    name_de: "Wechselschalter",
    name_en: "2-way Intermediate Switch",
    name_sk: "Vypínač schodiskový č.6",
    unit: "szt",
    is_favorite: true,
    order_index: 12,
  },
  {
    id: "mat_switch_cross",
    category: "switches",
    name_pl: "Wyłącznik krzyżowy",
    name_de: "Kreuzschalter",
    name_en: "Intermediate / Cross Switch",
    name_sk: "Vypínač krížový č.7",
    unit: "szt",
    is_favorite: false,
    order_index: 13,
  },
  {
    id: "mat_switch_button",
    category: "switches",
    name_pl: "Przycisk impulsowy / dzwonkowy",
    name_de: "Taster / Klingeltaster",
    name_en: "Push button / Bell switch",
    name_sk: "Tlačidlo zvončekové / impulzné",
    unit: "szt",
    is_favorite: false,
    order_index: 14,
  },
  {
    id: "mat_switch_dimmer",
    category: "switches",
    name_pl: "Ściemniacz obrotowy LED",
    name_de: "LED-Drehdimmer",
    name_en: "Rotary LED Dimmer",
    name_sk: "Otočný stmievač LED",
    unit: "szt",
    is_favorite: false,
    order_index: 15,
  },

  // ── 3. RAMKI / ABDECKRAHMEN / FRAMES ──
  {
    id: "mat_frame_1",
    category: "frames",
    name_pl: "Ramka 1-krotna",
    name_de: "Abdeckrahmen 1-fach",
    name_en: "1-gang Cover Frame",
    name_sk: "Krycí rámik 1-násobný",
    unit: "szt",
    is_favorite: true,
    order_index: 20,
  },
  {
    id: "mat_frame_2",
    category: "frames",
    name_pl: "Ramka 2-krotna",
    name_de: "Abdeckrahmen 2-fach",
    name_en: "2-gang Cover Frame",
    name_sk: "Krycí rámik 2-násobný",
    unit: "szt",
    is_favorite: true,
    order_index: 21,
  },
  {
    id: "mat_frame_3",
    category: "frames",
    name_pl: "Ramka 3-krotna",
    name_de: "Abdeckrahmen 3-fach",
    name_en: "3-gang Cover Frame",
    name_sk: "Krycí rámik 3-násobný",
    unit: "szt",
    is_favorite: true,
    order_index: 22,
  },
  {
    id: "mat_frame_4",
    category: "frames",
    name_pl: "Ramka 4-krotna",
    name_de: "Abdeckrahmen 4-fach",
    name_en: "4-gang Cover Frame",
    name_sk: "Krycí rámik 4-násobný",
    unit: "szt",
    is_favorite: false,
    order_index: 23,
  },
  {
    id: "mat_frame_5",
    category: "frames",
    name_pl: "Ramka 5-krotna",
    name_de: "Abdeckrahmen 5-fach",
    name_en: "5-gang Cover Frame",
    name_sk: "Krycí rámik 5-násobný",
    unit: "szt",
    is_favorite: false,
    order_index: 24,
  },

  // ── 3B. RAMKI Z POLEM OPISOWYM / ABDECKRAHMEN MIT BF ──
  {
    id: "mat_frame_bf_1",
    category: "frames_bf",
    name_pl: "Ramka 1-krotna mit BF",
    name_de: "Abdeckrahmen 1-fach mit BF",
    name_en: "1-gang Cover Frame mit BF",
    name_sk: "Krycí rámik 1-násobný mit BF",
    unit: "szt",
    is_favorite: true,
    order_index: 25,
  },
  {
    id: "mat_frame_bf_2",
    category: "frames_bf",
    name_pl: "Ramka 2-krotna mit BF",
    name_de: "Abdeckrahmen 2-fach mit BF",
    name_en: "2-gang Cover Frame mit BF",
    name_sk: "Krycí rámik 2-násobný mit BF",
    unit: "szt",
    is_favorite: true,
    order_index: 26,
  },
  {
    id: "mat_frame_bf_3",
    category: "frames_bf",
    name_pl: "Ramka 3-krotna mit BF",
    name_de: "Abdeckrahmen 3-fach mit BF",
    name_en: "3-gang Cover Frame mit BF",
    name_sk: "Krycí rámik 3-násobný mit BF",
    unit: "szt",
    is_favorite: true,
    order_index: 27,
  },
  {
    id: "mat_frame_bf_4",
    category: "frames_bf",
    name_pl: "Ramka 4-krotna mit BF",
    name_de: "Abdeckrahmen 4-fach mit BF",
    name_en: "4-gang Cover Frame mit BF",
    name_sk: "Krycí rámik 4-násobný mit BF",
    unit: "szt",
    is_favorite: false,
    order_index: 28,
  },
  {
    id: "mat_frame_bf_5",
    category: "frames_bf",
    name_pl: "Ramka 5-krotna mit BF",
    name_de: "Abdeckrahmen 5-fach mit BF",
    name_en: "5-gang Cover Frame mit BF",
    name_sk: "Krycí rámik 5-násobný mit BF",
    unit: "szt",
    is_favorite: false,
    order_index: 29,
  },

  // ── 4. OŚWIETLENIE / BELEUCHTUNG / LIGHTING ──
  {
    id: "mat_light_panel60",
    category: "lighting",
    name_pl: "Panel LED 60x60cm kasetonowy",
    name_de: "LED-Panel 60x60 Rasterdecke",
    name_en: "LED Panel 60x60 Grid Ceiling",
    name_sk: "LED panel 60x60 kazetový",
    unit: "szt",
    is_favorite: true,
    order_index: 30,
  },
  {
    id: "mat_light_herm120",
    category: "lighting",
    name_pl: "Oprawa hermetyczna LED 120cm IP65",
    name_de: "LED Feuchtraum Wannenleuchte 120cm IP65",
    name_en: "Waterproof LED Fixture 120cm IP65",
    name_sk: "Prachotesné LED svietidlo 120cm IP65",
    unit: "szt",
    is_favorite: true,
    order_index: 31,
  },
  {
    id: "mat_light_herm150",
    category: "lighting",
    name_pl: "Oprawa hermetyczna LED 150cm IP65",
    name_de: "LED Feuchtraum Wannenleuchte 150cm IP65",
    name_en: "Waterproof LED Fixture 150cm IP65",
    name_sk: "Prachotesné LED svietidlo 150cm IP65",
    unit: "szt",
    is_favorite: true,
    order_index: 32,
  },
  {
    id: "mat_light_downlight",
    category: "lighting",
    name_pl: "Downlight / Oczko LED wpuszczane",
    name_de: "LED Einbaustrahler rund",
    name_en: "Recessed Round LED Downlight",
    name_sk: "Zapustené bodové svietidlo LED",
    unit: "szt",
    is_favorite: true,
    order_index: 33,
  },
  {
    id: "mat_light_emergency",
    category: "lighting",
    name_pl: "Oprawa awaryjna / ewakuacyjna LED",
    name_de: "Rettungszeichenleuchte Notlicht LED",
    name_en: "Emergency Exit LED Light",
    name_sk: "Núdzové únikové LED svietidlo",
    unit: "szt",
    is_favorite: false,
    order_index: 34,
  },
  {
    id: "mat_light_plafon",
    category: "lighting",
    name_pl: "Plafoniera LED z czujnikiem ruchu IP54",
    name_de: "LED Wand-/Deckenleuchte mit HF Sensor IP54",
    name_en: "LED Ceiling Light with motion sensor IP54",
    name_sk: "Stropné LED svietidlo so senzorom IP54",
    unit: "szt",
    is_favorite: false,
    order_index: 35,
  },
  {
    id: "mat_light_fluter",
    category: "lighting",
    name_pl: "Naświetlacz zewnętrzny LED 50W IP65",
    name_de: "LED Fluter 50W Außenstrahler IP65",
    name_en: "Outdoor LED Floodlight 50W IP65",
    name_sk: "Vonkajší LED reflektor 50W IP65",
    unit: "szt",
    is_favorite: false,
    order_index: 36,
  },

  // ── 5. KABLE I PRZEWODY / KABEL / CABLES ──
  {
    id: "mat_cable_3x15",
    category: "cables",
    name_pl: "Przewód NYM-J 3x1.5 mm²",
    name_de: "Mantelleitung NYM-J 3x1,5 mm²",
    name_en: "Cable NYM-J 3x1.5 mm²",
    name_sk: "Kábel NYM-J 3x1,5 mm²",
    unit: "m",
    is_favorite: true,
    order_index: 40,
  },
  {
    id: "mat_cable_3x25",
    category: "cables",
    name_pl: "Przewód NYM-J 3x2.5 mm²",
    name_de: "Mantelleitung NYM-J 3x2,5 mm²",
    name_en: "Cable NYM-J 3x2.5 mm²",
    name_sk: "Kábel NYM-J 3x2,5 mm²",
    unit: "m",
    is_favorite: true,
    order_index: 41,
  },
  {
    id: "mat_cable_5x15",
    category: "cables",
    name_pl: "Przewód NYM-J 5x1.5 mm²",
    name_de: "Mantelleitung NYM-J 5x1,5 mm²",
    name_en: "Cable NYM-J 5x1.5 mm²",
    name_sk: "Kábel NYM-J 5x1,5 mm²",
    unit: "m",
    is_favorite: true,
    order_index: 42,
  },
  {
    id: "mat_cable_5x25",
    category: "cables",
    name_pl: "Przewód NYM-J 5x2.5 mm²",
    name_de: "Mantelleitung NYM-J 5x2,5 mm²",
    name_en: "Cable NYM-J 5x2.5 mm²",
    name_sk: "Kábel NYM-J 5x2,5 mm²",
    unit: "m",
    is_favorite: true,
    order_index: 43,
  },
  {
    id: "mat_cable_5x6",
    category: "cables",
    name_pl: "Przewód NYM-J 5x6.0 mm²",
    name_de: "Mantelleitung NYM-J 5x6 mm²",
    name_en: "Cable NYM-J 5x6.0 mm²",
    name_sk: "Kábel NYM-J 5x6,0 mm²",
    unit: "m",
    is_favorite: false,
    order_index: 44,
  },
  {
    id: "mat_cable_lan_cat6",
    category: "cables",
    name_pl: "Kabel sieciowy U/UTP kat. 6A LSOH",
    name_de: "Netzwerkkabel Cat.6A / Cat.7 Duplex LSOH",
    name_en: "Ethernet Cable Cat.6A LSOH",
    name_sk: "Sieťový kábel Cat.6A LSOH",
    unit: "m",
    is_favorite: false,
    order_index: 45,
  },

  // ── 6. PUSZKI I OSPRZĘT / DOSEN & ZUBEHÖR / BOXES ──
  {
    id: "mat_box_flush60",
    category: "boxes",
    name_pl: "Puszka podtynkowa fi 60 pojedyncza",
    name_de: "Unterputzdose 60mm flach",
    name_en: "Flush-mount Box 60mm single",
    name_sk: "Krabica pod omietku 60mm jednoduchá",
    unit: "szt",
    is_favorite: true,
    order_index: 50,
  },
  {
    id: "mat_box_flush_deep",
    category: "boxes",
    name_pl: "Puszka podtynkowa fi 60 głęboka",
    name_de: "Unterputzdose 60mm tief",
    name_en: "Deep Flush-mount Box 60mm",
    name_sk: "Hlboká krabica pod omietku 60mm",
    unit: "szt",
    is_favorite: true,
    order_index: 51,
  },
  {
    id: "mat_box_cavity_deep",
    category: "boxes",
    name_pl: "Puszka do płyt g-k głęboka 68mm",
    name_de: "Hohlwanddose 68mm tief",
    name_en: "Cavity Wall Box 68mm deep",
    name_sk: "Krabica do sadrokartónu hlboká 68mm",
    unit: "szt",
    is_favorite: true,
    order_index: 52,
  },
  {
    id: "mat_box_junction_ip54",
    category: "boxes",
    name_pl: "Puszka natynkowa odgałęźna IP54",
    name_de: "Feuchtraum Abzweigdose IP54",
    name_en: "Surface Junction Box IP54",
    name_sk: "Odbočná krabica na omietku IP54",
    unit: "szt",
    is_favorite: false,
    order_index: 53,
  },
  {
    id: "mat_wago_2",
    category: "accessories",
    name_pl: "Złączka WAGO 221-412 (2-przewodowa)",
    name_de: "WAGO Klemme 2-Leiter 221-412",
    name_en: "WAGO Connector 2-wire 221-412",
    name_sk: "WAGO svorka 2-vodičová 221-412",
    unit: "szt",
    is_favorite: true,
    order_index: 60,
  },
  {
    id: "mat_wago_3",
    category: "accessories",
    name_pl: "Złączka WAGO 221-413 (3-przewodowa)",
    name_de: "WAGO Klemme 3-Leiter 221-413",
    name_en: "WAGO Connector 3-wire 221-413",
    name_sk: "WAGO svorka 3-vodičová 221-413",
    unit: "szt",
    is_favorite: true,
    order_index: 61,
  },
  {
    id: "mat_wago_5",
    category: "accessories",
    name_pl: "Złączka WAGO 221-415 (5-przewodowa)",
    name_de: "WAGO Klemme 5-Leiter 221-415",
    name_en: "WAGO Connector 5-wire 221-415",
    name_sk: "WAGO svorka 5-vodičová 221-415",
    unit: "szt",
    is_favorite: true,
    order_index: 62,
  },
  {
    id: "mat_pipe_m20",
    category: "accessories",
    name_pl: "Peszel / Rura karbowana M20 750N",
    name_de: "Wellrohr M20 750N mit Zugdraht",
    name_en: "Flexible Corrugated Conduit M20",
    name_sk: "Chránička husí krk M20",
    unit: "m",
    is_favorite: false,
    order_index: 63,
  },
  {
    id: "mat_ties_200",
    category: "accessories",
    name_pl: "Opaski kablowe 200x3.6mm (op. 100szt)",
    name_de: "Kabelbinder 200x3,6mm (100er Pack)",
    name_en: "Cable Ties 200x3.6mm (pack 100pcs)",
    name_sk: "Sťahovacie pásky 200x3,6mm (bal. 100ks)",
    unit: "op",
    is_favorite: false,
    order_index: 64,
  },
];

export function getLocalizedMaterialName(item: PlanCatalogItem | any, lang: string): string {
  if (!item) return "";
  const l = (lang || "pl").toLowerCase();
  if (l === "pl" && item.name_pl) return item.name_pl;
  if (l === "de" && item.name_de) return item.name_de;
  if (l === "en" && item.name_en) return item.name_en;
  if (l === "sk" && item.name_sk) return item.name_sk;
  return item.name_pl || item.name_de || item.name_en || item.name_sk || item.name || item.display_name || "";
}

export function getLocalizedCategoryName(catId: string, lang: string): string {
  const l = (lang || "pl").toLowerCase();
  const found = PLAN_MATERIAL_CATEGORIES.find((c) => c.id.toLowerCase() === catId.toLowerCase());
  if (found) {
    if (l === "pl") return found.name_pl;
    if (l === "de") return found.name_de;
    if (l === "en") return found.name_en;
    if (l === "sk") return found.name_sk;
    return found.name_pl;
  }
  return catId;
}

export function getLocalizedUnit(unit: string, lang: string): string {
  const l = (lang || "pl").toLowerCase();
  const u = (unit || "szt").toLowerCase();
  if (u === "szt" || u === "stk" || u === "pcs" || u === "ks" || u === "st") {
    if (l === "de") return "Stk";
    if (l === "en") return "pcs";
    if (l === "sk") return "ks";
    return "szt";
  }
  if (u === "op" || u === "pck" || u === "pack" || u === "bal") {
    if (l === "de") return "Pck";
    if (l === "en") return "pack";
    if (l === "sk") return "bal.";
    return "op.";
  }
  if (u === "m" || u === "meter") return "m";
  if (u === "kpl" || u === "set") {
    if (l === "de") return "Set";
    if (l === "en") return "set";
    if (l === "sk") return "sada";
    return "kpl";
  }
  return unit;
}
