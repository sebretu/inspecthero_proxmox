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
import dynamic from "next/dynamic";

const AufmassCanvas = dynamic(() => import("@/components/aufmass/AufmassCanvas"), {
  ssr: false,
});

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

export default function QuestionsClient() {
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
  const [shapesByPhoto, setShapesByPhoto] = useState<Record<string, any[]>>({});

  const [metaByPlan, setMetaByPlan] = useState<Record<string, PlanMeta | null>>({});
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [activeTab, setActiveTab] = useState<"questions" | "answers">("questions");
  const [err, setErr] = useState<string | null>(null);
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

  const kanbanColumns = activeTab === "answers" ? ["APPROVED"] : ["OPEN"];
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
    async function checkSession() {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (error || !data?.session) {
          router.push("/auth/login");
          return;
        }

        // Get user profile
        const userEmail = data.session.user.email;
        let j: any;
        try {
          j = await apiGet<any>('/api/me');
        } catch (err) {
          throw new Error("Profile load failed");
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

      const statusQ = activeTab === "answers" ? "&status=APPROVED" : "&status=OPEN";
      const priorityQ = priorityFilter ? `&priority=${priorityFilter}` : "";
      const assignedQ = assignedFilter ? `&assigned_user_id=${encodeURIComponent(assignedFilter)}` : "";
      const dueFromQ = dueFrom ? `&due_from=${encodeURIComponent(dueFrom)}` : "";
      const dueToQ = dueTo ? `&due_to=${encodeURIComponent(dueTo)}` : "";
      const sortQ = sortBy ? `&sort=${encodeURIComponent(sortBy)}` : "";
      const qQ = qDebounced ? `&q=${encodeURIComponent(qDebounced)}` : "";

      const ts = await apiGet<Task[]>(
        `/api/tasks?projectId=${encodeURIComponent(pid)}&limit=${limit}&offset=${offset}${statusQ}${priorityQ}${assignedQ}${dueFromQ}${dueToQ}${sortQ}${qQ}&is_question=true`
      );
      if (offset === 0) setTasks(ts);
      else setTasks(prev => [...prev, ...ts]);

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
  }, [limit, offset, activeTab, priorityFilter, assignedFilter, dueFrom, dueTo, sortBy, projectId, qDebounced, sessionLoaded]);

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
                id: selected.id,
              };
            }
          });
          setThumbByTask(fetchedThumbs);
        })
        .catch((err) => console.warn("[questions] Batch photo fetch failed", err));
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

    function handleTaskCreated() {
      loadAll().catch(() => { });
    }

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
          // Filter sessions that have photo_id and task_id in the visible tasks list
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
        console.error("Failed to load aufmass sessions in QuestionsClient:", e);
      }
    })();
    return () => {
      active = false;
    };
  }, [projectId, tasks]);

  // Infinite Scroll Sentinel Observer
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

    // Compute using maxX + 1 because the range of tile indices is 0 to maxX (inclusive)
    const x = Math.min(Math.max(0, Math.floor(xNorm * (maxX + 1))), maxX);
    const y = Math.min(Math.max(0, Math.floor(yNorm * (maxY + 1))), maxY);

    return getApiUrl(`/api/tiles/${task.plan_id}/${meta.maxZoom}/${x}/${y}.png` + (token ? `?token=${token}` : ""));
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
      title: t("home", "serviceKanbanTitle"),
      body: t("home", "serviceKanbanBody"),
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

      <main className="home-main">

        {/* Offline Sync Indicator */}
        <PendingSyncIndicator />

        {err && <div className="home-card-error">{err}</div>}
        <section className="home-task-panel">
          <div className="flex flex-col gap-0.5 px-1 mb-8">
            <h2 className="text-2xl font-black uppercase tracking-tight text-ui-text">{t("home", "questionsTitle", "Pytania")}</h2>
            <div className="text-[10px] font-bold text-ui-muted/50 uppercase tracking-tight">{t("home", "questionsSubtitle", "Zarządzaj zadanymi pytaniami")}</div>
          </div>

          <div style={{ display: "flex", gap: "12px", marginBottom: "24px" }}>
            <button
              onClick={() => { setActiveTab("questions"); setOffset(0); }}
              style={{ padding: "8px 16px", borderRadius: "12px", border: "1px solid var(--border)", background: activeTab === "questions" ? "var(--primary)" : "transparent", color: activeTab === "questions" ? "#fff" : "var(--foreground)", fontWeight: 600, cursor: "pointer" }}
            >
              {t("home", "tabQuestions", "Pytania")}
            </button>
            <button
              onClick={() => { setActiveTab("answers"); setOffset(0); }}
              style={{ padding: "8px 16px", borderRadius: "12px", border: "1px solid var(--border)", background: activeTab === "answers" ? "var(--primary)" : "transparent", color: activeTab === "answers" ? "#fff" : "var(--foreground)", fontWeight: 600, cursor: "pointer" }}
            >
              {t("home", "tabAnswers", "Odpowiedzi")}
            </button>
          </div>

          <div className="home-filters">
            <label>
              {t("home", "selectProject")}:
              <select
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  if (typeof window !== 'undefined') localStorage.setItem('selectedProjectId', e.target.value);
                  setOffset(0);
                }}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.companies?.name ? `[${p.companies.name.toUpperCase()}] ` : ""}{p.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              {t("common", "search")}:
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("home", "search")}
              />
            </label>

            {(user?.role || "").toUpperCase() === "ADMIN" && (
              <label>
                {t("home", "filterAssignee")}:
                <select
                  value={assignedFilter}
                  onChange={(e) => {
                    setAssignedFilter(e.target.value);
                    setOffset(0);
                  }}
                >
                  <option value="">{t("taskStatus", "ALL")}</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name || p.email || p.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label>
              {t("home", "dueFrom")}:
              <input
                type="date"
                value={dueFrom}
                onChange={(e) => {
                  setDueFrom(e.target.value);
                  setOffset(0);
                }}
              />
            </label>

            <label>
              {t("home", "dueTo")}:
              <input
                type="date"
                value={dueTo}
                onChange={(e) => {
                  setDueTo(e.target.value);
                  setOffset(0);
                }}
              />
            </label>

            <label>
              {t("home", "sortBy")}:
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value);
                  setOffset(0);
                }}
              >
                <option value="">{t("home", "sortNewest")}</option>
              </select>
            </label>
          </div>

          <div ref={sentinelRef} style={{ height: "4px", width: "100%" }} />

          {taskTranslating && (
            <div className="home-card-note">
              {t("taskDrawer", "autoTranslateLoading", "Translating content...")} ({language.toUpperCase()})
            </div>
          )}
          {taskTranslationError && (
            <div className="home-card-error">
              {t("taskDrawer", "autoTranslateError", "Auto translation failed")}: {taskTranslationError}
            </div>
          )}

          <div className="tasks-grid">
            {tasks.map((task) => {
              const thumb = thumbByTask[task.id];
              // Użyj thumb_url jeśli dostępny, w przeciwnym razie url
              const thumbUrl = thumb?.thumb_url || thumb?.url || null;
              // Preferuj webp jeśli dostępny
              let thumbSrc = thumbUrl;
              if (thumbUrl && thumbUrl.endsWith('.jpg')) {
                const webpUrl = thumbUrl.replace(/\.jpg$/, '.webp');
                thumbSrc = webpUrl;
              }
              const thumbType = thumb?.type || null;
              const thumbAlt =
                thumbType === "AFTER"
                  ? t("home", "photoLabelAfter", "After photo")
                  : thumbType === "BEFORE"
                    ? t("home", "photoLabelBefore", "Before photo")
                    : t("home", "photoLabel", "Task photo");
              const thumbBadge =
                thumbType === "AFTER"
                  ? t("home", "photoBadgeAfter", "After")
                  : thumbType === "BEFORE"
                    ? t("home", "photoBadgeBefore", "Before")
                    : null;
              const tileUrl = getTileUrl(task);
              const taskNumberLabel = getTaskNumericLabel(task.id);
              const statusLabel = t("taskStatus", task.status, task.status);
              const statusClassName = statusBadgeClassByCode[task.status] || "task-card__badge--default";
              const footerStatusClassByCode: Record<string, string> = {
                OPEN: "task-card__footer-status--open",
                IN_PROGRESS: "task-card__footer-status--in-progress",
                DONE_WAITING_APPROVAL: "task-card__footer-status--waiting",
                APPROVED: "task-card__footer-status--approved",
                REJECTED: "task-card__footer-status--rejected",
              };
              const footerStatusClass = footerStatusClassByCode[task.status] || "";
              const priorityLabel = t("taskPriority", task.priority, task.priority);
              const dueLabel = task.due_date ? new Date(task.due_date).toLocaleDateString() : "—";
              const assignee = task.assigned_user_id ? profileById[task.assigned_user_id] : undefined;
              const assigneeLabel = assignee?.full_name || assignee?.email || t("taskDrawer", "assignedUser");
              const assigneeText = assignee ? assigneeLabel : `${t("taskDrawer", "assignedUser")}: —`;
              const translatedTitle = getTranslatedText("task.title", task.id, task.title);
              const translatedDescription = getTranslatedText("task.description", task.id, task.description);
              const descriptionRaw = translatedDescription?.trim() || "";
              const hasDescription = descriptionRaw.length > 0;
              const descriptionPreview = hasDescription && descriptionRaw.length > 220 ? `${descriptionRaw.slice(0, 220)}…` : descriptionRaw;
              const descriptionClasses = ["task-card__description", hasDescription ? "" : "task-card__description--muted"].filter(Boolean).join(" ");
              const descriptionContent = hasDescription ? descriptionPreview : t("home", "noDescription");

              return (
                <div key={task.id} className="task-card">
                  {/* Kliknięcie w zdjęcie → edycja pytań */}
                  <div
                    className="task-card__media"
                    onClick={() => router.push(`/task/${task.id}?isQuestion=true`)}
                    style={{ cursor: "pointer" }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && router.push(`/task/${task.id}?isQuestion=true`)}
                    aria-label={translatedTitle || task.title}
                  >
                    {thumbUrl ? (
                      <>
                        {thumb.id && shapesByPhoto[thumb.id] && shapesByPhoto[thumb.id].length > 0 ? (
                          <div className="w-full h-full pointer-events-none absolute inset-0">
                            <AufmassCanvas
                              imageUrl={getApiUrl(thumbUrl)}
                              shapes={shapesByPhoto[thumb.id]}
                              readOnly={true}
                            />
                          </div>
                        ) : (
                          <img src={getApiUrl(thumbUrl)} alt={thumbAlt} />
                        )}
                        {thumbBadge && (
                          <span
                            className={`task-card__media-badge ${thumbType === "AFTER" ? "task-card__media-badge--after" : "task-card__media-badge--before"
                              }`.trim()}
                          >
                            {thumbBadge}
                          </span>
                        )}
                      </>
                    ) : (
                      <div className="task-card__media-placeholder">
                        <span aria-hidden="true">📷</span>
                        <small>{t("home", "noPhoto", "No photo yet")}</small>
                      </div>
                    )}
                    <span className="task-card__hover-label" aria-hidden="true">{t("common", "edit", "Edit")}</span>
                  </div>

                  <div
                    className="task-card__body"
                    onClick={() => router.push(`/task/${task.id}?isQuestion=true`)}
                    style={{ cursor: "pointer" }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && router.push(`/task/${task.id}?isQuestion=true`)}
                  >
                    <h3>{translatedTitle || task.title}</h3>
                    <p className={descriptionClasses}>{descriptionContent}</p>
                    <p className="task-card__note">
                      {assigneeText}
                    </p>
                  </div>

                  <div
                    className="task-card__map"
                    onClick={() => {
                      if (task.plan_id) {
                        router.push(`/plan/${task.plan_id}?taskId=${task.id}&isQuestion=true`);
                      } else {
                        router.push(`/task/${task.id}?isQuestion=true`);
                      }
                    }}
                    style={{ cursor: task.plan_id ? "pointer" : "default" }}
                    role={task.plan_id ? "button" : undefined}
                    tabIndex={task.plan_id ? 0 : undefined}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && task.plan_id) {
                        router.push(`/plan/${task.plan_id}?taskId=${task.id}&isQuestion=true`);
                      }
                    }}
                    aria-label={task.plan_id ? t("home", "openPlanLabel", "Open plan") : undefined}
                  >
                    {tileUrl ? (
                      <img src={getApiUrl(tileUrl)} alt={t("home", "mapLabel")} />
                    ) : (
                      <div className="task-card__map-placeholder">
                        <span aria-hidden="true">📍</span>
                        <small>{t("home", "noTile")}</small>
                      </div>
                    )}
                    {taskNumberLabel && (
                      <span className="task-card__map-marker task-marker task-marker--thumb task-marker--question">{taskNumberLabel}</span>
                    )}
                    {task.plan_id && (
                      <span className="task-card__hover-label" aria-hidden="true">{t("home", "openMap", "Map")}</span>
                    )}
                  </div>

                  <div
                    className="task-card__footer"
                    onClick={() => router.push(`/task/${task.id}`)}
                    style={{ cursor: "pointer" }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && router.push(`/task/${task.id}`)}
                  >
                    <span>
                      {priorityLabel} · {dueLabel}
                    </span>
                    <span className={`task-card__footer-status ${footerStatusClass}`.trim()}>
                      {statusLabel}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Notifications panel at bottom */}
        <section className="home-control" style={{ marginTop: 16 }}>
          <div className="home-control-card">
            <div className="home-card-title">{t("home", "notifications")}</div>
            <div className="home-toggle-row">
              <label className="home-toggle" style={{ color: "#000000" }}>
                <input
                  type="checkbox"
                  checked={notificationSettings.notify_on_create}
                  onChange={(e) => {
                    const next = { ...notificationSettings, notify_on_create: e.target.checked };
                    setNotificationSettings(next);
                    saveNotificationSettings(next).catch(() => { });
                  }}
                />
                {t("home", "notifyOnCreate")}
              </label>
              <label className="home-toggle" style={{ color: "#000000" }}>
                <input
                  type="checkbox"
                  checked={notificationSettings.notify_on_status}
                  onChange={(e) => {
                    const next = { ...notificationSettings, notify_on_status: e.target.checked };
                    setNotificationSettings(next);
                    saveNotificationSettings(next).catch(() => { });
                  }}
                />
                {t("home", "notifyOnStatus")}
              </label>
              <label className="home-toggle" style={{ color: "#000000" }}>
                <input
                  type="checkbox"
                  checked={notificationSettings.notify_on_assign}
                  onChange={(e) => {
                    const next = { ...notificationSettings, notify_on_assign: e.target.checked };
                    setNotificationSettings(next);
                    saveNotificationSettings(next).catch(() => { });
                  }}
                />
                {t("home", "notifyOnAssign")}
              </label>
              {settingsSaving && <span className="home-card-note">{t("home", "savingSettings")}</span>}
              {settingsError && <span className="home-card-error">{settingsError}</span>}
            </div>
          </div>
        </section>
      </main >
    </>
  );
}
