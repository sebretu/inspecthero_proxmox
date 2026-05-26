"use client";
import { useState, useEffect, useMemo } from "react";
import { apiGet, apiPost } from "@/lib/apiClient";
import dynamic from "next/dynamic";
import { useLanguage } from "@/contexts/LanguageContext";
import { normalizeCableType } from "@/lib/cableUtils";
import React from "react";

const SingleMap = dynamic(
  () => import("./CableRouteSingleMap").then(m => ({ default: m.CableRouteSingleMap })),
  { ssr: false }
);

interface Pin { x: number; y: number }

interface Trommel {
  id: string;
  name: string;
  cable_type?: string | null;
  remaining_length?: number | null;
  is_archived?: boolean;
}

interface Category {
  id: string;
  name: string;
}

interface Props {
  projectId: string;
  token: string | null;
  onClose: () => void;
  onCableAdded: () => void;
  cableTypes: string[];
}

export function AdvancedCableAdderModal({ projectId, token, onClose, onCableAdded, cableTypes }: Props) {
  const { t } = useLanguage();
  const [plans, setPlans] = useState<any[]>([]);
  const [trommels, setTrommels] = useState<Trommel[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Shared state across multiple cables in one session
  const [planId, setPlanId] = useState("");
  const [pinA, setPinA] = useState<Pin | null>(null);
  const [labelA, setLabelA] = useState("A");
  const [planWidthM, setPlanWidthM] = useState("");

  // Per-cable state
  const [cableName, setCableName] = useState("");
  const [pointBLabel, setPointBLabel] = useState("");
  const [cableType, setCableType] = useState("");
  const [cableLength, setCableLength] = useState("");
  const [trommelId, setTrommelId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [pinB, setPinB] = useState<Pin | null>(null);
  const [waypoints, setWaypoints] = useState<Pin[]>([]);

  // Plan 2 state
  const [showPlan2, setShowPlan2] = useState(false);
  const [planId2, setPlanId2] = useState("");
  const [pinC, setPinC] = useState<Pin | null>(null);
  const [pinD, setPinD] = useState<Pin | null>(null);
  const [waypoints2, setWaypoints2] = useState<Pin[]>([]);
  const [planWidthM2, setPlanWidthM2] = useState("");
  
  const [activePlanView, setActivePlanView] = useState<1 | 2>(1);
  const [picking, setPicking] = useState<"A" | "B" | "C" | "D">("A");
  const [saving, setSaving] = useState(false);
  const [lastRouteData, setLastRouteData] = useState<any>(null);

  const [imgAspect, setImgAspect] = useState<number | null>(null);
  const [imgAspect2, setImgAspect2] = useState<number | null>(null);

  const SCALE_LS_KEY = "cableMapScale_";
  const LAST_ROUTE_LS_KEY = "lastCableRoute_";

  useEffect(() => {
    const saved = localStorage.getItem(LAST_ROUTE_LS_KEY);
    if (saved) {
      try { setLastRouteData(JSON.parse(saved)); } catch (e) {}
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiGet<Trommel[]>(`/api/trommels?projectId=${projectId}`),
      apiGet<any[]>(`/api/plans?projectId=${projectId}&limit=100`),
      apiGet<Category[]>(`/api/cable-categories?projectId=${projectId}`)
    ]).then(([trms, p, cats]) => {
      setTrommels(trms || []);
      setPlans(p || []);
      setCategories(cats || []);
    }).finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    if (planId) {
      setPlanWidthM(localStorage.getItem(SCALE_LS_KEY + planId) || "");
      fetch(`/api/tiles/${planId}/meta`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.gridW && d?.tileSize) setImgAspect((d.gridH * d.tileSize) / (d.gridW * d.tileSize)); })
        .catch(() => {});
    }
  }, [planId, token]);

  useEffect(() => {
    if (planId2) {
      setPlanWidthM2(localStorage.getItem(SCALE_LS_KEY + planId2) || "");
      fetch(`/api/tiles/${planId2}/meta`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.gridW && d?.tileSize) setImgAspect2((d.gridH * d.tileSize) / (d.gridW * d.tileSize)); })
        .catch(() => {});
    }
  }, [planId2, token]);

  const handleUpdateScale = (val: string, planNum: 1 | 2) => {
    if (planNum === 1 && planId) {
      setPlanWidthM(val);
      localStorage.setItem(SCALE_LS_KEY + planId, val);
    } else if (planNum === 2 && planId2) {
      setPlanWidthM2(val);
      localStorage.setItem(SCALE_LS_KEY + planId2, val);
    }
  };

  const routeDistanceM = useMemo<number | null>(() => {
    let total = 0;
    let hasSomething = false;

    if (pinA && pinB && planId) {
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

    if (showPlan2 && pinC && pinD && planId2) {
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
  }, [pinA, pinB, waypoints, planId, showPlan2, pinC, pinD, planId2, planWidthM, planWidthM2, imgAspect, imgAspect2]);

  async function handleAddCable() {
    if (!planId || !pinA || !cableName.trim() || !pointBLabel.trim() || !pinB) return;
    setSaving(true);
    try {
      const routeRes = await apiPost<any>("/api/cable-routes", {
        project_id: projectId,
        plan_id: planId,
        point_a_label: labelA.trim() || "A",
        point_b_label: pointBLabel.trim(),
        name: `${labelA.trim()} -> ${pointBLabel.trim()}`,
        point_a_x: pinA.x,
        point_a_y: pinA.y,
        point_b_x: pinB.x,
        point_b_y: pinB.y,
        waypoints: waypoints,
        plan_id_2: showPlan2 ? planId2 : null,
        point_c_x: showPlan2 ? pinC?.x : null,
        point_c_y: showPlan2 ? pinC?.y : null,
        point_d_x: showPlan2 ? pinD?.x : null,
        point_d_y: showPlan2 ? pinD?.y : null,
        waypoints_2: showPlan2 ? waypoints2 : [],
        scale: parseFloat(planWidthM) || null,
        scale_2: showPlan2 ? parseFloat(planWidthM2) || null : null
      });

      await apiPost<any>("/api/cables", {
        project_id: projectId,
        name: cableName.trim(),
        cable_type: normalizeCableType(cableType),
        length: cableLength ? Number(cableLength) : (routeDistanceM ? Number(routeDistanceM.toFixed(2)) : null),
        trommel_id: trommelId || null,
        category_id: categoryId || null,
        route_id: routeRes.id
      });

      setCableName("");
      setPointBLabel("");
      setCableLength("");
      setPinA(null); // Reset Point A
      setLabelA("A"); // Reset label to default
      setPinB(null);
      setWaypoints([]);
      setPinC(null);
      setPinD(null);
      setWaypoints2([]);
      setPicking("A"); // Back to picking A
      setActivePlanView(1);
      
      const routeData = {
        planId, labelA, pointBLabel, pinA, pinB, waypoints,
        showPlan2, planId2, pinC, pinD, waypoints2,
        planWidthM, planWidthM2, categoryId
      };
      setLastRouteData(routeData);
      localStorage.setItem(LAST_ROUTE_LS_KEY, JSON.stringify(routeData));

      onCableAdded();

      const btn = document.getElementById("advanced-save-btn");
      if (btn) {
        const old = btn.innerText;
        btn.innerText = "✓ Dodano!";
        setTimeout(() => { btn.innerText = old; }, 1500);
      }
    } catch (e: any) {
      alert("Błąd podczas dodawania kabla.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 30000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.85)", backdropFilter: "blur(10px)" }}>
      <div style={{ width: "min(1280px, 98vw)", height: "92vh", background: "#0b0f1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 24, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 40px 100px rgba(0,0,0,0.8)" }}>
        
        <div style={{ padding: "18px 24px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.02)" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: "#fff", letterSpacing: "-0.01em" }}>{t("cables", "advancedAdderTitle", "🚀 Zaawansowane dodawanie kabli")}</h2>
            <p style={{ margin: "2px 0 0", fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("cables", "advancedAdderSubtitle", "Ustal wspólny Punkt A i dodawaj kolejne kable")}</p>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,0.05)", color: "#888", border: "none", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>

        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          
          <div style={{ width: "340px", background: "rgba(0,0,0,0.3)", borderRight: "1px solid rgba(255,255,255,0.05)", padding: 24, display: "flex", flexDirection: "column", gap: 24, overflowY: "auto" }}>
            
            {lastRouteData && (
              <button 
                onClick={() => {
                  const d = lastRouteData;
                  setPlanId(d.planId);
                  setLabelA(d.labelA);
                  setPointBLabel(d.pointBLabel);
                  setPinA(d.pinA);
                  setPinB(d.pinB);
                  setWaypoints(d.waypoints);
                  setShowPlan2(d.showPlan2);
                  setPlanId2(d.planId2);
                  setPinC(d.pinC);
                  setPinD(d.pinD);
                  setWaypoints2(d.waypoints2);
                  setPlanWidthM(d.planWidthM);
                  setPlanWidthM2(d.planWidthM2);
                  if (d.categoryId) setCategoryId(d.categoryId);
                  setPicking("B");
                }}
                style={{ padding: "12px", borderRadius: 12, background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.3)", color: "#38bdf8", fontSize: 11, fontWeight: 900, cursor: "pointer", textTransform: "uppercase", width: "100%" }}
              >
                🔄 {t("cables", "useLastRoute", "Użyj ostatniej trasy")}
              </button>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <h3 style={{ margin: 0, fontSize: 12, fontWeight: 900, color: "#38bdf8", textTransform: "uppercase", letterSpacing: "0.1em" }}>{t("cables", "step1ManualA", "Krok 1: Wybierz start (Punkt A)")}</h3>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 6, color: "#94a3b8", fontSize: 10, fontWeight: 800, textTransform: "uppercase" }}>
                  {t("cables", "selectPlan", "Wybierz Plan")}
                  <select 
                    value={planId} 
                    onChange={e => { setPlanId(e.target.value); setPinA(null); setPinB(null); setWaypoints([]); setActivePlanView(1); setPicking("A"); }} 
                    style={{ padding: "12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "#000", color: "#fff", fontWeight: 700, fontSize: 13 }}
                  >
                    <option value="">-- {t("cables", "selectPlanPlaceholder", "Wybierz plan")} --</option>
                    {plans.map(p => {
                      const floorName = p.floors?.name || "";
                      const buildingName = p.floors?.buildings?.name || "";
                      const label = [buildingName, floorName].filter(Boolean).join(" · ") || p.id.slice(0, 8);
                      return <option key={p.id} value={p.id}>{label}</option>;
                    })}
                  </select>
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 6, color: "#94a3b8", fontSize: 10, fontWeight: 800, textTransform: "uppercase" }}>
                  {t("cables", "planWidthLabel", "Szerokość planu (m)")}
                  <input 
                    type="number" 
                    value={planWidthM} 
                    onChange={e => handleUpdateScale(e.target.value, 1)} 
                    placeholder="np. 50" 
                    style={{ padding: "12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "#000", color: "#fff", fontSize: 13, fontWeight: 700 }} 
                  />
                </label>
              </div>

              <label style={{ display: "flex", flexDirection: "column", gap: 6, color: "#94a3b8", fontSize: 10, fontWeight: 800, textTransform: "uppercase" }}>
                {t("cables", "pointAName", "Nazwa Punktu A")}
                <input value={labelA} onChange={e => setLabelA(e.target.value)} style={{ padding: "12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "#000", color: "#fff", fontSize: 13, fontWeight: 700 }} />
              </label>

              <button 
                onClick={() => { setPicking("A"); setActivePlanView(1); }}
                style={{ padding: "12px", borderRadius: 12, background: picking === "A" ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.05)", border: picking === "A" ? "1px solid #22c55e" : "1px solid rgba(255,255,255,0.1)", color: picking === "A" ? "#4ade80" : "#fff", fontWeight: 900, cursor: "pointer", fontSize: 11 }}
              >
                {pinA ? t("cables", "pointASet", "📍 Punkt A ustawiony ✓") : t("cables", "clickMapSetA", "🎯 Kliknij mapę aby ustawić Punkt A")}
              </button>
            </div>

            {pinA && (
              <>
                <div style={{ height: 1, background: "rgba(255,255,255,0.05)" }} />
                
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <h3 style={{ margin: 0, fontSize: 12, fontWeight: 900, color: "#38bdf8", textTransform: "uppercase", letterSpacing: "0.1em" }}>{t("cables", "step2AddCable", "Krok 2: Dodaj Kabel")}</h3>
                  
                  <label style={{ display: "flex", flexDirection: "column", gap: 6, color: "#94a3b8", fontSize: 10, fontWeight: 800, textTransform: "uppercase" }}>
                    {t("cables", "cableNameLabel", "Numer / Nazwa kabla")}
                    <input value={cableName} onChange={e => setCableName(e.target.value)} placeholder="np. K-01" style={{ padding: "12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "#000", color: "#fff", fontSize: 13, fontWeight: 700 }} />
                  </label>

                  <label style={{ display: "flex", flexDirection: "column", gap: 6, color: "#94a3b8", fontSize: 10, fontWeight: 800, textTransform: "uppercase" }}>
                    {t("cables", "pointBLabel", "Cel (Punkt B)")}
                    <input value={pointBLabel} onChange={e => setPointBLabel(e.target.value)} placeholder="np. Gniazdo 1" style={{ padding: "12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "#000", color: "#fff", fontSize: 13, fontWeight: 700 }} />
                  </label>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <label style={{ display: "flex", flexDirection: "column", gap: 6, color: "#94a3b8", fontSize: 10, fontWeight: 800, textTransform: "uppercase" }}>
                      {t("cables", "cableType", "Typ kabla")}
                      <input list="adv-cable-types" value={cableType} onChange={e => setCableType(e.target.value)} style={{ padding: "12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "#000", color: "#fff", fontSize: 13, fontWeight: 700 }} />
                      <datalist id="adv-cable-types">{cableTypes.map(ct => <option key={ct} value={ct} />)}</datalist>
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 6, color: "#94a3b8", fontSize: 10, fontWeight: 800, textTransform: "uppercase" }}>
                      {t("cables", "length", "Długość (m)")}
                      <input type="number" value={cableLength} onChange={e => setCableLength(e.target.value)} placeholder={routeDistanceM ? routeDistanceM.toFixed(1) : "m"} style={{ padding: "12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "#000", color: "#fff", fontSize: 13, fontWeight: 700 }} />
                    </label>
                  </div>

                  <label style={{ display: "flex", flexDirection: "column", gap: 6, color: "#94a3b8", fontSize: 10, fontWeight: 800, textTransform: "uppercase" }}>
                    {t("cables", "category", "Rozdzielnia (kategoria)")}
                    <select
                      value={categoryId}
                      onChange={e => setCategoryId(e.target.value)}
                      style={{ padding: "12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "#000", color: "#fff", fontSize: 13, fontWeight: 700 }}
                    >
                      <option value="">— {t("cables", "noCategory", "Bez kategorii")} —</option>
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </label>

                  <label style={{ display: "flex", flexDirection: "column", gap: 6, color: "#94a3b8", fontSize: 10, fontWeight: 800, textTransform: "uppercase" }}>
                    {t("cables", "assignTrommelLabel", "Przypisz bęben (opcjonalnie)")}
                    <select 
                      value={trommelId} 
                      onChange={e => setTrommelId(e.target.value)}
                      style={{ padding: "12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "#000", color: "#fff", fontSize: 13, fontWeight: 700 }}
                    >
                      <option value="">-- {t("cables", "noTrommelOpt", "Bez bębna")} --</option>
                      {(() => {
                        const filtered = trommels.filter(tr => {
                          if (tr.is_archived) return false;
                          if (!cableType) return true;
                          return normalizeCableType(tr.cable_type) === normalizeCableType(cableType);
                        });

                        const scored = filtered.map(tr => {
                          let score = 0;
                          const reqLen = parseFloat(cableLength) || routeDistanceM || 0;
                          if (tr.remaining_length != null && tr.remaining_length < reqLen) score -= 1000;
                          
                          // Simplified destination check: if any drum has a name similar to point B label? 
                          // Or if we had cables nested. For now, let's just sort by best fit.
                          return { tr, score };
                        });

                        const best = scored.length > 0 ? scored.sort((a,b) => b.score - a.score)[0] : null;
                        const bestId = (best && best.score > -100) ? best.tr.id : null;

                        return scored
                          .sort((a, b) => {
                            if (a.tr.id === bestId) return -1;
                            if (b.tr.id === bestId) return 1;
                            return a.tr.name.localeCompare(b.tr.name);
                          })
                          .map(({ tr }) => {
                            const isBest = tr.id === bestId;
                            return (
                              <option key={tr.id} value={tr.id} style={{ fontWeight: isBest ? 900 : 400, color: isBest ? "#38bdf8" : "inherit" }}>
                                {isBest ? "⭐ " : "🔄 "} {tr.name} {tr.remaining_length != null ? `[${tr.remaining_length}m]` : ""} {isBest ? "— REKOMENDOWANY" : ""}
                              </option>
                            );
                          });
                      })()}
                    </select>
                  </label>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="checkbox" id="advShowPlan2" checked={showPlan2} onChange={e => { setShowPlan2(e.target.checked); if (e.target.checked) setActivePlanView(2); else setActivePlanView(1); }} />
                    <label htmlFor="advShowPlan2" style={{ fontSize: 11, fontWeight: 800, color: "#fff", cursor: "pointer" }}>{t("cables", "connectToSecondPlan", "Połącz z drugim planem")}</label>
                  </div>

                  {showPlan2 && (
                    <label style={{ display: "flex", flexDirection: "column", gap: 6, color: "#94a3b8", fontSize: 10, fontWeight: 800, textTransform: "uppercase" }}>
                      {t("cables", "planWidthLabel", "Szerokość planu 2 (m)")}
                      <input 
                        type="number" 
                        value={planWidthM2} 
                        onChange={e => handleUpdateScale(e.target.value, 2)} 
                        placeholder="np. 50" 
                        style={{ padding: "12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "#000", color: "#fff", fontSize: 13, fontWeight: 700 }} 
                      />
                    </label>
                  )}

                  <div style={{ display: "flex", gap: 6 }}>
                    {(['B', 'C', 'D'] as const).map(p => {
                      if ((p === 'C' || p === 'D') && !showPlan2) return null;
                      const active = picking === p;
                      const placed = p === 'B' ? !!pinB : p === 'C' ? !!pinC : !!pinD;
                      return (
                        <button key={p} onClick={() => { setPicking(p); setActivePlanView(p === 'B' ? 1 : 2); }}
                          style={{ flex: 1, padding: "10px", borderRadius: 10, fontSize: 11, fontWeight: 900, background: active ? "#38bdf8" : "rgba(255,255,255,0.05)", color: active ? "#000" : "#888", border: "none", cursor: "pointer" }}>
                          {p} {placed ? "✓" : ""}
                        </button>
                      );
                    })}
                  </div>

                  <button 
                    id="advanced-save-btn"
                    onClick={handleAddCable}
                    disabled={!pinA || !pinB || !cableName || !pointBLabel || saving}
                    style={{ marginTop: 10, padding: "18px", borderRadius: 16, background: (!pinA || !pinB || !cableName || !pointBLabel) ? "rgba(255,255,255,0.05)" : "#38bdf8", color: (!pinA || !pinB || !cableName || !pointBLabel) ? "#444" : "#000", border: "none", fontWeight: 900, cursor: "pointer", fontSize: 14, boxShadow: "0 10px 30px rgba(56,189,248,0.2)" }}
                  >
                    {saving ? t("cables", "savingBtn", "Zapisywanie...") : t("cables", "saveAndNextBtn", "Zapisz i dodaj kolejny ⚡")}
                  </button>
                </div>
              </>
            )}
          </div>

          <div style={{ flex: 1, background: "#000", position: "relative" }}>
            {planId ? (
              activePlanView === 1 ? (
                <SingleMap 
                  planId={planId} token={token} 
                  pinA={pinA} pinB={pinB} 
                  setPinA={setPinA} setPinB={setPinB}
                  picking={picking === "A" ? "A" : "B"}
                  onPicked={(p) => { if (p === "A") setPicking("B"); else if (showPlan2) { setPicking("C"); setActivePlanView(2); } }}
                  waypoints={waypoints} setWaypoints={setWaypoints}
                  labelA={labelA}
                />
              ) : (
                <SingleMap 
                  planId={planId2} token={token} 
                  pinA={pinC} pinB={pinD} 
                  setPinA={setPinC} setPinB={setPinD}
                  labelA="C" labelB="D"
                  picking={picking === "C" ? "A" : "B"}
                  onPicked={(p) => { if (p === "A") setPicking("D"); }}
                  waypoints={waypoints2} setWaypoints={setWaypoints2}
                />
              )
            ) : (
              <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#334155", fontWeight: 800, fontSize: 18 }}>
                {t("cables", "pickPlanHint", "Wybierz plan po lewej, aby rozpocząć")}
              </div>
            )}
            
            {showPlan2 && activePlanView === 2 && (
              <div style={{ position: "absolute", top: 16, left: 16, zIndex: 1000, background: "rgba(15,23,42,0.9)", padding: "8px 16px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", display: "flex", gap: 12, alignItems: "center" }}>
                <span style={{ fontSize: 10, fontWeight: 900, color: "#38bdf8", textTransform: "uppercase" }}>{t("cables", "selectSecondPlan", "Drugi Plan")}</span>
                <select value={planId2} onChange={e => setPlanId2(e.target.value)} style={{ background: "transparent", border: "none", color: "#fff", fontSize: 13, fontWeight: 700, outline: "none" }}>
                  <option value="">-- {t("cables", "selectPlanPlaceholder", "Wybierz plan")} --</option>
                  {plans.map(p => <option key={p.id} value={p.id}>{p.floors?.buildings?.name} · {p.floors?.name}</option>)}
                </select>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
