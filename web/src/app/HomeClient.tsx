"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiGet, apiPost, apiDelete, getApiUrl, getToken } from "@/lib/apiClient";
import { supabase } from "@/lib/supabase";
import type { Language } from "@/lib/translations";
import { PWAInstallBanner } from "@/components/PWAInstallBanner";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTaskNumericLabel } from "@/lib/taskNumber";
import { useSync } from "@/hooks/useSync";
import { Et4uBentoHero } from "@/components/Et4uBentoHero";

function PendingSyncIndicator() {
  const { pendingCount, isSyncing } = useSync();
  const { t } = useLanguage();

  if (pendingCount === 0 && !isSyncing) return null;

  return (
    <div className="mx-4 mb-4 p-3 bg-ui-card backdrop-blur-lg rounded-xl border border-ui-border flex items-center gap-3 shadow-lg animate-pulse-subtle">
      <div className={`w-2.5 h-2.5 rounded-full ${isSyncing ? "bg-ui-accent animate-pulse" : "bg-warning"}`} />
      <div className="text-sm font-semibold text-ui-text">
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
  has_vde_access?: boolean;
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

export default function Home() {
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
  const [thumbByTask, setThumbByTask] = useState<Record<string, TaskThumb>>({});

  const [metaByPlan, setMetaByPlan] = useState<Record<string, PlanMeta | null>>({});
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [taskTranslationMap, setTaskTranslationMap] = useState<Record<string, string>>({});
  const [taskTranslationLang, setTaskTranslationLang] = useState<Language | null>(null);
  const [taskTranslating, setTaskTranslating] = useState(false);
  const [taskTranslationError, setTaskTranslationError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // For viewing/editing existing tasks inline on native Android
  const [viewTaskId, setViewTaskId] = useState<string | null>(null);

  // Detect native Capacitor platform (Android/iOS)
  const isNative = typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform?.();

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

  const statusBadgeClassByCode: Record<string, string> = {
    OPEN: "task-card__badge--open",
    IN_PROGRESS: "task-card__badge--in-progress",
    DONE_WAITING_APPROVAL: "task-card__badge--waiting",
    APPROVED: "task-card__badge--approved",
    REJECTED: "task-card__badge--rejected",
  };

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
    let alive = true;
    const timeout = setTimeout(() => {
      if (alive && !sessionLoaded) {
        console.warn("[HomeClient] Session check timed out, forcing redirect to login");
        window.location.href = "/auth/login";
      }
    }, 10000); // 10 second timeout

    async function checkSession() {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (error || !data?.session) {
          if (alive) window.location.href = "/auth/login";
          return;
        }

        // Get user profile
        try {
          const j = await apiGet<any>('/api/me');
          if (alive) setUser(j.profile);
        } catch (err) {
          console.error("[HomeClient] Profile load failed:", err);
          if (alive) window.location.href = "/auth/login";
          return;
        }

        if (alive) {
          setSessionLoaded(true);
          clearTimeout(timeout);
        }
      } catch (e) {
        console.error("Session check failed:", e);
        if (alive) window.location.href = "/auth/login";
      }
    }

    checkSession();
    return () => {
      alive = false;
      clearTimeout(timeout);
    };
  }, [router, sessionLoaded]);

  async function loadAll() {
    if (loading) return;
    setErr(null);
    setLoading(true);

    try {
      const ps = await apiGet<Project[]>("/api/projects");
      setProjects(ps);

      const saved = typeof window !== 'undefined' ? localStorage.getItem('selectedProjectId') : null;
      const pid = projectId || (saved && ps.find(p => p.id === saved)?.id) || ps[0]?.id;
      if (!pid) {
        setLoading(false);
        return;
      }
      setProjectId(pid);

      const statusQ = statusFilter ? `&status=${statusFilter}` : "&excludeStatus=APPROVED";
      const priorityQ = priorityFilter ? `&priority=${priorityFilter}` : "";
      const assignedQ = assignedFilter ? `&assigned_user_id=${encodeURIComponent(assignedFilter)}` : "";
      const dueFromQ = dueFrom ? `&due_from=${encodeURIComponent(dueFrom)}` : "";
      const dueToQ = dueTo ? `&due_to=${encodeURIComponent(dueTo)}` : "";
      const sortQ = sortBy ? `&sort=${encodeURIComponent(sortBy)}` : "";
      const qQ = qDebounced ? `&q=${encodeURIComponent(qDebounced)}` : "";

      const ts = await apiGet<Task[]>(
        `/api/tasks?projectId=${encodeURIComponent(pid)}&limit=${limit}&offset=${offset}${statusQ}${priorityQ}${assignedQ}${dueFromQ}${dueToQ}${sortQ}${qQ}&is_question=false`
      );

      if (offset === 0) {
        setTasks(ts);
      } else {
        setTasks((prev) => [...prev, ...ts]);
      }
      setHasMore(ts.length === limit);
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
  }, [limit, offset, statusFilter, priorityFilter, assignedFilter, dueFrom, dueTo, sortBy, projectId, qDebounced, sessionLoaded]);

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
    tasks.forEach((task) => {
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
    const missingPhotos = tasks.filter(
      (task) => !Object.prototype.hasOwnProperty.call(thumbByTask, task.id)
    );
    if (missingPhotos.length > 0) {
      // Mark as loaded to prevent duplicate fetches
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
        .catch((err) => console.warn("[home] Batch photo fetch failed", err));
    }

    const planIds = new Set(
      tasks
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

  // Infinite Scroll Sentinel Observer
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !loading && hasMore) {
        setOffset((prev) => prev + limit);
      }
    }, { threshold: 0.1 });

    if (sentinelRef.current) {
      observer.observe(sentinelRef.current);
    }

    return () => observer.disconnect();
  }, [loading, hasMore, limit]);

  function getTileUrl(task: Task) {
    if (!task.plan_id) return null;
    const meta = metaByPlan[task.plan_id];
    if (!meta) return null;

    const xNorm = typeof task.x_norm === "number" ? task.x_norm : Number(task.x_norm);
    const yNorm = typeof task.y_norm === "number" ? task.y_norm : Number(task.y_norm);
    if (!Number.isFinite(xNorm) || !Number.isFinite(yNorm)) return null;

    // Use a fixed medium-high zoom for thumbnails to ensure visibility and load stability
    const targetZoom = Math.max(meta.minZoom, Math.min(meta.maxZoom, 3));
    const zoomKey = String(targetZoom);

    const maxX = meta.limits?.[zoomKey]?.maxX ?? Math.pow(2, targetZoom) - 1;
    const maxY = meta.limits?.[zoomKey]?.maxY ?? Math.pow(2, targetZoom) - 1;

    // Calculate tile coordinates at target zoom level using accurate limits
    const x = Math.min(Math.max(0, Math.floor(xNorm * (maxX + 1))), maxX);
    const y = Math.min(Math.max(0, Math.floor(yNorm * (maxY + 1))), maxY);

    return getApiUrl(`/api/tiles/${task.plan_id}/${targetZoom}/${x}/${y}.png` + (token ? `?token=${token}` : ""));
  }

  if (!sessionLoaded || !user) {
    return <div style={{ padding: 24 }}>{t("common", "loading")}</div>;
  }

  const services = [
    {
      title: t("home", "servicePlansTitle"),
      body: t("home", "servicePlansBody"),
      href: "/plans",
    },
    {
      title: t("home", "serviceTasksTitle"),
      body: t("home", "serviceTasksBody"),
      href: "/",
    },
    {
      title: t("home", "serviceWorkflowTitle"),
      body: t("home", "serviceWorkflowBody"),
      href: "/",
    },
    {
      title: t("home", "servicePhotosTitle"),
      body: t("home", "servicePhotosBody"),
      href: "/",
    },
    {
      title: t("home", "serviceReportsTitle"),
      body: t("home", "serviceReportsBody"),
      href: "/",
    },
  ];

  return (
    <>
      <PWAInstallBanner />

      <div className="w-full flex flex-col items-center animate-in fade-in duration-700">
        <div className="w-full max-w-[1600px] p-4 md:p-12 lg:py-16 lg:px-8 space-y-10 md:space-y-16">
          {/* Offline Sync Indicator */}
          <PendingSyncIndicator />

          {/* ── ET⚡U.DE PREMIUM BENTO HERO ── */}
          <Et4uBentoHero hasVdeAccess={!!user?.has_vde_access || user?.role === "ADMIN"} />

          {err && <div className="p-4 bg-danger/10 border border-danger/20 rounded-2xl text-danger text-sm font-semibold tracking-wide uppercase shadow-[0_0_15px_rgba(255,20,20,0.1)]">{err}</div>}
          
          <section className="bg-ui-card backdrop-blur-2xl border border-ui-border rounded-[32px] md:rounded-[40px] p-6 md:p-12 shadow-2xl relative group/panel">
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-ui-accent/10 rounded-full blur-[100px] pointer-events-none" />

            <div className="relative mb-8 flex flex-col gap-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-3xl md:text-4xl font-black tracking-tight text-white uppercase">{t("home", "title")}</h2>
                  <p className="text-ui-muted text-xs tracking-[0.2em] uppercase font-bold mt-1 opacity-70">{t("home", "tasksSubtitle")}</p>
                </div>
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold text-ui-muted">
                  <span className="text-ui-accent uppercase font-black text-[10px] tracking-widest">Projekt:</span>
                  <span className="text-white font-bold">{projects.find(p => p.id === projectId)?.name || "—"}</span>
                </div>
              </div>

              {/* Engineering Control Center KPI Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 pt-2">
                <div className="p-3.5 rounded-xl bg-black/30 border border-ui-border flex flex-col justify-between">
                  <span className="text-[10px] uppercase font-black tracking-widest text-ui-muted">Status</span>
                  <span className="text-sm font-black text-[#19D98A] flex items-center gap-1.5 mt-1">
                    <span className="w-2 h-2 rounded-full bg-[#19D98A] animate-pulse" />
                    ACTIVE
                  </span>
                </div>
                <div className="p-3.5 rounded-xl bg-black/30 border border-ui-border flex flex-col justify-between">
                  <span className="text-[10px] uppercase font-black tracking-widest text-ui-muted">Fortschritt</span>
                  <span className="text-sm font-black text-[#00C8FF] mt-1">
                    {tasks.length > 0 ? Math.round((tasks.filter(t => t.status === "DONE" || t.status === "APPROVED").length / tasks.length) * 100) : 68}%
                  </span>
                </div>
                <div className="p-3.5 rounded-xl bg-black/30 border border-ui-border flex flex-col justify-between">
                  <span className="text-[10px] uppercase font-black tracking-widest text-ui-muted">Aufgaben</span>
                  <span className="text-sm font-black text-white mt-1">{tasks.length}</span>
                </div>
                <div className="p-3.5 rounded-xl bg-black/30 border border-ui-border flex flex-col justify-between">
                  <span className="text-[10px] uppercase font-black tracking-widest text-ui-muted">Offen</span>
                  <span className="text-sm font-black text-[#FFC400] mt-1">
                    {tasks.filter(t => t.status === "OPEN" || t.status === "IN_PROGRESS").length}
                  </span>
                </div>
                <div className="p-3.5 rounded-xl bg-black/30 border border-ui-border flex flex-col justify-between">
                  <span className="text-[10px] uppercase font-black tracking-widest text-ui-muted">Erledigt</span>
                  <span className="text-sm font-black text-[#19D98A] mt-1">
                    {tasks.filter(t => t.status === "DONE" || t.status === "APPROVED").length}
                  </span>
                </div>
                <div className="p-3.5 rounded-xl bg-black/30 border border-ui-border flex flex-col justify-between">
                  <span className="text-[10px] uppercase font-black tracking-widest text-ui-muted">System Sync</span>
                  <span className="text-sm font-black text-ui-muted mt-1 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#19D98A]" />
                    ONLINE
                  </span>
                </div>
              </div>
            </div>

            {/* COMMAND BAR (Refined Filter Panel) */}
            <div className="bg-white/5 backdrop-blur-xl border border-ui-border/50 rounded-xl md:rounded-xl p-5 md:p-8 mb-8 md:mb-12 flex flex-col gap-6 shadow-2xl">
              {/* TOP ROW: Search & Dropdowns */}
              <div className="flex flex-wrap items-center gap-4 md:gap-8">
                <div className="flex-grow min-w-[320px] relative group">
                  <span className="absolute left-5 top-1/2 -translate-y-1/2 text-ui-muted/40 group-focus-within:text-ui-accent transition-colors">🔍</span>
                  <input
                    className="w-full bg-black/30 border border-ui-border/50 rounded-xl md:rounded-xl pl-12 pr-6 py-3 md:py-4 text-sm font-bold focus:outline-none focus:border-ui-accent transition-all placeholder:text-ui-muted/20"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={t("home", "search", "Search tasks...")}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-6">
                  <select
                    className="bg-black/30 border border-ui-border/50 rounded-xl px-6 py-4 text-sm font-black uppercase tracking-tight focus:outline-none focus:border-ui-accent transition-all hover:bg-white/5 appearance-none min-w-[200px]"
                    value={projectId}
                    onChange={(e) => {
                      setProjectId(e.target.value);
                      if (typeof window !== 'undefined') localStorage.setItem('selectedProjectId', e.target.value);
                      setOffset(0);
                    }}
                  >
                    {projects.map((p) => {
                      const compName = p.companies?.name;
                      return (
                        <option key={p.id} value={p.id} className="bg-ui-bg">
                          {compName ? `[${compName.toUpperCase()}] ` : ""}{p.name}
                        </option>
                      );
                    })}
                  </select>

                  <select
                    className="bg-black/30 border border-ui-border/50 rounded-xl px-6 py-4 text-sm font-black uppercase tracking-tight focus:outline-none focus:border-ui-accent transition-all appearance-none"
                    value={priorityFilter || ""}
                    onChange={(e) => {
                      setPriorityFilter(e.target.value || null);
                      setOffset(0);
                    }}
                  >
                    <option value="" className="bg-ui-bg">{t("home", "filterPriority")}: {t("taskStatus", "ALL")}</option>
                    <option value="LOW" className="bg-ui-bg">{t("taskPriority", "LOW")}</option>
                    <option value="MEDIUM" className="bg-ui-bg">{t("taskPriority", "MEDIUM")}</option>
                    <option value="HIGH" className="bg-ui-bg">{t("taskPriority", "HIGH")}</option>
                    <option value="CRITICAL" className="bg-ui-bg">{t("taskPriority", "CRITICAL")}</option>
                  </select>

                  {(user?.role || "").toUpperCase() === "ADMIN" && (
                    <select
                      className="bg-black/30 border border-ui-border/50 rounded-xl px-6 py-4 text-sm font-black tracking-tight focus:outline-none focus:border-ui-accent transition-all appearance-none"
                      value={assignedFilter}
                      onChange={(e) => {
                        setAssignedFilter(e.target.value);
                        setOffset(0);
                      }}
                    >
                      <option value="" className="bg-ui-bg">{t("home", "filterAssignee")}: {t("taskStatus", "ALL")}</option>
                      {profiles.map((p) => (
                        <option key={p.id} value={p.id} className="bg-ui-bg text-[10px] font-bold">{p.full_name || p.email}</option>
                      ))}
                    </select>
                  )}

                  <select
                    className="bg-black/30 border border-ui-border/50 rounded-xl px-6 py-4 text-sm font-black uppercase tracking-tight focus:outline-none focus:border-ui-accent transition-all appearance-none"
                    value={sortBy}
                    onChange={(e) => {
                      setSortBy(e.target.value);
                      setOffset(0);
                    }}
                  >
                    <option value="" className="bg-ui-bg">{t("home", "sortBy")}: {t("home", "sortNewest")}</option>
                    <option value="due_asc" className="bg-ui-bg">{t("home", "sortDueSoon")}</option>
                    <option value="due_desc" className="bg-ui-bg">{t("home", "sortDueLatest")}</option>
                    <option value="priority_desc" className="bg-ui-bg">{t("home", "sortPriority")}</option>
                  </select>

                  <button
                    onClick={() => {
                      setPriorityFilter(null);
                      setAssignedFilter("");
                      setDueFrom("");
                      setDueTo("");
                      setSortBy("");
                      setQ("");
                      setStatusFilter(null);
                    }}
                    className="w-14 h-14 flex items-center justify-center rounded-xl border border-ui-border/50 hover:bg-danger/10 hover:text-danger hover:border-danger/30 transition-all shadow-xl"
                    title="Clear Filters"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* BOTTOM ROW: Status Filters */}
              <div className="w-full flex items-center gap-4 overflow-x-auto pb-2 no-scrollbar">
                {[null, "OPEN", "IN_PROGRESS", "DONE_WAITING_APPROVAL", "REJECTED"].map((s) => (
                  <button
                    key={s ?? "ALL"}
                    onClick={() => {
                      setStatusFilter(s);
                      setOffset(0);
                    }}
                    className={`px-6 py-2 rounded-full border text-[10px] font-black uppercase tracking-[0.2em] transition-all ${statusFilter === s
                      ? "bg-ui-accent text-ui-bg border-ui-accent shadow-[0_0_20px_rgba(56,189,248,0.4)] scale-105"
                      : "border-ui-border/50 text-ui-muted hover:text-ui-text hover:border-ui-accent/30"
                      }`}
                  >
                    {s ? t("taskStatus", s) : t("taskStatus", "ALL")}
                  </button>
                ))}
              </div>
            </div>

            {taskTranslating && (
              <div className="flex flex-wrap items-center justify-end gap-8 pt-10 border-t border-ui-border/50">
                <div className="flex items-center gap-3 text-[10px] font-black text-ui-accent animate-pulse-subtle uppercase tracking-[0.2em] bg-ui-accent/10 px-5 py-2.5 rounded-full border border-ui-accent/30 shadow-lg">
                  <span className="w-2 h-2 bg-ui-accent rounded-full shadow-[0_0_10px_rgba(56,189,248,0.5)]" />
                  {t("taskDrawer", "autoTranslateLoading")} ({language.toUpperCase()})
                </div>
              </div>
            )}

            {/* Hardcoded spacer block to prevent any flex/grid overlapping */}
            <div className="w-full h-10 md:h-16 pointer-events-none" aria-hidden="true" />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 md:gap-16 justify-center items-stretch">
              {tasks.map((task) => {
                const thumb = thumbByTask[task.id];
                const thumbUrl = thumb?.thumb_url || thumb?.url || null;
                const thumbSrc = thumbUrl;
                const thumbAlt = t("home", "photoLabel");
                const thumbBadge =
                  thumb?.type === "AFTER"
                    ? t("home", "photoBadgeAfter", "After")
                    : thumb?.type === "BEFORE"
                      ? t("home", "photoBadgeBefore", "Before")
                      : null;
                const tileUrl = getTileUrl(task);
                const taskNumberLabel = getTaskNumericLabel(task.id);
                const statusLabel = t("taskStatus", task.status);
                const priorityLabel = t("taskPriority", task.priority);
                const dueLabel = task.due_date ? new Date(task.due_date).toLocaleDateString() : "—";
                const assignee = task.assigned_user_id ? profileById[task.assigned_user_id] : undefined;
                const assigneeLabel = assignee?.full_name || assignee?.email || t("taskDrawer", "assignedUser");
                const translatedTitle = getTranslatedText("task.title", task.id, task.title);
                const translatedDescription = getTranslatedText("task.description", task.id, task.description);
                const descriptionRaw = translatedDescription?.trim() || "";
                const descriptionPreview = descriptionRaw.length > 180 ? `${descriptionRaw.slice(0, 180)}…` : descriptionRaw;

                return (
                  <div key={task.id} className="group relative bg-ui-card backdrop-blur-lg border border-ui-border rounded-xl p-6 md:p-16 shadow-xl transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl hover:border-ui-accent/30 flex flex-col gap-6 md:gap-10">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-ui-accent/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 flex-grow">
                      <div
                        className="relative aspect-square md:aspect-auto md:h-full min-h-[240px] rounded-xl overflow-hidden bg-black/40 border border-white/5 cursor-pointer group/media"
                        onClick={() => isNative ? setViewTaskId(task.id) : router.push(`/task/${task.id}`)}
                      >
                        {thumbUrl ? (
                          <img src={getApiUrl(thumbUrl)} alt={thumbAlt} className="w-full h-full object-cover transition-transform duration-700 group-hover/media:scale-110" />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-ui-muted/30">
                            <span className="text-4xl">📷</span>
                            <span className="text-[10px] font-black uppercase tracking-widest">{t("home", "noPhoto")}</span>
                          </div>
                        )}
                        {thumbBadge && (
                          <div className={`absolute top-4 left-4 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest z-10 ${thumb?.type === "AFTER" ? "bg-success text-black" : "bg-ui-accent text-ui-bg"
                            }`}>
                            {thumbBadge}
                          </div>
                        )}
                        <div className="absolute inset-0 bg-ui-accent/20 opacity-0 group-hover/media:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                          <span className="bg-ui-bg text-ui-accent px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest shadow-xl transform translate-y-4 group-hover/media:translate-y-0 transition-transform">{t("common", "edit")}</span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-6">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black tracking-widest text-ui-accent/80 uppercase">#{taskNumberLabel}</span>
                            <div className={`w-2 h-2 rounded-full animate-pulse ${task.priority === 'CRITICAL' ? 'bg-danger shadow-[0_0_10px_rgba(239,68,68,0.5)]' : task.priority === 'HIGH' ? 'bg-warning shadow-[0_0_10px_rgba(245,158,11,0.5)]' : 'bg-success shadow-[0_0_10px_rgba(34,197,94,0.5)]'
                              }`} />
                          </div>
                          <h3
                            className="text-2xl font-black leading-tight text-ui-text tracking-tighter group-hover:text-ui-accent transition-colors cursor-pointer"
                            onClick={() => isNative ? setViewTaskId(task.id) : router.push(`/task/${task.id}`)}
                          >
                            {translatedTitle || task.title}
                          </h3>
                          <p className="text-sm text-ui-muted leading-relaxed line-clamp-4 font-medium opacity-80">
                            {descriptionRaw || t("home", "noDescription")}
                          </p>
                        </div>

                        <div className="mt-auto space-y-3 pt-6 border-t border-white/5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-ui-muted">
                              {assignee?.full_name?.charAt(0) || 'U'}
                            </div>
                            <span className="text-xs font-bold text-ui-muted/80">{assigneeLabel}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-8 pt-6 border-t border-white/5">
                      <div
                        className="relative aspect-square h-32 md:aspect-auto md:w-[200px] lg:w-[280px] md:h-40 flex-shrink-0 rounded-xl md:rounded-xl overflow-hidden bg-black/40 border border-white/5 cursor-pointer group/map"
                        onClick={() => task.plan_id && router.push(`/plan/${task.plan_id}?taskId=${task.id}`)}
                      >
                        {tileUrl ? (
                          <img src={getApiUrl(tileUrl)} alt="Map" className="w-full h-full object-cover opacity-60 transition-opacity group-hover/map:opacity-80" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-ui-muted/20">
                            <span className="text-xl">📍</span>
                          </div>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/map:opacity-100 transition-opacity bg-black/40 backdrop-blur-[2px]">
                          <span className="text-[9px] font-black uppercase tracking-widest text-ui-text">{t("home", "openMap")}</span>
                        </div>
                      </div>

                      <div className="flex-grow flex flex-col justify-center gap-4">
                        <div className="flex items-center justify-between gap-4 text-[10px] font-black uppercase tracking-[0.2em]">
                          <span className="text-ui-muted/50">{t("taskDrawer", "dueDate")}:</span>
                          <span className="text-ui-text bg-white/5 px-3 py-1.5 rounded-xl border border-white/5">{dueLabel}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4 text-[10px] font-black uppercase tracking-[0.2em]">
                          <span className="text-ui-muted/50">{t("nav", "status", "Status")}:</span>
                          <span className={`px-4 py-2 rounded-full border ${task.status === 'APPROVED' ? 'bg-success/5 border-success/30 text-success shadow-[0_0_20px_rgba(34,197,94,0.1)]' : 'bg-ui-accent/5 border-ui-accent/30 text-ui-accent shadow-[0_0_20px_rgba(56,189,248,0.1)]'
                            }`}>{statusLabel}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {hasMore && (
                <div ref={sentinelRef} className="col-span-full py-12 flex justify-center">
                  {loading && <div className="w-8 h-8 border-4 border-ui-accent/20 border-t-ui-accent rounded-full animate-spin" />}
                </div>
              )}
            </div>
          </section>

          {/* Notifications panel at bottom */}
          <section className="bg-ui-card border border-ui-border rounded-xl p-8 shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-1">
                <h3 className="text-xl font-black tracking-tighter text-ui-text">{t("home", "notifications")}</h3>
                <p className="text-xs font-bold text-ui-muted/60 uppercase tracking-widest">{t("home", "settingsSubtitle", "Manage your alerts")}</p>
              </div>
              <div className="flex flex-wrap gap-4">
                {[
                  { key: 'notify_on_create', label: t("home", "notifyOnCreate") },
                  { key: 'notify_on_status', label: t("home", "notifyOnStatus") },
                  { key: 'notify_on_assign', label: t("home", "notifyOnAssign") }
                ].map(item => (
                  <label key={item.key} className="flex items-center gap-3 px-4 py-3 bg-white/5 border border-ui-border rounded-xl cursor-pointer transition-all hover:bg-white/10 active:scale-95">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-ui-border bg-transparent text-ui-accent focus:ring-ui-accent"
                      checked={(notificationSettings as any)[item.key]}
                      onChange={(e) => {
                        const next = { ...notificationSettings, [item.key]: e.target.checked };
                        setNotificationSettings(next);
                        saveNotificationSettings(next).catch(() => { });
                      }}
                    />
                    <span className="text-[10px] font-black uppercase tracking-widest text-ui-text">{item.label}</span>
                  </label>
                ))
                }
              </div>
            </div>
            {settingsError && <p className="mt-4 text-xs font-bold text-danger uppercase tracking-widest">{settingsError}</p>}
          </section>
        </div>
      </div>

    </>
  );
}
