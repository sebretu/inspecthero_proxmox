"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiGet, apiPost, getToken } from "@/lib/apiClient";
import { supabase } from "@/lib/supabase";
import type { Language } from "@/lib/translations";
import { PWAInstallBanner } from "@/components/PWAInstallBanner";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTaskNumericLabel } from "@/lib/taskNumber";
import TaskDrawer from "@/components/TaskDrawer";
import { useSync } from "@/hooks/useSync";

function PendingSyncIndicator() {
  const { pendingCount, isSyncing } = useSync();
  const { t } = useLanguage();

  if (pendingCount === 0 && !isSyncing) return null;

  return (
    <div style={{
      margin: "0 16px 16px 16px",
      padding: "12px",
      background: "#fff",
      borderRadius: 12,
      border: "1px solid var(--home-line)",
      display: "flex",
      alignItems: "center",
      gap: 12,
      boxShadow: "0 2px 8px rgba(0,0,0,0.05)"
    }}>
      <div style={{
        width: 10,
        height: 10,
        borderRadius: "50%",
        background: isSyncing ? "#2f6bff" : "#f59e0b",
        animation: isSyncing ? "pulse 1s infinite" : "none"
      }} />
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--home-ink)" }}>
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

type Project = { id: string; name: string };
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
  const [viewMode, setViewMode] = useState<"list" | "kanban">("list");
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [limit, setLimit] = useState(10);
  const [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [taskTranslationMap, setTaskTranslationMap] = useState<Record<string, string>>({});
  const [taskTranslationLang, setTaskTranslationLang] = useState<Language | null>(null);
  const [taskTranslating, setTaskTranslating] = useState(false);
  const [taskTranslationError, setTaskTranslationError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // New Task Flow State
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [newTaskProjectId, setNewTaskProjectId] = useState("");
  const [newTaskPlanId, setNewTaskPlanId] = useState("");
  const [availablePlans, setAvailablePlans] = useState<Plan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [createDraft, setCreateDraft] = useState<{
    project_id: string;
    plan_id: string;
    x_norm: number;
    y_norm: number;
    created_by?: string;
  } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!showNewTaskModal) return;
    if (!newTaskProjectId) {
      setAvailablePlans([]);
      return;
    }

    setLoadingPlans(true);
    apiGet<any[]>(`/api/plans?projectId=${encodeURIComponent(newTaskProjectId)}`)
      .then((data) => {
        // Map to simpler Plan structure if needed, or just use what we get
        // Assuming API returns object with floor_id, etc.
        // We need building/floor names for better UX, but for now just list them
        // Should ideally fetch hierarchy or enrich info. 
        // For simplicity, let's just show Plan version? Or maybe we can fetch floors too?
        // Let's rely on what we have. API /api/plans returns Plan objects. 
        // We probably want to group by floor?
        // Let's just list them for now. 
        // Ideally we should use the same logic as loadAll in plans page but simplified.
        setAvailablePlans(data || []);
        if (data && data.length > 0 && !newTaskPlanId) {
          setNewTaskPlanId(data[0].id);
        }
      })
      .catch((e) => console.error("Failed to load plans", e))
      .finally(() => setLoadingPlans(false));
  }, [showNewTaskModal, newTaskProjectId]);

  const openNewTaskModal = () => {
    setNewTaskProjectId(projectId || (projects[0]?.id ?? ""));
    setNewTaskPlanId("");
    setShowNewTaskModal(true);
  };

  const closeNewTaskModal = () => {
    setShowNewTaskModal(false);
  };

  const handleStartCreateTask = () => {
    if (!newTaskProjectId || !newTaskPlanId) return;

    setCreateDraft({
      project_id: newTaskProjectId,
      plan_id: newTaskPlanId,
      x_norm: 0.5, // Default center
      y_norm: 0.5, // Default center
      created_by: user?.id,
    });
    setDrawerOpen(true);
    closeNewTaskModal();
  };

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

  const kanbanColumns = ["OPEN", "IN_PROGRESS", "DONE_WAITING_APPROVAL", "APPROVED", "REJECTED"] as const;
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
    if (typeof window === "undefined") return u;

    const host = window.location.hostname;
    const proto = window.location.protocol;
    return u.replace(/^http:\/\/[^/]+:54321/i, `${proto}//${host}:54321`);
  }

  type TaskPhotoRow = { id: string; url?: string | null; photo_type?: "BEFORE" | "AFTER" | null };

  const loadThumb = useCallback(async (taskId: string) => {
    try {
      const fetchPhotos = async (phase?: "AFTER" | "BEFORE") => {
        const phaseParam = phase ? `&phase=${phase}` : "";
        return apiGet<{ ok: boolean; data: TaskPhotoRow[] }>(`/api/task-photos?taskId=${encodeURIComponent(taskId)}${phaseParam}&limit=1`
        );
      };

      let res = await fetchPhotos("AFTER");
      let photos = res?.data ?? [];
      if (!Array.isArray(photos) || photos.length === 0) {
        res = await fetchPhotos();
        photos = res?.data ?? [];
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

      const r = await fetch(`/api/tiles/${encodeURIComponent(planId)}/meta`, {
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
        const token = data.session.access_token;
        const r = await fetch("/api/me", { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) throw new Error("Profile load failed");
        const j = await r.json();
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
    setErr(null);

    try {
      const ps = await apiGet<Project[]>("/api/projects");
      setProjects(ps);

      const pid = projectId || ps[0]?.id;
      if (!pid) return;
      setProjectId(pid);

      const statusQ = statusFilter ? `&status=${statusFilter}` : "";
      const priorityQ = priorityFilter ? `&priority=${priorityFilter}` : "";
      const assignedQ = assignedFilter ? `&assigned_user_id=${encodeURIComponent(assignedFilter)}` : "";
      const dueFromQ = dueFrom ? `&due_from=${encodeURIComponent(dueFrom)}` : "";
      const dueToQ = dueTo ? `&due_to=${encodeURIComponent(dueTo)}` : "";
      const sortQ = sortBy ? `&sort=${encodeURIComponent(sortBy)}` : "";
      const qQ = qDebounced ? `&q=${encodeURIComponent(qDebounced)}` : "";

      const ts = await apiGet<Task[]>(
        `/api/tasks?projectId=${encodeURIComponent(pid)}&limit=${limit}&offset=${offset}${statusQ}${priorityQ}${assignedQ}${dueFromQ}${dueToQ}${sortQ}${qQ}`
      );
      setTasks(ts);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setErr(message);
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
    tasks.forEach((task) => {
      if (!Object.prototype.hasOwnProperty.call(thumbByTask, task.id)) {
        loadThumb(task.id).catch(() => { });
      }
    });

    const planIds = new Set(
      tasks
        .map((task) => task.plan_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    );

    planIds.forEach((planId) => {
      if (!Object.prototype.hasOwnProperty.call(metaByPlan, planId)) {
        loadPlanMeta(planId).catch(() => { });
      }
    });
  }, [tasks, thumbByTask, metaByPlan, loadThumb]);

  useEffect(() => {
    function handlePhotoAdded(event: Event) {
      const detail = (event as CustomEvent)?.detail;
      const taskIdFromEvent = detail?.taskId;
      if (!taskIdFromEvent) return;
      loadThumb(taskIdFromEvent).catch(() => { });
    }

    window.addEventListener("task-photo-added", handlePhotoAdded as EventListener);

    // Listen for task creation to reload list
    function onTaskCreated() {
      handleTaskCreated();
    }
    window.addEventListener("task-created", onTaskCreated as EventListener);

    return () => {
      window.removeEventListener("task-photo-added", handlePhotoAdded as EventListener);
      window.removeEventListener("task-created", onTaskCreated as EventListener);
    };
  }, [loadThumb]);

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
    const x = Math.min(Math.max(0, Math.floor(xNorm * meta.gridW)), maxX);
    const y = Math.min(Math.max(0, Math.floor(yNorm * meta.gridH)), maxY);

    return `/api/tiles/${task.plan_id}/${meta.maxZoom}/${x}/${y}.png` + (token ? `?token=${token}` : "");
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
        <section className="home-control">
          <div className="home-control-card">
            <div className="home-card-title">{t("home", "notifications")}</div>
            <div className="home-toggle-row">
              <label className="home-toggle">
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
              <label className="home-toggle">
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
              <label className="home-toggle">
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
          <div className="home-control-card" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <button
              onClick={openNewTaskModal}
              className="hero-btn"
            >
              <span className="hero-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L4 5V11C4 16 7.5 20.5 12 22C16.5 20.5 20 16 20 11V5L12 2Z"
                    stroke="white" strokeWidth="2" />
                  <path d="M8 12L11 15L16 9"
                    stroke="white" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </span>
              {t("home", "createNewTask", "Create new task")}
            </button>
          </div>
        </section>

        {/* Offline Sync Indicator */}
        <PendingSyncIndicator />

        {err && <div className="home-card-error">{err}</div>}
        <section className="home-task-panel">
          <div className="home-section-header">
            <h2>{t("home", "title")}</h2>
            <p>{t("home", "tasksSubtitle")}</p>
          </div>

          <div className="home-filters">
            <label>
              {t("home", "selectProject")}:
              <select
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  setOffset(0);
                }}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
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

            <div className="home-status-filter">
              {[null, "OPEN", "DONE_WAITING_APPROVAL", "APPROVED"].map((s) => (
                <button
                  key={s ?? "ALL"}
                  onClick={() => {
                    setStatusFilter(s);
                    setOffset(0);
                  }}
                  className={statusFilter === s ? "home-pill active" : "home-pill"}
                >
                  {s ? t("taskStatus", s) : t("taskStatus", "ALL")}
                </button>
              ))}
            </div>

            <label>
              {t("home", "filterPriority")}:
              <select
                value={priorityFilter || ""}
                onChange={(e) => {
                  setPriorityFilter(e.target.value || null);
                  setOffset(0);
                }}
              >
                <option value="">{t("taskStatus", "ALL")}</option>
                <option value="LOW">{t("taskPriority", "LOW")}</option>
                <option value="MEDIUM">{t("taskPriority", "MEDIUM")}</option>
                <option value="HIGH">{t("taskPriority", "HIGH")}</option>
                <option value="CRITICAL">{t("taskPriority", "CRITICAL")}</option>
              </select>
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
                <option value="due_asc">{t("home", "sortDueSoon")}</option>
                <option value="due_desc">{t("home", "sortDueLatest")}</option>
                <option value="priority_desc">{t("home", "sortPriority")}</option>
              </select>
            </label>
          </div>

          <div className="home-view-toggle">
            <span>{t("home", "viewMode")}:</span>
            <button
              onClick={() => setViewMode("list")}
              className={viewMode === "list" ? "home-toggle active" : "home-toggle"}
            >
              {t("home", "viewList")}
            </button>
            <button
              onClick={() => setViewMode("kanban")}
              className={viewMode === "kanban" ? "home-toggle active" : "home-toggle"}
            >
              {t("home", "viewKanban")}
            </button>
          </div>

          <div className="home-pagination">
            <button
              onClick={() => setOffset((o) => Math.max(0, o - limit))}
              disabled={offset === 0}
            >
              {t("home", "prev")}
            </button>
            <button onClick={() => setOffset((o) => o + limit)}>{t("home", "next")}</button>
            <label>
              {t("home", "limit")}:
              <input
                type="number"
                value={limit}
                min={1}
                max={200}
                onChange={(e) => {
                  setLimit(Math.max(1, Math.min(200, Number(e.target.value) || 10)));
                  setOffset(0);
                }}
              />
            </label>
          </div>

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

          {viewMode === "list" ? (
            <div className="tasks-grid">
              {tasks.map((task) => {
                const thumb = thumbByTask[task.id];
                const thumbUrl = thumb?.url || null;
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
                  <Link href={`/task/${task.id}`} key={task.id} className="task-card">
                    <div className="task-card__media">
                      {thumbUrl ? (
                        <>
                          <img src={thumbUrl} alt={thumbAlt} />
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
                          <p>{t("home", "noPhoto", "No photo yet")}</p>
                        </div>
                      )}
                    </div>

                    <div className="task-card__body">
                      <div className="task-card__status-row">
                        <span className={`task-card__badge ${statusClassName}`.trim()}>{statusLabel}</span>
                        <span className="task-card__pill">{priorityLabel}</span>
                      </div>
                      <h3>{translatedTitle || task.title}</h3>
                      <p className={descriptionClasses}>{descriptionContent}</p>
                      <p className="task-card__note">
                        {assigneeText} · {t("taskDrawer", "dueDate")}: {dueLabel}
                      </p>
                    </div>

                    <div className="task-card__map">
                      {tileUrl ? (
                        <img src={tileUrl} alt={t("home", "mapLabel")} />
                      ) : (
                        <div className="task-card__map-placeholder">
                          <span aria-hidden="true">📍</span>
                          <small>{t("home", "noTile")}</small>
                        </div>
                      )}
                      {taskNumberLabel && (
                        <span className="task-card__map-marker task-marker task-marker--thumb">{taskNumberLabel}</span>
                      )}
                    </div>

                    <div className="task-card__footer">
                      <span>
                        {priorityLabel} · {dueLabel}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="home-kanban">
              {kanbanColumns.map((status) => {
                const items = tasks.filter((t) => t.status === status);
                return (
                  <div key={status} className="home-kanban-column">
                    <div className="home-kanban-header">
                      {t("taskStatus", status)} ({items.length})
                    </div>
                    <div className="home-kanban-list">
                      {items.length === 0 && <div className="home-empty">{t("home", "noTasks")}</div>}
                      {items.map((task) => {
                        const assignee = task.assigned_user_id ? profileById[task.assigned_user_id] : undefined;
                        const dueLabel = task.due_date ? new Date(task.due_date).toLocaleDateString() : "—";
                        const translatedTitle = getTranslatedText("task.title", task.id, task.title);
                        return (
                          <Link key={task.id} href={`/task/${task.id}`} className="home-kanban-card">
                            <div className="home-kanban-title">{translatedTitle || task.title}</div>
                            <div className="home-kanban-meta">
                              <span className="home-kanban-priority">
                                {t("taskPriority", task.priority, task.priority)}
                              </span>
                              <span>{t("taskDrawer", "dueDate")}: {dueLabel}</span>
                            </div>
                            <div className="home-kanban-assignee">
                              {t("taskDrawer", "assignedUser")}: {assignee?.full_name || assignee?.email || "—"}
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
        {/* New Task Selection Modal */}
        {showNewTaskModal && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 10001,
              background: "rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backdropFilter: "blur(4px)",
            }}
            onClick={closeNewTaskModal}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: "#fff",
                borderRadius: 24,
                padding: 32,
                width: "min(400px, 90vw)",
                display: "grid",
                gap: 24,
                boxShadow: "0 25px 50px rgba(0,0,0,0.25)",
              }}
            >
              <div>
                <h3 style={{ fontSize: 20, fontWeight: 800, color: "#000" }}>
                  {t("taskDrawer", "newTask", "New Task")}
                </h3>
                <p style={{ fontSize: 13, color: "#444", marginTop: 4 }}>
                  {t("home", "newTaskModalSubtitle", "Select a project and plan to attach the task to.")}
                </p>
              </div>

              <label style={{ display: "grid", gap: 8, fontSize: 12, fontWeight: 700, color: "var(--home-muted)" }}>
                {t("home", "selectProject", "Select Project")}
                <select
                  value={newTaskProjectId}
                  onChange={(e) => {
                    setNewTaskProjectId(e.target.value);
                    setNewTaskPlanId("");
                  }}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid var(--home-line)",
                    fontSize: 14,
                    fontWeight: 600,
                    backgroundColor: "#333", // Dark background
                    color: "#fff",          // White text
                  }}
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: 8, fontSize: 12, fontWeight: 700, color: "var(--home-muted)" }}>
                {t("home", "selectPlan", "Select Plan")}
                <select
                  value={newTaskPlanId}
                  onChange={(e) => setNewTaskPlanId(e.target.value)}
                  disabled={loadingPlans || availablePlans.length === 0}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid var(--home-line)",
                    fontSize: 14,
                    fontWeight: 600,
                    backgroundColor: "#333", // Dark background
                    color: "#fff",          // White text
                    opacity: loadingPlans ? 0.6 : 1,
                  }}
                >
                  {availablePlans.length === 0 ? (
                    <option value="">{loadingPlans ? t("common", "loading") : t("plansPage", "noPlans")}</option>
                  ) : (
                    availablePlans.map((p) => {
                      const bName = p.floor?.building?.name;
                      const fName = p.floor?.name;
                      const displayName = bName && fName
                        ? `${bName} - ${fName}`
                        : p.name || `Plan v${p.version ?? "?"}`;

                      return (
                        <option key={p.id} value={p.id}>
                          {displayName}
                        </option>
                      );
                    })
                  )}
                </select>
              </label>

              <div style={{ display: "flex", gap: 12 }}>
                <button
                  onClick={closeNewTaskModal}
                  style={{
                    flex: 1,
                    padding: "12px",
                    borderRadius: 12,
                    border: "1px solid var(--home-line)",
                    background: "#fff",
                    color: "var(--home-ink)",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  {t("common", "cancel")}
                </button>
                <button
                  onClick={() => {
                    if (newTaskPlanId) {
                      router.push(`/plan/${newTaskPlanId}`);
                    }
                  }}
                  disabled={!newTaskProjectId || !newTaskPlanId}
                  style={{
                    flex: 1,
                    padding: "12px",
                    borderRadius: 12,
                    border: "none",
                    background: "#000", // Black background
                    color: "#fff",      // White text
                    fontWeight: 800,
                    cursor: !newTaskProjectId || !newTaskPlanId ? "not-allowed" : "pointer",
                    opacity: !newTaskProjectId || !newTaskPlanId ? 0.5 : 1,
                  }}
                >
                  {t("common", "continue", "Continue")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Task Drawer for Creation/Edit */}
        <TaskDrawer
          open={drawerOpen}
          taskId={null}
          createDraft={createDraft}
          onClose={() => {
            setDrawerOpen(false);
            setCreateDraft(null);
          }}
          uploadedBy={user?.id || ""}
          currentUserId={user?.id}
          currentUserRole={user?.role}
        />
      </main>
    </>
  );
}
