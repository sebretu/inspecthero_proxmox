"use client";
import React, { useMemo, useState, useEffect, useRef } from "react";
import { useNotification } from "@/contexts/NotificationContext";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { useLanguage } from "@/contexts/LanguageContext";
import { LogoutButton } from "@/components/LogoutButton";
import { RevisionModal } from "@/components/RevisionModal";
import { FehlerModal } from "@/components/FehlerModal";
import { FehlerAlertPopup } from "@/components/FehlerAlertPopup";
import { AIAssistant } from "@/components/AIAssistant";
import { Sparkles } from "lucide-react";
import { PrivacyModal } from "@/components/PrivacyModal";


import { supabase } from "@/lib/supabase";
import { apiGet } from "@/lib/apiClient";

export default function UnifiedLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { showNotification } = useNotification();
  const hideChrome = pathname?.startsWith("/task/") || pathname?.startsWith("/public/bma/");
  const [adminDropdownOpen, setAdminDropdownOpen] = useState(false);
  const [mainDropdownOpen, setMainDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const adminDropdownRef = useRef<HTMLDivElement>(null);
  const mainDropdownRef = useRef<HTMLDivElement>(null);
  const { t } = useLanguage();
  const currentYear = new Date().getFullYear();
  const footerTagline = t("footer", "tagline", "Inspection and reporting platform");
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userHasVdeAccess, setUserHasVdeAccess] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const isAdmin = (userRole || "").toUpperCase() === "ADMIN";
  const isJozef = userEmail === "jozef@demo.pl" || userEmail === "jozesf@demo.pl";
  const isMod = isAdmin || (userRole || "").toUpperCase() === "MODERATOR" || (userRole || "").toUpperCase() === "MOD" || isJozef;

  // --- Global New Task / New Question Modal ---
  const [showGlobalModal, setShowGlobalModal] = useState(false);
  const [isQuestionMode, setIsQuestionMode] = useState(false);
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [showFehlerModal, setShowFehlerModal] = useState(false);
  const [isAIAssistantOpen, setIsAIAssistantOpen] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [activeFehler, setActiveFehler] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [projectId, setProjectId] = useState("");
  const [plans, setPlans] = useState<any[]>([]);
  const [planId, setPlanId] = useState("");
  const [loadingPlans, setLoadingPlans] = useState(false);

  // Load projects when modal opens; reset plan state too
  useEffect(() => {
    if (!showGlobalModal) return;
    // Reset on open
    setProjects([]);
    setPlans([]);
    setProjectId("");
    setPlanId("");
    apiGet<any[]>("/api/projects")
      .then((ps) => {
        setProjects(ps || []);
        if (ps && ps.length > 0) setProjectId(ps[0].id);
      })
      .catch(() => { });
  }, [showGlobalModal]);

  // Load plans whenever projectId changes (and modal is open)
  useEffect(() => {
    if (!projectId) { setPlans([]); setPlanId(""); return; }
    setLoadingPlans(true);
    setPlans([]);
    setPlanId("");
    apiGet<any[]>(`/api/plans?projectId=${encodeURIComponent(projectId)}`)
      .then((ps) => {
        setPlans(ps || []);
        if (ps && ps.length > 0) setPlanId(ps[0].id);
      })
      .catch(() => { })
      .finally(() => setLoadingPlans(false));
  }, [projectId]);

  // Listen globally for nav bar button events — works on every page
  useEffect(() => {
    function onOpenTask() {
      setIsQuestionMode(false);
      setShowGlobalModal(true);
    }
    function onOpenQuestion() {
      setIsQuestionMode(true);
      setShowGlobalModal(true);
    }
    function onOpenRevision() {
      setShowRevisionModal(true);
    }
    function onOpenFehler() {
      setActiveFehler(null);
      setShowFehlerModal(true);
    }
    window.addEventListener("open-new-task", onOpenTask);
    window.addEventListener("open-new-question", onOpenQuestion);
    window.addEventListener("open-new-revision", onOpenRevision);
    window.addEventListener("open-new-fehler", onOpenFehler);
    return () => {
      window.removeEventListener("open-new-task", onOpenTask);
      window.removeEventListener("open-new-question", onOpenQuestion);
      window.removeEventListener("open-new-revision", onOpenRevision);
      window.removeEventListener("open-new-fehler", onOpenFehler);
    };
  }, []);

  // Load user role
  useEffect(() => {
    let alive = true;
    async function loadRole() {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      try {
        const j = await apiGet<any>("/api/me");
        if (alive) {
          setUserRole(j?.profile?.role || "USER");
          setUserHasVdeAccess(j?.profile?.has_vde_access || false);
          setCurrentUserId(j?.id || j?.profile?.id || null);
          setUserEmail(j?.profile?.email || null);
        }
      } catch (err: any) {
        if (alive) {
          setUserRole(null);
          setUserHasVdeAccess(false);
        }
      }
    }
    loadRole();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        loadRole();
      } else if (event === "SIGNED_OUT") {
        if (alive) {
          setUserRole(null);
          setUserHasVdeAccess(false);
          if (pathname !== "/auth/login" && pathname !== "/cables") {
            window.location.href = "/auth/login";
          }
        }
      }
    });
    return () => {
      alive = false;
      sub.subscription?.unsubscribe();
    };
  }, [pathname]);

  // Global Auth Guard: Force redirect if no session exists on a protected route
  useEffect(() => {
    let alive = true;
    async function checkAuth() {
      const { data } = await supabase.auth.getSession();
      const isPublicCablePage = pathname === "/cables";
      if (alive && !data?.session && pathname !== "/auth/login" && !isPublicCablePage && !isPublicBma) {
        console.warn("[UnifiedLayout] No session detected, redirecting to login");
        window.location.href = "/auth/login";
      }
    }
    checkAuth();
    return () => { alive = false; };
  }, [pathname]);

  // Close admin dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (adminDropdownRef.current && !adminDropdownRef.current.contains(event.target as Node)) {
        setAdminDropdownOpen(false);
      }
      if (mainDropdownRef.current && !mainDropdownRef.current.contains(event.target as Node)) {
        setMainDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside as EventListener);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside as EventListener);
    };
  }, []);

  // Admin notification on task approval
  useEffect(() => {
    function handleTaskSubmitted(e: any) {
      if ((userRole || "").toUpperCase() === "ADMIN") {
        const taskTitle = e?.detail?.title || "";
        showNotification(
          taskTitle 
            ? t("notifications", "taskSubmittedWithTitle", `Zadanie "${taskTitle}" zgłoszone do akceptacji.`).replace("{title}", taskTitle)
            : t("notifications", "taskSubmitted", "Zadanie zgłoszone do akceptacji."),
          "info"
        );
      }
    }
    window.addEventListener("task-submitted-for-approval", handleTaskSubmitted as any);
    return () => window.removeEventListener("task-submitted-for-approval", handleTaskSubmitted as any);
  }, [userRole, showNotification]);

  const navLinks = useMemo(() => {
    const base = [
      { href: "/", label: t("nav", "tasks", "Zadania") },
      { href: "/plans", label: t("nav", "plans", "Plany") },
      { href: "/charger-install", label: t("nav", "chargerInstall", "Instalacja Ładowarek") },
      { href: "/cables", label: t("nav", "cables", "Kable") },
      { href: "/bma-automation", label: t("bmaAutomation", "title", "BMA Automatyka") },
    ];

    if (isAdmin) {
      base.push({ href: "/automation", label: t("nav", "automation", "Automatyka kabli") });
    }

    if (isAdmin || isMod || userHasVdeAccess) {
      base.push({ href: "/measurement-protocols", label: t("nav", "measurementProtocols", "E-Check") });
    }

    base.push(
      { href: "/materials", label: t("nav", "materials", "Zapotrzebowania") },
      { href: "/questions", label: t("nav", "questions", "Pytania") }
    );

    if (isAdmin) {
      base.push({ href: "/aufmass", label: t("nav", "aufmass", "Aufmaß") });
    }

    // Add Employee Management for jozef@demo.pl or moderators/admins
    if (isMod) {
      base.push({ href: "/admin/attendance-calendar", label: t("nav", "manageWorkers", "Pracownicy") });
    }

    return base;
  }, [t, isAdmin, isMod, userHasVdeAccess]);

  const adminLinks = useMemo(() => {
    if (!isAdmin) return [];
    return [
      { href: "/users", label: t("nav", "users", "Użytkownicy") },
      { href: "/companies", label: t("nav", "companies", "Firmy") },
      { href: "/reports", label: t("nav", "reports", "Raporty") },
      { href: "/admin/user-reports", label: t("nav", "userReports", "Raporty Użytkowników") },
      { href: "/to-approve", label: t("nav", "toApprove", "Do zatwierdzenia") },
      { href: "/completed", label: t("nav", "completed", "Zakończone prace") },
      { href: "/admin/materials", label: t("nav", "adminMaterials", "Materiały (Admin)") },
      { href: "/admin/attendance-calendar", label: t("nav", "attendanceCalendar", "Kalendarz obecności") },
      { href: "/admin/revisions", label: t("nav", "revision", "Revision") },
      { href: "/admin/fehler", label: t("nav", "fehler", "Error") },
      { href: "/plans/upload", label: t("nav", "adminUploadPlan", "Upload plan") },
    ];
  }, [t, isAdmin]);

  const isPublicBma = pathname?.startsWith("/public/bma/");
  if (isPublicBma) return <div className="min-h-screen bg-[#020617] flex flex-col">{children}</div>;
  if (hideChrome) return <>{children}</>;

  return (
    <div className="min-h-screen bg-ui-bg text-ui-text font-sans selection:bg-ui-accent/30 selection:text-ui-text">
      <div className="relative w-full overflow-x-clip flex flex-col min-h-screen">

        {/* ── HEADER ── */}
        <header className="sticky top-0 z-[9990] w-full bg-ui-nav-bg/95 backdrop-blur-[40px] border-b border-[var(--ui-border)] shadow-[0_15px_50px_-10px_rgba(0,0,0,0.7)]">
          <div className="container mx-auto px-3 md:px-12 py-0 h-16 md:h-40 lg:h-[13rem] flex items-center justify-between">

            {/* Logo — left */}
            <div className="flex-shrink-0 flex items-center mr-auto pr-2 lg:pr-10">
              <Link
                href="/"
                className="flex items-center transition-all duration-500 hover:scale-105 active:scale-95 hover:!bg-none focus:!bg-none !shadow-none hover:!shadow-none focus:!shadow-none !p-0 !m-0"
                aria-label="InspectHero home"
              >
                <img
                  src="/inspecthero-logo.png"
                  alt="InspectHero logo"
                  className="!h-[44px] md:!h-[130px] lg:!h-[180px] !w-auto no-auto-scale brightness-0 invert opacity-100 contrast-200 grayscale drop-shadow-[0_0_15px_rgba(255,255,255,0.15)] object-contain"
                />
              </Link>
            </div>

            {/* Right nav & tools */}
            <div className="flex items-center justify-end gap-2 md:gap-8">
              {currentUserId && (
                <nav className="hidden lg:flex items-center gap-6 xl:gap-8">
                <div className="relative" ref={mainDropdownRef}>
                  <button
                    onClick={() => setMainDropdownOpen((o) => !o)}
                    className={`text-[13px] font-black uppercase tracking-[0.25em] transition-all duration-300 flex items-center gap-2 ${mainDropdownOpen ? "text-ui-accent" : "text-ui-muted hover:text-ui-text"}`}
                  >
                    Menu
                    <span className={`text-[10px] transition-transform duration-300 ${mainDropdownOpen ? "rotate-180" : ""}`}>▼</span>
                  </button>
                  {mainDropdownOpen && (
                    <div className="absolute top-full left-0 mt-6 w-56 bg-ui-card backdrop-blur-2xl border border-ui-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-[9995]">
                      <div className="flex flex-col py-2">
                        {navLinks.map((link) => (
                          <Link
                            key={`main-nav-${link.href}`}
                            href={link.href}
                            onClick={() => setMainDropdownOpen(false)}
                            className={`px-6 py-3 text-[11px] font-black uppercase tracking-[0.2em] transition-all duration-200 ${pathname === link.href
                              ? "bg-ui-accent/10 text-ui-accent border-l-2 border-ui-accent"
                              : "text-ui-muted hover:bg-white/5 hover:text-ui-text"
                              }`}
                          >
                            {link.label}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {isAdmin && adminLinks.length > 0 && (
                  <div className="relative" ref={adminDropdownRef}>
                    <button
                      onClick={() => setAdminDropdownOpen((o) => !o)}
                      className={`text-[13px] font-black uppercase tracking-[0.25em] transition-all duration-300 flex items-center gap-2 ${adminDropdownOpen ? "text-ui-accent" : "text-ui-muted hover:text-ui-text"
                        }`}
                    >
                      Admin
                      <span className={`text-[10px] transition-transform duration-300 ${adminDropdownOpen ? "rotate-180" : ""}`}>▼</span>
                    </button>
                    {adminDropdownOpen && (
                      <div className="absolute top-full right-0 mt-6 w-56 bg-ui-card backdrop-blur-2xl border border-ui-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-[9995]">
                        <div className="flex flex-col py-2">
                          {adminLinks.map((link) => (
                            <Link
                              key={`admin-${link.href}`}
                              href={link.href}
                              onClick={() => setAdminDropdownOpen(false)}
                              className={`px-6 py-3 text-[11px] font-black uppercase tracking-[0.2em] transition-all duration-200 ${pathname === link.href
                                ? "bg-ui-accent/10 text-ui-accent border-l-2 border-ui-accent"
                                : "text-ui-muted hover:bg-white/5 hover:text-ui-text"
                                }`}
                            >
                              {link.label}
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </nav>
              )}

              <div className="flex items-center gap-1.5 md:gap-4">
                {/* New Task button */}
                {currentUserId && (
                  <>
                    <button
                      className="flex items-center justify-center w-9 h-9 md:w-14 md:h-14 rounded-lg md:rounded-xl bg-gradient-to-br from-[#3b82f6] via-[#0ea5e9] to-[#2dd4bf] transition-all hover:scale-110 hover:shadow-[0_0_40px_rgba(14,165,233,0.7)] active:scale-95 border border-white/20 shadow-lg group"
                      onClick={() => window.dispatchEvent(new CustomEvent("open-new-task"))}
                      title={t("home", "createNewTask")}
                      aria-label={t("home", "createNewTask")}
                    >
                      <span className="text-lg md:text-3xl font-black text-white drop-shadow-md transition-transform group-hover:scale-110">✓</span>
                    </button>

                    {/* New Question button */}
                    <button
                      className="flex items-center justify-center w-9 h-9 md:w-12 md:h-12 rounded-lg md:rounded-xl bg-gradient-to-br from-fuchsia-500 to-purple-600 transition-all hover:scale-110 hover:shadow-[0_0_30px_rgba(217,70,239,0.5)] active:scale-95 border border-white/20 shadow-md text-white text-base md:text-lg font-bold"
                      onClick={() => window.dispatchEvent(new CustomEvent("open-new-question"))}
                      title={t("home", "newQuestion", "Zadaj pytanie")}
                    >
                      ?
                    </button>
                  </>
                )}

                {/* New Revision button */}
                {isAdmin && (
                  <button
                    className="flex items-center justify-center w-9 h-9 md:w-12 md:h-12 rounded-lg md:rounded-xl bg-gradient-to-br from-cyan-500 to-violet-600 transition-all hover:scale-110 hover:shadow-[0_0_30px_rgba(6,182,212,0.5)] active:scale-95 border border-white/20 shadow-md text-white text-base md:text-lg font-bold"
                    onClick={() => window.dispatchEvent(new CustomEvent("open-new-revision"))}
                    title={t("revision", "title", "New Revision")}
                    aria-label={t("revision", "title", "New Revision")}
                  >
                    📋
                  </button>
                )}

                {/* New Fehler button */}
                {isAdmin && (
                  <button
                    className="flex items-center justify-center w-9 h-9 md:w-12 md:h-12 rounded-lg md:rounded-xl bg-gradient-to-br from-amber-500 to-red-500 transition-all hover:scale-110 hover:shadow-[0_0_30px_rgba(239,68,68,0.5)] active:scale-95 border border-white/20 shadow-md text-white text-base md:text-lg font-bold"
                    onClick={() => window.dispatchEvent(new CustomEvent("open-new-fehler"))}
                    title={t("fehler", "title", "Error")}
                    aria-label={t("fehler", "title", "Error")}
                  >
                    ⚠️
                  </button>
                )}


                <div className="h-8 w-px bg-ui-border/20 hidden md:block" />

                {/* Theme/lang/logout: hidden on mobile (accessible from drawer) */}
                <div className="hidden md:flex items-center gap-1 md:gap-2">
                  <ThemeSwitcher />
                  <LanguageSwitcher />
                  {isAdmin && (
                    <button
                      className="flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 transition-all hover:scale-110 hover:shadow-[0_0_20px_rgba(168,85,247,0.4)] active:scale-95 border border-white/10 shadow-sm p-1.5 mx-1 group"
                      onClick={() => setIsAIAssistantOpen(true)}
                      title="AI Assistant"
                    >
                      <Sparkles className="w-5 h-5 md:w-6 md:h-6 text-white drop-shadow-sm" />
                    </button>
                  )}


                  <LogoutButton className="p-1.5 md:p-2 rounded-full hover:bg-white/5 transition-colors" />
                </div>

                {/* Hamburger — mobile only */}
                <button
                  className="lg:hidden flex flex-col justify-center items-center w-10 h-10 rounded-lg gap-[5px] hover:bg-white/5 transition-colors"
                  onClick={() => setMobileMenuOpen(true)}
                  aria-label="Otwórz menu"
                >
                  <span className="block w-6 h-0.5 bg-ui-text rounded-full" />
                  <span className="block w-6 h-0.5 bg-ui-text rounded-full" />
                  <span className="block w-6 h-0.5 bg-ui-text rounded-full" />
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-grow animate-in fade-in duration-500">{children}</main>

        <footer className="py-12 border-t border-ui-border/50 text-center text-sm text-ui-muted">
          <div className="container mx-auto px-4 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4">
            <span>InspectHero © {currentYear} — {footerTagline}</span>
            <span className="hidden sm:inline text-ui-border/30">|</span>
            <button
              onClick={() => setShowPrivacyModal(true)}
              className="hover:text-ui-accent transition-colors duration-300 font-semibold underline decoration-dotted underline-offset-4"
            >
              {t("footer", "privacyPolicy", "Polityka Prywatności")}
            </button>
          </div>
        </footer>
      </div>

      {/* ── MOBILE MENU DRAWER ── */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-[20000] lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        >
          {/* Dark background */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

          {/* Side drawer */}
          <div
            className="absolute top-0 right-0 h-full w-[80vw] max-w-xs bg-ui-nav-bg border-l border-ui-border shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-ui-border">
              <img
                src="/inspecthero-logo.png"
                alt="logo"
                className="h-10 w-auto brightness-0 invert grayscale"
              />
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="text-ui-muted hover:text-ui-text text-2xl leading-none"
                aria-label="Zamknij menu"
              >
                ✕
              </button>
            </div>

            {/* Nav links */}
            {currentUserId && (
              <nav className="flex flex-col gap-1 px-4 pt-4 flex-grow overflow-y-auto">
                {navLinks.map((link) => (
                  <Link
                    key={`mob-${link.href}`}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`px-4 py-3 rounded-lg text-[13px] font-black uppercase tracking-[0.2em] transition-all ${pathname === link.href
                      ? "bg-ui-accent/15 text-ui-accent"
                      : "text-ui-muted hover:bg-white/5 hover:text-ui-text"
                      }`}
                  >
                    {link.label}
                  </Link>
                ))}

                {isAdmin && adminLinks.length > 0 && (
                  <>
                    <div className="my-3 border-t border-ui-border" />
                    <p className="px-4 pb-1 text-[10px] font-black uppercase tracking-widest text-ui-muted/50">Admin</p>
                    {adminLinks.map((link) => (
                      <Link
                        key={`mob-admin-${link.href}`}
                        href={link.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`px-4 py-3 rounded-lg text-[13px] font-black uppercase tracking-[0.2em] transition-all ${pathname === link.href
                          ? "bg-ui-accent/15 text-ui-accent"
                          : "text-ui-muted hover:bg-white/5 hover:text-ui-text"
                          }`}
                      >
                        {link.label}
                      </Link>
                    ))}
                      <button
                        onClick={() => {
                          setMobileMenuOpen(false);
                          setIsAIAssistantOpen(true);
                        }}
                        className="mx-4 my-2 p-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-[13px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 shadow-lg active:scale-95"
                      >
                        <Sparkles className="w-5 h-5 text-white" />
                        AI Assistant
                      </button>

                  </>
                )}
              </nav>
            )}

            {/* Drawer footer: theme + lang + logout */}
            <div className="flex items-center justify-center gap-3 px-6 py-5 border-t border-ui-border">
              <ThemeSwitcher />
              <LanguageSwitcher />
              <LogoutButton className="p-2 rounded-full hover:bg-white/5 transition-colors" />
            </div>
          </div>
        </div>
      )}

      {/* ── GLOBAL Modal: choose project + plan then go to plan page ── */}
      {showGlobalModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10001,
            background: "rgba(0,0,0,0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backdropFilter: "blur(8px)",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowGlobalModal(false); }}
        >
          <div
            style={{
              background: "var(--ui-card, #1a1a2e)",
              borderRadius: 24,
              padding: 32,
              width: "min(420px, 92vw)",
              display: "grid",
              gap: 24,
              boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
              border: "1px solid var(--ui-border, rgba(255,255,255,0.1))",
            }}
          >
            <h3 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: "var(--ui-text, #fff)" }}>
              {isQuestionMode
                ? t("home", "newQuestion", "Nowe pytanie")
                : t("taskDrawer", "newTask", "Nowe zadanie")}
            </h3>

            <label style={{ display: "grid", gap: 8, fontSize: 12, fontWeight: 700, color: "var(--ui-muted, #888)" }}>
              {t("home", "selectProject", "Wybierz projekt")}
              <select
                value={projectId}
                onChange={(e) => { setProjectId(e.target.value); }}
                style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid var(--ui-border, rgba(255,255,255,0.1))", background: "var(--ui-bg, #000)", color: "var(--ui-text, #fff)", fontSize: 14, fontWeight: 600 }}
              >
                 {projects.map((p) => <option key={p.id} value={p.id}>{p.companies?.name ? `[${p.companies.name.toUpperCase()}] ` : ""}{p.name}</option>)}
              </select>
            </label>

            <label style={{ display: "grid", gap: 8, fontSize: 12, fontWeight: 700, color: "var(--ui-muted, #888)" }}>
              {t("home", "selectPlan", "Wybierz plan")}
              <select
                value={planId}
                onChange={(e) => setPlanId(e.target.value)}
                disabled={loadingPlans || plans.length === 0}
                style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid var(--ui-border, rgba(255,255,255,0.1))", background: "var(--ui-bg, #000)", color: "var(--ui-text, #fff)", fontSize: 14, fontWeight: 600 }}
              >
                {loadingPlans && <option>{t("common", "loading", "Ładowanie...")}</option>}
                {!loadingPlans && plans.length === 0 && <option>{t("home", "noPlans", "Brak planów")}</option>}
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.floors?.buildings?.name && p.floors?.name
                      ? `${p.floors.buildings.name} - ${p.floors.name}`
                      : p.name || `Plan v${p.version}`}
                  </option>
                ))}
              </select>
            </label>

            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={() => setShowGlobalModal(false)}
                style={{ flex: 1, padding: "12px", borderRadius: 12, border: "1px solid var(--ui-border, rgba(255,255,255,0.1))", background: "transparent", color: "var(--ui-text, #fff)", fontWeight: 800, cursor: "pointer" }}
              >
                {t("common", "cancel", "Anuluj")}
              </button>
              <button
                onClick={() => {
                  if (planId) {
                    setShowGlobalModal(false);
                    window.location.href = `/plan/${planId}${isQuestionMode ? "?isQuestion=true" : ""}`;
                  }
                }}
                disabled={!projectId || !planId}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: 12,
                  border: "none",
                  background: isQuestionMode
                    ? "linear-gradient(135deg,#d946ef,#7c3aed)"
                    : "linear-gradient(135deg,#3b82f6,#2dd4bf)",
                  color: "#fff",
                  fontWeight: 800,
                  cursor: !projectId || !planId ? "not-allowed" : "pointer",
                  opacity: !projectId || !planId ? 0.5 : 1,
                }}
              >
                {t("common", "continue", "Dalej")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRevisionModal && (
        <RevisionModal
          open={showRevisionModal}
          onClose={() => setShowRevisionModal(false)}
        />
      )}
      {showFehlerModal && (
        <FehlerModal
          open={showFehlerModal}
          onClose={() => { setShowFehlerModal(false); setActiveFehler(null); }}
          editItem={activeFehler}
          currentUserId={currentUserId}
          currentUserRole={userRole}
        />
      )}

      {/* High-priority Fehler alert popup for assigned users */}
      <FehlerAlertPopup
        currentUserId={currentUserId}
        onViewFehler={(fehler) => { setActiveFehler(fehler); setShowFehlerModal(true); }}
      />

      <AIAssistant 
        isOpen={isAIAssistantOpen} 
        onClose={() => setIsAIAssistantOpen(false)} 
      />

      <PrivacyModal
        open={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
      />
    </div>
  );
}
