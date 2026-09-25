"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiGet, apiPatch, apiPost, getApiUrl, getToken } from "@/lib/apiClient";
import { supabase } from "@/lib/supabase";
import type { Language } from "@/lib/translations";
import { PWAInstallBanner } from "@/components/PWAInstallBanner";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTaskNumericLabel } from "@/lib/taskNumber";
import { useSync } from "@/hooks/useSync";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";

const AufmassCanvas = dynamic(() => import("@/components/aufmass/AufmassCanvas"), {
  ssr: false,
});

function PendingSyncIndicator() {
  const { pendingCount, isSyncing } = useSync();
  const { t } = useLanguage();

  if (pendingCount === 0 && !isSyncing) return null;

  return (
    <div className="flex items-center gap-3 bg-ui-card backdrop-blur-xl border border-ui-border p-4 rounded-2xl mb-8 shadow-2xl">
      <div className={`w-3 h-3 rounded-full ${isSyncing ? "bg-ui-accent animate-pulse" : "bg-amber-500"}`} />
      <div className="text-[10px] font-black uppercase tracking-widest text-ui-muted">
        {isSyncing
          ? t("home", "syncing", "Syncing data...")
          : t("home", "pendingTasks", `Pending offline tasks: ${pendingCount}`)}
      </div>
    </div>
  );
}

type Plan = {
  id: string;
  name: string;
  floor_id: string;
  version?: number;
  floor?: {
    name: string;
    building?: {
      name: string;
    };
  };
};

type Project = { id: string; name: string; companies?: { name: string } | null };
type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  due_date: string | null;
  assigned_user_id?: string | null;
  plan_id?: string | null;
  x_norm?: number | null;
  y_norm?: number | null;
};

type PlanMeta = {
  tileSize: number;
  minZoom: number;
  maxZoom: number;
  gridW: number;
  gridH: number;
  limits?: Record<string, { maxX: number; maxY: number }>;
};

type User = {
  id: string;
  email: string;
  full_name: string;
  role?: string;
};
type Profile = {
  id: string;
  full_name: string;
  email?: string;
};

type NotificationSettings = {
  notify_on_create: boolean;
  notify_on_status: boolean;
  notify_on_assign: boolean;
};

type TaskThumb = {
  url: string | null;
  thumb_url?: string | null;
  type: "BEFORE" | "AFTER" | null;
  id?: string;
};

const STATUS_COLORS: Record<string, string> = {
  OPEN: "#6b7280", IN_PROGRESS: "#3b82f6", DONE_WAITING_APPROVAL: "#f59e0b", APPROVED: "#22c55e", REJECTED: "#ef4444",
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW: "#22c55e", MEDIUM: "#f59e0b", HIGH: "#ef4444", CRITICAL: "#7c3aed",
};

