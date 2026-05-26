"use client";
import { useState, useEffect, useMemo } from "react";
import { apiGet } from "@/lib/apiClient";
import dynamic from "next/dynamic";

const SingleMap = dynamic(
  () => import("./CableRouteSingleMap").then(m => ({ default: m.CableRouteSingleMap })),
  { ssr: false }
);

type Plan = { id: string; name: string; floor_name?: string };
interface Pin { x: number; y: number }

interface Props {
  projectId: string;
  token: string | null;
  initialPlanId?: string;
  initialPinA?: Pin | null;
  initialPinB?: Pin | null;
  initialLabelA?: string;
  initialLabelB?: string;
  initialWaypoints?: Pin[];
  onChange: (val: {
    plan_id: string;
    point_a_x: number | null; point_a_y: number | null;
    point_b_x: number | null; point_b_y: number | null;
    point_a_label: string; point_b_label: string;
    waypoints: Pin[];
    plan_id_2?: string | null;
    point_c_x?: number | null; point_c_y?: number | null;
    point_d_x?: number | null; point_d_y?: number | null;
    waypoints_2?: Pin[];
    scale?: number | null;
    scale_2?: number | null;
  }) => void;
  onClose: () => void;
  initialPlanId2?: string | null;
  initialPinC?: Pin | null;
  initialPinD?: Pin | null;
  initialWaypoints2?: Pin[];
  initialScale?: number | null;
  initialScale2?: number | null;
}

/** Compute total polyline length in normalized units (0-1 coordinate space) */
function polylineLength(points: Pin[]): number {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    total += Math.hypot(dx, dy);
  }
  return total;
}

