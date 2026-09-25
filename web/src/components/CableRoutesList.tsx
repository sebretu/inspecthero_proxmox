"use client";
import { useState } from "react";
import { apiPatch, apiDelete } from "@/lib/apiClient";
import { useLanguage } from "@/contexts/LanguageContext";
import dynamic from "next/dynamic";

const CableMapModal = dynamic(
  () => import("./CableMapModal").then(m => ({ default: m.CableMapModal })),
  { ssr: false }
);

const CableRouteMapPicker = dynamic(
  () => import("./CableRouteMapPicker").then(m => ({ default: m.CableRouteMapPicker })),
  { ssr: false }
);

export interface Route {
  id: string;
  name: string | null;
  point_a_label: string;
  point_b_label: string;
  plan_id?: string | null;
  point_a_x?: number | null;
  point_a_y?: number | null;
  point_b_x?: number | null;
  point_b_y?: number | null;
  waypoints?: { x: number; y: number }[] | null;
  point_a_photo?: string | null;
  point_b_photo?: string | null;
}

interface Props {
  routes: Route[];
  token: string | null;
  isMod: boolean;
  projectId: string;
  onUpdated: (route: Route) => void;
  onDeleted: (id: string) => void;
  onAddNew: () => void;
}

type EditState = {
  id: string;
  name: string;
  labelA: string;
  labelB: string;
};

