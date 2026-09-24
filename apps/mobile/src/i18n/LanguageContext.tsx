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
    sync_now: 'Sync 🔄',
    syncing: 'Synchronisiere mit Cloud...',
    synced: 'Mit Cloud synchronisiert',
    conn_error: 'Verbindungsfehler',
    ready_offline: 'Bereit für Offline-Arbeit',
    click_sync: 'Klicken Sie auf Sync 🔄 zum Laden',
    pending_mutations: 'Ausstehende Änderungen',
    last_sync: 'Letzter Sync',
    login_cloud: '🔑 In Cloud anmelden',
    logout: 'Abmelden',
    client_subtitle: 'Offline-First Mobiler Baustellen-Client',
    local_db: 'Lokale Datenbank',
    sqlite_status: '🟢 SQLite (WAL)',
    db_desc: 'Alle Bauobjekte, Geschosspläne und Montageaufgaben sind offline voll funktionsfähig.',
    projects_stat: 'Projekte',
    tasks_stat: 'Aufgaben',
    sync_queue_stat: 'Sync-Warteschlange',
    browse_plans_btn: '📐 Pläne (Leaflet) →',
    browse_projects_btn: '🏢 Projekte ({count}) →',
    add_task_offline: '+ Neue Offline-Aufgabe',
    // Menu items
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
    reports: 'BERICHTE (PDF)',
    user_reports: 'BENUTZERBERICHTE',
    to_approve: 'ZUR GENEHMIGUNG',
    completed_work: 'FERTIGE ARBEITEN',
    materials_admin: 'MATERIALIEN (ADMIN)',
    attendance_list: 'ANWESENHEITSLISTE',
    revisions: 'REVISIONEN',
    errors: 'FEHLER',
    upload_plan: 'PLAN HOCHLADEN',
    // Attendance & Orders
    hours_vacation: 'Stunden & Urlaub',
    materials_catalog: 'Materialien (Katalog)',
  },
  pl: {
    menu: 'MENU ▾',
    admin: 'ADMIN ▾',
    offline: 'Tryb Offline',
    sync: 'Sync 🔄',
    sync_now: 'Sync 🔄',
    syncing: 'Synchronizacja z chmurą...',
    synced: 'Zsynchronizowano z chmurą',
    conn_error: 'Błąd połączenia',
    ready_offline: 'Gotowy do pracy bez zasięgu',
    click_sync: 'Kliknij Sync 🔄, aby pobrać dane',
    pending_mutations: 'Oczekujące mutacje',
    last_sync: 'Ostatni sync',
    login_cloud: '🔑 Zaloguj do chmury',
    logout: 'Wyloguj',
    client_subtitle: 'Klient terenowy Offline-First',
    local_db: 'Lokalna Baza Danych',
    sqlite_status: '🟢 SQLite (WAL)',
    db_desc: 'Wszystkie obiekty, rzuty kondygnacji i zadania montażowe są w pełni dostępne bez zasięgu.',
    projects_stat: 'Projekty',
    tasks_stat: 'Zadania',
    sync_queue_stat: 'Kolejka Sync',
    browse_plans_btn: '📐 Przeglądaj Plany (Leaflet) →',
    browse_projects_btn: '🏢 Projekty ({count}) →',
    add_task_offline: '+ Dodaj nowe zadanie offline',
    // Menu items
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
    // Attendance & Orders
    hours_vacation: 'Godziny & Urlopy',
    materials_catalog: 'Materiały (Katalog)',
  },
  en: {
    menu: 'MENU ▾',
    admin: 'ADMIN ▾',
    offline: 'Offline Mode',
    sync: 'Sync 🔄',
    sync_now: 'Sync 🔄',
    syncing: 'Syncing with cloud...',
    synced: 'Synced with cloud',
    conn_error: 'Connection error',
    ready_offline: 'Ready for offline work',
    click_sync: 'Click Sync 🔄 to fetch data',
    pending_mutations: 'Pending mutations',
    last_sync: 'Last sync',
    login_cloud: '🔑 Login to Cloud',
    logout: 'Logout',
    client_subtitle: 'Offline-First Field Mobile Client',
    local_db: 'Local Database',
    sqlite_status: '🟢 SQLite (WAL)',
    db_desc: 'All construction projects, floor plans and tasks are fully functional offline.',
    projects_stat: 'Projects',
    tasks_stat: 'Tasks',
    sync_queue_stat: 'Sync Queue',
    browse_plans_btn: '📐 Browse Plans (Leaflet) →',
    browse_projects_btn: '🏢 Projects ({count}) →',
    add_task_offline: '+ Add New Offline Task',
    // Menu items
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
    // Attendance & Orders
    hours_vacation: 'Hours & Vacations',
    materials_catalog: 'Materials (Catalog)',
  },
  sk: {
    menu: 'MENU ▾',
    admin: 'ADMIN ▾',
    offline: 'Offline režim',
    sync: 'Sync 🔄',
    sync_now: 'Sync 🔄',
    syncing: 'Synchronizácia s cloudom...',
    synced: 'Synchronizované s cloudom',
    conn_error: 'Chyba pripojenia',
    ready_offline: 'Pripravené na prácu offline',
    click_sync: 'Kliknite na Sync 🔄 pre stiahnutie',
    pending_mutations: 'Čakajúce zmeny',
    last_sync: 'Posledný sync',
    login_cloud: '🔑 Prihlásiť sa do cloudu',
    logout: 'Odhlásiť',
    client_subtitle: 'Terénny mobilný klient Offline-First',
    local_db: 'Lokálna databáza',
    sqlite_status: '🟢 SQLite (WAL)',
    db_desc: 'Všetky stavebné objekty, pôdorysy a montážne úlohy sú plne dostupné offline.',
    projects_stat: 'Projekty',
    tasks_stat: 'Úlohy',
    sync_queue_stat: 'Sync fronta',
    browse_plans_btn: '📐 Prehliadať plány (Leaflet) →',
    browse_projects_btn: '🏢 Projekty ({count}) →',
    add_task_offline: '+ Pridať novú offline úlohu',
    // Menu items
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
    // Attendance & Orders
    hours_vacation: 'Hodiny & Dovolenka',
    materials_catalog: 'Materiály (Katalóg)',
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
    }).catch(() => {});
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    SecureStore.setItemAsync('user_language', lang).catch(() => {});
  };

  const t = (key: string, defaultVal?: string): string => {
    const dict = MOBILE_TRANSLATIONS[language] || MOBILE_TRANSLATIONS.de;
    return dict[key] ?? defaultVal ?? key;
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