export default function CompletedClient() {
  const router = useRouter();
  const [priorityFilter, setPriorityFilter] = useState<string | null>(null);
  const [assignedFilter, setAssignedFilter] = useState("");
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [sortBy, setSortBy] = useState("");
  const { t, language } = useLanguage();
  const [user, setUser] = useState<User | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profilesLoaded, setProfilesLoaded] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>({
    notify_on_create: true,
    notify_on_status: true,
    notify_on_assign: true,
  });
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planId, setPlanId] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [thumbByTask, setThumbByTask] = useState<Record<string, TaskThumb>>({});
  const [shapesByPhoto, setShapesByPhoto] = useState<Record<string, any[]>>({});

  const [metaByPlan, setMetaByPlan] = useState<Record<string, PlanMeta | null>>({});
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [activeTab, setActiveTab] = useState<"tasks" | "questions" | "fehlers" | "cables">("tasks");
  const [err, setErr] = useState<string | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [taskTranslationMap, setTaskTranslationMap] = useState<Record<string, string>>({});
  const [taskTranslationLang, setTaskTranslationLang] = useState<Language | null>(null);
  const [taskTranslating, setTaskTranslating] = useState(false);
  const [taskTranslationError, setTaskTranslationError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const handleTaskCreated = () => { loadAll(); };

  useEffect(() => { if (sessionLoaded) getToken().then(setToken); }, [sessionLoaded]);

  const profileById = useMemo(() => {
    const map: Record<string, Profile> = {};
    for (const p of profiles) map[p.id] = p;
    return map;
  }, [profiles]);

  const getTranslatedText = (scope: string, id: string, fallback?: string | null) => {
    if (!id) return fallback ?? "";
    if (taskTranslationLang !== language) return fallback ?? "";
    const key = `${scope}:${id}`;
    const candidate = taskTranslationMap[key];
    if (!candidate) return fallback ?? "";
    const trimmed = candidate.trim();
    return trimmed.length > 0 ? trimmed : fallback ?? "";
  };

  function fixStorageUrl(u: string) {
    if (!u) return u;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (supabaseUrl) return u.replace(/^https?:\/\/[^/]+(?::\d+)?(?=\/storage\/v1)/i, supabaseUrl);
    if (typeof window === "undefined") return u;
    const host = window.location.hostname;
    const proto = window.location.protocol;
    return u.replace(/^http:\/\/[^/]+:54321/i, `${proto}//${host}`);
  }

  type TaskPhotoRow = { id: string; url?: string | null; photo_type?: "BEFORE" | "AFTER" | null };

  const loadThumb = useCallback(async (taskId: string) => {
    try {
      const fetchPhotos = async (phase?: "AFTER" | "BEFORE") => {
        const phaseParam = phase ? `&phase=${phase}` : "";
        return apiGet<TaskPhotoRow[]>(`/api/task-photos?taskId=${encodeURIComponent(taskId)}${phaseParam}&limit=1`);
      };
      let photos = await fetchPhotos("AFTER");
      if (!Array.isArray(photos) || photos.length === 0) photos = await fetchPhotos();
      const selected = Array.isArray(photos) && photos.length > 0 ? photos[0] : null;
      const raw = selected?.url ?? null;
      const fixed = raw ? fixStorageUrl(raw) : null;
      const phase = selected?.photo_type ?? null;
      setThumbByTask((prev) => ({ ...prev, [taskId]: { url: fixed, type: phase } }));
    } catch (loadErr) {
      console.warn("[completed] loadThumb failed", loadErr);
      setThumbByTask((prev) => ({ ...prev, [taskId]: { url: null, type: null } }));
    }
  }, []);

  async function loadPlanMeta(planId: string) {
    try {
      const token = await getToken();
      const headers: HeadersInit = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const r = await fetch(getApiUrl(`/api/tiles/${encodeURIComponent(planId)}/meta`), { cache: "no-store", headers });
      if (!r.ok) { setMetaByPlan((prev) => ({ ...prev, [planId]: null })); return; }
      const meta = (await r.json()) as PlanMeta;
      setMetaByPlan((prev) => ({ ...prev, [planId]: meta }));
    } catch { setMetaByPlan((prev) => ({ ...prev, [planId]: null })); }
  }

  useEffect(() => {
    async function checkSession() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error || !data?.session) { router.push("/auth/login"); return; }
        let j: any;
        try { j = await apiGet<any>('/api/me'); } catch (err) { throw new Error("Profile load failed"); }
        if (j.profile?.role?.toUpperCase() !== "ADMIN") { router.push("/"); return; }
        setUser(j.profile);
        setSessionLoaded(true);
      } catch (e) { console.error("Session check failed:", e); router.push("/auth/login"); }
    }
    checkSession();
  }, [router]);

  async function loadAll() {
    if (loading) return;
    setErr(null); setLoading(true);
    try {
      const ps = await apiGet<Project[]>("/api/projects");
      setProjects(ps);
      const saved = typeof window !== 'undefined' ? localStorage.getItem('selectedProjectId') : null;
      const pid = projectId || (saved && ps.find(p => p.id === saved)?.id) || ps[0]?.id;
      if (!pid) return;
      setProjectId(pid);
      const statusQ = `&status=APPROVED`; // Lock to APPROVED
      const isQuestionQ = activeTab === "questions" ? "&is_question=true" : "&is_question=false";
      const priorityQ = priorityFilter ? `&priority=${priorityFilter}` : "";
      const assignedQ = assignedFilter ? `&assigned_user_id=${encodeURIComponent(assignedFilter)}` : "";
      const dueFromQ = dueFrom ? `&due_from=${encodeURIComponent(dueFrom)}` : "";
      const dueToQ = dueTo ? `&due_to=${encodeURIComponent(dueTo)}` : "";
      const sortQ = sortBy ? `&sort=${encodeURIComponent(sortBy)}` : "";
      const qQ = qDebounced ? `&q=${encodeURIComponent(qDebounced)}` : "";
      const planQ = planId ? `&planId=${encodeURIComponent(planId)}` : "";
      const ts = await apiGet<Task[]>(`/api/tasks?projectId=${encodeURIComponent(pid)}&limit=${limit}&offset=${offset}${statusQ}${isQuestionQ}${priorityQ}${assignedQ}${dueFromQ}${dueToQ}${sortQ}${qQ}${planQ}`);
      if (offset === 0) setTasks(ts);
      else setTasks(prev => [...prev, ...ts]);
      setHasMore(ts.length === limit);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }

  useEffect(() => {
    if (!sessionLoaded) return;
    loadAll().catch((e) => setErr(String(e?.message || e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit, offset, activeTab, priorityFilter, assignedFilter, dueFrom, dueTo, sortBy, projectId, planId, qDebounced, sessionLoaded]);

  useEffect(() => {
    if (!projectId) {
      setPlans([]);
      if (planId) { setPlanId(""); setOffset(0); }
      return;
    }
    apiGet<any>(`/api/plans?projectId=${projectId}`).then(res => {
      const fetchedPlans = res.data || res || [];
      setPlans(fetchedPlans);
      if (planId && !fetchedPlans.find((p: any) => p.id === planId)) {
        setPlanId("");
        setOffset(0);
      }
    }).catch(console.error);
  }, [projectId]);

  useEffect(() => {
    if (!sessionLoaded || profilesLoaded) return;
    apiGet<Profile[]>("/api/profiles?limit=1000").then((data) => setProfiles(data || [])).finally(() => setProfilesLoaded(true));
  }, [sessionLoaded, profilesLoaded]);

  useEffect(() => {
    if (!sessionLoaded || settingsLoaded) return;
    apiGet<NotificationSettings>("/api/notification-settings").then((data) => { if (data) setNotificationSettings(data); }).catch(() => { }).finally(() => setSettingsLoaded(true));
  }, [sessionLoaded, settingsLoaded]);

  useEffect(() => {
    if (!user?.id || (user.role || "").toUpperCase() === "ADMIN") return;
    setAssignedFilter((prev) => (prev === user.id ? prev : user.id));
  }, [user]);

  useEffect(() => {
    if (!tasks.length) { setTaskTranslationMap({}); setTaskTranslationLang(language); setTaskTranslationError(null); setTaskTranslating(false); return; }
    const items: { key: string; text: string }[] = [];
    tasks.forEach((task) => {
      const title = task.title?.trim(); if (title) items.push({ key: `task.title:${task.id}`, text: title });
      const description = task.description?.trim(); if (description) items.push({ key: `task.description:${task.id}`, text: description });
    });
    if (items.length === 0) { setTaskTranslationMap({}); setTaskTranslationLang(language); setTaskTranslationError(null); setTaskTranslating(false); return; }
    let alive = true; setTaskTranslating(true); setTaskTranslationError(null);
    apiPost<{ translations: string[] }>("/api/translate", { targetLang: language, texts: items.map((item) => item.text) })
      .then((payload) => {
        if (!alive) return;
        const next: Record<string, string> = {};
        (payload.translations || []).forEach((value, idx) => { const key = items[idx]?.key; if (key && typeof value === "string") next[key] = value; });
        setTaskTranslationMap(next); setTaskTranslationLang(language);
      })
      .catch((err: any) => { if (alive) setTaskTranslationError(err?.message || String(err)); })
      .finally(() => { if (alive) setTaskTranslating(false); });
    return () => { alive = false; };
  }, [tasks, language]);

  async function saveNotificationSettings(next: NotificationSettings) {
    setSettingsSaving(true); setSettingsError(null);
    try { await apiPost<NotificationSettings>("/api/notification-settings", next); }
    catch (e: unknown) { setSettingsError(e instanceof Error ? e.message : String(e)); }
    finally { setSettingsSaving(false); }
  }

  useEffect(() => {
    const t = setTimeout(() => { setQDebounced(q); setOffset(0); }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const missingPhotos = tasks.filter((task) => !Object.prototype.hasOwnProperty.call(thumbByTask, task.id));
    if (missingPhotos.length > 0) {
      const nextThumbs = { ...thumbByTask };
      missingPhotos.forEach(t => nextThumbs[t.id] = { url: null, type: null });
      setThumbByTask(nextThumbs);
      const params = new URLSearchParams();
      missingPhotos.forEach((t) => params.append("taskIds", t.id));
      params.append("phases", "BEFORE"); params.append("phases", "AFTER"); params.append("limit", "1");
      apiGet<any[]>(`/api/task-photos/batch?${params.toString()}`).then((photos) => {
        const fetchedThumbs = { ...nextThumbs };
        const photoMap: Record<string, any> = {};
        for (const p of photos) {
          if (!photoMap[p.task_id]) photoMap[p.task_id] = {};
          if (!photoMap[p.task_id][p.photo_type]) photoMap[p.task_id][p.photo_type] = p;
        }
        missingPhotos.forEach((t) => {
          const after = photoMap[t.id]?.AFTER; const before = photoMap[t.id]?.BEFORE;
          const selected = after || before;
          if (selected) fetchedThumbs[t.id] = { url: selected.url ? fixStorageUrl(selected.url) : null, type: selected.photo_type, id: selected.id };
        });
        setThumbByTask(fetchedThumbs);
      }).catch((err) => console.warn("[completed] Batch photo fetch failed", err));
    }
    const planIds = new Set(tasks.map((task) => task.plan_id).filter((id): id is string => typeof id === "string" && id.length > 0));
    const missingPlans = Array.from(planIds).filter((planId) => !Object.prototype.hasOwnProperty.call(metaByPlan, planId));
    if (missingPlans.length > 0) {
      setMetaByPlan((prev) => { const next = { ...prev }; missingPlans.forEach(id => next[id] = null); return next; });
      missingPlans.forEach(planId => loadPlanMeta(planId).catch(() => { }));
    }
  }, [tasks, thumbByTask, metaByPlan, loadThumb]);

  useEffect(() => {
    function handlePhotoAdded(event: Event) { const detail = (event as CustomEvent)?.detail; const taskId = detail?.taskId; if (taskId) loadThumb(taskId).catch(() => { }); }
    window.addEventListener("task-photo-added", handlePhotoAdded as EventListener);
    window.addEventListener("task-created", handleTaskCreated as EventListener);
    return () => {
      window.removeEventListener("task-photo-added", handlePhotoAdded as EventListener);
      window.removeEventListener("task-created", handleTaskCreated as EventListener);
    };
  }, [loadThumb]);
  useEffect(() => {
    if (!projectId || tasks.length === 0) return;
    
    let active = true;
    (async () => {
      try {
        const sessions = await apiGet<any[]>(`/api/aufmass/sessions?projectId=${projectId}`);
        if (!active) return;
        if (sessions && Array.isArray(sessions)) {
          const relevantSessions = sessions.filter(s => s.photo_id && tasks.some(t => t.id === s.task_id));
          const shapesMap: Record<string, any[]> = {};
          await Promise.all(
            relevantSessions.map(async (sess) => {
              try {
                const res = await apiGet<any>(`/api/aufmass/versions?sessionId=${sess.id}&photoId=${sess.photo_id}`);
                const versions = res.data || res;
                if (versions && versions.length > 0) {
                  shapesMap[sess.photo_id] = versions[0].data || [];
                }
              } catch (e) {
                console.error("Failed to load version for session", sess.id, e);
              }
            })
          );
          if (active) {
            setShapesByPhoto(shapesMap);
          }
        }
      } catch (e) {
        console.error("Failed to load aufmass sessions in CompletedClient:", e);
      }
    })();
    return () => {
      active = false;
    };
  }, [projectId, tasks]);
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => { if (entries[0].isIntersecting && !loading && hasMore) setOffset((prev) => prev + limit); }, { threshold: 0.1 });
    if (sentinelRef.current) observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [loading, hasMore, limit]);

  function getTileUrl(task: Task) {
    if (!task.plan_id) return null;
    const meta = metaByPlan[task.plan_id]; if (!meta) return null;
    const xNorm = typeof task.x_norm === "number" ? task.x_norm : Number(task.x_norm);
    const yNorm = typeof task.y_norm === "number" ? task.y_norm : Number(task.y_norm);
    if (!Number.isFinite(xNorm) || !Number.isFinite(yNorm)) return null;
    const zoomKey = String(meta.maxZoom);
    const maxX = meta.limits?.[zoomKey]?.maxX ?? meta.gridW - 1;
    const maxY = meta.limits?.[zoomKey]?.maxY ?? meta.gridH - 1;
    const x = Math.min(Math.max(0, Math.floor(xNorm * (maxX + 1))), maxX);
    const y = Math.min(Math.max(0, Math.floor(yNorm * (maxY + 1))), maxY);
    return getApiUrl(`/api/tiles/${task.plan_id}/${meta.maxZoom}/${x}/${y}.png` + (token ? `?token=${token}` : ""));
  }

  if (!sessionLoaded || !user) {
    return (
      <div className="min-h-screen bg-ui-bg flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-ui-border border-t-ui-accent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      className="min-h-screen bg-transparent text-ui-text selection:bg-ui-accent/30 overflow-x-hidden pb-20"
    >
      <PWAInstallBanner />

      {/* Ambient Background Glows */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-ui-accent/5 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-ui-accent/5 blur-[120px] rounded-full"></div>
        <div className="absolute inset-0 opacity-[0.02]" style={{ backgroundImage: "radial-gradient(var(--ui-text) 1px, transparent 0)", backgroundSize: "40px 40px" }}></div>
      </div>

      <div className="relative z-10 container mx-auto px-6 py-12 max-w-[1600px]">
        {/* Header Card */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-12 gap-8 bg-ui-card backdrop-blur-3xl border border-ui-border p-10 lg:p-14 rounded-2xl shadow-2xl shadow-black/50">
          <div>
            <h1 className="text-4xl lg:text-5xl font-black tracking-tighter text-ui-text uppercase leading-none">
              {t("home", "completedTasksTitle", "FERTIGE ARBEITEN")}
            </h1>
            <p className="text-ui-muted text-xs mt-4 uppercase font-bold tracking-[0.3em]">
              {t("home", "completedTasksSubtitle", "Lista wykonanych prac i usterek")}
            </p>
          </div>

          <div className="flex bg-black/40 p-2 rounded-2xl border border-ui-border backdrop-blur-xl gap-2 overflow-x-auto max-w-full no-scrollbar">
            {[
              { id: "tasks", label: t("home", "tabTasks", "Zadania"), icon: "✅" },
              { id: "questions", label: t("home", "tabQuestions", "Pytania"), icon: "❓" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id as any); setOffset(0); }}
                className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-300 flex items-center gap-2 whitespace-nowrap ${
                  activeTab === tab.id 
                  ? "bg-ui-accent text-slate-950 shadow-[0_0_20px_var(--ui-glow)]" 
                  : "text-ui-muted hover:text-ui-text hover:bg-white/5"
                }`}
              >
                <span className="text-sm">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
          {/* Sidebar / Filters */}
          <div className="xl:col-span-4 space-y-8">
            <PendingSyncIndicator />

            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-ui-card backdrop-blur-3xl border border-ui-border rounded-2xl p-10 space-y-8 shadow-2xl"
            >
              <div className="space-y-6">
                <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-ui-accent/80 mb-2">{t("reports", "filters", "ARCHIV FILTRIEREN")}</h2>
                
                {/* Project Selector */}
                <div className="space-y-3">
                  <label className="text-[9px] font-black text-ui-muted uppercase tracking-widest ml-1">{t("home", "selectProject", "PROJEKT")}</label>
                  <div className="relative">
                    <select
                      value={projectId}
                      onChange={(e) => {
                        setProjectId(e.target.value);
                        if (typeof window !== 'undefined') localStorage.setItem('selectedProjectId', e.target.value);
                        setOffset(0);
                      }}
                      className="w-full bg-black/40 border border-ui-border rounded-2xl px-6 py-4 text-xs font-bold outline-none appearance-none cursor-pointer focus:border-ui-accent/50 transition-all"
                      style={{ color: "white" }}
                    >
                      {projects.map((p) => (
                        <option key={p.id} value={p.id} style={{ color: "white", backgroundColor: "#0f172a" }}>{p.companies?.name ? `[${p.companies.name.toUpperCase()}] ` : ""}{p.name}</option>
                      ))}
                    </select>
                    <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-ui-muted">▼</div>
                  </div>
                </div>

                {/* Plan Selector */}
                <div className="space-y-3">
                  <label className="text-[9px] font-black text-ui-muted uppercase tracking-widest ml-1">{t("home", "selectPlan", "PLAN")}</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <select
                        value={planId}
                        onChange={(e) => {
                          setPlanId(e.target.value);
                          setOffset(0);
                        }}
                        disabled={!projectId}
                        className="w-full bg-black/40 border border-ui-border rounded-2xl px-6 py-4 text-xs font-bold outline-none appearance-none cursor-pointer focus:border-ui-accent/50 transition-all disabled:opacity-50"
                        style={{ color: "white" }}
                      >
                        <option value="" style={{ color: "white", backgroundColor: "#0f172a" }}>{t("common", "all", "Wszystkie")}</option>
                        {plans.map((p) => (
                          <option key={p.id} value={p.id} style={{ color: "white", backgroundColor: "#0f172a" }}>
                            {(p as any).floors?.buildings?.name ? `${(p as any).floors.buildings.name} — ` : ''}{(p as any).floors?.name || p.name || `Plan ${p.id.slice(0,4)}`}
                          </option>
                        ))}
                      </select>
                      <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-ui-muted">▼</div>
                    </div>
                    {planId && (
                      <button
                        onClick={() => router.push(`/plan/${planId}?showCompleted=true`)}
                        className="bg-ui-accent text-slate-950 font-black uppercase tracking-widest text-[9px] px-6 rounded-2xl shadow-lg hover:brightness-110 transition-all whitespace-nowrap"
                      >
                        {t("common", "openPlan", "Otwórz plan")}
                      </button>
                    )}
                  </div>
                </div>

                {/* Search */}
                <div className="space-y-3">
                  <label className="text-[9px] font-black text-ui-muted uppercase tracking-widest ml-1">{t("common", "search", "SUCHE")}</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder={t("home", "search", "Wyszukaj...")}
                      className="w-full bg-black/40 border border-ui-border rounded-2xl px-6 py-4 text-xs font-bold outline-none focus:border-ui-accent/50 transition-all"
                      style={{ color: "white" }}
                    />
                    <span className="absolute right-6 top-1/2 -translate-y-1/2 text-ui-muted">🔍</span>
                  </div>
                </div>

                {/* Priority Selector */}
                <div className="space-y-3">
                  <label className="text-[9px] font-black text-ui-muted uppercase tracking-widest ml-1">{t("home", "filterPriority", "PRIORYTET")}</label>
                  <div className="relative">
                    <select
                      value={priorityFilter || ""}
                      onChange={(e) => { setPriorityFilter(e.target.value || null); setOffset(0); }}
                      className="w-full bg-black/40 border border-ui-border rounded-2xl px-6 py-4 text-xs font-bold outline-none appearance-none cursor-pointer focus:border-ui-accent/50 transition-all"
                      style={{ color: "white" }}
                    >
                      <option value="" style={{ color: "white", backgroundColor: "#0f172a" }}>{t("taskStatus", "ALL", "Wszystkie")}</option>
                      <option value="LOW" style={{ color: "white", backgroundColor: "#0f172a" }}>{t("taskPriority", "LOW", "Niski")}</option>
                      <option value="MEDIUM" style={{ color: "white", backgroundColor: "#0f172a" }}>{t("taskPriority", "MEDIUM", "Średni")}</option>
                      <option value="HIGH" style={{ color: "white", backgroundColor: "#0f172a" }}>{t("taskPriority", "HIGH", "Wysoki")}</option>
                      <option value="CRITICAL" style={{ color: "white", backgroundColor: "#0f172a" }}>{t("taskPriority", "CRITICAL", "Krytyczny")}</option>
                    </select>
                    <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-ui-muted">▼</div>
                  </div>
                </div>

                {/* Assignee Selector */}
                {(user?.role || "").toUpperCase() === "ADMIN" && (
                  <div className="space-y-3">
                    <label className="text-[9px] font-black text-ui-muted uppercase tracking-widest ml-1">{t("home", "filterAssignee", "VERANTWORTLICHER")}</label>
                    <div className="relative">
                      <select
                        value={assignedFilter}
                        onChange={(e) => { setAssignedFilter(e.target.value); setOffset(0); }}
                        className="w-full bg-black/40 border border-ui-border rounded-2xl px-6 py-4 text-xs font-bold outline-none appearance-none cursor-pointer focus:border-ui-accent/50 transition-all"
                        style={{ color: "white" }}
                      >
                        <option value="" style={{ color: "white", backgroundColor: "#0f172a" }}>{t("taskStatus", "ALL", "Alle")}</option>
                        {profiles.map((p) => (
                          <option key={p.id} value={p.id} style={{ color: "white", backgroundColor: "#0f172a" }}>
                            {p.full_name || p.email || p.id.slice(0, 8)}
                          </option>
                        ))}
                      </select>
                      <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-ui-muted">▼</div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>

          {/* Main Content Area */}
          <div className="xl:col-span-8 space-y-8">
            {err && (
              <div className="bg-red-500/10 border border-red-500/30 p-6 rounded-2xl text-red-400 text-xs font-bold uppercase tracking-widest flex items-center gap-4">
                <span>⚠️</span> {err}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {tasks.length === 0 ? (
                <div className="col-span-full py-40 text-center bg-ui-card/40 rounded-2xl border border-ui-border border-dashed">
                  <div className="w-20 h-20 bg-ui-card rounded-full flex items-center justify-center text-4xl mx-auto mb-8 opacity-20">📂</div>
                  <p className="text-[10px] font-black uppercase tracking-[0.4em] text-ui-muted">{t("common", "noData", "Brak zakończonych zadań")}</p>
                </div>
              ) : (
                tasks.map((task) => {
                  const thumb = thumbByTask[task.id];
                  const thumbUrl = thumb?.thumb_url || thumb?.url || null;
                  const tileUrl = getTileUrl(task);
                  const translatedTitle = getTranslatedText("task.title", task.id, task.title);

                  return (
                    <motion.div
                      key={task.id}
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-ui-card backdrop-blur-3xl border border-ui-border rounded-2xl overflow-hidden flex flex-col group hover:border-ui-accent/30 transition-all duration-500 shadow-xl"
                    >
                      <div className="relative h-56 overflow-hidden cursor-pointer" onClick={() => router.push(`/task/${task.id}`)}>
                        {thumbUrl ? (
                          thumb.id && shapesByPhoto[thumb.id] && shapesByPhoto[thumb.id].length > 0 ? (
                            <div className="w-full h-full pointer-events-none absolute inset-0">
                              <AufmassCanvas
                                imageUrl={getApiUrl(thumbUrl)}
                                shapes={shapesByPhoto[thumb.id]}
                                readOnly={true}
                              />
                            </div>
                          ) : (
                            <img src={getApiUrl(thumbUrl)} alt="task" className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700 group-hover:scale-110" />
                          )
                        ) : (
                          <div className="w-full h-full bg-black/40 flex flex-col items-center justify-center gap-3">
                            <span className="text-4xl opacity-10">📷</span>
                            <span className="text-[8px] font-black uppercase tracking-widest text-slate-600">{t("home", "noPhoto")}</span>
                          </div>
                        )}
                        <div className="absolute top-6 right-6 flex flex-col gap-2">
                          <span className="px-4 py-2 rounded-xl bg-ui-accent text-slate-950 text-[9px] font-black uppercase tracking-widest shadow-lg shadow-ui-accent/20">
                            #{getTaskNumericLabel(task.id)}
                          </span>
                        </div>
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-8">
                          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white flex items-center gap-2">
                            {t("common", "edit", "DETAILS ANSEHEN")} ➜
                          </span>
                        </div>
                      </div>

                      <div className="p-10 flex-1 flex flex-col gap-6">
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full" style={{ background: PRIORITY_COLORS[task.priority] }} />
                            <span className="text-[9px] font-black uppercase tracking-widest text-ui-muted">{t("taskPriority", task.priority, task.priority)}</span>
                          </div>
                          <h3 className="text-xl font-black text-ui-text uppercase leading-snug tracking-tight line-clamp-2">{translatedTitle || task.title}</h3>
                        </div>

                        <div className="flex items-center justify-between pt-6 border-t border-ui-border/50 mt-auto">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-ui-card flex items-center justify-center text-[10px] font-black border border-ui-border text-ui-muted">
                              {profileById[task.assigned_user_id || ""]?.full_name?.[0] || "?"}
                            </div>
                            <span className="text-[9px] font-black text-ui-muted uppercase tracking-widest">
                              {profileById[task.assigned_user_id || ""]?.full_name || "—"}
                            </span>
                          </div>
                          <span className="text-[9px] font-mono text-ui-muted uppercase">
                            {task.due_date ? new Date(task.due_date).toLocaleDateString() : "—"}
                          </span>
                        </div>

                        <div className="flex gap-3 pt-4">
                           <button 
                            onClick={() => {
                              if (task.plan_id) router.push(`/plan/${task.plan_id}?taskId=${task.id}&showCompleted=true`);
                              else router.push(`/task/${task.id}`);
                            }}
                            className="flex-1 py-4 rounded-2xl bg-slate-800/50 text-slate-400 border border-slate-700/50 text-[9px] font-black uppercase tracking-widest hover:bg-slate-700 hover:text-white transition-all flex items-center justify-center gap-2"
                           >
                             📍 {t("home", "openMap", "Auf Karte zeigen")}
                           </button>
                           <button 
                            onClick={() => router.push(`/task/${task.id}`)}
                            className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all"
                           >
                             👁️
                           </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>

            {/* Sentinel for Infinite Scroll */}
            <div ref={sentinelRef} className="h-20 w-full flex items-center justify-center">
              {loading && <div className="w-6 h-6 border-2 border-ui-border border-t-ui-accent rounded-full animate-spin"></div>}
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </motion.div>
  );
}
