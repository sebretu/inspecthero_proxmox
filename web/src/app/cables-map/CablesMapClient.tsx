"use client";
import { useState, useEffect, useMemo } from "react";
import { apiGet, apiPatch } from "@/lib/apiClient";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "@/contexts/LanguageContext";
import dynamic from "next/dynamic";
import { Map as MapIcon, Layers, ChevronLeft } from "lucide-react";
import Link from "next/link";

const LeafletMap = dynamic(() => import("@/components/_CableMapLeaflet").then(m => ({ default: m.CableMapLeaflet })), { ssr: false });
const TrommelPanel = dynamic(() => import("@/components/TrommelPanel").then(m => ({ default: m.TrommelPanel })), { ssr: false });
const CableDrawer = dynamic(() => import("@/components/CableDrawer").then(m => ({ default: m.CableDrawer })), { ssr: false });
const CableMapModal = dynamic(() => import("@/components/CableMapModal").then(m => ({ default: m.CableMapModal })), { ssr: false });

interface Route {
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
  plan_id_2?: string | null;
  point_c_x?: number | null;
  point_c_y?: number | null;
  point_d_x?: number | null;
  point_d_y?: number | null;
  waypoints_2?: { x: number; y: number }[] | null;
  point_a_photo?: string | null;
  point_b_photo?: string | null;
}

interface Cable {
  id: string;
  name: string;
  index_number?: number | null;
  cable_type?: string | null;
  length?: number | null;
  status: string;
  is_verified?: boolean;
  cable_routes?: Route | null;
  trommel_id?: string | null;
}

interface Trommel {
  id: string;
  name: string;
  index_number?: number | null;
  serial_number?: string | null;
  total_length: number | null;
}

const COLORS = ["#38bdf8", "#f97316", "#a78bfa", "#34d399", "#fb7185", "#fbbf24", "#60a5fa", "#f472b6", "#4ade80", "#e879f9"];

