"use client";
import React, { useMemo, useState, useEffect, useRef } from "react";
import { useNotification } from "@/contexts/NotificationContext";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
import { Et4uLogo } from "@/components/Et4uLogo";


import { supabase } from "@/lib/supabase";
import { apiGet } from "@/lib/apiClient";

export default function UnifiedLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
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
  const footerOwner = t("footer", "owner", "Owner: Marcin Slapinski");
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
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
        setAdminDropdownOpen(false);
        setMainDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside as EventListener);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside as EventListener);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Close mobile menu on pathname changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

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
      { href: "/cables", label: t("nav", "cables", "Kable") },
      { href: "/stromkreise", label: t("nav", "stromkreise", "Stromkreise") },
      { href: "/uv-plans", label: t("nav", "uvPlans", "Stromkreise von UV-Plan") },
      { href: "/bma-automation", label: t("bmaAutomation", "title", "BMA Automatyka") },
      { href: "/maengelanzeige", label: t("nav", "maengelanzeige", "Mängelanzeige") },
    ];

    if (isAdmin) {
      base.push({ href: "/charger-install", label: t("nav", "chargerInstall", "Instalacja Ładowarek") });
      base.push({ href: "/automation", label: t("nav", "automation", "Automatyka kabli") });
      base.push({ href: "/pdf-editor", label: "Narzędzie PDF" });
    }

    if (isAdmin || userHasVdeAccess) {
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
      { href: "/admin/symbol-annotator", label: "⚡ YOLO Annotator" },
      { href: "/admin/symbol-detection", label: "🔍 Symbol Detection" },
      { href: "/documentation", label: `📸 ${t("nav", "documentation", "Foto-Dokumentation")}` },
      { href: "/maengelanzeige", label: "📑 Mängelanzeige" },
      { href: "/progress", label: t("nav", "progress", "📈 Projektfortschritt") },
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
        <header className="sticky top-0 z-[100000] w-full bg-ui-nav-bg/95 backdrop-blur-[40px] border-b border-[var(--ui-border)] shadow-[0_15px_50px_-10px_rgba(0,0,0,0.7)]">
          <div className="container mx-auto px-3 md:px-8 py-0 h-16 md:h-20 lg:h-24 flex items-center justify-between">

            {/* Logo — left */}
            <div className="flex-shrink-0 flex items-center mr-auto pr-2 lg:pr-8">
              <Link
                href="/"
                className="flex items-center transition-all duration-300 hover:scale-[1.03] active:scale-[0.98] focus:outline-none bg-transparent hover:bg-transparent"
                aria-label="ET4U.DE Home"
              >
                <Et4uLogo size="md" animated />
              </Link>
            </div>

            {/* Right nav & tools */}
            <div className="flex items-center justify-end gap-2 md:gap-6">
              {currentUserId && (
                <nav className="hidden lg:flex items-center gap-5 xl:gap-7">
                <div className="relative" ref={mainDropdownRef}>
                  <button
                    onClick={() => setMainDropdownOpen((o) => !o)}
                    className={`text-[12px] font-black uppercase tracking-[0.22em] transition-all duration-300 flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${
                      mainDropdownOpen
                        ? "text-ui-accent border-ui-accent/40 bg-ui-accent/10"
                        : "text-ui-muted border-transparent hover:text-ui-text hover:bg-white/5"
                    }`}
                  >
                    Menu
                    <span className={`text-[9px] transition-transform duration-300 ${mainDropdownOpen ? "rotate-180" : ""}`}>▼</span>
                  </button>
                  {mainDropdownOpen && (
                    <div className="absolute top-full left-0 mt-3 w-60 bg-ui-card backdrop-blur-2xl border border-ui-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-[100005]">
                      <div className="flex flex-col py-2">
                        {navLinks.map((link) => (
                          <Link
                            key={`main-nav-${link.href}`}
                            href={link.href}
                            onClick={() => setMainDropdownOpen(false)}
                            className={`px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.18em] transition-all duration-200 ${
                              pathname === link.href
                                ? "bg-ui-accent/15 text-ui-accent border-l-3 border-ui-accent font-black"
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
                      className={`text-[12px] font-black uppercase tracking-[0.22em] transition-all duration-300 flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${
                        adminDropdownOpen
                          ? "text-ui-accent border-ui-accent/40 bg-ui-accent/10"
                          : "text-ui-muted border-transparent hover:text-ui-text hover:bg-white/5"
                      }`}
                    >
                      Admin
                      <span className={`text-[9px] transition-transform duration-300 ${adminDropdownOpen ? "rotate-180" : ""}`}>▼</span>
                    </button>
                    {adminDropdownOpen && (
                      <div className="absolute top-full right-0 mt-3 w-64 bg-ui-card backdrop-blur-2xl border border-ui-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-[100005]">
                        <div className="flex flex-col py-2">
                          {adminLinks.map((link) => (
                            <Link
                              key={`admin-${link.href}`}
                              href={link.href}
                              onClick={() => setAdminDropdownOpen(false)}
                              className={`px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.18em] transition-all duration-200 ${
                                pathname === link.href
                                  ? "bg-ui-accent/15 text-ui-accent border-l-3 border-ui-accent font-black"
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

              <div className="flex items-center gap-1.5 md:gap-3">
                {/* New Task button */}
                {currentUserId && (
                  <>
                    <button
                      className="flex items-center justify-center w-9 h-9 md:w-11 md:h-11 rounded-xl bg-gradient-to-br from-[#FFD000] via-[#F59E0B] to-[#D97706] text-black font-black transition-all hover:scale-110 hover:shadow-[0_0_25px_rgba(255,208,0,0.6)] active:scale-95 border border-white/25 shadow-md group"
                      onClick={() => window.dispatchEvent(new CustomEvent("open-new-task"))}
                      title={t("home", "createNewTask")}
                      aria-label={t("home", "createNewTask")}
                    >
                      <span className="text-base md:text-xl font-extrabold text-black drop-shadow-sm transition-transform group-hover:scale-110">✓</span>
                    </button>

                    {/* New Question button */}
                    <button
                      className="flex items-center justify-center w-9 h-9 md:w-10 md:h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 transition-all hover:scale-110 hover:shadow-[0_0_20px_rgba(99,102,241,0.5)] active:scale-95 border border-white/20 shadow-sm text-white text-sm md:text-base font-bold"
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
                    className="flex items-center justify-center w-9 h-9 md:w-10 md:h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-600 transition-all hover:scale-110 hover:shadow-[0_0_20px_rgba(20,184,166,0.5)] active:scale-95 border border-white/20 shadow-sm text-white text-sm md:text-base font-bold"
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
                    className="flex items-center justify-center w-9 h-9 md:w-10 md:h-10 rounded-xl bg-gradient-to-br from-amber-500 to-rose-600 transition-all hover:scale-110 hover:shadow-[0_0_20px_rgba(244,63,94,0.5)] active:scale-95 border border-white/20 shadow-sm text-white text-sm md:text-base font-bold"
                    onClick={() => window.dispatchEvent(new CustomEvent("open-new-fehler"))}
                    title={t("fehler", "title", "Error")}
                    aria-label={t("fehler", "title", "Error")}
                  >
                    ⚠️
                  </button>
                )}

                <div className="h-6 w-px bg-ui-border/30 hidden md:block" />

                {/* Theme/lang/logout */}
                <div className="hidden md:flex items-center gap-1 md:gap-2">
                  <ThemeSwitcher />
                  <LanguageSwitcher />
                  {isAdmin && (
                    <button
                      className="flex items-center justify-center w-8 h-8 md:w-9 md:h-9 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 transition-all hover:scale-110 hover:shadow-[0_0_20px_rgba(168,85,247,0.4)] active:scale-95 border border-white/10 shadow-sm p-1.5 mx-1 group"
                      onClick={() => setIsAIAssistantOpen(true)}
                      title="AI Assistant"
                    >
                      <Sparkles className="w-4 h-4 md:w-5 md:h-5 text-white drop-shadow-sm" />
                    </button>
                  )}

                  <LogoutButton className="p-1.5 md:p-2 rounded-full hover:bg-white/5 transition-colors" />
                </div>

                {/* Hamburger — mobile only */}
                <button
                  className="lg:hidden flex flex-col justify-center items-center w-10 h-10 rounded-xl gap-[5px] hover:bg-white/5 border border-ui-border/30 transition-colors cursor-pointer"
                  onClick={() => setMobileMenuOpen((o) => !o)}
                  aria-label={mobileMenuOpen ? "Zamknij menu" : "Otwórz menu"}
                  aria-expanded={mobileMenuOpen}
                >
                  <span className="block w-5 h-0.5 bg-ui-text rounded-full" />
                  <span className="block w-5 h-0.5 bg-ui-accent rounded-full" />
                  <span className="block w-5 h-0.5 bg-ui-text rounded-full" />
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-grow pb-20 lg:pb-0 animate-in fade-in duration-500">{children}</main>

        {/* ── MOBILE BOTTOM NAVIGATION BAR (Ergonomic Touch Bar) ── */}
        {currentUserId && (
          <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-[99990] bg-ui-nav-bg/95 backdrop-blur-xl border-t border-ui-border px-2 py-1.5 flex items-center justify-around shadow-[0_-10px_30px_rgba(0,0,0,0.6)]">
            <Link
              href="/"
              className={`flex flex-col items-center justify-center min-w-[56px] min-h-[44px] px-2 py-1 rounded-xl transition-all ${
                pathname === "/" ? "text-ui-accent font-black" : "text-ui-muted hover:text-ui-text font-bold"
              }`}
            >
              <span className="text-base">⚡</span>
              <span className="text-[10px] uppercase tracking-wider">Home</span>
            </Link>
            <Link
              href="/plans"
              onClick={(e) => {
                e.preventDefault();
                if (typeof window !== "undefined") {
                  try {
                    const rawFavs = localStorage.getItem("et4u_favorite_plans");
                    if (rawFavs) {
                      const favs = JSON.parse(rawFavs);
                      if (Array.isArray(favs) && favs.length > 0 && favs[0].id) {
                        router.push(`/plan/${favs[0].id}`);
                        return;
                      }
                    }
                    const lastPlanId = localStorage.getItem("et4u_active_plan_id") || localStorage.getItem("et4u_last_plan_id");
                    if (lastPlanId) {
                      router.push(`/plan/${lastPlanId}`);
                      return;
                    }
                  } catch {}
                }
                router.push("/plans?direct=1");
              }}
              className={`flex flex-col items-center justify-center min-w-[56px] min-h-[44px] px-2 py-1 rounded-xl transition-all ${
                (pathname || "").startsWith("/plans") || (pathname || "").startsWith("/plan/") ? "text-ui-accent font-black" : "text-ui-muted hover:text-ui-text font-bold"
              }`}
            >
              <span className="text-base">🗺️</span>
              <span className="text-[10px] uppercase tracking-wider">Pläne</span>
            </Link>
            <Link
              href="/stromkreise"
              className={`flex flex-col items-center justify-center min-w-[56px] min-h-[44px] px-2 py-1 rounded-xl transition-all ${
                (pathname || "").startsWith("/stromkreise") ? "text-ui-accent font-black" : "text-ui-muted hover:text-ui-text font-bold"
              }`}
            >
              <span className="text-base">⚡</span>
              <span className="text-[10px] uppercase tracking-wider">Stromkreise</span>
            </Link>
            <Link
              href="/cables"
              className={`flex flex-col items-center justify-center min-w-[56px] min-h-[44px] px-2 py-1 rounded-xl transition-all ${
                (pathname || "").startsWith("/cables") ? "text-ui-accent font-black" : "text-ui-muted hover:text-ui-text font-bold"
              }`}
            >
              <span className="text-base">🔌</span>
              <span className="text-[10px] uppercase tracking-wider">Kabel</span>
            </Link>
            <button
              onClick={() => setMobileMenuOpen((o) => !o)}
              className={`flex flex-col items-center justify-center min-w-[56px] min-h-[44px] px-2 py-1 rounded-xl transition-all cursor-pointer ${
                mobileMenuOpen ? "text-ui-accent font-black" : "text-ui-muted hover:text-ui-text font-bold"
              }`}
            >
              <span className="text-base">{mobileMenuOpen ? "✕" : "☰"}</span>
              <span className="text-[10px] uppercase tracking-wider">Menu</span>
            </button>
          </nav>
        )}

        <footer className="py-10 border-t border-ui-border/30 text-center text-sm text-ui-muted bg-ui-bg/50 backdrop-blur-md">
          <div className="container mx-auto px-4 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 flex-wrap">
            <span className="font-medium">ET⚡U.DE © {currentYear} — {footerTagline}</span>
            <span className="hidden sm:inline text-ui-border/40">|</span>
            <span className="font-medium">{footerOwner}</span>
            <span className="hidden sm:inline text-ui-border/40">|</span>
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
          className="fixed inset-0 z-[200000] lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        >
          {/* Dark background */}
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm cursor-pointer" />

          {/* Side drawer */}
          <div
            className="absolute top-0 right-0 h-full w-[85vw] max-w-xs bg-ui-nav-bg border-l border-ui-border shadow-2xl flex flex-col z-[200001]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-ui-border bg-ui-nav-bg shrink-0">
              <Et4uLogo size="sm" animated />
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="text-ui-muted hover:text-ui-text text-xl w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
                aria-label="Zamknij menu"
              >
                ✕
              </button>
            </div>

            {/* Nav links */}
            {currentUserId && (
              <nav className="flex flex-col gap-1 px-4 pt-4 flex-grow overflow-y-auto overscroll-contain">
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
            <div className="flex items-center justify-center gap-3 px-6 py-5 border-t border-ui-border shrink-0">
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
            zIndex: 100050,
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
