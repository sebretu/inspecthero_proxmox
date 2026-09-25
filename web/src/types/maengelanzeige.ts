export type AIRelevance = "RELEVANT" | "POSSIBLY_RELEVANT" | "NOT_RELEVANT";
export type MangelStatus = "OPEN" | "IN_PROGRESS" | "ZU_KLAEREN" | "DONE" | "NOT_RELEVANT";
export type PhotoType = "BEFORE" | "AFTER" | "GENERAL";

export interface MaengelanzeigeDocument {
  id: string;
  project_id: string;
  title: string;
  file_name: string;
  storage_bucket: string;
  storage_path: string;
  total_pages: number;
  status: "ACTIVE" | "ARCHIVED" | string;
  uploaded_by?: string | null;
  created_at: string;
  updated_at?: string;
  // Computed counters
  items_count?: number;
  selected_count?: number;
  done_count?: number;
}

export interface MaengelanzeigePhoto {
  id: string;
  item_id: string;
  storage_bucket: string;
  storage_path: string;
  url: string;
  caption?: string | null;
  ai_suggested_caption?: string | null;
  photo_type?: PhotoType | null; // "BEFORE" | "AFTER" | "GENERAL"
  uploaded_by?: string | null;
  created_at: string;
}

export interface ReportConfig {
  // Custom report name / filename
  customReportName?: string;

  // Status filter for report export
  includedStatuses?: MangelStatus[];

  // Mangel details
  includeOriginalText: boolean;
  includeStatus: boolean;
  includeTrade: boolean;
  includeCompany: boolean;
  includeLocation: boolean;
  includeRoom: boolean;

  // Photos & Links
  includeBeforePhotos: boolean;
  includeAfterPhotos: boolean;
  includeHdPhotoLinks?: boolean; // Clickable link to full-resolution original photo

  // Comments / Documentation
  includeAdminDoc: boolean; // Bauleitung / Admin
  includeUserDoc: boolean; // Mitarbeiter / User
}

export type ReportPreset = "FULL" | "MANGEL_STATUS" | "MANGEL_PHOTOS" | "MANGEL_COMMENTS" | "CUSTOM";

export const DEFAULT_INCLUDED_STATUSES: MangelStatus[] = ["OPEN", "IN_PROGRESS", "ZU_KLAEREN", "DONE"];

export const DEFAULT_REPORT_CONFIG: ReportConfig = {
  includedStatuses: ["OPEN", "IN_PROGRESS", "ZU_KLAEREN", "DONE"],
  includeOriginalText: true,
  includeStatus: true,
  includeTrade: true,
  includeCompany: true,
  includeLocation: true,
  includeRoom: true,
  includeBeforePhotos: true,
  includeAfterPhotos: true,
  includeAdminDoc: true,
  includeUserDoc: true,
  includeHdPhotoLinks: true,
};

export const REPORT_PRESETS: Record<ReportPreset, { name: string; description: string; config: ReportConfig }> = {
  FULL: {
    name: "Vollständig",
    description: "Alle Mängeldetails, Fotos (Vorher/Nachher) & Dokumentationen (Bauleitung/Mitarbeiter)",
    config: {
      includedStatuses: ["OPEN", "IN_PROGRESS", "ZU_KLAEREN", "DONE"],
      includeOriginalText: true,
      includeStatus: true,
      includeTrade: true,
      includeCompany: true,
      includeLocation: true,
      includeRoom: true,
      includeBeforePhotos: true,
      includeAfterPhotos: true,
      includeAdminDoc: true,
      includeUserDoc: true,
      includeHdPhotoLinks: true,
    },
  },
  MANGEL_STATUS: {
    name: "Nur Mangel + Status",
    description: "Kompakte Übersicht nur mit Mängeltext, Ort, Gewerk und aktuellem Status",
    config: {
      includedStatuses: ["OPEN", "IN_PROGRESS", "ZU_KLAEREN", "DONE"],
      includeOriginalText: true,
      includeStatus: true,
      includeTrade: true,
      includeCompany: true,
      includeLocation: true,
      includeRoom: true,
      includeBeforePhotos: false,
      includeAfterPhotos: false,
      includeAdminDoc: false,
      includeUserDoc: false,
    },
  },
  MANGEL_PHOTOS: {
    name: "Mangel + Fotos",
    description: "Mängeldetails mit Fotodokumentation (Vorher & Nachher), ohne Textkommentare",
    config: {
      includedStatuses: ["OPEN", "IN_PROGRESS", "ZU_KLAEREN", "DONE"],
      includeOriginalText: true,
      includeStatus: true,
      includeTrade: true,
      includeCompany: true,
      includeLocation: true,
      includeRoom: true,
      includeBeforePhotos: true,
      includeAfterPhotos: true,
      includeAdminDoc: false,
      includeUserDoc: false,
    },
  },
  MANGEL_COMMENTS: {
    name: "Mangel + Kommentare",
    description: "Mängeldetails mit Bauleitung- und Mitarbeiterdokumentation, ohne Fotos",
    config: {
      includedStatuses: ["OPEN", "IN_PROGRESS", "ZU_KLAEREN", "DONE"],
      includeOriginalText: true,
      includeStatus: true,
      includeTrade: true,
      includeCompany: true,
      includeLocation: true,
      includeRoom: true,
      includeBeforePhotos: false,
      includeAfterPhotos: false,
      includeAdminDoc: true,
      includeUserDoc: true,
    },
  },
  CUSTOM: {
    name: "Benutzerdefiniert",
    description: "Individuell angepasste Auswahl der Inhalte",
    config: DEFAULT_REPORT_CONFIG,
  },
};

export interface MaengelanzeigeItem {
  id: string;
  document_id: string;
  project_id: string;
  item_number: string;
  trade_or_company?: string | null; // Gewerk / Firma / Auftragnehmer
  location?: string | null; // Ort / Raum / Bauteil
  page_number: number;
  original_text: string;
  ai_relevance: AIRelevance;
  ai_relevance_reason?: string | null;
  is_selected: boolean;
  our_documentation?: string | null; // Version 1: Admin-Dokumentation (Bauleitung)
  user_documentation?: string | null; // Version 2: Ausführung / Kommentar durch Mitarbeiter
  export_include_before_photos?: boolean; // In PDF Bericht aufnehmen
  export_include_after_photos?: boolean; // In PDF Bericht aufnehmen
  export_include_admin_doc?: boolean; // In PDF Bericht aufnehmen
  export_include_user_doc?: boolean; // In PDF Bericht aufnehmen
  custom_report_config?: Partial<ReportConfig> | null; // Optional individual override
  status: MangelStatus;
  assigned_user_id?: string | null;
  sort_order: number;
  created_at: string;
  updated_at?: string;
  photos?: MaengelanzeigePhoto[];
}