export default function CablesMapClient() {
  const { t } = useLanguage();
  const [token, setToken] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const isAdmin = (userRole || "").toUpperCase() === "ADMIN";
  const [projectId, setProjectId] = useState<string | null>(null);
  const [cables, setCables] = useState<Cable[]>([]);
  const [trommels, setTrommels] = useState<Trommel[]>([]);
  const [plansList, setPlansList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [selectedTrommel, setSelectedTrommel] = useState<any | null>(null);
  const [selectedCable, setSelectedCable] = useState<any | null>(null);
  const [mapCable, setMapCable] = useState<any | null>(null);
  const [verifyInput, setVerifyInput] = useState("");
  const [categories, setCategories] = useState<any[]>([]);
  const [cableTypes, setCableTypes] = useState<string[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setToken(data?.session?.access_token || null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setToken(s?.access_token || null));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!token) return;
    const pId = localStorage.getItem("selectedProjectId");
    setProjectId(pId);
    
    async function loadRole() {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).single();
        setUserRole(profile?.role || "USER");
      }
    }
    loadRole();
  }, [token]);

  const loadData = async () => {
    if (!token || !projectId) return;
    setLoading(true);
    try {
      const [cRes, tRes, pRes] = await Promise.all([
        apiGet<Cable[]>(`/api/cables?projectId=${projectId}&limit=2000`, token),
        apiGet<Trommel[]>(`/api/trommels?projectId=${projectId}`, token),
        apiGet<any[]>(`/api/plans?projectId=${projectId}`, token)
      ]);
      setCables(cRes || []);
      setTrommels(tRes || []);
      setPlansList(pRes || []);

      try {
        const catRes = await apiGet<any[]>(`/api/cable-categories?projectId=${projectId}`, token);
        setCategories(catRes || []);
      } catch (e) {
        console.error("Failed to load categories", e);
      }

      const types = new Set<string>();
      (cRes || []).forEach(c => { if (c.cable_type) types.add(c.cable_type); });
      setCableTypes(Array.from(types).sort());
    } catch (err) {
      console.error("[CablesMap] Failed to load data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [token, projectId]);

  const cablesWithMap = useMemo(() => {
    return cables.filter(c => c.cable_routes && (
      (c.cable_routes.plan_id && c.cable_routes.point_a_x != null) ||
      (c.cable_routes.plan_id_2 && c.cable_routes.point_c_x != null)
    ));
  }, [cables]);

  const plans = useMemo(() => {
    const p = new Map<string, { id: string; count: number }>();
    cablesWithMap.forEach(c => {
      const pid = c.cable_routes!.plan_id;
      if (pid) {
        p.set(pid, { id: pid, count: (p.get(pid)?.count || 0) + 1 });
      }
      const pid2 = c.cable_routes!.plan_id_2;
      if (pid2) {
        p.set(pid2, { id: pid2, count: (p.get(pid2)?.count || 0) + 1 });
      }
    });
    return Array.from(p.values()).sort((a, b) => b.count - a.count);
  }, [cablesWithMap]);

  useEffect(() => {
    if (!activePlanId && plans.length > 0) {
      setActivePlanId(plans[0].id);
    }
  }, [plans, activePlanId]);

  const mapRoutes = useMemo(() => {
    if (!activePlanId) return [];
    return cablesWithMap
      .filter(c => c.cable_routes?.plan_id === activePlanId || c.cable_routes?.plan_id_2 === activePlanId)
      .map((c, i) => {
        const r = c.cable_routes!;
        const tr = trommels.find(t => t.id === c.trommel_id);
        const trNum = tr?.serial_number || tr?.index_number;
        const trommelName = tr ? (trNum != null ? `#${trNum} ${tr.name}` : tr.name) : null;

        const isPlan1 = r.plan_id === activePlanId;

        return {
          id: c.id,
          routeId: r.id,
          name: c.index_number != null ? `#${c.index_number} ${c.name}` : c.name,
          trommelName,
          trommelId: c.trommel_id,
          color: COLORS[i % COLORS.length],
          status: c.status,
          isVerified: c.is_verified,
          pinA: isPlan1 
            ? { x: r.point_a_x!, y: r.point_a_y! }
            : { x: r.point_c_x!, y: r.point_c_y! },
          pinB: isPlan1 
            ? { x: r.point_b_x!, y: r.point_b_y! }
            : { x: r.point_d_x!, y: r.point_d_y! },
          labelA: isPlan1 ? r.point_a_label : "C",
          labelB: isPlan1 ? r.point_b_label : r.point_b_label,
          waypoints: isPlan1 
            ? (Array.isArray(r.waypoints) ? r.waypoints : [])
            : (Array.isArray(r.waypoints_2) ? r.waypoints_2 : []),
          pointAPhoto: isPlan1 ? r.point_a_photo : null,
          pointBPhoto: isPlan1 ? r.point_b_photo : r.point_b_photo
        };
      });
  }, [activePlanId, cablesWithMap, trommels]);

  const handleVerifyCable = async (id: string, num?: number) => {
    try {
      const payload: any = { id, is_verified: true };
      if (num != null) payload.index_number = num;
      const { error } = await apiPatch<any>("/api/cables", payload, token);
      if (error) throw new Error(error);
      loadData();
    } catch (err: any) {
      alert("Błąd podczas weryfikacji: " + err.message);
    }
  };

  const handleGlobalVerify = async () => {
    if (!verifyInput) return;
    const num = parseInt(verifyInput);
    if (isNaN(num)) return alert("Wpisz poprawny numer kabla");
    
    const cable = cables.find(c => c.index_number === num);
    if (!cable) return alert(`Nie znaleziono kabla o numerze #${num}`);

    if (cable.is_verified) return alert(`Kabel #${num} jest już zweryfikowany`);

    if (confirm(`Czy na pewno oznaczyć kabel #${num} (${cable.name}) jako zweryfikowany?`)) {
      await handleVerifyCable(cable.id);
      setVerifyInput("");
      
      // If it's on a different plan, maybe switch?
      if (cable.cable_routes?.plan_id && cable.cable_routes.plan_id !== activePlanId) {
        setActivePlanId(cable.cable_routes.plan_id);
      }
    }
  };

  const handleUpdateCableNumber = async (id: string, num: number) => {
    try {
      const { error } = await apiPatch<any>("/api/cables", { id, index_number: num }, token);
      if (error) throw new Error(error);
      loadData();
    } catch (err: any) {
      console.error("[CablesMap] Failed to update index:", err);
    }
  };

  if (loading) {
    return (
      <div style={{ height: "100vh", background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 40, height: 40, border: "4px solid rgba(255,255,255,0.1)", borderTopColor: "#38bdf8", borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 16px" }} />
          <p style={{ fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", fontSize: 12 }}>{t("common","loading","Ładowanie mapy...")}</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#000", overflow: "hidden" }}>
      {/* HEADER */}
      <div style={{ padding: "14px 20px", background: "#0f172a", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", gap: 20, zIndex: 10 }}>
        <Link href="/cables" style={{ display: "flex", alignItems: "center", gap: 8, color: "#94a3b8", textDecoration: "none", fontSize: 13, fontWeight: 700 }}>
          <ChevronLeft size={18} /> {t("common","back","Powrót")}
        </Link>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(56,189,248,0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "#38bdf8" }}>
            <MapIcon size={20} />
          </div>
          <div>
            <h1 style={{ fontSize: 16, fontWeight: 900, color: "#fff", margin: 0 }}>{t("cables","cableMapTitle","MAPA KABLI")}</h1>
            <p style={{ fontSize: 11, color: "#64748b", margin: 0, fontWeight: 700 }}>{cablesWithMap.length} {t("cables","cablesOnMap","kabli z trasami")}</p>
          </div>
        </div>

        {/* GLOBAL VERIFY SEARCH */}
        {isAdmin && (
          <div style={{ display: "flex", gap: 8, background: "rgba(255,255,255,0.05)", padding: "4px 8px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)" }}>
            <input 
              type="number" 
              placeholder={`${t("cables", "verifyBtn", "Weryfikuj")} #...`} 
              value={verifyInput}
              onChange={(e) => setVerifyInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleGlobalVerify()}
              style={{ background: "transparent", border: "none", color: "#fff", fontSize: 13, width: 100, outline: "none", fontWeight: 700 }}
            />
            <button 
              onClick={handleGlobalVerify}
              style={{ background: "#10b981", color: "#fff", border: "none", borderRadius: 8, padding: "4px 10px", fontSize: 10, fontWeight: 900, cursor: "pointer", textTransform: "uppercase" }}
            >
              OK
            </button>
          </div>
        )}

        {/* PLAN SELECTOR */}
        {plans.length > 1 && (
          <div style={{ 
            display: "flex", 
            background: "rgba(255,255,255,0.05)", 
            borderRadius: 12, 
            padding: 4, 
            border: "1px solid rgba(255,255,255,0.1)",
            overflowX: "auto",
            maxWidth: "100%",
            gap: 4,
            msOverflowStyle: "none",
            scrollbarWidth: "none"
          }}>
            <style>{`
              .plan-scroller::-webkit-scrollbar { display: none; }
            `}</style>
            <div className="plan-scroller" style={{ display: "flex", gap: 4 }}>
            {plans.map(p => {
              const planInfo = plansList.find(pl => pl.id === p.id);
              const planName = planInfo ? `${planInfo.floors?.buildings?.name || ""} > ${planInfo.floors?.name || ""}`.trim() : `PLAN ${p.id.slice(0, 6).toUpperCase()}`;
              const label = planName.length > 20 ? planName.slice(0, 20) + "..." : planName;

              return (
                <button 
                  key={p.id}
                  onClick={() => setActivePlanId(p.id)}
                  style={{ 
                    padding: "8px 16px", 
                    borderRadius: 10, 
                    border: "none", 
                    background: activePlanId === p.id ? "#38bdf8" : "transparent", 
                    color: activePlanId === p.id ? "#000" : "#94a3b8", 
                    fontSize: 11, 
                    fontWeight: 900, 
                    cursor: "pointer",
                    transition: "all 0.2s",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexShrink: 0,
                    whiteSpace: "nowrap"
                  }}
                  title={planName}
                >
                  <Layers size={14} />
                  {label} ({p.count})
                </button>
              );
            })}
            </div>
          </div>
        )}
      </div>

      {/* MAP */}
      <div style={{ flex: 1, position: "relative" }}>
        {activePlanId ? (
          <LeafletMap
            planId={activePlanId}
            token={token}
            routes={mapRoutes}
            isAdmin={isAdmin}
            onVerifyCable={handleVerifyCable}
            onUpdateCableNumber={handleUpdateCableNumber}
            onSelectCable={(id) => {
              const c = cables.find(x => x.id === id);
              if (c) setMapCable(c);
            }}
            onEditCable={(id) => {
              const c = cables.find(x => x.id === id);
              if (c) setSelectedCable(c);
            }}
            onSelectTrommel={(id) => {
              const tr = trommels.find(t => t.id === id);
              if (tr) setSelectedTrommel(tr);
            }}
            onRouteUpdated={loadData}
          />
        ) : (
          <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, color: "#475569" }}>
            <div style={{ fontSize: 64 }}>🗺️</div>
            <p style={{ fontSize: 16, fontWeight: 800 }}>{t("cables","noCablesOnMap","Brak kabli z wyznaczoną trasą")}</p>
          </div>
        )}
      </div>

      {/* TROMMEL PANEL MODAL */}
      {selectedTrommel && (
        <div style={{ position: "fixed", inset: 0, zIndex: 20000, display: "flex", justifyContent: "flex-end", background: "rgba(0,0,0,0.5)" }}>
           <div style={{ width: "min(450px, 100%)", height: "100%", background: "#0f172a", borderLeft: "1px solid rgba(255,255,255,0.1)", boxShadow: "-20px 0 60px rgba(0,0,0,0.5)" }}>
              <TrommelPanel 
                trommel={selectedTrommel} 
                token={token} 
                isAdmin={isAdmin} 
                isMod={isAdmin} 
                onClose={() => setSelectedTrommel(null)} 
                onUpdated={loadData}
                onCableClick={(c) => setMapCable(c)}
              />
           </div>
        </div>
      )}

      {/* CABLE DRAWER MODAL */}
      {selectedCable && (
        <div style={{ position: "fixed", inset: 0, zIndex: 20000, display: "flex", justifyContent: "flex-end", background: "rgba(0,0,0,0.5)" }}>
          <div style={{ width: "min(500px, 100%)", height: "100%", background: "#0f172a", borderLeft: "1px solid rgba(255,255,255,0.1)", boxShadow: "-20px 0 60px rgba(0,0,0,0.5)" }}>
            <CableDrawer 
              cable={selectedCable}
              token={token}
              isMod={isAdmin}
              projectId={projectId || ""}
              onClose={() => setSelectedCable(null)}
              onUpdated={(u) => {
                setCables(prev => prev.map(c => c.id === u.id ? { ...c, ...u } as any : c));
                setSelectedCable(null);
              }}
              onDeleted={(id) => {
                setCables(prev => prev.filter(c => c.id !== id));
                setSelectedCable(null);
              }}
              routes={[]} // Routes are not needed for simple info, but prop is required
              trommels={trommels as any}
              cableTypes={cableTypes}
              categories={categories}
            />
          </div>
        </div>
      )}

      {/* CABLE MAP MODAL (Focused view) */}
      {mapCable && (
        <CableMapModal 
          cable={mapCable}
          token={token}
          allCables={cables}
          trommels={trommels as any}
          onClose={() => setMapCable(null)}
          onUpdated={() => loadData()}
          onOpenCable={(c) => setMapCable(c)}
          onSelectTrommel={(tid) => {
            const tr = trommels.find(t => t.id === tid);
            if (tr) {
              setMapCable(null);
              setSelectedTrommel(tr);
            }
          }}
        />
      )}
    </div>
  );
}
