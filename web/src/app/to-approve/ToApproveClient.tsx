"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiGet, apiDelete, apiPatch, apiPost, apiCall, getApiUrl, getToken } from "@/lib/apiClient";
import { supabase } from "@/lib/supabase";
import type { Language } from "@/lib/translations";
import { PWAInstallBanner } from "@/components/PWAInstallBanner";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTaskNumericLabel } from "@/lib/taskNumber";
import { useSync } from "@/hooks/useSync";
import { FehlerModal } from "@/components/FehlerModal";
import PhotoLightbox from "@/components/PhotoLightbox";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";

const PlanSnippet = dynamic(() => import("@/components/PlanSnippet"), { ssr: false });

const STATUS_COLORS: Record<string, string> = {
  OPEN: "#6b7280", IN_PROGRESS: "#3b82f6", DONE_WAITING_APPROVAL: "#f59e0b", APPROVED: "#22c55e", REJECTED: "#ef4444",
};
const STATUS_LABELS: Record<string, string> = {
  OPEN: "Offen", IN_PROGRESS: "In Bearb.", DONE_WAITING_APPROVAL: "Zur Genehm.", APPROVED: "Genehmigt", REJECTED: "Abgelehnt",
};
const PRIORITY_COLORS: Record<string, string> = {
  LOW: "#22c55e", MEDIUM: "#f59e0b", HIGH: "#ef4444", CRITICAL: "#7c3aed",
};

