"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// Batch fetch
import qs from "qs";
import ReactDOM from "react-dom";
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import TaskDrawer from "./TaskDrawer";
import PlanMeasurementModule from "./measurement/PlanMeasurementModule";
import PlanPhotoPinsModule from "./photo-pins/PlanPhotoPinsModule";
import PlanRevisionsKlappenModule from "./klappen/PlanRevisionsKlappenModule";
import PlanBmaSymbolsModule from "./bma-symbols/PlanBmaSymbolsModule";
import PlanLayersControl, {
  PlanLayersVisibility,
  DEFAULT_LAYERS_VISIBILITY,
  LayerCounts,
} from "./layers/PlanLayersControl";
import { apiGet, getApiUrl } from "@/lib/apiClient";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTaskNumericLabel } from "@/lib/taskNumber";

type Meta = {
  tileSize: number;
  minZoom: number;
  maxZoom: number;
  gridW: number;
  gridH: number;
};

type TaskRow = {
  id: string;
  x_norm: number;
  y_norm: number;
  render_x?: number;
  render_y?: number;
  render_contract_version?: number;
  title: string;
  status?: string;
  assigned_user_id?: string | null;
  is_question?: boolean;
};

type ProfileRow = {
  id: string;
  full_name: string;
};

type TaskPhotoRow = {
  id: string;
  task_id: string;
  url: string;
  photo_type?: "BEFORE" | "AFTER" | null;
};

type RevisionRow = {
  id: string;
  title: string;
  x_norm: number | null;
  y_norm: number | null;
  description?: string | null;
  assigned_user_id?: string | null;
  profiles?: { full_name: string } | null;
  revision_photos?: { url: string }[];
};

type FehlerRow = {
  id: string;
  title: string;
  x_norm: number | null;
  y_norm: number | null;
  description?: string | null;
  priority?: string;
  assigned_user_id?: string | null;
  profiles?: { full_name: string } | null;
  fehler_photos?: { url: string }[];
};

const CRS = L.CRS.Simple;

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "/leaflet/images/marker-icon-2x.png",
  iconUrl: "/leaflet/images/marker-icon.png",
  shadowUrl: "/leaflet/images/marker-shadow.png",
});

function shortId(id: string) {
  if (!id) return "—";
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

function statusBadge(status?: string) {
  const s = (status || "OPEN").toUpperCase();
  const common: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 8px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    border: "1px solid rgba(17,24,39,0.18)",
    background: "rgba(17,24,39,0.04)",
    color: "#111827",
    width: "fit-content",
  };

  if (s === "OPEN") return <span style={common}>🟦 OPEN</span>;
  if (s === "IN_PROGRESS") return <span style={common}>🟨 IN_PROGRESS</span>;
  if (s === "DONE_WAITING_APPROVAL") return <span style={common}>🟧 DONE</span>;
  if (s === "APPROVED") return <span style={common}>🟩 APPROVED</span>;
  if (s === "REJECTED") return <span style={common}>🟥 REJECTED</span>;
  return <span style={common}>{s}</span>;
}



