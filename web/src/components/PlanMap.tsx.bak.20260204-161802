"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type Meta = {
  tileSize: number;
  minZoom: number;
  maxZoom: number;
  gridW: number; // liczba kafli na maxZoom
  gridH: number; // liczba kafli na maxZoom
};

type TaskRow = {
  id: string;
  plan_id: string;
  project_id: string;
  x_norm: number;
  y_norm: number;
  title: string;
  description: string | null;
};

type TaskPhoto = {
  id: string;
  task_id: string;
  url: string;
  caption: string | null;
  uploaded_by: string;
  created_at: string;
  storage_bucket: string;
  storage_path: string | null;
};

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

// Poprawny CRS
const CRS = L.CRS.Simple;

// Leaflet default icons fix (Next.js)
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "/leaflet/images/marker-icon-2x.png",
  iconUrl: "/leaflet/images/marker-icon.png",
  shadowUrl: "/leaflet/images/marker-shadow.png",
});

export default function PlanMap({ planId, meta }: { planId: string; meta: Meta }) {
  // DEMO (na razie na sztywno)
  const PROJECT_ID = "55555555-5555-5555-5555-555555555555";
  const CREATED_BY = "44444444-4444-4444-4444-444444444444";

  // ✅ startowy zoom (ustaw tutaj)
  const START_ZOOM = 2;

  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [map, setMap] = useState<L.Map | null>(null);

  // ✅ zdjęcia per task (cache + loading)
  const [photosByTask, setPhotosByTask] = useState<Record<string, TaskPhoto[]>>({});
  const [photosLoading, setPhotosLoading] = useState<Record<string, boolean>>({});

  // Rozmiar świata w pikselach NA maxZoom (bo gridW/gridH są dla maxZoom)
  const worldPxW = meta.gridW * meta.tileSize;
  const worldPxH = meta.gridH * meta.tileSize;

  /**
   * Bounds w Leaflet muszą być w "jednostkach CRS" (LatLng), a nie surowe piksele maxZoom.
   * Konwertujemy piksele maxZoom → LatLng przez CRS.pointToLatLng(point, zoom=maxZoom)
   */
  const bounds = useMemo(() => {
    const sw = CRS.pointToLatLng(L.point(0, worldPxH), meta.maxZoom); // (x=0, y=H)
    const ne = CRS.pointToLatLng(L.point(worldPxW, 0), meta.maxZoom); // (x=W, y=0)
    return L.latLngBounds(sw, ne);
  }, [worldPxW, worldPxH, meta.maxZoom]);

  const center = useMemo(() => bounds.getCenter(), [bounds]);

  const loadTasks = useCallback(async () => {
    setTasksLoading(true);
    try {
      const r = await fetch(`/api/tasks?projectId=${PROJECT_ID}&planId=${planId}&limit=200&offset=0`, {
        cache: "no-store",
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error?.message || "tasks fetch failed");
      setTasks(j.data || []);
    } finally {
      setTasksLoading(false);
    }
  }, [PROJECT_ID, planId]);

  // ✅ ładowanie zdjęć dopiero gdy trzeba
  const loadPhotosForTask = useCallback(
    async (taskId: string) => {
      if (photosByTask[taskId]) return; // cache

      setPhotosLoading((s) => ({ ...s, [taskId]: true }));
      try {
        const r = await fetch(`/api/task-photos?taskId=${encodeURIComponent(taskId)}`, { cache: "no-store" });
        const j = await r.json();
        if (!r.ok || !j?.ok) throw new Error(j?.error?.message || "task-photos fetch failed");
        setPhotosByTask((s) => ({ ...s, [taskId]: (j.data || []) as TaskPhoto[] }));
      } catch (e) {
        console.error(e);
        // żeby nie odpalać fetch za każdym razem po błędzie
        setPhotosByTask((s) => ({ ...s, [taskId]: [] }));
      } finally {
        setPhotosLoading((s) => ({ ...s, [taskId]: false }));
      }
    },
    [photosByTask]
  );

  useEffect(() => {
    loadTasks().catch(console.error);
  }, [loadTasks]);

  // ✅ Twarde ograniczenie świata + start na planie (bez fitBounds, bo nadpisuje zoom)
  useEffect(() => {
    if (!map) return;

    map.setMaxBounds(bounds);

    // start zoom: clamp do min/max z meta
    const z = Math.max(meta.minZoom, Math.min(meta.maxZoom, START_ZOOM));
    map.setView(center, z, { animate: false });
  }, [map, bounds, center, meta.minZoom, meta.maxZoom, START_ZOOM]);

  function ClickToCreate() {
    useMapEvents({
      click: async (e) => {
        // Zamieniamy kliknięty LatLng → piksele na maxZoom
        const p = CRS.latLngToPoint(e.latlng, meta.maxZoom);
        const x = p.x;
        const y = p.y;

        const x_norm = clamp01(x / worldPxW);
        const y_norm = clamp01(y / worldPxH);

        const title = window.prompt("Tytuł taska?", "Nowy task");
        if (!title) return;

        const description = (window.prompt("Opis (opcjonalnie)?", "") || "").trim() || null;

        const r = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: PROJECT_ID,
            plan_id: planId,
            x_norm,
            y_norm,
            title,
            description,
            created_by: CREATED_BY,
          }),
        });

        const j = await r.json();
        if (!r.ok || !j?.ok) {
          alert(`Błąd: ${j?.error?.message || j?.error || r.status}`);
          return;
        }

        await loadTasks();
      },
    });

    return null;
  }

  return (
    <div style={{ width: "100%", height: "calc(100vh - 120px)" }}>
      <div style={{ padding: "6px 10px", fontSize: 12, opacity: 0.75 }}>
        tasks: {tasks.length} {tasksLoading ? "(loading…)" : ""} | planId:{" "}
        <span style={{ fontFamily: "monospace" }}>{planId}</span>
      </div>

      <MapContainer
        crs={CRS}
        whenCreated={setMap}
        center={center}
        zoom={Math.max(meta.minZoom, Math.min(meta.maxZoom, START_ZOOM))}
        minZoom={meta.minZoom}
        maxZoom={meta.maxZoom}
        bounds={bounds}
        maxBounds={bounds}
        maxBoundsViscosity={1.0}
        style={{ width: "100%", height: "100%", background: "#fff" }}
      >
        <TileLayer
          url={`/api/tiles/${planId}/{z}/{x}/{y}.png`}
          tileSize={meta.tileSize}
          minZoom={meta.minZoom}
          maxZoom={meta.maxZoom}
          minNativeZoom={meta.minZoom}
          maxNativeZoom={meta.maxZoom}
          // NA RAZIE zostaw false; jeśli okaże się, że kafle są odwrócone w Y, zmienisz na true.
          tms={false}
          noWrap={true}
          keepBuffer={4}
          // klucz: dajemy klasę, żeby w CSS domknąć "szwy" między kaflami
          className="plan-tiles"
        />

        <ClickToCreate />

        {tasks.map((t) => {
          // Task trzymasz jako norm (0..1) względem świata maxZoom → liczmy piksele maxZoom
          const x = Number(t.x_norm) * worldPxW;
          const y = Number(t.y_norm) * worldPxH;

          // Piksele maxZoom → LatLng
          const ll = CRS.pointToLatLng(L.point(x, y), meta.maxZoom);

          const photos = photosByTask[t.id];
          const isPhotosLoading = !!photosLoading[t.id];

          return (
            <Marker
              key={t.id}
              position={ll}
              eventHandlers={{
                popupopen: () => {
                  loadPhotosForTask(t.id).catch(console.error);
                },
              }}
            >
              <Popup>
                <div style={{ minWidth: 260 }}>
                  <div style={{ fontWeight: 700 }}>{t.title}</div>
                  {t.description ? <div style={{ marginTop: 6 }}>{t.description}</div> : null}

                  {/* ✅ zdjęcia */}
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Zdjęcia</div>

                    {isPhotosLoading ? (
                      <div style={{ fontSize: 12, opacity: 0.75 }}>Ładowanie…</div>
                    ) : photos ? (
                      photos.length === 0 ? (
                        <div style={{ fontSize: 12, opacity: 0.75 }}>Brak zdjęć</div>
                      ) : (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {photos.slice(0, 6).map((p) => (
                            <a
                              key={p.id}
                              href={p.url}
                              target="_blank"
                              rel="noreferrer"
                              title={p.caption || ""}
                              style={{ display: "block", width: 72, textDecoration: "none" }}
                            >
                              <img
                                src={p.url}
                                alt={p.caption || "task photo"}
                                style={{
                                  width: 72,
                                  height: 72,
                                  objectFit: "cover",
                                  borderRadius: 8,
                                  border: "1px solid rgba(0,0,0,0.12)",
                                }}
                              />
                              {p.caption ? (
                                <div style={{ fontSize: 11, opacity: 0.8, marginTop: 4, lineHeight: 1.1 }}>
                                  {p.caption}
                                </div>
                              ) : null}
                            </a>
                          ))}
                        </div>
                      )
                    ) : (
                      <button
                        onClick={() => loadPhotosForTask(t.id)}
                        style={{
                          fontSize: 12,
                          padding: "6px 10px",
                          borderRadius: 8,
                          border: "1px solid rgba(0,0,0,0.2)",
                          background: "white",
                          cursor: "pointer",
                        }}
                      >
                        Wczytaj zdjęcia
                      </button>
                    )}
                  </div>

                  <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>{t.id}</div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