/** Format distance nicely */
function fmtMeters(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(2)} km`;
  if (m >= 1) return `${m.toFixed(1)} m`;
  return `${(m * 100).toFixed(0)} cm`;
}

const SCALE_LS_KEY = "cableMapScale_";

export function CableRouteMapPicker({
  projectId, token,
  initialPlanId = "", initialPinA = null, initialPinB = null, initialLabelA = "", initialLabelB = "", initialWaypoints = [],
  onChange, onClose,
  initialPlanId2 = "", initialPinC = null, initialPinD = null, initialWaypoints2 = [],
  initialScale = null, initialScale2 = null
}: Props) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planId, setPlanId] = useState(initialPlanId);
  const [pinA, setPinA] = useState<Pin | null>(initialPinA);
  const [pinB, setPinB] = useState<Pin | null>(initialPinB);
  const [labelA, setLabelA] = useState(initialLabelA || "Punkt A");
  const [labelB, setLabelB] = useState(initialLabelB || "Punkt B");
  const [picking, setPicking] = useState<"A" | "B" | "C" | "D">("A");
  const [waypoints, setWaypoints] = useState<Pin[]>(initialWaypoints);
  
  // Second Plan States
  const [showPlan2, setShowPlan2] = useState(!!initialPlanId2);
  const [planId2, setPlanId2] = useState(initialPlanId2 || "");
  const [pinC, setPinC] = useState<Pin | null>(initialPinC);
  const [pinD, setPinD] = useState<Pin | null>(initialPinD);
  const [waypoints2, setWaypoints2] = useState<Pin[]>(initialWaypoints2);
  const [planWidthM, setPlanWidthM] = useState<string>(initialScale != null ? String(initialScale) : "");
  const [planWidthM2, setPlanWidthM2] = useState<string>(initialScale2 != null ? String(initialScale2) : "");
  const [imgAspect, setImgAspect] = useState<number | null>(null);
  const [imgAspect2, setImgAspect2] = useState<number | null>(null);
  const [activePlanView, setActivePlanView] = useState<1 | 2>(initialPlanId2 ? 2 : 1);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Load plan list
  useEffect(() => {
    if (!projectId) return;
    apiGet<any[]>(`/api/plans?projectId=${projectId}&limit=100`)
      .then(ps => {
        const list = (ps || []).map((p: any) => {
          const floorName = p.floors?.name || "";
          const buildingName = p.floors?.buildings?.name || "";
          const version = p.version ? `v${p.version}` : "";
          const label = [buildingName, floorName, version].filter(Boolean).join(" · ") || p.id.slice(0, 8);
          return { id: p.id, name: label };
        });
        setPlans(list);
        if (!planId && list.length > 0) setPlanId(list[0].id);
      })
      .catch(() => {});
  }, [projectId]);

  // Load saved scale for current plan
  useEffect(() => {
    if (!planId) return;
    const saved = localStorage.getItem(SCALE_LS_KEY + planId);
    if (saved) setPlanWidthM(saved);
    else setPlanWidthM("");
  }, [planId]);

  // Load image aspect ratio for Plan 1
  useEffect(() => {
    if (!planId) return;
    setImgAspect(null);
    fetch(`/api/tiles/${planId}/meta`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.gridW && d?.gridH && d?.tileSize) {
          const W = d.gridW * d.tileSize;
          const H = d.gridH * d.tileSize;
          setImgAspect(H / W);
        }
      })
      .catch(() => {});
  }, [planId, token]);

  // Load image aspect ratio for Plan 2
  useEffect(() => {
    if (!planId2) return;
    setImgAspect2(null);
    fetch(`/api/tiles/${planId2}/meta`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.gridW && d?.gridH && d?.tileSize) {
          const W = d.gridW * d.tileSize;
          const H = d.gridH * d.tileSize;
          setImgAspect2(H / W);
        }
      })
      .catch(() => {});
  }, [planId2, token]);

  // Load saved scale for plan 2
  useEffect(() => {
    if (!planId2) return;
    const saved = localStorage.getItem(SCALE_LS_KEY + planId2);
    if (saved) setPlanWidthM2(saved);
    else setPlanWidthM2("");
  }, [planId2]);

  // Save scale to localStorage when changed for plan 2
  useEffect(() => {
    if (!planId2 || !planWidthM2) return;
    localStorage.setItem(SCALE_LS_KEY + planId2, planWidthM2);
  }, [planId2, planWidthM2]);

  // Save scale to localStorage when changed for plan 1
  useEffect(() => {
    if (!planId || !planWidthM) return;
    localStorage.setItem(SCALE_LS_KEY + planId, planWidthM);
  }, [planId, planWidthM]);

  // Calculate real-world route length
  const routeDistanceM = useMemo<number | null>(() => {
    let total = 0;
    let hasSomething = false;

    // Plan 1 Distance
    if (pinA && pinB) {
      const wM = parseFloat(planWidthM);
      if (wM > 0 && imgAspect) {
        const hM = wM * imgAspect;
        const pts = [pinA, ...waypoints, pinB];
        const scaled = pts.map(p => ({ x: p.x * wM, y: p.y * hM }));
        for (let i = 0; i < scaled.length - 1; i++) {
          total += Math.hypot(scaled[i + 1].x - scaled[i].x, scaled[i + 1].y - scaled[i].y);
        }
        hasSomething = true;
      }
    }

    // Plan 2 Distance
    if (showPlan2 && pinC && pinD) {
      const wM2 = parseFloat(planWidthM2);
      if (wM2 > 0 && imgAspect2) {
        const hM2 = wM2 * imgAspect2;
        const pts2 = [pinC, ...waypoints2, pinD];
        const scaled2 = pts2.map(p => ({ x: p.x * wM2, y: p.y * hM2 }));
        for (let i = 0; i < scaled2.length - 1; i++) {
          total += Math.hypot(scaled2[i + 1].x - scaled2[i].x, scaled2[i + 1].y - scaled2[i].y);
        }
        hasSomething = true;
      }
    }

    return hasSomething ? total : null;
  }, [pinA, pinB, waypoints, planWidthM, imgAspect, showPlan2, pinC, pinD, waypoints2, planWidthM2, imgAspect2]);

  function handlePicked(which: "A" | "B" | "C" | "D") {
    if (which === "A") setPicking("B");
    else if (which === "B" && showPlan2) setPicking("C");
    else if (which === "C") setPicking("D");
    else setPicking(which);
  }

  function handleConfirm() {
    onChange({
      plan_id: planId,
      point_a_x: pinA?.x ?? null, point_a_y: pinA?.y ?? null,
      point_b_x: pinB?.x ?? null, point_b_y: pinB?.y ?? null,
      point_a_label: labelA.trim() || "Punkt A",
      point_b_label: labelB.trim() || "Punkt B",
      waypoints,
      plan_id_2: showPlan2 ? planId2 : null,
      point_c_x: showPlan2 ? pinC?.x ?? null : null,
      point_c_y: showPlan2 ? pinC?.y ?? null : null,
      point_d_x: showPlan2 ? pinD?.x ?? null : null,
      point_d_y: showPlan2 ? pinD?.y ?? null : null,
      waypoints_2: showPlan2 ? waypoints2 : [],
      scale: parseFloat(planWidthM) || null,
      scale_2: showPlan2 ? parseFloat(planWidthM2) || null : null,
    });
    onClose();
  }

  const canConfirm = !!planId && !!pinA && !!pinB;
  const bothSet = !!pinA && !!pinB;

  if (!mounted) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 20000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}>
      <div style={{ width: "min(860px, 96vw)", maxHeight: "94dvh", background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 40px 120px rgba(0,0,0,0.8)" }}>

        {/* header */}
        <div style={{ padding: "16px 22px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <p style={{ margin: 0, fontSize: 10, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", color: "#38bdf8" }}>TRASA KABLOWA</p>
            <h2 style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 900, color: "#fff" }}>Zaznacz punkty na planie</h2>
          </div>
          <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#888", cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 22px 22px", display: "flex", flexDirection: "column", gap: 14 }}>

          <div style={{ display: "flex", gap: 10, alignItems: "center", background: activePlanView === 1 ? "rgba(56,189,248,0.1)" : "transparent", padding: "10px", borderRadius: "12px", border: activePlanView === 1 ? "1px solid rgba(56,189,248,0.3)" : "1px solid transparent" }}>
            <button onClick={() => setActivePlanView(1)} style={{ padding: "4px 8px", borderRadius: 8, border: "none", background: activePlanView === 1 ? "#38bdf8" : "rgba(255,255,255,0.1)", color: activePlanView === 1 ? "#000" : "#fff", fontWeight: 800, fontSize: 10, cursor: "pointer" }}>PLAN 1</button>
            <label style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "#888", whiteSpace: "nowrap" }}>Plan:</label>
            <select value={planId} onChange={e => { setPlanId(e.target.value); setActivePlanView(1); }}
              style={{ flex: 1, padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "#000", color: "#fff", fontSize: 14, fontWeight: 600 }}>
              <option value="">— wybierz plan —</option>
              {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input type="checkbox" id="showPlan2" checked={showPlan2} onChange={e => { setShowPlan2(e.target.checked); if (e.target.checked) setActivePlanView(2); else setActivePlanView(1); }} />
            <label htmlFor="showPlan2" style={{ fontSize: 12, fontWeight: 800, color: "#fff", cursor: "pointer" }}>Połącz z drugim planem (kontynuacja trasy)</label>
          </div>

          {showPlan2 && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", background: activePlanView === 2 ? "rgba(56,189,248,0.1)" : "transparent", padding: "10px", borderRadius: "12px", border: activePlanView === 2 ? "1px solid rgba(56,189,248,0.3)" : "1px solid transparent" }}>
              <button onClick={() => setActivePlanView(2)} style={{ padding: "4px 8px", borderRadius: 8, border: "none", background: activePlanView === 2 ? "#38bdf8" : "rgba(255,255,255,0.1)", color: activePlanView === 2 ? "#000" : "#fff", fontWeight: 800, fontSize: 10, cursor: "pointer" }}>PLAN 2</button>
              <label style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "#888", whiteSpace: "nowrap" }}>Plan 2:</label>
              <select value={planId2} onChange={e => { setPlanId2(e.target.value); setActivePlanView(2); }}
                style={{ flex: 1, padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "#000", color: "#fff", fontSize: 14, fontWeight: 600 }}>
                <option value="">— wybierz drugi plan —</option>
                {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}

          {((activePlanView === 1 && planId) || (activePlanView === 2 && planId2)) && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 14px", borderRadius: 12, background: "rgba(56,189,248,0.06)", border: "1px solid rgba(56,189,248,0.3)" }}>
              <span style={{ fontSize: 16 }}>📐</span>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "#64748b", display: "block", marginBottom: 4 }}>
                  Szerokość planu {activePlanView} (metry)
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="number"
                    min="0.1"
                    step="0.5"
                    placeholder="np. 50"
                    value={activePlanView === 1 ? planWidthM : planWidthM2}
                    onChange={e => activePlanView === 1 ? setPlanWidthM(e.target.value) : setPlanWidthM2(e.target.value)}
                    style={{ width: 100, padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(56,189,248,0.3)", background: "#000", color: "#fff", fontSize: 14, fontWeight: 700 }}
                  />
                  <span style={{ fontSize: 12, color: "#64748b" }}>m — szerokość rysunku</span>
                </div>
              </div>
              {routeDistanceM !== null && (
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", color: "#64748b" }}>Całkowita długość</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: "#38bdf8", lineHeight: 1.1 }}>
                    {fmtMeters(routeDistanceM)}
                  </div>
                  <div style={{ fontSize: 9, color: "#475569" }}>{waypoints.length + (showPlan2 ? waypoints2.length : 0)} pkt pośr.</div>
                </div>
              )}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(["A", "B", "C", "D"] as const).map(pin => {
              if ((pin === "C" || pin === "D") && !showPlan2) return null;
              const active = picking === pin;
              const placed = pin === "A" ? !!pinA : pin === "B" ? !!pinB : pin === "C" ? !!pinC : !!pinD;
              const color = (pin === "A" || pin === "C") ? "#22c55e" : "#f97316";
              const textColor = (pin === "A" || pin === "C") ? "#86efac" : "#fdba74";
              return (
                <button key={pin} onClick={() => { 
                  setPicking(pin); 
                  if (pin === "A" || pin === "B") setActivePlanView(1);
                  else setActivePlanView(2);
                }}
                  style={{ flex: "1 0 45%", padding: "10px 14px", borderRadius: 12, cursor: "pointer", transition: "all 0.15s",
                    border: `2px solid ${active ? color : "rgba(255,255,255,0.1)"}`,
                    background: active ? `${color}22` : "transparent",
                    color: active ? textColor : "#666",
                    fontWeight: 900, fontSize: 13, textAlign: "center" as const }}>
                  📍 Punkt {pin} {placed ? "✓" : "— kliknij"}
                </button>
              );
            })}
          </div>

          <div style={{ height: 380, borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)", position: "relative" }}>
            {((activePlanView === 1 && planId) || (activePlanView === 2 && planId2)) ? (
              <SingleMap
                planId={activePlanView === 1 ? planId : planId2} 
                token={token}
                pinA={activePlanView === 1 ? pinA : pinC} 
                pinB={activePlanView === 1 ? pinB : pinD}
                setPinA={p => { if (activePlanView === 1) setPinA(p); else setPinC(p); }}
                setPinB={p => { if (activePlanView === 1) setPinB(p); else setPinD(p); }}
                picking={picking === "A" || picking === "B" ? picking : (picking === "C" ? "A" : "B")} 
                onPicked={(p) => {
                  if (activePlanView === 1) handlePicked(p as "A" | "B");
                  else handlePicked(p === "A" ? "C" : "D");
                }}
                waypoints={activePlanView === 1 ? waypoints : waypoints2} 
                setWaypoints={p => { if (activePlanView === 1) setWaypoints(p); else setWaypoints2(p); }}
              />
            ) : (
              <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#444", fontSize: 14, fontWeight: 700 }}>
                Wybierz plan powyżej
              </div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "#86efac" }}>Nazwa Punktu A</span>
              <input value={labelA} onChange={e => setLabelA(e.target.value)} placeholder="np. Rozdzielnia główna"
                style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid rgba(34,197,94,0.3)", background: "#000", color: "#fff", fontSize: 13, fontWeight: 600 }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "#fdba74" }}>Nazwa Punktu B</span>
              <input value={labelB} onChange={e => setLabelB(e.target.value)} placeholder="np. Piętro 3 – obwód 12"
                style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid rgba(249,115,22,0.3)", background: "#000", color: "#fff", fontSize: 13, fontWeight: 600 }} />
            </label>
          </div>
        </div>

        {/* footer */}
        <div style={{ padding: "12px 22px", borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", gap: 10, flexShrink: 0, alignItems: "center" }}>
          {routeDistanceM !== null && (
            <div style={{ padding: "8px 16px", borderRadius: 10, background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.25)", flexShrink: 0 }}>
              <div style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "#64748b" }}>Trasa</div>
              <div style={{ fontSize: 17, fontWeight: 900, color: "#38bdf8" }}>{fmtMeters(routeDistanceM)}</div>
            </div>
          )}
          <button onClick={handleConfirm} disabled={!canConfirm}
            style={{ flex: 1, padding: "13px", borderRadius: 12, border: "none", fontWeight: 900, fontSize: 14, cursor: canConfirm ? "pointer" : "not-allowed",
              background: canConfirm ? "linear-gradient(135deg,#22c55e,#16a34a)" : "rgba(255,255,255,0.05)",
              color: canConfirm ? "#fff" : "#444", transition: "all 0.2s" }}>
            {canConfirm ? `✓ Zapisz trasę${(waypoints.length + waypoints2.length) > 0 ? ` (${waypoints.length + waypoints2.length} pkt pośr.)` : ""}${routeDistanceM !== null ? ` · ${fmtMeters(routeDistanceM)}` : ""}` : `Zaznacz punkty na mapie`}
          </button>
          <button onClick={onClose}
            style={{ padding: "13px 22px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#888", fontWeight: 900, fontSize: 14, cursor: "pointer" }}>
            Anuluj
          </button>
        </div>
      </div>
    </div>
  );
}
