import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';

export type Language = 'de' | 'pl' | 'en' | 'sk';

export const LANGUAGES: { code: Language; label: string; flag: string }[] = [
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'pl', label: 'Polski', flag: '🇵🇱' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'sk', label: 'Slovenčina', flag: '🇸🇰' },
];

export const MOBILE_TRANSLATIONS: Record<Language, Record<string, string>> = {
  de: {
    menu: 'MENU ▾',
    admin: 'ADMIN ▾',
    offline: 'Offline-Modus',
    sync: 'Sync 🔄',
    tasks: 'AUFGABEN',
    plans: 'PLÄNE',
    cables: 'KABEL',
    circuits: 'STROMKREISE',
    uv_circuits: 'STROMKREISE VON UV-PLAN',
    bma_automatik: 'BMA AUTOMATIK',
    maengelanzeige: 'MÄNGELANZEIGE',
    chargers: 'LADEGERÄT-INSTALLATION',
    cable_auto: 'KABEL-AUTOMATISIERUNG',
    pdf_tool: 'NARZĘDZIE PDF',
    echeck: 'E-CHECK',
    materials_orders: 'ANFORDERUNGEN',
    questions: 'FRAGEN',
    aufmass: 'AUFMASS',
    employees: 'MITARBEITER',
    // Admin
    yolo_annotator: 'YOLO ANNOTATOR',
    symbol_detection: 'SYMBOL DETECTION',
    photo_doc: 'FOTO-DOKUMENTATION',
    project_progress: 'PROJEKTFORTSCHRITT',
    users: 'BENUTZER',
    companies: 'UNTERNEHMEN',
    reports: 'BERICHTE',
    user_reports: 'BENUTZERBERICHTE',
    to_approve: 'ZUR GENEHMIGUNG',
    completed_work: 'FERTIGE ARBEITEN',
    materials_admin: 'MATERIALIEN (ADMIN)',
    attendance_list: 'ANWESENHEITSLISTE',
    revisions: 'REVISIONEN',
    errors: 'FEHLER',
    upload_plan: 'PLAN HOCHLADEN',
  },
  pl: {
    menu: 'MENU ▾',
    admin: 'ADMIN ▾',
    offline: 'Tryb Offline',
    sync: 'Sync 🔄',
    tasks: 'ZADANIA',
    plans: 'PLANY',
    cables: 'KABLE',
    circuits: 'OBWODY',
    uv_circuits: 'OBWODY Z PLANU UV',
    bma_automatik: 'AUTOMATYKA BMA',
    maengelanzeige: 'MÄNGELANZEIGE (USTERKI)',
    chargers: 'INSTALACJA ŁADOWAREK',
    cable_auto: 'AUTOMATYZACJA KABLI',
    pdf_tool: 'NARZĘDZIE PDF',
    echeck: 'E-CHECK (POMIARY)',
    materials_orders: 'ZAPOTRZEBOWANIE',
    questions: 'PYTANIA I UWAGI',
    aufmass: 'PRZEDMIAR / AUFMASS',
    employees: 'PRACOWNICY',
    // Admin
    yolo_annotator: 'YOLO ANNOTATOR',
    symbol_detection: 'DETEKCJA SYMBOLI AI',
    photo_doc: 'FOTO-DOKUMENTACJA',
    project_progress: 'POSTĘP PROJEKTU',
    users: 'UŻYTKOWNICY',
    companies: 'FIRMY',
    reports: 'RAPORTY PDF (BERICHTE)',
    user_reports: 'RAPORTY PRACOWNIKÓW',
    to_approve: 'DO ZATWIERDZENIA',
    completed_work: 'UKOŃCZONE PRACE',
    materials_admin: 'MATERIAŁY (ADMIN)',
    attendance_list: 'LISTA OBECNOŚCI / GODZINY',
    revisions: 'REWIZJE',
    errors: 'BŁĘDY',
    upload_plan: 'WGRAJ NOWY PLAN',
  },
  en: {
    menu: 'MENU ▾',
    admin: 'ADMIN ▾',
    offline: 'Offline Mode',
    sync: 'Sync 🔄',
    tasks: 'TASKS',
    plans: 'PLANS',
    cables: 'CABLES',
    circuits: 'CIRCUITS',
    uv_circuits: 'CIRCUITS FROM UV-PLAN',
    bma_automatik: 'BMA AUTOMATION',
    maengelanzeige: 'DEFECTS (MÄNGELANZEIGE)',
    chargers: 'CHARGER INSTALLATION',
    cable_auto: 'CABLE AUTOMATION',
    pdf_tool: 'PDF TOOL',
    echeck: 'E-CHECK (VDE)',
    materials_orders: 'REQUIREMENTS / ORDERS',
    questions: 'QUESTIONS',
    aufmass: 'MEASUREMENTS (AUFMASS)',
    employees: 'EMPLOYEES',
    // Admin
    yolo_annotator: 'YOLO ANNOTATOR',
    symbol_detection: 'SYMBOL DETECTION AI',
    photo_doc: 'PHOTO DOCUMENTATION',
    project_progress: 'PROJECT PROGRESS',
    users: 'USERS',
    companies: 'COMPANIES',
    reports: 'PDF REPORTS',
    user_reports: 'USER REPORTS',
    to_approve: 'TO APPROVE',
    completed_work: 'COMPLETED WORK',
    materials_admin: 'MATERIALS (ADMIN)',
    attendance_list: 'ATTENDANCE & HOURS',
    revisions: 'REVISIONS',
    errors: 'ERRORS',
    upload_plan: 'UPLOAD PLAN',
  },
  sk: {
    menu: 'MENU ▾',
    admin: 'ADMIN ▾',
    offline: 'Offline režim',
    sync: 'Sync 🔄',
    tasks: 'ÚLOHY',
    plans: 'PLÁNY',
    cables: 'KÁBLE',
    circuits: 'OBVODY',
    uv_circuits: 'OBVODY Z UV-PLÁNU',
    bma_automatik: 'BMA AUTOMATIKA',
    maengelanzeige: 'ZOZNAM VÁD (MÄNGEL)',
    chargers: 'INŠTALÁCIA NABÍJAČIEK',
    cable_auto: 'AUTOMATIZÁCIA KÁBLOV',
    pdf_tool: 'NÁSTROJ PDF',
    echeck: 'E-CHECK MERANIE',
    materials_orders: 'POŽIADAVKY NA MATERIÁL',
    questions: 'OTÁZKY',
    aufmass: 'VÝMERA / AUFMASS',
    employees: 'ZAMESTNANCI',
    // Admin
    yolo_annotator: 'YOLO ANNOTATOR',
    symbol_detection: 'DETEKCIA SYMBOLOV AI',
    photo_doc: 'FOTODOKUMENTÁCIA',
    project_progress: 'POKROK PROJEKTU',
    users: 'POUŽÍVATELIA',
    companies: 'FIRMY',
    reports: 'SPRÁVY A PROTOKOLY (PDF)',
    user_reports: 'SPRÁVY POUŽÍVATEĽOV',
    to_approve: 'NA SCHVÁLENIE',
    completed_work: 'UKONČENÉ PRÁCE',
    materials_admin: 'MATERIÁLY (ADMIN)',
    attendance_list: 'PREZENČNÁ LISTINA',
    revisions: 'REVÍZIE',
    errors: 'CHYBY',
    upload_plan: 'NAHRAŤ PLÁN',
  },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, defaultVal?: string) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  language: 'de',
  setLanguage: () => {},
  t: (key) => key,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('de');

  useEffect(() => {
    SecureStore.getItemAsync('user_language').then((saved) => {
      if (saved && (saved === 'de' || saved === 'pl' || saved === 'en' || saved === 'sk')) {
        setLanguageState(saved as Language);
      }
    });
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    SecureStore.setItemAsync('user_language', lang).catch(() => {});
  };

  const t = (key: string, defaultVal?: string): string => {
    const dict = MOBILE_TRANSLATIONS[language] || MOBILE_TRANSLATIONS.de;
    return dict[key] || defaultVal || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
