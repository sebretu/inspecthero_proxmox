"use client";
import { useState, useEffect } from "react";
import { apiGet, apiPost } from "@/lib/apiClient";
import dynamic from "next/dynamic";

const SingleMap = dynamic(
  () => import("./CableRouteSingleMap").then(m => ({ default: m.CableRouteSingleMap })),
  { ssr: false }
);

interface Pin { x: number; y: number }

interface Category {
  id: string;
  project_id: string;
  name: string;
  plan_id: string;
  point_a_x: number;
  point_a_y: number;
  point_a_label: string;
}

interface Trommel {
  id: string;
  name: string;
  cable_type?: string | null;
  remaining_length?: number | null;
  is_archived?: boolean;
}

interface Props {
  projectId: string;
  token: string | null;
  onClose: () => void;
  onCableAdded: () => void;
  cableTypes: string[];
}

import { useLanguage } from "@/contexts/LanguageContext";
import React from "react";

export function SerialCableAdderModal({ projectId, token, onClose, onCableAdded, cableTypes }: Props) {
  const { t } = useLanguage();
  const [categories, setCategories] = useState<Category[]>([]);
  const [trommels, setTrommels] = useState<Trommel[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedCatId, setSelectedCatId] = useState("");
  
  // Cable state
  const [cableName, setCableName] = useState("");
  const [pointBLabel, setPointBLabel] = useState("");
  const [cableType, setCableType] = useState("");
  const [cableLength, setCableLength] = useState("");
  const [trommelId, setTrommelId] = useState("");
  const [pinB, setPinB] = useState<Pin | null>(null);
  const [waypoints, setWaypoints] = useState<Pin[]>([]);

  const [saving, setSaving] = useState(false);

  // Plan 2 state
  const [showPlan2, setShowPlan2] = useState(false);
  const [planId2, setPlanId2] = useState("");
  const [pinC, setPinC] = useState<Pin | null>(null);
  const [pinD, setPinD] = useState<Pin | null>(null);
  const [waypoints2, setWaypoints2] = useState<Pin[]>([]);
  const [activePlanView, setActivePlanView] = useState<1 | 2>(1);
  const [picking, setPicking] = useState<"A" | "B" | "C" | "D">("B");
  const [planWidthM, setPlanWidthM] = useState<string>("");
  const [planWidthM2, setPlanWidthM2] = useState<string>("");
  const [imgAspect, setImgAspect] = useState<number | null>(null);
  const [imgAspect2, setImgAspect2] = useState<number | null>(null);

  const loadTrommels = async () => {
    try {
      const trms = await apiGet<Trommel[]>(`/api/trommels?projectId=${projectId}`);
      setTrommels(trms || []);
    } catch {}
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiGet<Category[]>(`/api/cable-categories?projectId=${projectId}`),
      apiGet<Trommel[]>(`/api/trommels?projectId=${projectId}`),
      apiGet<any[]>(`/api/plans?projectId=${projectId}`)
    ]).then(([cats, trms, p]) => {
      setCategories(cats || []);
      setTrommels(trms || []);
      setPlans(p || []);
    }).finally(() => setLoading(false));
  }, [projectId]);

  const activeCat = categories.find(c => c.id === selectedCatId);
  const activePlan = activeCat ? plans.find(p => p.id === activeCat.plan_id) : null;
  const SCALE_LS_KEY = "cableMapScale_";

  useEffect(() => {
    if (activePlan?.id) {
      setPlanWidthM(localStorage.getItem(SCALE_LS_KEY + activePlan.id) || "");
      // Fetch meta
      setImgAspect(null);
      fetch(`/api/tiles/${activePlan.id}/meta`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.gridW && d?.tileSize) setImgAspect((d.gridH * d.tileSize) / (d.gridW * d.tileSize)); })
        .catch(() => {});
    }
  }, [activePlan?.id, token]);

  useEffect(() => {
    if (planId2) {
      setPlanWidthM2(localStorage.getItem(SCALE_LS_KEY + planId2) || "");
      // Fetch meta
      setImgAspect2(null);
      fetch(`/api/tiles/${planId2}/meta`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.gridW && d?.tileSize) setImgAspect2((d.gridH * d.tileSize) / (d.gridW * d.tileSize)); })
        .catch(() => {});
    }
  }, [planId2, token]);

  // Save scale to localStorage when changed
  const handleUpdateScale = (val: string, planNum: 1 | 2) => {
    if (planNum === 1 && activePlan?.id) {
      setPlanWidthM(val);
      localStorage.setItem(SCALE_LS_KEY + activePlan.id, val);
    } else if (planNum === 2 && planId2) {
      setPlanWidthM2(val);
      localStorage.setItem(SCALE_LS_KEY + planId2, val);
    }
  };

  const routeDistanceM = React.useMemo<number | null>(() => {
    let total = 0;
    let hasSomething = false;

    // Plan 1
    if (activeCat && pinB && activePlan) {
      const wM = parseFloat(planWidthM);
      if (wM > 0 && imgAspect) {
        const hM = wM * imgAspect;
        const pts = [{ x: activeCat.point_a_x, y: activeCat.point_a_y }, ...waypoints, pinB];
        const scaled = pts.map(p => ({ x: p.x * wM, y: p.y * hM }));
        for (let i = 0; i < scaled.length - 1; i++) {
          total += Math.hypot(scaled[i + 1].x - scaled[i].x, scaled[i + 1].y - scaled[i].y);
        }
        hasSomething = true;
      }
    }

    // Plan 2
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
  }, [activeCat, pinB, waypoints, activePlan, showPlan2, pinC, pinD, planId2, plans, planWidthM, planWidthM2, imgAspect, imgAspect2]);

  async function handleAddCable() {
    if (!activeCat || !cableName.trim() || !pointBLabel.trim() || !pinB) return;
    setSaving(true);
    try {
      // 1. Create Route
      const routeRes = await apiPost<any>("/api/cable-routes", {
        project_id: projectId,
        plan_id: activeCat.plan_id,
        point_a_label: activeCat.point_a_label,
        point_b_label: pointBLabel.trim(),
        name: `${activeCat.point_a_label} -> ${pointBLabel.trim()}`,
        point_a_x: activeCat.point_a_x,
        point_a_y: activeCat.point_a_y,
        point_b_x: pinB.x,
        point_b_y: pinB.y,
        waypoints: waypoints,
        plan_id_2: showPlan2 ? planId2 : null,
        point_c_x: showPlan2 ? pinC?.x : null,
        point_c_y: showPlan2 ? pinC?.y : null,
        point_d_x: showPlan2 ? pinD?.x : null,
        point_d_y: showPlan2 ? pinD?.y : null,
        waypoints_2: showPlan2 ? waypoints2 : []
      });
      
      const routeId = routeRes.id; // API returns { ok: true, data: { id: ... } }, but apiPost unwraps data

      // 2. Create Cable
      await apiPost<any>("/api/cables", {
        project_id: projectId,
        name: cableName.trim(),
        cable_type: cableType.trim() || null,
        length: cableLength ? Number(cableLength) : null,
        trommel_id: trommelId || null,
        route_id: routeId,
        category_id: activeCat.id
      });

      // Refresh trommels after adding cable to update remaining lengths
      await loadTrommels();

      // Reset for next cable
      setCableName("");
      setPointBLabel("");
      setCableLength("");
      setPinB(null);
      setWaypoints([]);
      setPinC(null);
      setPinD(null);
      setWaypoints2([]);
      setPicking(showPlan2 ? "B" : "B"); // reset picking state
      onCableAdded();
      
      // Briefly show success
      const btn = document.getElementById("serial-save-btn");
      if (btn) {
        const old = btn.innerText;
        btn.innerText = t("cables", "addedSuccess", "✓ Dodano!");
        setTimeout(() => { btn.innerText = old; }, 1500);
      }
    } catch (e: any) {
      if (e.code === "TROMMEL_FULL") {
        alert(t("cables", "errorTrommelFull", "Not enough space on the trommel. Please choose another one."));
      } else {
        alert("Błąd podczas dodawania kabla.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 30000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)" }}>
      <div style={{ width: "min(1200px, 98vw)", height: "90vh", background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        
        <div style={{ padding: "16px 22px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: "#fff" }}>{t("cables", "serialAdderModalTitle", "⚡ Seryjne dodawanie kabli")}</h2>
          <button onClick={onClose} style={{ background: "transparent", color: "#888", border: "none", fontSize: 16, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          
          {/* Lewy panel form */}
          <div style={{ width: "320px", background: "rgba(0,0,0,0.2)", borderRight: "1px solid rgba(255,255,255,0.05)", padding: 20, display: "flex", flexDirection: "column", gap: 20, overflowY: "auto" }}>
            
            <label style={{ display: "flex", flexDirection: "column", gap: 6, color: "#aaa", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>
              {t("cables", "step1Title", "1. Wybierz Rozdzielnię")}
              <select 
                value={selectedCatId} 
                onChange={e => { setSelectedCatId(e.target.value); setPinB(null); setWaypoints([]); setPinC(null); setPinD(null); setWaypoints2([]); setActivePlanView(1); setPicking("B"); }} 
                style={{ padding: "12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "#000", color: "#fff", fontWeight: 700 }}
              >
                <option value="">{t("cables", "selectCategoryPlaceholder", "-- Wybierz --")}</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name} ({c.point_a_label})</option>)}
              </select>
            </label>

            {activeCat && (
              <>
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", margin: "0 -20px" }} />
                
                <h3 style={{ margin: 0, fontSize: 14, color: "#38bdf8", fontWeight: 800 }}>{t("cables", "step2Title", "2. Nowy Kabel")}</h3>
                
                <label style={{ display: "flex", flexDirection: "column", gap: 6, color: "#aaa", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>
                  {t("cables", "cableNameLabel", "Numer / Nazwa kabla")}
                  <input value={cableName} onChange={e => setCableName(e.target.value)} placeholder={t("cables", "cableNamePlaceholder", "np. K-101")} style={{ padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "#000", color: "#fff" }} />
                </label>

                <label style={{ display: "flex", flexDirection: "column", gap: 6, color: "#aaa", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>
                  {t("cables", "pointBLabel", "Miejsce docelowe (Punkt B)")}
                  <input value={pointBLabel} onChange={e => setPointBLabel(e.target.value)} placeholder={t("cables", "pointBPlaceholder", "np. Szafa Rack 2")} style={{ padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "#000", color: "#fff" }} />
                </label>

                <label style={{ display: "flex", flexDirection: "column", gap: 6, color: "#aaa", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>
                  {t("cables", "cableTypeLabel", "Typ kabla (opcjonalnie)")}
                  <input list="serial-cable-types" value={cableType} onChange={e => setCableType(e.target.value)} placeholder={t("cables", "cableTypePlaceholder", "np. NYY-J 5x16")} style={{ padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "#000", color: "#fff" }} />
                  <datalist id="serial-cable-types">
                    {cableTypes.map(ct => <option key={ct} value={ct} />)}
                  </datalist>
                </label>

                <label style={{ display: "flex", flexDirection: "column", gap: 6, color: "#aaa", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>{t("cables", "lengthOpt", "Długość (m)")}</span>
                    {routeDistanceM != null ? (
                      <span style={{ color: "#38bdf8", fontWeight: 900 }}>{routeDistanceM.toFixed(1)}m ({t("cables", "fromMapHint", "z mapy")})</span>
                    ) : (
                      <span style={{ color: "#f59e0b", fontSize: 9 }}>{t("cables", "noScaleHint", "Brak skali na planie")}</span>
                    )}
                  </div>
                  <input type="number" min="0" step="0.5" value={cableLength} onChange={e => setCableLength(e.target.value)} placeholder="np. 25" style={{ padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "#000", color: "#fff" }} />
                </label>

                <label style={{ display: "flex", flexDirection: "column", gap: 6, color: "#aaa", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>
                  {t("cables", "assignTrommelLabel", "Przypisz bęben (opcjonalnie)")}
                  <select value={trommelId} onChange={e => setTrommelId(e.target.value)} style={{ padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "#000", color: "#fff" }}>
                    <option value="">{t("cables", "noTrommelOpt", "Bez bębna")}</option>
                    {(() => {
                      const filtered = trommels.filter(t => {
                        if (t.is_archived) return false;
                        if (cableType && t.cable_type && t.cable_type.trim().toLowerCase() !== cableType.trim().toLowerCase()) return false;
                        return true;
                      });

                      const scored = filtered.map(t => {
                        let score = 0;
                        const reqLen = parseFloat(cableLength) || routeDistanceM || 0;
                        if (t.remaining_length != null && t.remaining_length < reqLen) score -= 1000;
                        return { t, score };
                      });

                      const best = scored.length > 0 ? scored.sort((a,b) => b.score - a.score)[0] : null;
                      const bestId = (best && best.score > -100) ? best.t.id : null;

                      return scored
                        .sort((a, b) => {
                          if (a.t.id === bestId) return -1;
                          if (b.t.id === bestId) return 1;
                          return a.t.name.localeCompare(b.t.name);
                        })
                        .map(({ t }) => {
                          const isBest = t.id === bestId;
                          return (
                            <option key={t.id} value={t.id} style={{ fontWeight: isBest ? 900 : 400, color: isBest ? "#38bdf8" : "inherit" }}>
                              {isBest ? "⭐ " : "🔄 "} {t.name} {t.remaining_length != null ? `[${t.remaining_length}m]` : ""} {isBest ? "— REKOMENDOWANY" : ""}
                            </option>
                          );
                        });
                    })()}
                  </select>
                </label>

                <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", margin: "0 -20px" }} />
                
                <h3 style={{ margin: 0, fontSize: 14, color: "#38bdf8", fontWeight: 800 }}>{t("cables", "step3Title", "3. Mapa i Połączenie")}</h3>
                
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" id="serialShowPlan2" checked={showPlan2} onChange={e => { setShowPlan2(e.target.checked); if (e.target.checked) setActivePlanView(2); else setActivePlanView(1); }} />
                  <label htmlFor="serialShowPlan2" style={{ fontSize: 11, fontWeight: 800, color: "#fff", cursor: "pointer" }}>{t("cables", "connectToSecondPlan", "Połącz z drugim planem")}</label>
                </div>

                {showPlan2 && (
                  <label style={{ display: "flex", flexDirection: "column", gap: 6, color: "#aaa", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>
                    {t("cables", "selectSecondPlan", "Wybierz drugi plan")}
                    <select 
                      value={planId2} 
                      onChange={e => { setPlanId2(e.target.value); setActivePlanView(2); }} 
                      style={{ padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "#000", color: "#fff" }}
                    >
                      <option value="">{t("cables", "selectPlanPlaceholder", "-- Wybierz plan --")}</option>
                      {plans.map(p => {
                         const floorName = p.floors?.name || "";
                         const buildingName = p.floors?.buildings?.name || "";
                         const fileName = p.pdf_path?.split('/').pop() || "";
                         const label = [buildingName, floorName, fileName].filter(Boolean).join(" · ") || p.id.slice(0, 8);
                         return <option key={p.id} value={p.id}>{label}</option>;
                      })}
                    </select>
                  </label>
                )}

                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => setActivePlanView(1)} style={{ flex: 1, padding: "8px", borderRadius: 8, fontSize: 10, fontWeight: 900, background: activePlanView === 1 ? "#38bdf8" : "rgba(255,255,255,0.05)", color: activePlanView === 1 ? "#000" : "#888", border: "none", cursor: "pointer" }}>PLAN 1</button>
                  {showPlan2 && <button onClick={() => setActivePlanView(2)} style={{ flex: 1, padding: "8px", borderRadius: 8, fontSize: 10, fontWeight: 900, background: activePlanView === 2 ? "#38bdf8" : "rgba(255,255,255,0.05)", color: activePlanView === 2 ? "#000" : "#888", border: "none", cursor: "pointer" }}>PLAN 2</button>}
                </div>

                <div style={{ padding: "10px", borderRadius: 10, background: "rgba(56,189,248,0.05)", border: "1px solid rgba(56,189,248,0.2)", display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 9, fontWeight: 800, color: "#888", textTransform: "uppercase" }}>{t("cables", "planWidthLabel", "Szerokość planu")} {activePlanView} (m)</label>
                  <input 
                    type="number" 
                    step="0.5" 
                    value={activePlanView === 1 ? planWidthM : planWidthM2} 
                    onChange={e => handleUpdateScale(e.target.value, activePlanView)} 
                    placeholder="np. 45" 
                    style={{ padding: "8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "#000", color: "#fff", fontSize: 13, fontWeight: 700 }} 
                  />
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {(["B", "C", "D"] as const).map(p => {
                    if ((p === "C" || p === "D") && !showPlan2) return null;
                    const active = picking === p;
                    const placed = p === "B" ? !!pinB : p === "C" ? !!pinC : !!pinD;
                    const color = p === "B" ? "#f97316" : (p === "C" ? "#22c55e" : "#f97316");
                    return (
                      <button key={p} onClick={() => { setPicking(p); setActivePlanView(p === "B" ? 1 : 2); }}
                        style={{ flex: "1 0 45%", padding: "6px", borderRadius: 8, fontSize: 10, fontWeight: 900, border: `1px solid ${active ? color : "rgba(255,255,255,0.1)"}`, background: active ? `${color}22` : "transparent", color: active ? color : "#666", cursor: "pointer" }}>
                        PKT {p} {placed ? "✓" : ""}
                      </button>
                    );
                  })}
                </div>

                <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
                  {!pinB && (
                    <div style={{ fontSize: 11, color: "#f59e0b", background: "rgba(245,158,11,0.1)", padding: 10, borderRadius: 8, fontWeight: 700, textAlign: "center" }}>
                      {t("cables", "clickMapPointB", "👉 Kliknij na mapie, aby ustawić Punkt B")}
                    </div>
                  )}
                  <button 
                    id="serial-save-btn"
                    onClick={handleAddCable} 
                    disabled={!cableName || !pointBLabel || !pinB || (showPlan2 && (!pinC || !pinD)) || saving} 
                    style={{ padding: 16, borderRadius: 12, background: (!cableName || !pointBLabel || !pinB || (showPlan2 && (!pinC || !pinD))) ? "rgba(255,255,255,0.05)" : "#10b981", color: (!cableName || !pointBLabel || !pinB || (showPlan2 && (!pinC || !pinD))) ? "#888" : "#fff", border: "none", fontWeight: 900, cursor: (!cableName || !pointBLabel || !pinB || (showPlan2 && (!pinC || !pinD))) ? "not-allowed" : "pointer", transition: "all 0.2s" }}
                  >
                    {saving ? t("cables", "savingBtn", "Zapisywanie...") : t("cables", "saveAndNextBtn", "Zapisz i dodaj kolejny ⚡")}
                  </button>
                </div>
              </>
            )}

          </div>

          {/* Prawy panel mapa */}
          <div style={{ flex: 1, position: "relative", background: "#000" }}>
            {!activeCat ? (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontWeight: 800 }}>
                {t("cables", "selectCategoryMapHint", "Wybierz rozdzielnię po lewej stronie, aby załadować mapę.")}
              </div>
            ) : (activePlanView === 1 ? (
              <SingleMap
                planId={activeCat.plan_id}
                token={token}
                pinA={{ x: activeCat.point_a_x, y: activeCat.point_a_y }}
                pinB={pinB}
                setPinA={() => {}} // Block changing A
                setPinB={setPinB}
                picking={picking === "B" ? "B" : "B"} // it only picks B on plan 1
                waypoints={waypoints}
                setWaypoints={setWaypoints}
                onPicked={() => { if (picking === "B" && showPlan2) { setPicking("C"); setActivePlanView(2); } }}
              />
            ) : (
              <SingleMap
                planId={planId2}
                token={token}
                pinA={pinC}
                pinB={pinD}
                setPinA={setPinC}
                setPinB={setPinD}
                labelA="C"
                labelB="D"
                picking={picking === "C" ? "A" : (picking === "D" ? "B" : "A")}
                waypoints={waypoints2}
                setWaypoints={setWaypoints2}
                onPicked={(p) => { if (p === "A") setPicking("D"); }}
              />
            ))}
            
            {activeCat && (
              <div style={{ position: "absolute", top: 10, left: 10, zIndex: 1000, background: "rgba(0,0,0,0.8)", padding: "8px 16px", borderRadius: 12, border: "1px solid rgba(56,189,248,0.3)" }}>
                <div style={{ fontSize: 10, color: "#aaa", fontWeight: 800, textTransform: "uppercase", marginBottom: 2 }}>{t("cables", "activeCategory", "Aktywna Rozdzielnia")}</div>
                <div style={{ fontSize: 14, color: "#38bdf8", fontWeight: 900 }}>{activeCat.name}</div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