function PendingSyncIndicator() {
  const { pendingCount, isSyncing } = useSync();
  const { t } = useLanguage();

  if (pendingCount === 0 && !isSyncing) return null;

  return (
    <div className="flex items-center gap-3 bg-slate-900/60 backdrop-blur-xl border border-slate-700/30 p-4 rounded-2xl mb-8 shadow-2xl">
      <div className={`w-3 h-3 rounded-full ${isSyncing ? "bg-cyan-500 animate-pulse" : "bg-amber-500"}`} />
      <div className="text-[10px] font-black uppercase tracking-widest text-slate-300">
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
};

export default function ToApproveClient() {
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
  const [tasks, setTasks] = useState<Task[]>([]);
  const [questions, setQuestions] = useState<Task[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [fehlers, setFehlers] = useState<any[]>([]);
  const [cables, setCables] = useState<any[]>([]);
  const [editingItems, setEditingItems] = useState<Record<string, any[]>>({});
  const [deletedItems, setDeletedItems] = useState<Record<string, string[]>>({});
  const [materialsSearch, setMaterialsSearch] = useState<Record<string, any[]>>({});
  const [isSearching, setIsSearching] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState<Record<string, string>>({});
  const [customForms, setCustomForms] = useState<Record<string, boolean>>({});
  const [savingOrderId, setSavingOrderId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"tasks" | "orders" | "questions" | "fehlers" | "cables">("tasks");
  const [thumbByTask, setThumbByTask] = useState<Record<string, TaskThumb>>({});

  const [isFehlerModalOpen, setIsFehlerModalOpen] = useState(false);
  const [editFehlerItem, setEditFehlerItem] = useState<any | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [deletingFehler, setDeletingFehler] = useState<string | null>(null);

  const [metaByPlan, setMetaByPlan] = useState<Record<string, PlanMeta | null>>({});
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function searchMaterialsForOrder(orderId: string, query: string) {
    if (query.trim().length < 2) {
      setMaterialsSearch(prev => ({ ...prev, [orderId]: [] }));
      return;
    }
    setIsSearching(prev => ({ ...prev, [orderId]: true }));
    try {
      const tokenStr = await getToken();
      const response = await apiGet(`/api/materials?search=${encodeURIComponent(query)}`, tokenStr!) as any;
      const results = response && response.items ? response.items : (Array.isArray(response) ? response : []);
      setMaterialsSearch(prev => {
        const next = { ...prev };
        next[orderId] = results;
        return next;
      });
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearching(prev => ({ ...prev, [orderId]: false }));
    }
  }
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [taskTranslationMap, setTaskTranslationMap] = useState<Record<string, string>>({});
  const [taskTranslationLang, setTaskTranslationLang] = useState<Language | null>(null);
  const [taskTranslating, setTaskTranslating] = useState(false);
  const [taskTranslationError, setTaskTranslationError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const handleTaskCreated = () => {
    loadAll(); // Reload tasks list
  };

  useEffect(() => {
    if (sessionLoaded) {
      getToken().then(setToken);
    }
  }, [sessionLoaded]);

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
    if (supabaseUrl) {
      return u.replace(/^https?:\/\/[^/]+(?::\d+)?(?=\/storage\/v1)/i, supabaseUrl);
    }
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
        return apiGet<TaskPhotoRow[]>(`/api/task-photos?taskId=${encodeURIComponent(taskId)}${phaseParam}&limit=1`
        );
      };

      let photos = await fetchPhotos("AFTER");
      if (!Array.isArray(photos) || photos.length === 0) {
        photos = await fetchPhotos();
      }

      const selected = Array.isArray(photos) && photos.length > 0 ? photos[0] : null;
      const raw = selected?.url ?? null;
      const fixed = raw ? fixStorageUrl(raw) : null;
      const phase = selected?.photo_type ?? null;
      setThumbByTask((prev) => ({ ...prev, [taskId]: { url: fixed, type: phase } }));
    } catch (loadErr) {
      console.warn("[home] loadThumb failed", loadErr);
      setThumbByTask((prev) => ({ ...prev, [taskId]: { url: null, type: null } }));
    }
  }, []);

  async function loadPlanMeta(planId: string) {
    try {
      const token = await getToken();
      const headers: HeadersInit = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const r = await fetch(getApiUrl(`/api/tiles/${encodeURIComponent(planId)}/meta`), {
        cache: "no-store",
        headers,
      });

      if (!r.ok) {
        setMetaByPlan((prev) => ({ ...prev, [planId]: null }));
        return;
      }
      const meta = (await r.json()) as PlanMeta;
      setMetaByPlan((prev) => ({ ...prev, [planId]: meta }));
    } catch {
      setMetaByPlan((prev) => ({ ...prev, [planId]: null }));
    }
  }

  // Check session on mount
  useEffect(() => {
    async function checkSession() {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (error || !data?.session) {
          router.push("/auth/login");
          return;
        }

        // Get user profile
        let j: any;
        try {
          j = await apiGet<any>('/api/me');
        } catch (err) {
          throw new Error("Profile load failed");
        }

        if (j.profile?.role?.toUpperCase() !== "ADMIN") {
          router.push("/");
          return;
        }

        setUser(j.profile);
        setSessionLoaded(true);
      } catch (e) {
        console.error("Session check failed:", e);
        router.push("/auth/login");
      }
    }

    checkSession();
  }, [router]);

  async function loadAll() {
    if (loading) return;
    setErr(null);
    setLoading(true);

    try {
      const ps = await apiGet<Project[]>("/api/projects");
      setProjects(ps);

      const saved = typeof window !== 'undefined' ? localStorage.getItem('selectedProjectId') : null;
      const pid = projectId || (saved && ps.find(p => p.id === saved)?.id) || ps[0]?.id;
      if (!pid) return;
      setProjectId(pid);

      const statusQ = `&status=DONE_WAITING_APPROVAL`; // Lock to DONE_WAITING_APPROVAL
      const priorityQ = priorityFilter ? `&priority=${priorityFilter}` : "";
      const assignedQ = assignedFilter ? `&assigned_user_id=${encodeURIComponent(assignedFilter)}` : "";
      const dueFromQ = dueFrom ? `&due_from=${encodeURIComponent(dueFrom)}` : "";
      const dueToQ = dueTo ? `&due_to=${encodeURIComponent(dueTo)}` : "";
      const sortQ = sortBy ? `&sort=${encodeURIComponent(sortBy)}` : "";
      const qQ = qDebounced ? `&q=${encodeURIComponent(qDebounced)}` : "";

      const ts = await apiGet<Task[]>(
        `/api/tasks?projectId=${encodeURIComponent(pid)}&limit=${limit}&offset=${offset}${statusQ}${priorityQ}${assignedQ}${dueFromQ}${dueToQ}${sortQ}${qQ}&is_question=false`
      );
      if (offset === 0) setTasks(ts);
      else setTasks(prev => [...prev, ...ts]);

      const qs = await apiGet<Task[]>(
        `/api/tasks?projectId=${encodeURIComponent(pid)}&limit=${limit}&offset=${offset}${assignedQ}${dueFromQ}${dueToQ}${sortQ}${qQ}&is_question=true`
      );
      if (offset === 0) setQuestions(qs);
      else setQuestions(prev => [...prev, ...qs]);

      const fs = await apiGet<any[]>(
        `/api/fehler?projectId=${encodeURIComponent(pid)}&limit=${limit}&offset=${offset}${statusQ}${priorityQ}${assignedQ}${sortQ}${qQ}`
      );
      if (offset === 0) setFehlers(fs);
      else setFehlers(prev => [...prev, ...fs]);

      const cs = await apiGet<any[]>(
        `/api/cables?projectId=${encodeURIComponent(pid)}&limit=${limit}&offset=${offset}&status=pending_approval${qQ}`
      );
      if (offset === 0) setCables(cs || []);
      else setCables(prev => [...prev, ...(cs || [])]);

      setHasMore(ts.length === limit || qs.length === limit || fs.length === limit || (cs?.length || 0) === limit);

      if (offset === 0) {
        const ords = await apiGet<any[]>(`/api/orders?projectId=${encodeURIComponent(pid)}`);
        const ordList = ords || [];
        setOrders(ordList);
        const editMap: Record<string, any[]> = {};
        ordList.forEach((o: any) => {
          editMap[o.id] = (o.items || []).map((it: any) => ({ ...it }));
        });
        setEditingItems(editMap);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setErr(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!sessionLoaded) return;
    loadAll().catch((e) => setErr(String(e?.message || e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit, offset, priorityFilter, assignedFilter, dueFrom, dueTo, sortBy, projectId, qDebounced, sessionLoaded]);

  useEffect(() => {
    if (!sessionLoaded || profilesLoaded) return;
    apiGet<Profile[]>("/api/profiles?limit=1000")
      .then((data) => setProfiles(data || []))
      .finally(() => setProfilesLoaded(true));
  }, [sessionLoaded, profilesLoaded]);

  useEffect(() => {
    if (!sessionLoaded || settingsLoaded) return;
    apiGet<NotificationSettings>("/api/notification-settings")
      .then((data) => {
        if (data) setNotificationSettings(data);
      })
      .catch(() => { })
      .finally(() => setSettingsLoaded(true));
  }, [sessionLoaded, settingsLoaded]);

  useEffect(() => {
    if (!user?.id) return;
    if ((user.role || "").toUpperCase() === "ADMIN") return;
    setAssignedFilter((prev) => (prev === user.id ? prev : user.id));
  }, [user]);

  useEffect(() => {
    if (!tasks.length) {
      setTaskTranslationMap({});
      setTaskTranslationLang(language);
      setTaskTranslationError(null);
      setTaskTranslating(false);
      return;
    }

    const items: { key: string; text: string }[] = [];
    [...tasks, ...questions].forEach((task) => {
      const title = task.title?.trim();
      if (title) items.push({ key: `task.title:${task.id}`, text: title });
      const description = task.description?.trim();
      if (description) items.push({ key: `task.description:${task.id}`, text: description });
    });

    if (items.length === 0) {
      setTaskTranslationMap({});
      setTaskTranslationLang(language);
      setTaskTranslationError(null);
      setTaskTranslating(false);
      return;
    }

    let alive = true;
    setTaskTranslating(true);
    setTaskTranslationError(null);

    apiPost<{ translations: string[] }>("/api/translate", {
      targetLang: language,
      texts: items.map((item) => item.text),
    })
      .then((payload) => {
        if (!alive) return;
        const next: Record<string, string> = {};
        (payload.translations || []).forEach((value, idx) => {
          const key = items[idx]?.key;
          if (key && typeof value === "string") {
            next[key] = value;
          }
        });
        setTaskTranslationMap(next);
        setTaskTranslationLang(language);
      })
      .catch((translationErr: any) => {
        if (!alive) return;
        setTaskTranslationError(translationErr?.message || String(translationErr));
        setTaskTranslationMap({});
      })
      .finally(() => {
        if (!alive) return;
        setTaskTranslating(false);
      });

    return () => {
      alive = false;
    };
  }, [tasks, language]);

  async function saveNotificationSettings(next: NotificationSettings) {
    setSettingsSaving(true);
    setSettingsError(null);
    try {
      await apiPost<NotificationSettings>("/api/notification-settings", next);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setSettingsError(message);
    } finally {
      setSettingsSaving(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => {
      setQDebounced(q);
      setOffset(0);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const missingPhotos = [...tasks, ...questions].filter(
      (task) => !Object.prototype.hasOwnProperty.call(thumbByTask, task.id)
    );
    if (missingPhotos.length > 0) {
      const nextThumbs = { ...thumbByTask };
      missingPhotos.forEach(t => nextThumbs[t.id] = { url: null, type: null });
      setThumbByTask(nextThumbs);

      const params = new URLSearchParams();
      missingPhotos.forEach((t) => params.append("taskIds", t.id));
      params.append("phases", "BEFORE");
      params.append("phases", "AFTER");
      params.append("limit", "1");

      apiGet<any[]>(`/api/task-photos/batch?${params.toString()}`)
        .then((photos) => {
          const fetchedThumbs = { ...nextThumbs };
          const photoMap: Record<string, any> = {};

          for (const p of photos) {
            if (!photoMap[p.task_id]) photoMap[p.task_id] = {};
            if (!photoMap[p.task_id][p.photo_type]) {
              photoMap[p.task_id][p.photo_type] = p;
            }
          }

          missingPhotos.forEach((t) => {
            const after = photoMap[t.id]?.AFTER;
            const before = photoMap[t.id]?.BEFORE;
            const selected = after || before;
            if (selected) {
              fetchedThumbs[t.id] = {
                url: selected.url ? fixStorageUrl(selected.url) : null,
                type: selected.photo_type,
              };
            }
          });
          setThumbByTask(fetchedThumbs);
        })
        .catch((err) => console.warn("[to-approve] Batch photo fetch failed", err));
    }

    const planIds = new Set(
      [...tasks, ...questions]
        .map((task) => task.plan_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    );

    const missingPlans = Array.from(planIds).filter(
      (planId) => !Object.prototype.hasOwnProperty.call(metaByPlan, planId)
    );

    if (missingPlans.length > 0) {
      setMetaByPlan((prev) => {
        const next = { ...prev };
        missingPlans.forEach(id => next[id] = null);
        return next;
      });

      missingPlans.forEach(planId => {
        loadPlanMeta(planId).catch(() => { });
      });
    }
  }, [tasks, thumbByTask, metaByPlan, loadThumb]);

  useEffect(() => {
    function handlePhotoAdded(event: Event) {
      const detail = (event as CustomEvent)?.detail;
      const taskIdFromEvent = detail?.taskId;
      if (!taskIdFromEvent) return;
      loadThumb(taskIdFromEvent).catch(() => { });
    }
    window.addEventListener("task-photo-added", handlePhotoAdded as EventListener);
    window.addEventListener("task-created", handleTaskCreated as EventListener);
    return () => {
      window.removeEventListener("task-photo-added", handlePhotoAdded as EventListener);
      window.removeEventListener("task-created", handleTaskCreated as EventListener);
    };
  }, [loadThumb]);

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !loading && hasMore) {
        setOffset((prev) => prev + limit);
      }
    }, { threshold: 0.1 });
    if (sentinelRef.current) observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [loading, hasMore, limit]);

  function getTileUrl(task: Task) {
    if (!task.plan_id) return null;
    const meta = metaByPlan[task.plan_id];
    if (!meta) return null;
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
      <div className="min-h-screen bg-[#020617] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-slate-800 border-t-cyan-500 rounded-full animate-spin"></div>
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
              {t("nav", "toApprove", "ZUR GENEHMIGUNG")}
            </h1>
            <p className="text-ui-muted text-xs mt-4 uppercase font-bold tracking-[0.3em]">
              {t("home", "toApproveSubtitle", "Zadania zgłoszone i oczekujące na weryfikację")}
            </p>
          </div>

          <div className="flex bg-black/40 p-2 rounded-2xl border border-ui-border backdrop-blur-xl gap-2 overflow-x-auto max-w-full no-scrollbar">
            {[
              { id: "tasks", label: t("nav", "tasks", "Zadania"), count: tasks.length, icon: "📋" },
              { id: "questions", label: t("home", "questionsTab", "Pytania"), count: questions.length, icon: "❓" },
              { id: "orders", label: t("materials", "adminOrdersTab", "Zamówienia"), count: orders.filter(o => o.status === "PENDING").length, icon: "📦" },
              { id: "fehlers", label: t("nav", "fehler", "Błędy"), count: fehlers.length, icon: "⚠️" },
              { id: "cables", label: t("cables", "cablesToApproveTitle", "Kable"), count: cables.length, icon: "🔌" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id as any); setOffset(0); }}
                className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-300 flex items-center gap-2 whitespace-nowrap ${
                  activeTab === tab.id 
                  ? "bg-ui-accent text-slate-950 shadow-[0_0_20px_var(--ui-glow)]" 
                  : "text-ui-muted hover:text-ui-text hover:bg-white/5"
                }`}
              >
                <span className="text-sm">{tab.icon}</span>
                {tab.label}
                <span className={`ml-1 px-2 py-0.5 rounded-md text-[9px] ${activeTab === tab.id ? "bg-black/20 text-slate-950" : "bg-ui-card text-ui-muted"}`}>
                  {tab.count}
                </span>
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
                <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-ui-accent/80 mb-2">{t("reports", "filters", "FILTRY")}</h2>
                
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
                      className="w-full bg-black/40 border border-ui-border rounded-2xl px-6 py-4 text-xs font-bold text-ui-text outline-none appearance-none cursor-pointer focus:border-ui-accent/50 transition-all"
                    >
                      {projects.map((p) => (
                        <option key={p.id} value={p.id} className="bg-slate-900">{p.companies?.name ? `[${p.companies.name.toUpperCase()}] ` : ""}{p.name}</option>
                      ))}
                    </select>
                    <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-ui-muted">▼</div>
                  </div>
                </div>

                {/* Search */}
                <div className="space-y-3">
                  <label className="text-[9px] font-black text-ui-muted uppercase tracking-widest ml-1">{t("common", "search", "SZUKAJ")}</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder={t("home", "search", "Wpisz frazę...")}
                      className="w-full bg-black/40 border border-ui-border rounded-2xl px-6 py-4 text-xs font-bold text-ui-text outline-none focus:border-ui-accent/50 transition-all"
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
                      className="w-full bg-black/40 border border-ui-border rounded-2xl px-6 py-4 text-xs font-bold text-ui-text outline-none appearance-none cursor-pointer focus:border-ui-accent/50 transition-all"
                    >
                      <option value="" className="bg-slate-900">{t("taskStatus", "ALL", "Wszystkie")}</option>
                      <option value="LOW" className="bg-slate-900">{t("taskPriority", "LOW", "Niski")}</option>
                      <option value="MEDIUM" className="bg-slate-900">{t("taskPriority", "MEDIUM", "Średni")}</option>
                      <option value="HIGH" className="bg-slate-900">{t("taskPriority", "HIGH", "Wysoki")}</option>
                      <option value="CRITICAL" className="bg-slate-900">{t("taskPriority", "CRITICAL", "Krytyczny")}</option>
                    </select>
                    <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-ui-muted">▼</div>
                  </div>
                </div>

                {/* Assignee Selector */}
                {(user?.role || "").toUpperCase() === "ADMIN" && (
                  <div className="space-y-3">
                    <label className="text-[9px] font-black text-ui-muted uppercase tracking-widest ml-1">{t("home", "filterAssignee", "WYKONAWCA")}</label>
                    <div className="relative">
                      <select
                        value={assignedFilter}
                        onChange={(e) => { setAssignedFilter(e.target.value); setOffset(0); }}
                        className="w-full bg-black/40 border border-ui-border rounded-2xl px-6 py-4 text-xs font-bold text-ui-text outline-none appearance-none cursor-pointer focus:border-ui-accent/50 transition-all"
                      >
                        <option value="" className="bg-slate-900">{t("taskStatus", "ALL", "Wszyscy")}</option>
                        {profiles.map((p) => (
                          <option key={p.id} value={p.id} className="bg-slate-900">
                            {p.full_name || p.email || p.id.slice(0, 8)}
                          </option>
                        ))}
                      </select>
                      <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-ui-muted">▼</div>
                    </div>
                  </div>
                )}

                {/* Date Range */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <label className="text-[9px] font-black text-ui-muted uppercase tracking-widest ml-1">{t("home", "dueFrom", "OD")}</label>
                    <input
                      type="date"
                      value={dueFrom}
                      onChange={(e) => { setDueFrom(e.target.value); setOffset(0); }}
                      className="w-full bg-black/40 border border-ui-border rounded-2xl px-6 py-4 text-[10px] font-bold text-ui-text outline-none focus:border-ui-accent/50 transition-all"
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[9px] font-black text-ui-muted uppercase tracking-widest ml-1">{t("home", "dueTo", "DO")}</label>
                    <input
                      type="date"
                      value={dueTo}
                      onChange={(e) => { setDueTo(e.target.value); setOffset(0); }}
                      className="w-full bg-black/40 border border-ui-border rounded-2xl px-6 py-4 text-[10px] font-bold text-ui-text outline-none focus:border-ui-accent/50 transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Notification Settings Sidebar Widget */}
              <div className="pt-8 border-t border-ui-border/50 space-y-6">
                <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-amber-500/80 mb-2">{t("home", "notifications", "POWIADOMIENIA")}</h2>
                <div className="space-y-3">
                  {[
                    { key: 'notify_on_create', label: t("home", "notifyOnCreate", "NOWE ZADANIA") },
                    { key: 'notify_on_status', label: t("home", "notifyOnStatus", "ZMIANY STATUSU") },
                    { key: 'notify_on_assign', label: t("home", "notifyOnAssign", "PRZYPISANIA") },
                  ].map((setting) => (
                    <label key={setting.key} className="flex items-center justify-between p-4 rounded-2xl bg-black/20 border border-ui-border cursor-pointer group hover:border-ui-muted transition-all">
                      <span className="text-[9px] font-black text-ui-muted group-hover:text-ui-text transition-colors uppercase tracking-widest">{setting.label}</span>
                      <input
                        type="checkbox"
                        checked={(notificationSettings as any)[setting.key]}
                        onChange={(e) => {
                          const next = { ...notificationSettings, [setting.key]: e.target.checked };
                          setNotificationSettings(next);
                          saveNotificationSettings(next).catch(() => { });
                        }}
                        className="w-5 h-5 rounded-lg border-2 border-ui-border bg-black/40 checked:bg-ui-accent checked:border-ui-accent transition-all appearance-none cursor-pointer"
                      />
                    </label>
                  ))}
                </div>
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

            <AnimatePresence mode="wait">
              <motion.div 
                key={activeTab}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                {activeTab === "tasks" || activeTab === "questions" ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {(activeTab === "questions" ? questions : tasks).length === 0 ? (
                      <div className="col-span-full py-40 text-center bg-ui-card/40 rounded-2xl border border-ui-border border-dashed">
                        <div className="w-20 h-20 bg-ui-card rounded-full flex items-center justify-center text-4xl mx-auto mb-8 opacity-20">📭</div>
                        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-ui-muted">{t("common", "noData", "Brak zadań do wyświetlenia")}</p>
                      </div>
                    ) : (
                      (activeTab === "questions" ? questions : tasks).map((task) => {
                        const thumb = thumbByTask[task.id];
                        const thumbUrl = thumb?.thumb_url || thumb?.url || null;
                        const tileUrl = getTileUrl(task);
                        const translatedTitle = getTranslatedText("task.title", task.id, task.title);

                        return (
                          <motion.div
                            key={task.id}
                            layout
                            className="bg-ui-card backdrop-blur-3xl border border-ui-border rounded-2xl overflow-hidden flex flex-col group hover:border-ui-accent/30 transition-all duration-500 shadow-xl"
                          >
                            <div className="relative h-64 overflow-hidden cursor-pointer" onClick={() => router.push(`/task/${task.id}`)}>
                              {thumbUrl ? (
                                <img src={getApiUrl(thumbUrl)} alt="task" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                              ) : (
                                <div className="w-full h-full bg-black/40 flex flex-col items-center justify-center gap-3">
                                  <span className="text-4xl opacity-10">📷</span>
                                  <span className="text-[8px] font-black uppercase tracking-widest text-slate-600">{t("home", "noPhoto", "No photo yet")}</span>
                                </div>
                              )}
                              <div className="absolute top-6 right-6 flex flex-col gap-2">
                                <span className="px-4 py-2 rounded-xl bg-black/60 backdrop-blur-md text-[9px] font-black uppercase tracking-widest text-ui-accent border border-ui-accent/30">
                                  #{getTaskNumericLabel(task.id)}
                                </span>
                                <span className={`px-4 py-2 rounded-xl bg-black/60 backdrop-blur-md text-[9px] font-black uppercase tracking-widest border border-white/10`} style={{ color: STATUS_COLORS[task.status] }}>
                                  {t("taskStatus", task.status, task.status)}
                                </span>
                              </div>
                              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-8">
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white flex items-center gap-2">
                                  {t("common", "edit", "EDYTUJ ZADANIE")} ➜
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

                              <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 rounded-2xl bg-black/20 border border-ui-border">
                                  <p className="text-[8px] font-black text-ui-muted uppercase mb-1">{t("taskDrawer", "assignedUser", "WYKONAWCA")}</p>
                                  <p className="text-[10px] font-bold text-ui-text uppercase truncate">
                                    {profileById[task.assigned_user_id || ""]?.full_name || "—"}
                                  </p>
                                </div>
                                <div className="p-4 rounded-2xl bg-black/20 border border-ui-border">
                                  <p className="text-[8px] font-black text-ui-muted uppercase mb-1">{t("taskDrawer", "dueDate", "TERMIN")}</p>
                                  <p className="text-[10px] font-bold text-ui-text uppercase truncate">
                                    {task.due_date ? new Date(task.due_date).toLocaleDateString() : "—"}
                                  </p>
                                </div>
                              </div>

                              <div className="flex gap-3 pt-6 border-t border-ui-border/50 mt-auto">
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (!confirm(t("home", "confirmDelete", "Na pewno usunąć to zadanie?"))) return;
                                    try {
                                      await apiCall(`/api/task?id=${task.id}`, { method: "DELETE" });
                                      loadAll();
                                    } catch (err: any) { alert(err.message); }
                                  }}
                                  className="p-4 rounded-2xl bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500 hover:text-white transition-all shadow-lg shadow-red-500/5"
                                >
                                  🗑
                                </button>
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    const reason = prompt(t("home", "rejectReason", "Podaj powód odrzucenia:"));
                                    if (!reason?.trim()) return;
                                    try {
                                      await apiCall("/api/tasks", { method: "PATCH", body: { id: task.id, status: "REJECTED", rejection_reason: reason } });
                                      loadAll();
                                    } catch (err: any) { alert(err.message); }
                                  }}
                                  className="flex-1 py-4 rounded-2xl bg-ui-card text-ui-muted border border-ui-border text-[10px] font-black uppercase tracking-widest hover:bg-white/5 transition-all"
                                >
                                  ✗ {t("home", "rejectBtn", "Odrzuć")}
                                </button>
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    try {
                                      await apiCall("/api/tasks", { method: "PATCH", body: { id: task.id, status: "APPROVED" } });
                                      loadAll();
                                    } catch (err: any) { alert(err.message); }
                                  }}
                                  className="flex-1 py-4 rounded-2xl bg-green-500/20 text-green-400 border border-green-500/30 text-[10px] font-black uppercase tracking-widest hover:bg-green-500 hover:text-slate-950 transition-all"
                                >
                                  ✓ {t("home", "approveBtn", "Zatwierdź")}
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })
                    )}
                  </div>
                ) : activeTab === "cables" ? (
                  <div className="space-y-6">
                    {cables.length === 0 ? (
                      <div className="py-40 text-center bg-ui-card/40 rounded-2xl border border-ui-border border-dashed">
                        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-ui-muted">{t("cables", "noCablesToApprove", "Brak kabli do zatwierdzenia")}</p>
                      </div>
                    ) : (
                      cables.map(cable => (
                        <motion.div 
                          key={cable.id}
                          layout
                          className="bg-ui-card backdrop-blur-3xl border border-ui-border rounded-2xl p-10 flex flex-col md:flex-row justify-between items-center gap-8 group hover:border-ui-accent/30 transition-all shadow-xl"
                        >
                          <div className="flex items-center gap-8 flex-1 w-full overflow-hidden">
                            <div className="w-16 h-16 bg-cyan-500/10 rounded-2xl flex items-center justify-center text-3xl shrink-0 border border-cyan-500/20 shadow-inner shadow-cyan-500/5">🔌</div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <h4 className="text-xl font-black text-white uppercase tracking-tight truncate">{cable.name}</h4>
                                {cable.cable_type && <span className="px-3 py-1 rounded-lg bg-slate-800 text-slate-400 text-[8px] font-black uppercase tracking-widest border border-slate-700/50">{cable.cable_type}</span>}
                              </div>
                              <div className="flex flex-wrap gap-x-6 gap-y-2 text-[10px] font-bold text-ui-muted uppercase tracking-widest">
                                {cable.length != null && <span className="flex items-center gap-2">📏 {cable.length}M</span>}
                                {cable.cable_routes && <span className="flex items-center gap-2 truncate">📍 {cable.cable_routes.point_a_label} ➔ {cable.cable_routes.point_b_label}</span>}
                                {cable.reported_profile && <span className="text-ui-accent">👤 {cable.reported_profile.full_name}</span>}
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-4 w-full md:w-auto">
                            <button
                              onClick={async () => {
                                if (!confirm("Odrzucić ten kabel?")) return;
                                try {
                                  const token = await getToken();
                                  await fetch(`/api/cables`, { method: "PATCH", body: JSON.stringify({ id: cable.id, status: "in_progress" }), headers: { ... (token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" } });
                                  loadAll();
                                } catch (e: any) { alert(e.message); }
                              }}
                              className="flex-1 md:w-32 py-4 rounded-2xl bg-red-500/10 text-red-500 border border-red-500/20 text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all shadow-lg shadow-red-500/5"
                            >
                              ✗ {t("cables", "rejectBtn", "Odrzuć")}
                            </button>
                            <button
                              onClick={async () => {
                                try {
                                  const token = await getToken();
                                  await fetch(`/api/cables`, { method: "PATCH", body: JSON.stringify({ id: cable.id, status: "done" }), headers: { ... (token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" } });
                                  loadAll();
                                } catch (e: any) { alert(e.message); }
                              }}
                              className="flex-1 md:w-32 py-4 rounded-2xl bg-green-500/20 text-green-400 border border-green-500/30 text-[10px] font-black uppercase tracking-widest hover:bg-green-500 hover:text-slate-950 transition-all shadow-lg shadow-green-500/5"
                            >
                              ✓ {t("cables", "approveBtn", "Zatwierdź")}
                            </button>
                          </div>
                        </motion.div>
                      ))
                    )}
                  </div>
                ) : activeTab === "fehlers" ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {fehlers.length === 0 ? (
                      <div className="col-span-full py-40 text-center bg-ui-card/40 rounded-2xl border border-ui-border border-dashed">
                        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-ui-muted">{t("common", "noData", "Brak błędów do zatwierdzenia")}</p>
                      </div>
                    ) : (
                      fehlers.map((f) => (
                        <motion.div
                          key={f.id}
                          layout
                          className="bg-ui-card backdrop-blur-3xl border border-ui-border rounded-2xl overflow-hidden flex flex-col group hover:border-amber-500/30 transition-all duration-500 shadow-xl"
                        >
                          <div className="relative h-64 overflow-hidden">
                            {f.plan_id ? (
                              <PlanSnippet planId={f.plan_id} itemId={f.id} x_norm={f.x_norm || 0.5} y_norm={f.y_norm || 0.5} type="FEHLER" />
                            ) : (
                              <div className="w-full h-full bg-black/40 flex flex-col items-center justify-center gap-3">
                                <span className="text-4xl opacity-10">🗺️</span>
                                <span className="text-[8px] font-black uppercase tracking-widest text-ui-muted">{t("home", "noPlan", "No Plan Data")}</span>
                              </div>
                            )}
                            <div className="absolute top-6 left-6 px-4 py-2 rounded-xl bg-red-500 text-white text-[9px] font-black uppercase tracking-widest z-10 shadow-xl shadow-red-500/20 border border-red-400/30">
                              {f.priority}
                            </div>
                            <div className="absolute top-6 right-6 px-4 py-2 rounded-xl bg-black/60 backdrop-blur-md text-[9px] font-black uppercase tracking-widest border border-white/10" style={{ color: STATUS_COLORS[f.status] }}>
                              {STATUS_LABELS[f.status] || f.status}
                            </div>
                          </div>

                          <div className="p-10 flex-1 flex flex-col gap-6">
                            <div className="space-y-3">
                              <h3 className="text-xl font-black text-ui-text uppercase leading-snug tracking-tight line-clamp-2">{f.title}</h3>
                              <p className="text-[10px] text-ui-muted font-bold uppercase leading-relaxed line-clamp-3">{f.description || t("home", "noDescription", "Brak opisu.")}</p>
                            </div>

                            {f.fehler_photos?.length > 0 && (
                              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                                {f.fehler_photos.map((p: any) => (
                                  <div
                                    key={p.id}
                                    className="w-16 h-16 shrink-0 rounded-xl overflow-hidden border border-slate-800 hover:border-cyan-500 transition-all cursor-zoom-in"
                                    onClick={() => setPreviewUrl(p.url)}
                                  >
                                    <img src={p.url} alt="fehler" className="w-full h-full object-cover" />
                                  </div>
                                ))}
                              </div>
                            )}

                            <div className="flex items-center justify-between pt-6 border-t border-ui-border/50 mt-auto">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-ui-card flex items-center justify-center text-[10px] font-black border border-ui-border">
                                  {f.profiles?.full_name?.[0] || "?"}
                                </div>
                                <div>
                                  <p className="text-[8px] font-black text-ui-muted uppercase mb-0.5">{t("taskDrawer", "assignedUser", "ZGŁOSIŁ")}</p>
                                  <p className="text-[10px] font-bold text-ui-text uppercase">{f.profiles?.full_name || "Nieznany"}</p>
                                </div>
                              </div>
                              <span className="text-[10px] font-mono text-ui-muted">{new Date(f.created_at).toLocaleDateString()}</span>
                            </div>

                            <div className="grid grid-cols-2 gap-3 pt-6 border-t border-ui-border/50">
                              <button
                                onClick={async () => {
                                  try {
                                    const token = await getToken();
                                    await fetch(`/api/fehler?id=${f.id}`, { method: "PATCH", body: JSON.stringify({ status: "APPROVED" }), headers: { ... (token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" } });
                                    loadAll();
                                  } catch (e: any) { alert(e.message); }
                                }}
                                className="py-4 rounded-2xl bg-green-500/20 text-green-400 border border-green-500/30 text-[10px] font-black uppercase tracking-widest hover:bg-green-500 hover:text-slate-950 transition-all"
                              >
                                ✓ {t("home", "approveBtn", "Zatwierdź")}
                              </button>
                              <button
                                onClick={async () => {
                                  const reason = prompt(t("home", "rejectReason", "Podaj powód odrzucenia:"));
                                  if (!reason?.trim()) return;
                                  try {
                                    const token = await getToken();
                                    await fetch(`/api/fehler?id=${f.id}`, { method: "PATCH", body: JSON.stringify({ status: "REJECTED", rejection_reason: reason }), headers: { ... (token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" } });
                                    loadAll();
                                  } catch (e: any) { alert(e.message); }
                                }}
                                className="py-4 rounded-2xl bg-red-500/10 text-red-500 border border-red-500/20 text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all"
                              >
                                ✗ {t("home", "rejectBtn", "Odrzuć")}
                              </button>
                              <button
                                onClick={() => { setEditFehlerItem(f); setIsFehlerModalOpen(true); }}
                                className="py-4 rounded-2xl bg-ui-card text-ui-muted border border-ui-border text-[10px] font-black uppercase tracking-widest hover:bg-white/5 transition-all"
                              >
                                {t("common", "edit", "Edytuj")}
                              </button>
                              <button
                                onClick={async () => {
                                  if (!confirm(t("fehler", "deleteConfirm", "Delete this error?"))) return;
                                  setDeletingFehler(f.id);
                                  try {
                                    const token = await getToken();
                                    await fetch(`/api/fehler?id=${f.id}`, { method: "DELETE", headers: token ? { Authorization: `Bearer ${token}` } : {} });
                                    loadAll();
                                  } catch (e: any) { alert(e.message); } finally { setDeletingFehler(null); }
                                }}
                                disabled={deletingFehler === f.id}
                                className="py-4 rounded-2xl bg-ui-card/50 text-ui-muted border border-ui-border text-[10px] font-black uppercase tracking-widest hover:text-red-500 transition-all"
                              >
                                {deletingFehler === f.id ? "..." : t("common", "delete", "Usuń")}
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      ))
                    )}
                  </div>
                ) : activeTab === "orders" ? (
                  <div className="space-y-8">
                    {orders.length === 0 ? (
                      <div className="py-40 text-center bg-ui-card/40 rounded-2xl border border-ui-border border-dashed">
                        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-ui-muted">{t("materials", "noOrders", "Brak zamówień do zatwierdzenia")}</p>
                      </div>
                    ) : (
                      orders.map(order => (
                        <motion.div 
                          key={order.id}
                          layout
                          className="bg-ui-card backdrop-blur-3xl border border-ui-border rounded-2xl p-12 lg:p-16 shadow-2xl flex flex-col gap-10"
                        >
                          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-ui-border/50 pb-10">
                            <div className="flex items-center gap-6">
                              <div className="w-16 h-16 bg-amber-500/10 rounded-2xl flex items-center justify-center text-3xl border border-amber-500/20 shadow-inner shadow-amber-500/5">📦</div>
                              <div>
                                <h3 className="text-2xl font-black text-ui-text uppercase tracking-tight">
                                  {t("materials", "orderFrom", "Zamówienie od")} {order.user?.full_name || "Nieznany"}
                                </h3>
                                <div className="flex items-center gap-4 mt-2">
                                  <span className="text-[10px] font-mono text-ui-muted">{new Date(order.created_at).toLocaleString()}</span>
                                  <span className={`px-4 py-1 rounded-full text-[9px] font-black uppercase tracking-widest shadow-lg ${
                                    order.status === "PENDING" ? "bg-amber-500 text-amber-950" : 
                                    order.status === "APPROVED" ? "bg-green-500 text-green-950" : 
                                    order.status === "REJECTED" ? "bg-red-500 text-white" : "bg-slate-700 text-slate-200"
                                  }`}>
                                    {order.status}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-3">
                              {order.status === "PENDING" && (
                                <>
                                  <button
                                    onClick={async () => {
                                      if (!confirm("Odrzucić?")) return;
                                      try { await apiCall("/api/orders", { method: "PATCH", body: { orderId: order.id, status: "REJECTED" } }); loadAll(); } catch (e: any) { alert(e.message); }
                                    }}
                                    className="px-8 py-4 rounded-2xl bg-red-500/10 text-red-500 border border-red-500/20 text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all shadow-lg shadow-red-500/5"
                                  >
                                    ✗ {t("materials", "rejectBtn", "Odrzuć")}
                                  </button>
                                  <button
                                    onClick={async () => {
                                      try { 
                                        await apiCall("/api/orders", { method: "PATCH", body: { orderId: order.id, status: "APPROVED" } }); 
                                        router.push(`/admin/orders/${order.id}/email`);
                                      } catch (e: any) { alert(e.message); }
                                    }}
                                    className="px-8 py-4 rounded-2xl bg-green-500/20 text-green-400 border border-green-500/30 text-[10px] font-black uppercase tracking-widest hover:bg-green-500 hover:text-slate-950 transition-all shadow-lg shadow-green-500/5"
                                  >
                                    ✓ {t("materials", "approveBtn", "Zatwierdź")}
                                  </button>
                                </>
                              )}
                              <button
                                onClick={async () => {
                                  if (!confirm("Usunąć?")) return;
                                  try { await apiCall(`/api/orders?id=${order.id}`, { method: "DELETE" }); loadAll(); } catch (e: any) { alert(e.message); }
                                }}
                                className="w-14 h-14 bg-slate-800/50 text-slate-500 rounded-2xl flex items-center justify-center hover:bg-red-500/10 hover:text-red-500 transition-all border border-slate-700/50 shadow-xl"
                              >
                                🗑
                              </button>
                            </div>
                          </div>

                          <div className="overflow-x-auto no-scrollbar">
                            <table className="w-full text-left border-separate border-spacing-y-4">
                              <thead>
                                <tr className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em]">
                                  <th className="px-6 pb-2">{t("materials", "materialCol", "Materiał")}</th>
                                  <th className="px-6 pb-2 text-right">{t("materials", "quantityCol", "Ilość")}</th>
                                  <th className="w-20"></th>
                                </tr>
                              </thead>
                              <tbody>
                                {(editingItems[order.id] || order.items || []).filter((item: any) => !(deletedItems[order.id] || []).includes(item.id)).map((item: any, idx: number) => (
                                  <tr key={item.id} className="bg-black/20 border border-ui-border group transition-all">
                                    <td className="px-8 py-6 rounded-l-2xl border-y border-l border-ui-border">
                                      <div className="flex flex-col gap-1">
                                        {item.material ? (
                                          <>
                                            <span className="text-[11px] font-black text-ui-text uppercase tracking-tight">
                                              {item.material.category && <span className="text-ui-accent/70">{item.material.category} — </span>}
                                              {item.material.display_name || item.material.name}
                                            </span>
                                            {item.material.article_number && <span className="text-[9px] font-mono font-bold text-amber-500 uppercase">ART: {item.material.article_number}</span>}
                                          </>
                                        ) : (
                                          <input
                                            type="text"
                                            value={item.custom_name || ""}
                                            onChange={e => setEditingItems(prev => {
                                              const copy = [...(prev[order.id] || [])];
                                              copy[idx] = { ...copy[idx], custom_name: e.target.value };
                                              return { ...prev, [order.id]: copy };
                                            })}
                                            className="bg-black/40 border border-slate-700/50 rounded-xl px-4 py-2 text-[11px] font-bold text-white outline-none focus:border-cyan-500/50 w-full max-w-sm"
                                            placeholder="Nazwa własna..."
                                          />
                                        )}
                                      </div>
                                    </td>
                                    <td className="px-8 py-6 border-y border-slate-800/50 text-right">
                                      <div className="flex items-center justify-end gap-3">
                                        <input
                                          type="number"
                                          value={item.quantity}
                                          onChange={e => {
                                            const val = parseFloat(e.target.value);
                                            if (!isNaN(val) && val >= 0) {
                                              setEditingItems(prev => {
                                                const copy = [...(prev[order.id] || [])];
                                                const targetIdx = copy.findIndex(ci => ci.id === item.id);
                                                if (targetIdx !== -1) copy[targetIdx] = { ...copy[targetIdx], quantity: val };
                                                return { ...prev, [order.id]: copy };
                                              });
                                            }
                                          }}
                                          className="w-24 bg-black/40 border border-slate-700/50 rounded-xl px-4 py-2 text-[11px] font-black text-white text-right outline-none focus:border-cyan-500/50"
                                        />
                                        <span className="text-[10px] font-black text-ui-muted uppercase tracking-widest w-12 text-left">
                                          {item.material ? item.material.unit : (item.custom_unit || "SZT.")}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="px-6 py-6 rounded-r-2xl border-y border-r border-ui-border text-center">
                                      <button
                                        onClick={() => setDeletedItems(prev => ({ ...prev, [order.id]: [...(prev[order.id] || []), item.id] }))}
                                        className="w-8 h-8 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                                      >
                                        ✗
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          <div className="flex flex-col lg:flex-row justify-between items-end gap-8 pt-10 border-t border-slate-800/50">
                             <div className="w-full lg:w-2/3 space-y-4">
                               <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{t("adminMaterials", "addMaterialTitle", "DODAJ MATERIAŁ")}</h4>
                               <div className="relative">
                                 <input
                                   type="text"
                                   placeholder={t("materials", "searchPlaceholder", "Wyszukaj w bazie...")}
                                   value={searchQuery[order.id] || ""}
                                   onChange={(e) => {
                                     setSearchQuery(prev => ({ ...prev, [order.id]: e.target.value }));
                                     searchMaterialsForOrder(order.id, e.target.value);
                                   }}
                                   className="w-full bg-black/40 border border-ui-border rounded-2xl px-8 py-5 text-xs font-bold text-ui-text outline-none focus:border-ui-accent/50 transition-all shadow-xl"
                                 />
                                 {isSearching[order.id] && <div className="absolute right-8 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-ui-border border-t-ui-accent rounded-full animate-spin"></div>}
                                 
                                 <AnimatePresence>
                                   {(materialsSearch[order.id] || []).length > 0 && searchQuery[order.id]?.length >= 2 && (
                                     <motion.div 
                                       initial={{ opacity: 0, y: 10 }}
                                       animate={{ opacity: 1, y: 0 }}
                                       exit={{ opacity: 0, y: 10 }}
                                       className="absolute z-50 left-0 right-0 mt-4 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden max-h-80 overflow-y-auto custom-scrollbar"
                                     >
                                       {materialsSearch[order.id].map(mat => (
                                         <div
                                           key={mat.id}
                                           onClick={() => {
                                             setEditingItems(prev => {
                                               const items = prev[order.id] || [];
                                               const existing = items.find(i => i.material?.id === mat.id || i.material_id === mat.id);
                                               if (existing) return { ...prev, [order.id]: items.map(i => i.id === existing.id ? { ...i, quantity: i.quantity + 1 } : i) };
                                               return { ...prev, [order.id]: [...items, { id: `temp-${Math.random()}`, material_id: mat.id, material: mat, quantity: 1 }] };
                                             });
                                             setSearchQuery(prev => ({ ...prev, [order.id]: "" }));
                                             setMaterialsSearch(prev => ({ ...prev, [order.id]: [] }));
                                           }}
                                           className="px-8 py-5 hover:bg-cyan-500/10 cursor-pointer border-b border-slate-800 last:border-0 flex justify-between items-center group transition-colors"
                                         >
                                           <div className="flex flex-col gap-1">
                                             <span className="text-xs font-black text-ui-muted group-hover:text-ui-accent uppercase tracking-tight">{mat.display_name || mat.name}</span>
                                             {mat.article_number && <span className="text-[9px] font-mono text-amber-500/70 uppercase">ART: {mat.article_number}</span>}
                                           </div>
                                           <span className="text-[10px] font-black text-ui-muted uppercase">{mat.unit}</span>
                                         </div>
                                       ))}
                                     </motion.div>
                                   )}
                                 </AnimatePresence>
                               </div>
                             </div>

                             <div className="flex flex-col gap-4 w-full lg:w-auto">
                               <button
                                 disabled={savingOrderId === order.id}
                                 onClick={async () => {
                                   setSavingOrderId(order.id);
                                   try {
                                     const items = editingItems[order.id] || [];
                                     const dels = deletedItems[order.id] || [];
                                     for (const delId of dels) if (!delId.startsWith("temp-")) await apiCall(`/api/order-items?id=${delId}`, { method: "DELETE" });
                                     for (const item of items) {
                                       if (dels.includes(item.id)) continue;
                                       if (item.id.startsWith("temp-")) {
                                         let matIdToUse = item.material?.id || item.material_id;
                                         await apiCall("/api/order-items", { method: "POST", body: { orderId: order.id, materialId: matIdToUse, customName: item.custom_name, customUnit: item.custom_unit, quantity: item.quantity } });
                                       } else {
                                         await apiCall("/api/order-items", { method: "PATCH", body: { itemId: item.id, quantity: item.quantity, customName: item.custom_name, customUnit: item.custom_unit } });
                                       }
                                     }
                                     setDeletedItems(prev => ({ ...prev, [order.id]: [] }));
                                     await loadAll();
                                   } catch (e: any) { alert(e.message); } finally { setSavingOrderId(null); }
                                 }}
                                 className={`px-10 py-5 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] transition-all duration-300 shadow-xl flex items-center justify-center gap-3 ${
                                   savingOrderId === order.id ? "bg-ui-card text-ui-muted" : "bg-ui-accent text-slate-950 hover:scale-[1.02] shadow-[0_0_20px_var(--ui-glow)]"
                                 }`}
                               >
                                 {savingOrderId === order.id ? "..." : "💾 " + t("common", "saveChanges", "ZAPISZ ZMIANY")}
                               </button>
                             </div>
                          </div>
                        </motion.div>
                      ))
                    )}
                  </div>
                ) : null}
                
                {/* Sentinel for Infinite Scroll */}
                <div ref={sentinelRef} className="h-20 w-full flex items-center justify-center">
                  {loading && <div className="w-6 h-6 border-2 border-ui-border border-t-ui-accent rounded-full animate-spin"></div>}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      <PhotoLightbox url={previewUrl} onClose={() => setPreviewUrl(null)} />
      <FehlerModal
        open={isFehlerModalOpen}
        onClose={() => { setIsFehlerModalOpen(false); setEditFehlerItem(null); }}
        onSaved={loadAll}
        editItem={editFehlerItem}
        currentUserId={user?.id || null}
        currentUserRole={(user?.role || "USER").toUpperCase()}
      />

      {/* Custom Scrollbar Styling */}
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.2); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(148, 163, 184, 0.3); }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </motion.div>
  );
}