export function CableRoutesList({ routes, token, isMod, projectId, onUpdated, onDeleted, onAddNew }: Props) {
  const { t } = useLanguage();
  const [editing, setEditing] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [mapRoute, setMapRoute] = useState<Route | null>(null);
  const [editMapRoute, setEditMapRoute] = useState<Route | null>(null);
  const [expanded, setExpanded] = useState(false);

  function startEdit(r: Route) {
    setEditing({ id: r.id, name: r.name || "", labelA: r.point_a_label, labelB: r.point_b_label });
    setSaveErr(null);
  }

  async function handleSave() {
    if (!editing) return;
    setSaving(true); setSaveErr(null);
    try {
      const patch: any = { id: editing.id };
      const orig = routes.find(r => r.id === editing.id);
      if (!orig) return;
      if (editing.name !== (orig.name || "")) patch.name = editing.name || null;
      if (editing.labelA !== orig.point_a_label) patch.point_a_label = editing.labelA;
      if (editing.labelB !== orig.point_b_label) patch.point_b_label = editing.labelB;
      if (Object.keys(patch).length === 1) { setEditing(null); return; }
      const updated = await apiPatch<Route>("/api/cable-routes", patch);
      onUpdated(updated);
      setEditing(null);
    } catch (e: any) { setSaveErr(e?.message || "Error"); }
    finally { setSaving(false); }
  }

  async function handleMapEditSave(val: {
    plan_id: string;
    point_a_x: number | null; point_a_y: number | null;
    point_b_x: number | null; point_b_y: number | null;
    point_a_label: string; point_b_label: string;
    waypoints: { x: number; y: number }[];
  }, routeId: string) {
    try {
      const patch: any = {
        id: routeId,
        point_a_label: val.point_a_label,
        point_b_label: val.point_b_label,
        waypoints: val.waypoints.length > 0 ? val.waypoints : null,
      };
      if (val.point_a_x != null) patch.point_a_x = val.point_a_x;
      if (val.point_a_y != null) patch.point_a_y = val.point_a_y;
      if (val.point_b_x != null) patch.point_b_x = val.point_b_x;
      if (val.point_b_y != null) patch.point_b_y = val.point_b_y;
      const updated = await apiPatch<Route>("/api/cable-routes", patch);
      onUpdated(updated);
    } catch {}
  }

  async function handleDelete(route: Route) {
    if (!confirm(t("cables", "routeDeleteConfirm", "Delete this route? Cables using it will be unlinked."))) return;
    try {
      await apiDelete(`/api/cable-routes?id=${route.id}`);
      onDeleted(route.id);
    } catch {}
  }

  const visibleRoutes = expanded ? routes : routes.slice(0, 5);

  return (
    <>
      <div className="bg-white/5 border border-ui-border/50 rounded-2xl overflow-hidden">
        {/* header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-ui-border/30">
          <p className="text-[10px] font-black uppercase tracking-widest text-ui-muted">
            {t("cables", "routesTitle", "Routes")} ({routes.length})
          </p>
          <button
            onClick={onAddNew}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg border border-emerald-500/30 text-emerald-400 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500/10 transition-all"
          >
            🗺 {t("cables", "routeAddNew", "Add new route")}
          </button>
        </div>

        {/* list */}
        {routes.length === 0 ? (
          <p className="px-5 py-4 text-sm text-ui-muted font-bold">{t("cables", "noRoutes", "No routes defined")}</p>
        ) : (
          <div className="divide-y divide-ui-border/20">
            {visibleRoutes.map(r => {
              const hasMap = !!(r.plan_id && r.point_a_x != null);
              const isEditing = editing?.id === r.id;
              const waypointCount = Array.isArray(r.waypoints) ? r.waypoints.length : 0;

              return (
                <div key={r.id} className="px-5 py-3">
                  {isEditing ? (
                    /* ── EDIT MODE ── */
                    <div className="flex flex-col gap-3">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <label className="flex flex-col gap-1">
                          <span className="text-[9px] font-black uppercase tracking-widest text-ui-muted">{t("cables", "routeName", "Route name")}</span>
                          <input
                            value={editing!.name}
                            onChange={e => setEditing(prev => prev ? { ...prev, name: e.target.value } : null)}
                            placeholder={t("cables", "routeName", "Route name")}
                            className="bg-black/40 border border-ui-border/50 rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:border-ui-accent"
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: "#86efac" }}>{t("cables", "routeLabelA", "Point A label")}</span>
                          <input
                            value={editing!.labelA}
                            onChange={e => setEditing(prev => prev ? { ...prev, labelA: e.target.value } : null)}
                            className="bg-black/40 border border-emerald-500/30 rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:border-emerald-500"
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: "#fdba74" }}>{t("cables", "routeLabelB", "Point B label")}</span>
                          <input
                            value={editing!.labelB}
                            onChange={e => setEditing(prev => prev ? { ...prev, labelB: e.target.value } : null)}
                            className="bg-black/40 border border-orange-500/30 rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:border-orange-500"
                          />
                        </label>
                      </div>

                      {/* Map edit button — opens map picker with existing pins + waypoints */}
                      <button
                        onClick={() => { setEditMapRoute(r); setEditing(null); }}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-cyan-500/30 text-cyan-400 text-xs font-black hover:bg-cyan-500/10 transition-all self-start"
                      >
                        🗺 Edytuj przebieg trasy na mapie
                        {waypointCount > 0 && (
                          <span className="px-1.5 py-0.5 rounded-full text-[9px] bg-cyan-500/20 border border-cyan-500/30">
                            {waypointCount} pkt pośr.
                          </span>
                        )}
                      </button>

                      {saveErr && <p className="text-red-400 text-xs font-bold">{saveErr}</p>}
                      <div className="flex gap-2">
                        <button onClick={handleSave} disabled={saving} className="px-5 py-2 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 text-white font-black text-xs disabled:opacity-50">
                          {saving ? "..." : t("cables", "routeSave", "Save route")}
                        </button>
                        <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-lg border border-ui-border/50 text-ui-muted font-black text-xs">
                          {t("common", "cancel", "Cancel")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* ── VIEW MODE ── */
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${hasMap ? "bg-emerald-500" : "bg-ui-muted/40"}`} />
                      <div className="flex-1 min-w-0">
                        {r.name && <p className="text-xs font-black text-ui-text truncate">{r.name}</p>}
                        <p className="text-[11px] font-bold text-ui-muted truncate">
                          <span style={{ color: "#86efac" }}>A: {r.point_a_label}</span>
                          <span className="text-ui-muted/40 mx-1">→</span>
                          <span style={{ color: "#fdba74" }}>B: {r.point_b_label}</span>
                          {waypointCount > 0 && (
                            <span className="ml-2 text-[9px] text-cyan-400/70">🔀 {waypointCount} pkt</span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {hasMap && (
                          <button
                            onClick={() => setMapRoute(r)}
                            title={t("cables", "routeMap", "Show on map")}
                            className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm hover:bg-emerald-500/20 transition-all flex items-center justify-center"
                          >🗺</button>
                        )}
                        <button
                          onClick={() => startEdit(r)}
                          title={t("cables", "routeEdit", "Edit")}
                          className="w-8 h-8 rounded-lg bg-white/5 border border-ui-border/30 text-ui-muted text-sm hover:bg-white/10 hover:text-ui-text transition-all flex items-center justify-center"
                        >✏️</button>
                        {isMod && (
                          <button
                            onClick={() => handleDelete(r)}
                            title={t("cables", "routeDelete", "Delete")}
                            className="w-8 h-8 rounded-lg bg-red-500/5 border border-red-500/20 text-red-400/70 text-sm hover:bg-red-500/15 hover:text-red-400 transition-all flex items-center justify-center"
                          >🗑</button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* show more/less */}
        {routes.length > 5 && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="w-full py-2.5 text-[10px] font-black uppercase tracking-widest text-ui-muted hover:text-ui-text border-t border-ui-border/30 transition-colors"
          >
            {expanded ? `▲ ${t("common", "showLess", "Pokaż mniej")}` : `▼ ${t("common", "showAll", "Pokaż wszystkie")} (${routes.length})`}
          </button>
        )}

        {/* map preview */}
        {mapRoute && mapRoute.plan_id && mapRoute.point_a_x != null && (
          <CableMapModal
            cable={{
              id: mapRoute.id,
              name: mapRoute.name || `${mapRoute.point_a_label} → ${mapRoute.point_b_label}`,
              status: "pending",
              cable_routes: mapRoute,
            }}
            token={token}
            onClose={() => setMapRoute(null)}
          />
        )}
      </div>

      {/* Map picker for editing existing route path + waypoints */}
      {editMapRoute && (
        <CableRouteMapPicker
          projectId={projectId}
          token={token}
          initialPlanId={editMapRoute.plan_id || ""}
          initialPinA={editMapRoute.point_a_x != null ? { x: editMapRoute.point_a_x!, y: editMapRoute.point_a_y! } : null}
          initialPinB={editMapRoute.point_b_x != null ? { x: editMapRoute.point_b_x!, y: editMapRoute.point_b_y! } : null}
          initialLabelA={editMapRoute.point_a_label}
          initialLabelB={editMapRoute.point_b_label}
          initialWaypoints={Array.isArray(editMapRoute.waypoints) ? editMapRoute.waypoints : []}
          initialPointAPhoto={editMapRoute.point_a_photo}
          initialPointBPhoto={editMapRoute.point_b_photo}
          onClose={() => setEditMapRoute(null)}
          onChange={async val => {
            await handleMapEditSave(val, editMapRoute.id);
            setEditMapRoute(null);
          }}
        />
      )}
    </>
  );
}