export default function PlanMap({
  planId,
  projectId,
  meta,
  fullHeight = false,
  focusPoint,
  focusTaskId,
  allowCreate = true,
  currentUserId,
  currentUserRole,
  projectLoadError,
  isQuestion,
  showCompleted = false,
  revisions,
  fehlers,
  aufmassMarkers,
  focusFehlerId,
  focusRevisionId,
  hideTasks = false,
  customMinZoom,
  customMagnification,
  onMapClick,
  onMarkerDragEnd,
  onMarkerDelete,
  onMarkerClick,
  onMarkerDoubleClick,
}: {
  planId: string;
  projectId: string | null;
  meta: Meta;
  fullHeight?: boolean;
  focusPoint?: { x_norm: number; y_norm: number } | null;
  focusTaskId?: string | null;
  focusFehlerId?: string | null;
  focusRevisionId?: string | null;
  allowCreate?: boolean;
  currentUserId?: string | null;
  currentUserRole?: string | null;
  projectLoadError?: string | null;
  isQuestion?: boolean;
  showCompleted?: boolean;
  revisions?: RevisionRow[];
  fehlers?: FehlerRow[];
  aufmassMarkers?: any[];
  hideTasks?: boolean;
  customMinZoom?: number | null;
  customMagnification?: number | null;
  onMapClick?: (x_norm: number, y_norm: number) => void;
  onMarkerDragEnd?: (id: string, x: number, y: number) => void;
  onMarkerDelete?: (id: string) => void;
  onMarkerClick?: (id: string) => void;
  onMarkerDoubleClick?: (id: string) => void;
}) {
  const START_ZOOM = 2;
  const FALLBACK_UPLOADED_BY = "44444444-4444-4444-4444-444444444444";
  const { t } = useLanguage();
  const router = useRouter();

  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [thumbByTask, setThumbByTask] = useState<Record<string, string | null>>({});
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);
  const [openTooltipId, setOpenTooltipId] = useState<string | null>(null);
  const [map, setMap] = useState<any | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const markerIconCache = useRef<Record<string, any>>({});

  // ✅ create-mode: klik w mapę -> draft, a task tworzy się dopiero po "Zapisz" w TaskDrawer
  const [createDraft, setCreateDraft] = useState<any>(null);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [taskToolbarSlot, setTaskToolbarSlot] = useState<HTMLElement | null>(null);

  // 📑 Layer visibility state (persisted per plan in localStorage, default all hidden as requested)
  const [layersVisibility, setLayersVisibility] = useState<PlanLayersVisibility>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(`inspecthero_plan_layers_vis_${planId}`);
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return DEFAULT_LAYERS_VISIBILITY;
  });

  const [layerCounts, setLayerCounts] = useState<LayerCounts>({});
  const [isWhiteSchemaMode, setIsWhiteSchemaMode] = useState(false);

  const handleMeasurementsCount = useCallback((c: number) => {
    setLayerCounts((prev) => (prev.measurements === c ? prev : { ...prev, measurements: c }));
  }, []);

  const handlePhotoCounts = useCallback((c: { photoPins: number; montageDoku: number; damage?: number }) => {
    setLayerCounts((prev) => (
      prev.photoPins === c.photoPins && prev.montageDoku === c.montageDoku && prev.damage === c.damage
        ? prev
        : { ...prev, photoPins: c.photoPins, montageDoku: c.montageDoku, damage: c.damage }
    ));
  }, []);

  const handleKlappenCount = useCallback((c: number) => {
    setLayerCounts((prev) => (prev.klappen === c ? prev : { ...prev, klappen: c }));
  }, []);

  const handleBmaCounts = useCallback(
    (c: { bma: number; lighting: number; notlicht: number; heating?: number; kabelbahn: number; kabelauslass: number; abdeckung?: number; anderungen?: number }) => {
      setLayerCounts((prev) => {
        if (
          prev.bma === c.bma &&
          prev.lighting === c.lighting &&
          prev.notlicht === c.notlicht &&
          prev.heating === c.heating &&
          prev.kabelbahn === c.kabelbahn &&
          prev.kabelauslass === c.kabelauslass &&
          prev.abdeckung === c.abdeckung &&
          prev.anderungen === c.anderungen
        ) {
          return prev;
        }
        return { ...prev, ...c };
      });
    },
    []
  );

  const handleLayersChange = useCallback(
    (newVis: PlanLayersVisibility) => {
      setLayersVisibility(newVis);
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(`inspecthero_plan_layers_vis_${planId}`, JSON.stringify(newVis));
        } catch {}
      }
    },
    [planId]
  );

  const ensureLayerVisible = useCallback(
    (key: keyof PlanLayersVisibility) => {
      setLayersVisibility((prev) => {
        if (prev[key]) return prev;
        const next = { ...prev, [key]: true };
        if (typeof window !== "undefined") {
          try {
            localStorage.setItem(`inspecthero_plan_layers_vis_${planId}`, JSON.stringify(next));
          } catch {}
        }
        return next;
      });
    },
    [planId]
  );

  useEffect(() => {
    const updateSlot = () => {
      const el = document.getElementById("plan-measurement-toolbar-left");
      if (el) setTaskToolbarSlot(el);
    };
    updateSlot();
    const timer = setTimeout(updateSlot, 100);
    return () => clearTimeout(timer);
  }, []);

  // ESC key to cancel task placement mode, close tooltips and photo preview
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsAddingTask(false);
        setCreateDraft(null);
        setOpenTooltipId(null);
        setPreviewUrl(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // ⭐ profile cache
  const [profiles, setProfiles] = useState<Record<string, string>>({});

  // 📷 photo preview
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const worldPxW = meta.gridW * meta.tileSize;
  const worldPxH = meta.gridH * meta.tileSize;

  const bounds = useMemo(() => {
    const sw = CRS.pointToLatLng(L.point(0, worldPxH), meta.maxZoom);
    const ne = CRS.pointToLatLng(L.point(worldPxW, 0), meta.maxZoom);
    return L.latLngBounds(sw, ne);
  }, [worldPxW, worldPxH, meta.maxZoom]);

  const center = bounds.getCenter();
  const focusLatLng = useMemo(() => {
    if (!focusPoint) return null;
    const p = L.point(focusPoint.x_norm * worldPxW, focusPoint.y_norm * worldPxH);
    return CRS.pointToLatLng(p, meta.maxZoom);
  }, [focusPoint, worldPxW, worldPxH, meta.maxZoom]);

  const MapContainerAny: any = MapContainer;

  const loadTasks = useCallback(async () => {
    if (!projectId) {
      setTasks([]);
      return;
    }

    const search = new URLSearchParams({
      projectId,
      planId,
      limit: "200",
      offset: "0",
    });

    try {
      const data = await apiGet<TaskRow[]>(`/api/tasks?${search.toString()}`);
      setTasks(data || []);
    } catch {
      setTasks([]);
    }
  }, [projectId, planId]);

  // ⭐ pobierz profile 1x
  useEffect(() => {
    apiGet<ProfileRow[]>("/api/profiles?limit=1000")
      .then((rows) => {
        const map: Record<string, string> = {};
        for (const p of rows || []) map[p.id] = p.full_name;
        setProfiles(map);
      })
      .catch(() => { });
  }, []);

  useEffect(() => {
    if (hideTasks) {
      setTasks([]);
      return;
    }
    loadTasks().catch(() => { });
  }, [loadTasks, hideTasks]);

  useEffect(() => {
    import("@/lib/apiClient").then(({ getToken }) => {
      getToken().then((t) => setToken(t));
    });
  }, []);

  // ✅ Deep-linking: auto-open tooltip for focused Task, Fehler or Revision & auto-enable task markers from Aufgaben
  useEffect(() => {
    const isUserAdmin = (currentUserRole || "").toUpperCase() === "ADMIN";
    if (focusTaskId) {
      setOpenTooltipId(focusTaskId);
      ensureLayerVisible("tasks");
    } else if (focusFehlerId) {
      setOpenTooltipId(focusFehlerId);
      ensureLayerVisible("tasks");
    } else if (focusRevisionId && isUserAdmin) {
      setOpenTooltipId(focusRevisionId);
      ensureLayerVisible("tasks");
    }
  }, [focusTaskId, focusFehlerId, focusRevisionId, currentUserRole, ensureLayerVisible]);

  // Batch fetch thumbs for all visible tasks and both phases
  const loadThumbsBatch = useCallback(async (tasks: TaskRow[]) => {
    if (!tasks.length) return;
    const phases: ("BEFORE" | "AFTER")[] = ["BEFORE", "AFTER"];
    const params = qs.stringify({
      taskIds: tasks.map((t) => t.id),
      phases,
    }, { arrayFormat: "repeat" });
    try {
      const photos = await apiGet<TaskPhotoRow[]>(`/api/task-photos/batch?${params}`);
      const thumbMap: Record<string, string | null> = {};
      for (const row of photos) {
        const key = `${row.task_id}:${row.photo_type || "BEFORE"}`;
        thumbMap[key] = row.url || null;
      }
      setThumbByTask((prev) => ({ ...prev, ...thumbMap }));
    } catch (err) {
      console.warn("[planmap] loadThumbsBatch failed", err);
    }
  }, []);

  // On tasks change, batch fetch thumbs
  useEffect(() => {
    if (!tasks.length) return;
    loadThumbsBatch(tasks);
  }, [tasks, loadThumbsBatch]);

  // Helper for legacy code (popup etc.)
  function ensureThumb(taskId: string, status?: string) {
    const s = (status || "OPEN").toUpperCase();
    const phase = s === "APPROVED" ? "AFTER" : "BEFORE";
    const key = `${taskId}:${phase}`;
    return;
  }

  // ✅ create-mode: klik w mapę wywołuje onMapClick lub tworzy draft gdy aktywny jest tryb isAddingTask
  function ClickToCreate({ projectId, createdBy, onMapClick }: { projectId: string; createdBy: string; onMapClick?: (x: number, y: number) => void }) {
    const map = useMap();
    useMapEvents({
      click: (e: any) => {
        if (
          (map as any)?._isMeasuring ||
          (typeof window !== "undefined" && (window as any)._isMeasurementActive) ||
          (map as any)?._isPhotoPinActive ||
          (typeof window !== "undefined" && (window as any)._isPhotoPinActive) ||
          e?.originalEvent?._measurementHandled ||
          e?._measurementHandled ||
          e?.originalEvent?._photoPinHandled ||
          e?._photoPinHandled
        ) {
          return;
        }
        if (onMapClick) {
            const p = CRS.latLngToPoint(e.latlng, meta.maxZoom);
            onMapClick(p.x / worldPxW, p.y / worldPxH);
            return;
        }
        if (isAddingTask) {
          if (!projectId || !createdBy) return;
          const p = CRS.latLngToPoint(e.latlng, meta.maxZoom);
          const draft = {
            project_id: projectId,
            plan_id: planId,
            x_norm: p.x / worldPxW,
            y_norm: p.y / worldPxH,
            created_by: createdBy,
            is_question: isQuestion,
          };
          setDrawerTaskId(null);
          setCreateDraft(draft);
          setIsAddingTask(false);
        }
      },
    });
    return null;
  }

  function MapInstanceCapture() {
    const map = useMap();
    useEffect(() => {
      if (!map) return;
      setMap(map);

      const updateZoomClass = () => {
        const z = map.getZoom();
        const container = map.getContainer();
        if (!container) return;
        container.classList.remove("map-zoom-low", "map-zoom-mid", "map-zoom-high");
        if (z <= 2) {
          container.classList.add("map-zoom-low");
        } else if (z === 3) {
          container.classList.add("map-zoom-mid");
        } else {
          container.classList.add("map-zoom-high");
        }
      };

      updateZoomClass();
      map.on("zoomend", updateZoomClass);
      return () => {
        map.off("zoomend", updateZoomClass);
      };
    }, [map]);
    return null;
  }

  // ✅ eventy z TaskDrawer: miniaturka + lista
  useEffect(() => {
    const onPhotoAdded = (e: any) => {
      const id = e?.detail?.taskId;
      if (!id) return;
      // Invalidate cache for this task so next click reloads
      setThumbByTask((prev) => {
        const next = { ...prev };
        // We don't know the phase easily here, so clear both potential keys
        delete next[`${id}:BEFORE`];
        delete next[`${id}:AFTER`];
        return next;
      });
      loadTasks().catch(() => { });
    };

    const onCreated = (e: any) => {
      const id = e?.detail?.taskId;
      if (!id) return;

      setCreateDraft(null);
      setDrawerTaskId(id);

      loadTasks().catch(() => { });
    };

    window.addEventListener("task-photo-added", onPhotoAdded);
    window.addEventListener("task-saved", loadTasks as any);
    window.addEventListener("task-deleted", loadTasks as any);
    window.addEventListener("task-created", onCreated as any);

    return () => {
      window.removeEventListener("task-photo-added", onPhotoAdded);
      window.removeEventListener("task-saved", loadTasks as any);
      window.removeEventListener("task-deleted", loadTasks as any);
      window.removeEventListener("task-created", onCreated as any);
    };
  }, [loadTasks]);

  const mapHeight = fullHeight ? "100vh" : "calc(100vh - 120px)";

  const getIconForLabel = useCallback(
    (label: string, isTaskQuestion?: boolean) => {
      if (!label) return undefined;
      const cacheKey = `${label}-${isTaskQuestion ? 'Q' : 'T'}`;
      if (!markerIconCache.current[cacheKey]) {
        const baseClass = isTaskQuestion ? "task-marker task-marker--map task-marker--question" : "task-marker task-marker--map";
        markerIconCache.current[cacheKey] = L.divIcon({
          className: "",
          html: `<div class="${baseClass}">${label}</div>`,
          iconSize: [56, 72],
          iconAnchor: [28, 58],
          popupAnchor: [0, 14],
        });
      }
      return markerIconCache.current[cacheKey];
    },
    []
  );

  const getRevisionIcon = useCallback((emoji: string, colorClass: string) => {
    return L.divIcon({
      className: "premium-marker-wrapper",
      html: `<div class="task-marker--premium ${colorClass}">${emoji}</div>`,
      iconSize: [64, 64],
      iconAnchor: [32, 32],
      tooltipAnchor: [0, -32],
    });
  }, []);

  const effectiveMinZoom = typeof customMinZoom === "number" ? customMinZoom : meta.minZoom;
  const effectiveMaxZoom = meta.maxZoom + (typeof customMagnification === "number" ? customMagnification : 0);

  function FocusOnTask({ target }: { target: any | null }) {
    const map = useMap();
    const focusZoom = Math.min(effectiveMaxZoom, Math.max(effectiveMinZoom, START_ZOOM + 1));

    useEffect(() => {
      if (!target) return;
      map.setView(target, focusZoom, { animate: true });
    }, [map, target, focusZoom]);

    return null;
  }

  return (
    <>
      <MapContainerAny
        crs={CRS}
        center={focusLatLng || center}
        zoom={Math.max(effectiveMinZoom, Math.min(effectiveMaxZoom, START_ZOOM))}
        minZoom={effectiveMinZoom}
        maxZoom={effectiveMaxZoom}
        bounds={bounds}
        maxBounds={bounds.pad ? bounds.pad(0.5) : bounds}
        maxBoundsViscosity={0.3}
        style={{ height: mapHeight, background: "#fff" }}
      >
        {token && !isWhiteSchemaMode && (
          <TileLayer 
            url={getApiUrl(`/api/tiles/${planId}/{z}/{x}/{y}.png?token=${token}&v=${(meta as any)?.activeVersionId || ''}`)} 
            {...({ maxNativeZoom: meta.maxZoom } as any)}
          />
        )}

        <MapInstanceCapture />
        <PlanLayersControl
          visibility={layersVisibility}
          onChange={handleLayersChange}
          counts={{
            ...layerCounts,
            tasks: tasks.length,
          }}
        />

        <PlanMeasurementModule
          planId={planId}
          meta={meta}
          isVisible={layersVisibility.measurements}
          onCountChange={handleMeasurementsCount}
          onEnsureVisible={() => ensureLayerVisible("measurements")}
        />
        <PlanPhotoPinsModule
          planId={planId}
          meta={meta}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          isPhotoPinsVisible={layersVisibility.photoPins}
          isMontageDokuVisible={layersVisibility.montageDoku}
          isDamageVisible={layersVisibility.damage}
          onCountsChange={handlePhotoCounts}
          onEnsurePhotoPinsVisible={() => ensureLayerVisible("photoPins")}
          onEnsureMontageDokuVisible={() => ensureLayerVisible("montageDoku")}
          onEnsureDamageVisible={() => ensureLayerVisible("damage")}
        />
        <PlanRevisionsKlappenModule
          planId={planId}
          meta={meta}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          isVisible={layersVisibility.klappen}
          onCountChange={handleKlappenCount}
          onEnsureVisible={() => ensureLayerVisible("klappen")}
        />
        <PlanBmaSymbolsModule
          planId={planId}
          meta={meta}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          layersVisibility={layersVisibility}
          onEnsureLayerVisible={(key) => ensureLayerVisible(key)}
          onCountsChange={handleBmaCounts}
          projectId={projectId || undefined}
          isWhiteSchemaMode={isWhiteSchemaMode}
          onToggleWhiteSchemaMode={() => setIsWhiteSchemaMode((prev) => !prev)}
        />

        {/* Task / Question creation button placed in the top-right toolbar */}
        {allowCreate && projectId && currentUserId && taskToolbarSlot && typeof document !== "undefined" && (
          ReactDOM.createPortal(
            <button
              type="button"
              onClick={() => {
                setIsAddingTask((prev) => {
                  if (!prev) ensureLayerVisible("tasks");
                  return !prev;
                });
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "5px 10px",
                borderRadius: "8px",
                fontSize: "12px",
                fontWeight: 700,
                cursor: "pointer",
                border: isAddingTask ? "1px solid #16a34a" : "1px solid rgba(0, 0, 0, 0.1)",
                background: isAddingTask ? "#16a34a" : "#ffffff",
                color: isAddingTask ? "#ffffff" : "#1f2937",
                transition: "all 0.15s ease",
                whiteSpace: "nowrap",
                userSelect: "none",
                flexShrink: 0,
                boxShadow: isAddingTask ? "0 0 8px rgba(22, 163, 74, 0.4)" : "0 1px 2px rgba(0, 0, 0, 0.05)",
              }}
              title={isQuestion ? t("home", "newQuestion", "Zadaj pytanie") : t("home", "createNewTask", "Nowe zadanie")}
            >
              ✓ {isQuestion ? t("home", "newQuestion", "Pytanie") : t("home", "newTask", "Zadanie")}
            </button>,
            taskToolbarSlot
          )
        )}

        {/* Hint banner when Task placement mode is active */}
        {isAddingTask && (
          <div style={{ position: "absolute", top: 62, right: 16, zIndex: 9999, pointerEvents: "none" }}>
            <div style={{
              background: "rgba(15, 23, 42, 0.92)",
              color: "#ffffff",
              fontSize: 12,
              fontWeight: 600,
              padding: "6px 12px",
              borderRadius: 8,
              boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
              display: "flex",
              alignItems: "center",
              gap: 6,
              pointerEvents: "auto",
            }}>
              <span>ℹ️ {t("planMap", "clickToPlaceTaskHint", "Kliknij na planie, aby wstawić zadanie (ESC anuluje)")}</span>
              <button
                type="button"
                onClick={() => setIsAddingTask(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#94a3b8",
                  fontSize: 14,
                  cursor: "pointer",
                  marginLeft: 4,
                  padding: "0 2px",
                }}
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {allowCreate && projectId && currentUserId && <ClickToCreate projectId={projectId} createdBy={currentUserId} onMapClick={onMapClick} />}

        <FocusOnTask target={focusLatLng} />

        {(layersVisibility.tasks || isAddingTask) && tasks
          .filter((task) => {
            // If isQuestion is true, show ONLY questions
            if (isQuestion) {
              return task.is_question === true;
            }
            // If isQuestion is false, show ONLY tasks (not questions)
            if (task.is_question === true) return false;

            // If showCompleted is false, hide APPROVED (completed) tasks
            if (!showCompleted && (task.status || "OPEN").toUpperCase() === "APPROVED") {
              return false;
            }
            return true;
          })
          .map((task) => {
            const rx = task.render_x ?? task.x_norm;
            const ry = task.render_y ?? task.y_norm;
            const ll = CRS.pointToLatLng(L.point(rx * worldPxW, ry * worldPxH), meta.maxZoom);
            const status = (task.status || "OPEN").toUpperCase();
            const phase = status === "APPROVED" ? "AFTER" : "BEFORE";
            const thumb = thumbByTask[`${task.id}:${phase}`];
            const taskNumberLabel = getTaskNumericLabel(task.id);
            const markerIcon = getIconForLabel(taskNumberLabel, task.is_question);

            const isFocused = focusTaskId === task.id;

            return (
              <Marker
                key={task.id}
                position={ll}
                // @ts-ignore
                icon={markerIcon ?? undefined}
                ref={(markerRef: any) => {
                  if (isFocused && markerRef) {
                    // Auto-open popup after map has panned (short delay)
                    setTimeout(() => {
                      try { markerRef.openPopup(); } catch { }
                    }, 600);
                  }
                }}
                eventHandlers={{
                  click: (e: any) => {
                    ensureThumb(task.id, task.status);
                    setOpenTooltipId(task.id);
                    // Standard pan/center logic
                    if (map) {
                      // Pan to marker, but slightly offset so tooltip below is visible
                      // We want the marker to be slightly ABOVE the screen center
                      const zoom = meta.maxZoom;
                      const point = map.project(e.latlng, zoom);
                      // Offset by 180 pixels down (moves map UP)
                      const targetPoint = point.add([0, 180]);
                      const targetLatLng = map.unproject(targetPoint, zoom);
                      map.setView(targetLatLng, zoom, { animate: true });
                    }
                  },
                }}
              >
                {/* react-leaflet Tooltip with direction="bottom" and permanent={true} behaves like a robust interactive popup */}
                {openTooltipId === task.id && (
                  // @ts-ignore
                  <Tooltip direction="bottom" offset={[0, 14]} opacity={1} interactive permanent>
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{ width: 240, color: "#111827", position: "relative" }}
                    >
                      {/* Custom close button for Tooltip */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenTooltipId(null);
                        }}
                        style={{
                          position: "absolute",
                          top: -6,
                          right: -6,
                          width: 28,
                          height: 28,
                          borderRadius: "50%",
                          background: "#fff",
                          border: "1px solid rgba(17,24,39,0.2)",
                          color: "#111827",
                          fontSize: 16,
                          fontWeight: 800,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                          zIndex: 10,
                        }}
                      >
                        ✕
                      </button>

                      {thumb ? (
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewUrl(getApiUrl(thumb));
                          }}
                          style={{ cursor: "pointer", position: "relative" }}
                        >
                          <img
                            src={getApiUrl(thumb)}
                            alt=""
                            style={{
                              width: "100%",
                              height: 90,
                              objectFit: "cover",
                              borderRadius: 10,
                              display: "block",
                            }}
                          />
                          <div
                            style={{
                              position: "absolute",
                              bottom: 4,
                              right: 4,
                              background: "rgba(0,0,0,0.5)",
                              color: "white",
                              padding: "2px 6px",
                              borderRadius: 4,
                              fontSize: 10,
                            }}
                          >
                            🔍
                          </div>
                        </div>
                      ) : (
                        <div
                          style={{
                            height: 90,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            opacity: 0.7,
                            borderRadius: 10,
                            border: "1px dashed rgba(17,24,39,0.25)",
                          }}
                        >
                          {t("planMap", "noPhoto", "No photo")}
                        </div>
                      )}

                      <div style={{ fontWeight: 900, marginTop: 8 }}>{task.title}</div>

                      <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
                        {statusBadge(task.status)}
                        <div style={{ fontSize: 12 }}>
                          <b>{t("planMap", "assignedTo", "Assigned to")}:</b>{" "}
                          {task.assigned_user_id ? profiles[task.assigned_user_id] || shortId(task.assigned_user_id) : "—"}
                        </div>
                      </div>

                      <button
                        style={{
                          marginTop: 10,
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: 10,
                          border: "1px solid rgba(17,24,39,0.25)",
                          background: "#fff",
                          color: "#111827",
                          cursor: "pointer",
                          fontWeight: 800,
                        }}
                        onClick={() => {
                          setCreateDraft(null);
                          setDrawerTaskId(task.id);
                        }}
                      >
                        {t("planMap", "openTaskButton", "Open task")}
                      </button>
                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 12,
                          color: "rgba(17,24,39,0.7)",
                        }}
                      >
                        {t("planMap", "openTaskHint", "Click to expand the side panel")}
                      </div>
                    </div>
                  </Tooltip>
                )
                }
              </Marker>
            );
          })}

        {/* Revisions */}
        {(layersVisibility.tasks || isAddingTask) && (currentUserRole || "").toUpperCase() === "ADMIN" && (revisions || []).filter(r => r.x_norm !== null && r.y_norm !== null).map(r => {
          const ll = CRS.pointToLatLng(L.point(r.x_norm! * worldPxW, r.y_norm! * worldPxH), meta.maxZoom);
          return (
            <Marker key={r.id} position={ll}
              // @ts-ignore
              icon={getRevisionIcon("📋", "style-revision")}
              eventHandlers={{
                click: () => setOpenTooltipId(r.id),
              }}
            >
              {openTooltipId === r.id && (
                /* @ts-ignore */
                <Tooltip direction="top" offset={[0, -40]} permanent interactive>
                  <div className="relative p-2 min-w-[180px]" onClick={e => e.stopPropagation()}>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenTooltipId(null);
                        router.push("/admin/revisions");
                      }}
                      className="absolute -top-4 -right-4 w-7 h-7 rounded-full bg-white border border-black/10 flex items-center justify-center text-xs shadow-md font-bold hover:bg-gray-50 active:scale-95 transition-all text-black"
                      title={t("common", "backToList", "Back to list")}
                    >✕</button>
                    
                    {r.revision_photos && r.revision_photos.length > 0 && (
                      <div className="mb-2 rounded-lg overflow-hidden border border-black/5 aspect-video bg-black/5">
                        <img src={getApiUrl(r.revision_photos[0].url)} alt="" className="w-full h-full object-cover" />
                      </div>
                    )}

                    <div style={{ fontWeight: 800, fontSize: 13, lineHeight: '1.2' }}>{r.title}</div>
                    <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Revision (Poprawka)</div>
                    
                    <div className="mt-3 flex flex-col gap-2 pt-2 border-t border-black/5">
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="font-bold opacity-50 uppercase text-[9px]">Przypisany:</span>
                        <span className="font-semibold text-ui-accent truncate">
                          {r.profiles?.full_name || r.assigned_user_id || "—"}
                        </span>
                      </div>
                      {r.description && <div className="text-[11px] opacity-70 line-clamp-2 italic">"{r.description}"</div>}
                    </div>
                  </div>
                </Tooltip>
              )}
            </Marker>
          );
        })}

        {/* Fehlers */}
        {(fehlers || []).filter(f => f.x_norm !== null && f.y_norm !== null).map(f => {
          const ll = CRS.pointToLatLng(L.point(f.x_norm! * worldPxW, f.y_norm! * worldPxH), meta.maxZoom);
          return (
            <Marker key={f.id} position={ll}
              // @ts-ignore
              icon={getRevisionIcon("⚠️", "style-fehler")}
              eventHandlers={{
                click: () => setOpenTooltipId(f.id),
              }}
            >
              {openTooltipId === f.id && (
                /* @ts-ignore */
                <Tooltip direction="top" offset={[0, -40]} permanent interactive>
                  <div className="relative p-2 min-w-[180px]" onClick={e => e.stopPropagation()}>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenTooltipId(null);
                        router.push("/admin/fehler");
                      }}
                      className="absolute -top-4 -right-4 w-7 h-7 rounded-full bg-white border border-black/10 flex items-center justify-center text-xs shadow-md font-bold hover:bg-gray-50 active:scale-95 transition-all text-black"
                      title={t("common", "backToList", "Back to list")}
                    >✕</button>

                    {f.fehler_photos && f.fehler_photos.length > 0 && (
                      <div className="mb-2 rounded-lg overflow-hidden border border-black/5 aspect-video bg-black/5">
                        <img src={getApiUrl(f.fehler_photos[0].url)} alt="" className="w-full h-full object-cover" />
                      </div>
                    )}

                    <div style={{ fontWeight: 800, fontSize: 13, lineHeight: '1.2', color: '#f59e0b' }}>{f.title}</div>
                    <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
                      {f.priority || "MEDIUM"} Fehler (Błąd)
                    </div>

                    <div className="mt-3 flex flex-col gap-2 pt-2 border-t border-black/5">
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="font-bold opacity-50 uppercase text-[9px]">Przypisany:</span>
                        <span className="font-semibold text-ui-accent truncate">
                          {f.profiles?.full_name || f.assigned_user_id || "—"}
                        </span>
                      </div>
                      {f.description && <div className="text-[11px] opacity-70 line-clamp-2 italic">"{f.description}"</div>}
                    </div>
                  </div>
                </Tooltip>
              )}
            </Marker>
          );
        })}
        {/* Aufmass Markers */}
        {(aufmassMarkers || []).filter(am => am.x_norm !== null && am.y_norm !== null).map((am) => {
          const ll = CRS.pointToLatLng(L.point(am.x_norm * worldPxW, am.y_norm * worldPxH), meta.maxZoom);
          const color = am.color || (am.session_type === 'baubehinderung' ? '#ef4444' : am.session_type === 'zusatz' ? '#f59e0b' : am.session_type === 'bestellung' ? '#8b5cf6' : am.session_type === 'fragen' ? '#ec4899' : '#3b82f6');
          
          // Calculate sequential number for A1, A2, Z1, Z2
          const sameTypeMarkers = (aufmassMarkers || [])
            .filter(m => m.session_type === am.session_type && m.x_norm !== null && m.y_norm !== null)
            .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
          const idx = sameTypeMarkers.findIndex(m => m.id === am.id);
          const prefix = am.session_type === 'zusatz' ? 'Z' : am.session_type === 'baubehinderung' ? 'B' : am.session_type === 'bestellung' ? 'Bs' : am.session_type === 'fragen' ? 'F' : 'A';
          const label = am.label || `${prefix}${idx + 1}`;
          
          const iconHtml = `
            <div style="background-color: ${color}; border: 2px solid white; border-radius: 10px; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; color: ${am.textColor || 'white'}; font-size: 10px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.3); pointer-events: none;">
              ${label}
            </div>
          `;
          return (
            <Marker key={am.id} position={ll}
              // @ts-ignore
              draggable={!!onMarkerDragEnd}
              eventHandlers={{
                dragend: (e: any) => {
                  if (onMarkerDragEnd) {
                    const marker = e.target;
                    const position = marker.getLatLng();
                    const p = CRS.latLngToPoint(position, meta.maxZoom);
                    onMarkerDragEnd(am.id, p.x / worldPxW, p.y / worldPxH);
                  }
                },
                click: () => {
                  if (onMarkerClick) {
                    onMarkerClick(am.id);
                  } else if (onMarkerDelete) {
                    onMarkerDelete(am.id);
                  }
                },
                dblclick: () => {
                  if (onMarkerDoubleClick) {
                    onMarkerDoubleClick(am.id);
                  }
                }
              }}
              // @ts-ignore
              icon={L.divIcon({
                html: iconHtml,
                className: '',
                iconSize: [20, 20],
                iconAnchor: [10, 20]
              })}
            />
          );
        })}

      </MapContainerAny >

      {/* createDraft is accepted by TaskDrawer at runtime */}
      {/* @ts-ignore */}
      <TaskDrawer
        createDraft={createDraft}
        open={!!drawerTaskId || !!createDraft}
        taskId={drawerTaskId}
        uploadedBy={currentUserId || FALLBACK_UPLOADED_BY}
        currentUserId={currentUserId}
        currentUserRole={currentUserRole}
        onClose={() => {
          setDrawerTaskId(null);
          setCreateDraft(null);
        }}
      />

      {
        !projectId && projectLoadError && (
          <div
            style={{
              position: "absolute",
              top: 16,
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(17,24,39,0.9)",
              color: "#fff",
              padding: "8px 14px",
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {projectLoadError}
          </div>
        )
      }

      {/* 📷 fullscreen photo preview overlay */}
      {
        previewUrl && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 99999,
              background: "rgba(0,0,0,0.85)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 20,
            }}
            onClick={() => setPreviewUrl(null)}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                setPreviewUrl(null);
              }}
              style={{
                position: "absolute",
                top: 20,
                right: 20,
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: "white",
                border: "none",
                color: "black",
                fontSize: 24,
                fontWeight: "bold",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
              }}
            >
              ✕
            </button>
            <img
              src={previewUrl || undefined}
              alt="Preview"
              style={{
                maxWidth: "100%",
                maxHeight: "100%",
                objectFit: "contain",
                borderRadius: 8,
                boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
              }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )
      }
    </>
  );
}
