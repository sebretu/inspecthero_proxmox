"use client";
import { useState, useMemo } from "react";
import { apiPatch } from "@/lib/apiClient";
import dynamic from "next/dynamic";
import { useLanguage } from "@/contexts/LanguageContext";

const LeafletMap = dynamic(() => import("./_CableMapLeaflet").then(m => ({ default: m.CableMapLeaflet })), { ssr: false });

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
}

interface Cable {
  id: string;
  name: string;
  index_number?: number | null;
  cable_type?: string | null;
  length?: number | null;
  status: string;
  cable_routes?: Route | null;
  trommel_id?: string | null;
  is_verified?: boolean;
}

interface Trommel {
  id: string;
  name: string;
  index_number?: number | null;
  serial_number?: string | null;
}

interface Props {
  categoryName: string;
  cables: Cable[];
  trommels: Trommel[];
  token: string | null;
  onClose: () => void;
  onSelectCable?: (cable: Cable) => void;
  onEditCable?: (cable: Cable) => void;
  onSelectTrommel?: (trommelId: string) => void;
  onUpdated?: () => void;
  isAdmin?: boolean;
}

const COLORS = ["#38bdf8", "#f97316", "#a78bfa", "#34d399", "#fb7185", "#fbbf24", "#60a5fa", "#f472b6", "#4ade80", "#e879f9"];

export function CategoryMapModal({ categoryName, cables, trommels, token, onClose, onSelectCable, onEditCable, onSelectTrommel, onUpdated, isAdmin }: Props) {
  const { t } = useLanguage();
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [verifyInput, setVerifyInput] = useState("");

  const cablesWithMap = useMemo(() => {
    return cables.filter(c => c.cable_routes?.plan_id && c.cable_routes.point_a_x != null);
  }, [cables]);

  // Group cables by plan
  const plans = useMemo(() => {
    const p = new Map<string, { id: string; count: number }>();
    cablesWithMap.forEach(c => {
      const pid = c.cable_routes!.plan_id!;
      p.set(pid, { id: pid, count: (p.get(pid)?.count || 0) + 1 });
    });
    return Array.from(p.values());
  }, [cablesWithMap]);

  // Set initial plan
  useMemo(() => {
    if (!activePlanId && plans.length > 0) {
      setActivePlanId(plans[0].id);
    }
  }, [plans, activePlanId]);

  const mapRoutes = useMemo(() => {
    if (!activePlanId) return [];
    return cablesWithMap
      .filter(c => c.cable_routes?.plan_id === activePlanId)
      .map((c, i) => {
        const r = c.cable_routes!;
        const tr = trommels.find(t => t.id === c.trommel_id);
        const trNum = tr?.serial_number || tr?.index_number;
        const trommelName = tr ? (trNum != null ? `#${trNum} ${tr.name}` : tr.name) : null;

        return {
          id: c.id,
          name: c.index_number != null ? `#${c.index_number} ${c.name}` : c.name,
          trommelName,
          trommelId: c.trommel_id,
          color: COLORS[i % COLORS.length],
          status: c.status,
          pinA: { x: r.point_a_x!, y: r.point_a_y! },
          pinB: { x: r.point_b_x!, y: r.point_b_y! },
          labelA: r.point_a_label,
          labelB: r.point_b_label,
          isVerified: c.is_verified,
          waypoints: Array.isArray(r.waypoints) ? r.waypoints : []
        };
      });
  }, [activePlanId, cablesWithMap, trommels]);

  const handleVerifyCable = async (id: string, num?: number) => {
    try {
      const payload: any = { id, is_verified: true };
      if (num != null) payload.index_number = num;
      const { error } = await apiPatch<any>("/api/cables", payload, token);
      if (error) throw new Error(error);
      onUpdated?.();
    } catch (err: any) {
      alert("Błąd podczas weryfikacji: " + err.message);
    }
  };

  const handleGlobalVerify = async () => {
    if (!verifyInput) return;
    const num = parseInt(verifyInput);
    if (isNaN(num)) return alert("Wpisz poprawny numer kabla");
    
    const cable = cables.find(c => c.index_number === num);
    if (!cable) return alert(`Nie znaleziono kabla o numerze #${num} w tej kategorii`);

    if (cable.is_verified) return alert(`Kabel #${num} jest już zweryfikowany`);

    if (confirm(`Czy na pewno oznaczyć kabel #${num} (${cable.name}) jako zweryfikowany?`)) {
      await handleVerifyCable(cable.id);
      setVerifyInput("");
    }
  };

  const handleUpdateCableNumber = async (id: string, num: number) => {
    try {
      const { error } = await apiPatch<any>("/api/cables", { id, index_number: num }, token);
      if (error) throw new Error(error);
      onUpdated?.();
    } catch (err: any) {
      console.error("[CategoryMap] Failed to update index:", err);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 15000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}>
      <div style={{ width: "min(1000px, 96vw)", height: "min(750px, 92dvh)", background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 24, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 40px 120px rgba(0,0,0,0.8)" }}>
        
        <div style={{ padding: "18px 24px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.2em", textTransform: "uppercase", color: "#38bdf8", margin: 0 }}>{t("cables","categoryMapTitle","MAPA KATEGORII")}</p>
            <h2 style={{ fontSize: 20, fontWeight: 900, color: "#fff", margin: "4px 0 0" }}>{categoryName}</h2>
            <p style={{ fontSize: 12, color: "#64748b", margin: "2px 0 0", fontWeight: 700 }}>{cablesWithMap.length} {t("cables","cablesOnMap","kabli na mapie")}</p>
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
                .plan-scroller-modal::-webkit-scrollbar { display: none; }
              `}</style>
              <div className="plan-scroller-modal" style={{ display: "flex", gap: 4 }}>
              {plans.map(p => (
                <button 
                  key={p.id}
                  onClick={() => setActivePlanId(p.id)}
                  style={{ 
                    padding: "6px 14px", 
                    borderRadius: 10, 
                    border: "none", 
                    background: activePlanId === p.id ? "#38bdf8" : "transparent", 
                    color: activePlanId === p.id ? "#000" : "#94a3b8", 
                    fontSize: 11, 
                    fontWeight: 900, 
                    cursor: "pointer",
                    transition: "all 0.2s",
                    flexShrink: 0,
                    whiteSpace: "nowrap"
                  }}
                >
                  PLAN {p.id.slice(0, 4)} ({p.count})
                </button>
              ))}
              </div>
            </div>
          )}

          <button onClick={onClose} style={{ width: 38, height: 38, borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#94a3b8", cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>

        <div style={{ flex: 1, position: "relative", overflow: "hidden", background: "#000" }}>
          {activePlanId ? (
            <LeafletMap
              planId={activePlanId}
              token={token}
              routes={mapRoutes}
              onSelectCable={(id) => {
                const target = cables.find(c => c.id === id);
                if (target) onSelectCable?.(target);
              }}
              onEditCable={(id) => {
                const target = cables.find(c => c.id === id);
                if (target) onEditCable?.(target);
              }}
              onSelectTrommel={onSelectTrommel}
              onVerifyCable={handleVerifyCable}
              onUpdateCableNumber={handleUpdateCableNumber}
              isAdmin={isAdmin}
            />
          ) : (
            <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, color: "#475569" }}>
              <div style={{ fontSize: 64 }}>🗺️</div>
              <p style={{ fontSize: 16, fontWeight: 800 }}>{t("cables","noCablesOnMap","Brak kabli z wyznaczoną trasą w tej kategorii")}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
