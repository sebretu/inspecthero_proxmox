"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import TaskDrawer from "./TaskDrawer";

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
  title: string;
  status?: string;
  assigned_user_id?: string | null;
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

  // szybkie wyróżnienie bez zabawy w theme
  if (s === "OPEN") return <span style={common}>🟦 OPEN</span>;
  if (s === "IN_PROGRESS") return <span style={common}>🟨 IN_PROGRESS</span>;
  if (s === "DONE_WAITING_APPROVAL") return <span style={common}>🟧 DONE</span>;
  if (s === "APPROVED") return <span style={common}>🟩 APPROVED</span>;
  if (s === "REJECTED") return <span style={common}>🟥 REJECTED</span>;
  return <span style={common}>{s}</span>;
}

export default function PlanMap({ planId, meta }: { planId: string; meta: Meta }) {
  // DEMO (na razie na sztywno)
  const PROJECT_ID = "55555555-5555-5555-5555-555555555555";
  const CREATED_BY = "44444444-4444-4444-4444-444444444444";

  const START_ZOOM = 2;

  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [thumbByTask, setThumbByTask] = useState<Record<string, string | null>>({});
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);

  const worldPxW = meta.gridW * meta.tileSize;
  const worldPxH = meta.gridH * meta.tileSize;

  const bounds = useMemo(() => {
    const sw = CRS.pointToLatLng(L.point(0, worldPxH), meta.maxZoom);
    const ne = CRS.pointToLatLng(L.point(worldPxW, 0), meta.maxZoom);
    return L.latLngBounds(sw, ne);
  }, [worldPxW, worldPxH, meta.maxZoom]);

  const center = bounds.getCenter();

  const loadTasks = useCallback(async () => {
    const r = await fetch(`/api/tasks?projectId=${PROJECT_ID}&planId=${planId}&limit=200&offset=0`, {
      cache: "no-store",
    });
    const j = await r.json();
    if (j?.ok) setTasks(j.data || []);
  }, [PROJECT_ID, planId]);

  useEffect(() => {
    loadTasks().catch(() => {});
  }, [loadTasks]);

  async function loadThumb(taskId: string) {
    const r = await fetch(`/api/task-photos?taskId=${encodeURIComponent(taskId)}`, { cache: "no-store" });
    const j = await r.json();
    setThumbByTask((p) => ({
      ...p,
      [taskId]: j?.ok && j.data && j.data.length ? j.data[0].url : null,
    }));
  }

  // EVENT z TaskDrawer po uploadzie: odśwież miniaturę + listę tasków (status/assigned też może się zmienić)
  useEffect(() => {
    const h = (e: any) => {
      const id = e?.detail?.taskId;
      if (!id) return;
      loadThumb(id).catch(() => {});
      loadTasks().catch(() => {});
    };
    window.addEventListener("task-photo-added", h);
    window.addEventListener("task-saved", loadTasks as any);
    window.addEventListener("task-deleted", loadTasks as any);
    return () => {
      window.removeEventListener("task-photo-added", h);
      window.removeEventListener("task-saved", loadTasks as any);
      window.removeEventListener("task-deleted", loadTasks as any);
    };
  }, [loadTasks]);

  function ClickToCreate() {
    useMapEvents({
      click: async (e) => {
        const p = CRS.latLngToPoint(e.latlng, meta.maxZoom);
        const r = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: PROJECT_ID,
            plan_id: planId,
            x_norm: p.x / worldPxW,
            y_norm: p.y / worldPxH,
            title: "Nowy task",
            description: null,
            created_by: CREATED_BY,
          }),
        });
        const j = await r.json();
        if (j?.ok && j?.data?.id) {
          setDrawerTaskId(j.data.id);
          loadTasks().catch(() => {});
        }
      },
    });
    return null;
  }

  return (
    <>
      <MapContainer
        crs={CRS}
        center={center}
        zoom={Math.max(meta.minZoom, Math.min(meta.maxZoom, START_ZOOM))}
        minZoom={meta.minZoom}
        maxZoom={meta.maxZoom}
        bounds={bounds}
        maxBounds={bounds}
        maxBoundsViscosity={1.0}
        style={{ height: "calc(100vh - 120px)", background: "#fff" }}
      >
        <TileLayer url={`/api/tiles/${planId}/{z}/{x}/{y}.png`} />
        <ClickToCreate />

        {tasks.map((t) => {
          const ll = CRS.pointToLatLng(L.point(t.x_norm * worldPxW, t.y_norm * worldPxH), meta.maxZoom);
          const thumb = thumbByTask[t.id];

          return (
            <Marker key={t.id} position={ll}>
              <Popup
                autoPan
                closeButton
                eventHandlers={{
                  popupopen: () => {
                    loadThumb(t.id).catch(() => {});
                  },
                }}
              >
                <div style={{ width: 240, color: "#111827" }}>
                  {thumb ? (
                    <img
                      src={thumb}
                      alt=""
                      style={{
                        width: "100%",
                        height: 90,
                        objectFit: "cover",
                        borderRadius: 10,
                        border: "1px solid rgba(17,24,39,0.10)",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "100%",
                        height: 90,
                        borderRadius: 10,
                        border: "1px dashed rgba(17,24,39,0.25)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        opacity: 0.75,
                      }}
                    >
                      Brak zdjęcia
                    </div>
                  )}

                  <div style={{ fontWeight: 900, marginTop: 8 }}>{t.title}</div>

                  <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
                    {statusBadge(t.status)}
                    <div style={{ fontSize: 12, opacity: 0.85 }}>
                      <b>Przydzielony:</b> {t.assigned_user_id ? shortId(t.assigned_user_id) : "—"}
                    </div>
                  </div>

                  <button
                    style={{
                      marginTop: 10,
                      width: "100%",
                      padding: "8px 10px",
                      background: "#fff",
                      color: "#111827",
                      border: "1px solid rgba(17,24,39,0.25)",
                      borderRadius: 10,
                      cursor: "pointer",
                      fontWeight: 800,
                    }}
                    onClick={() => setDrawerTaskId(t.id)}
                  >
                    Otwórz task
                  </button>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      <TaskDrawer
        open={!!drawerTaskId}
        taskId={drawerTaskId}
        uploadedBy={CREATED_BY}
        onClose={() => setDrawerTaskId(null)}
      />
    </>
  );
}
