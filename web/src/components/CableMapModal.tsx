"use client";
import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { apiPatch } from "@/lib/apiClient";
import { useLanguage } from "@/contexts/LanguageContext";

// Lazy-load only what we need from leaflet/react-leaflet
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
  trommel_id?: string | null;
  status: "pending" | "in_progress" | "pending_approval" | "done" | string;
  cable_routes?: Route | null;
}

interface Trommel {
  id: string;
  name: string;
  index_number?: number | null;
  serial_number?: string | null;
  total_length?: number | null;
  used_length?: number;
  status?: string;
  cable_type?: string | null;
}

interface Props {
  cable: Cable;
  token: string | null;
  onClose: () => void;
  onUpdated?: (cable: Cable) => void;
  allCables?: Cable[];
  trommels?: Trommel[];
  onOpenCable?: (cable: any) => void;
  onEditCable?: (cable: any) => void;
  onSelectTrommel?: (tid: string) => void;
}

export function CableMapModal({ cable, token, allCables = [], trommels = [], onClose, onUpdated, onOpenCable, onEditCable, onSelectTrommel }: Props) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const route = cable.cable_routes;
  const [activePlan, setActivePlan] = useState<1 | 2>(1);
  const [currentStatus, setCurrentStatus] = useState(cable.status);
  const [updatedCable, setUpdatedCable] = useState<Cable | null>(null);
  const [logisticsNotification, setLogisticsNotification] = useState<{
    type: 'sameTrommel' | 'nearbySameType' | 'nearbyDiffType';
    cable: Cable;
    trommelName?: string;
  } | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showShortCableForm, setShowShortCableForm] = useState(false);
  const [remnantLength, setRemnantLength] = useState("");
  const [shortCableLogistics, setShortCableLogistics] = useState<{
    targetTrommel: Trommel | null;
    status: 'confirm_move' | 'confirm_assign_free' | 'no_space' | 'no_trommels';
  } | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  // Close and propagate update
  function handleClose() {
    if (updatedCable) onUpdated?.(updatedCable);
    onClose();
  }

  // Open suggested cable's map (propagates update, then opens new cable)
  function handleOpenSuggested() {
    const target = logisticsNotification?.cable;
    if (!target) return;
    // Pass the updated current cable AND the target to open next
    if (updatedCable) onUpdated?.(updatedCable);
    onOpenCable?.(target);
  }

  // Logic to find the next logical cable to work on
  const findNextCable = (currentCable: Cable, status: string, list: Cable[]) => {
    if (status !== 'pending_approval' || !list.length) return null;

    // Use latest data for the current cable from the list if available
    const latestMe = list.find(c => c.id === currentCable.id) || currentCable;
    const myDest = (latestMe.cable_routes?.point_b_label || "").trim().toLowerCase();
    const myType = latestMe.cable_type;

    if (!myDest && !latestMe.trommel_id) return null;

    // Priority 1: same trommel, same destination, not done, not this cable
    const sameTrommelCandidate = list.find(c =>
      c.id !== currentCable.id &&
      c.trommel_id === latestMe.trommel_id &&
      latestMe.trommel_id != null &&
      c.status !== 'done' &&
      c.status !== 'pending_approval' &&
      (c.cable_routes?.point_b_label || "").trim().toLowerCase() === myDest
    );

    if (sameTrommelCandidate) return { type: 'sameTrommel' as const, cable: sameTrommelCandidate };

    // Priority 2: same destination, same cable type, different trommel
    const sameTypeDiffTrommel = list.find(c =>
      c.id !== currentCable.id &&
      (c.cable_routes?.point_b_label || "").trim().toLowerCase() === myDest &&
      myDest !== "" &&
      c.cable_type === myType &&
      myType != null &&
      c.trommel_id !== latestMe.trommel_id &&
      c.trommel_id != null &&
      c.status !== 'done' &&
      c.status !== 'pending_approval'
    );

    if (sameTypeDiffTrommel) {
      const tr = trommels.find(t => t.id === sameTypeDiffTrommel.trommel_id);
      const trNum = tr?.serial_number || tr?.index_number;
      return {
        type: 'nearbySameType' as const,
        cable: sameTypeDiffTrommel,
        trommelName: tr ? `${trNum ? `#${trNum} ` : ''}${tr.name}` : undefined
      };
    }

    // Priority 3: same destination, different type
    const diffType = list.find(c =>
      c.id !== currentCable.id &&
      (c.cable_routes?.point_b_label || "").trim().toLowerCase() === myDest &&
      myDest !== "" &&
      c.trommel_id != null &&
      c.status !== 'done' &&
      c.status !== 'pending_approval'
    );

    if (diffType) {
      const tr = trommels.find(t => t.id === diffType.trommel_id);
      const trNum = tr?.serial_number || tr?.index_number;
      return {
        type: 'nearbyDiffType' as const,
        cable: diffType,
        trommelName: tr ? `${trNum ? `#${trNum} ` : ''}${tr.name}` : undefined
      };
    }

    // Priority 4: any other cable on the same trommel
    const anyOnSameTrommel = list.find(c =>
      c.id !== currentCable.id &&
      c.trommel_id === latestMe.trommel_id &&
      latestMe.trommel_id != null &&
      c.status !== 'done' &&
      c.status !== 'pending_approval'
    );

    if (anyOnSameTrommel) {
      return { type: 'sameTrommel' as const, cable: anyOnSameTrommel };
    }

    return null;
  };

  async function handleReport() {
    if (!token) return;
    setLoading(true);
    try {
      const next = currentStatus === "pending_approval" ? "in_progress" : "pending_approval";
      const updated = await apiPatch<Cable>("/api/cables", { id: cable.id, status: next }, token);
      setCurrentStatus(next);
      setUpdatedCable(updated);
      onUpdated?.(updated); // Notify parent immediately

      // Recalculate immediately for the chain
      setLogisticsNotification(findNextCable(cable, next, allCables));
    } catch (e: any) {
      alert(e.message || "Błąd");
    } finally {
      setLoading(false);
    }
  }

  async function handleShortCableSearch() {
    const len = Number(remnantLength);
    if (isNaN(len)) return;

    const candidates = trommels.filter(t => 
      t.id !== cable.trommel_id && 
      t.cable_type === cable.cable_type &&
      !["picked_up"].includes(t.status || "")
    );

    if (candidates.length === 0) {
      setShortCableLogistics({ targetTrommel: null, status: 'no_trommels' });
      return;
    }

    const needed = cable.length || 0;
    
    // Find a drum that can fit the FULL length of the cable
    const bestFit = candidates.find(t => {
      const trCables = allCables.filter(c => c.trommel_id === t.id);
      const used = trCables.reduce((sum, c) => sum + (c.length || 0), 0);
      const remaining = (t.total_length || 0) - used;
      return remaining >= needed;
    });

    if (bestFit) {
      setShortCableLogistics({ targetTrommel: bestFit, status: 'confirm_move' });
      return;
    }

    // Any drum with space
    const anySpace = candidates.find(t => {
      const trCables = allCables.filter(c => c.trommel_id === t.id);
      const used = trCables.reduce((sum, c) => sum + (c.length || 0), 0);
      const remaining = (t.total_length || 0) - used;
      return remaining > 0;
    });

    if (anySpace) {
      setShortCableLogistics({ targetTrommel: anySpace, status: 'confirm_assign_free' });
      return;
    }

    setShortCableLogistics({ targetTrommel: null, status: 'no_space' });
  }

  async function handleShortCableExecute() {
    if (!shortCableLogistics?.targetTrommel && shortCableLogistics?.status !== 'no_space' && shortCableLogistics?.status !== 'no_trommels') return;
    
    setLoading(true);
    try {
      const targetId = shortCableLogistics?.targetTrommel?.id || null;
      const oldTrommelId = cable.trommel_id;
      
      if (oldTrommelId) {
        await apiPatch("/api/trommels", { 
          id: oldTrommelId, 
          status: "empty",
          remnant_length: Number(remnantLength) || 0
        }, token);
      }
      
      const updated = await apiPatch<Cable>("/api/cables", { 
        id: cable.id, 
        trommel_id: targetId 
      }, token);
      
      setUpdatedCable(updated);
      onUpdated?.(updated);
      onClose();
    } catch (e: any) {
      alert(e?.message || "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLogisticsNotification(findNextCable(cable, currentStatus, allCables));
  }, [currentStatus, cable.id, allCables, trommels]);

  const hasCoords1 =
    route?.plan_id &&
    route.point_a_x != null && route.point_a_y != null &&
    route.point_b_x != null && route.point_b_y != null;

  const hasCoords2 =
    route?.plan_id_2 &&
    route.point_c_x != null && route.point_c_y != null &&
    route.point_d_x != null && route.point_d_y != null;

  const hasCoords = activePlan === 1 ? hasCoords1 : hasCoords2;

  const notifColor = logisticsNotification?.type === 'sameTrommel'
    ? { border: 'rgba(34,197,94,0.4)', bg: 'rgba(34,197,94,0.08)', text: '#86efac' }
    : logisticsNotification?.type === 'nearbySameType'
    ? { border: 'rgba(234,179,8,0.4)', bg: 'rgba(234,179,8,0.08)', text: '#fde047' }
    : { border: 'rgba(59,130,246,0.4)', bg: 'rgba(59,130,246,0.08)', text: '#93c5fd' };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 15000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}>
      <div style={{ width: "min(900px, 96vw)", height: "min(680px, 90dvh)", background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 40px 120px rgba(0,0,0,0.8)" }}>

        {/* header */}
        <div style={{ padding: "16px 22px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", color: "#38bdf8", margin: 0 }}>{t("cables","cableMapTitle","MAPA KABLA")}</p>
            <h2 style={{ fontSize: 17, fontWeight: 900, color: "#fff", margin: "4px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {cable.index_number != null && <span style={{ color: "#38bdf8", marginRight: 6 }}>#{cable.index_number}</span>}
              {cable.name}
              {cable.cable_type && <span style={{ fontSize: 12, fontWeight: 600, color: "#888", marginLeft: 8 }}>{cable.cable_type}</span>}
            </h2>
            {route && (
              <p style={{ fontSize: 12, color: "#888", margin: "2px 0 0", fontWeight: 600 }}>
                <span style={{ color: "#86efac" }}>A: {route.point_a_label}</span>
                {" → "}
                <span style={{ color: "#fdba74" }}>B: {route.point_b_label}</span>
                {cable.length != null && <span style={{ color: "#888", marginLeft: 8 }}>· {cable.length}m</span>}
              </p>
            )}
          </div>
          {token && currentStatus !== "done" && (
            <button 
              onClick={() => {
                if (currentStatus === "pending_approval") {
                  setShowCancelConfirm(true);
                } else {
                  handleReport();
                }
              }}
              disabled={loading}
              style={{ 
                padding: "8px 16px", 
                borderRadius: 12, 
                border: "none", 
                background: currentStatus === "pending_approval" ? "rgba(255,255,255,0.05)" : "#eab308", 
                color: currentStatus === "pending_approval" ? "#888" : "#000", 
                fontSize: 12, 
                fontWeight: 900, 
                cursor: "pointer",
                transition: "all 0.2s",
                boxShadow: currentStatus === "pending_approval" ? "none" : "0 4px 12px rgba(234,179,8,0.3)"
              }}
            >
              {loading ? "..." : currentStatus === "pending_approval" ? `↩ ${t("cables","cancelReport","Cofnij")}` : t("cables","reportApproval","Zgłoś do zatwierdzenia")}
            </button>
          )}
          {cable.trommel_id && currentStatus !== "done" && (
            <button
              onClick={() => setShowShortCableForm(true)}
              style={{ padding: "8px 16px", borderRadius: 12, border: "1px solid rgba(244,63,94,0.3)", background: "rgba(244,63,94,0.1)", color: "#fb7185", fontWeight: 800, fontSize: 12, cursor: "pointer" }}
            >
              📏 {t("cables", "shortCableBtn", "Kabel za krótki")}
            </button>
          )}
          {hasCoords1 && hasCoords2 && (
            <div style={{ display: "flex", background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: 2, border: "1px solid rgba(255,255,255,0.1)" }}>
              <button onClick={() => setActivePlan(1)} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: activePlan === 1 ? "#38bdf8" : "transparent", color: activePlan === 1 ? "#000" : "#888", fontSize: 11, fontWeight: 800, cursor: "pointer" }}>PLAN 1</button>
              <button onClick={() => setActivePlan(2)} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: activePlan === 2 ? "#38bdf8" : "transparent", color: activePlan === 2 ? "#000" : "#888", fontSize: 11, fontWeight: 800, cursor: "pointer" }}>PLAN 2</button>
            </div>
          )}
          <button
            onClick={handleClose}
            style={{ width: 34, height: 34, borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#888", cursor: "pointer", fontSize: 16, flexShrink: 0 }}
          >
            ✕
          </button>
        </div>

        {/* Cancel Approval Confirmation Overlay */}
        {showCancelConfirm && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 30000,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
            borderRadius: 20,
          }}>
            <div style={{
              background: "#1e293b",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 20,
              padding: "28px 32px",
              maxWidth: 380,
              width: "90%",
              display: "flex",
              flexDirection: "column",
              gap: 16,
              boxShadow: "0 24px 80px rgba(0,0,0,0.8)"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 28 }}>&#x21A9;</span>
                <div>
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 900, color: "#fff" }}>
                    {t("cables", "cancelReportConfirmTitle", "Na pewno?")}
                  </p>
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: "#94a3b8", fontWeight: 500, lineHeight: 1.5 }}>
                    {t("cables", "cancelReportConfirmBody", "Czy chcesz cofnąć zgłoszenie tego kabla do zatwierdzenia?")}
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => { setShowCancelConfirm(false); handleReport(); }}
                  style={{ flex: 1, padding: "10px 16px", borderRadius: 10, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.15)", color: "#f87171", fontWeight: 800, fontSize: 13, cursor: "pointer" }}
                >
                  {t("cables", "cancelReportConfirmYes", "Tak, cofnij zgłoszenie")}
                </button>
                <button
                  onClick={() => setShowCancelConfirm(false)}
                  style={{ flex: 1, padding: "10px 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#94a3b8", fontWeight: 800, fontSize: 13, cursor: "pointer" }}
                >
                  {t("cables", "cancelReportConfirmNo", "Nie, zostaw")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Logistics Notification Banner */}
        {logisticsNotification && (
          <div style={{
            margin: "0 16px",
            padding: "14px 16px",
            borderRadius: 14,
            border: `1px solid ${notifColor.border}`,
            background: notifColor.bg,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            flexShrink: 0,
            marginTop: 12,
            marginBottom: 0,
            zIndex: 20000,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <p style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: notifColor.text, margin: 0 }}>
                {t("cables", "logisticsNotifyTitle", "💡 Logistics Tip")}
              </p>
              <button
                onClick={() => setLogisticsNotification(null)}
                style={{ width: 22, height: 22, borderRadius: 6, border: "none", background: "rgba(255,255,255,0.08)", color: "#888", fontSize: 12, cursor: "pointer", lineHeight: 1, flexShrink: 0 }}
              >✕</button>
            </div>

            <p style={{ fontSize: 12, color: "#aaa", fontWeight: 600, margin: 0, lineHeight: 1.5 }}>
              {logisticsNotification.type === 'sameTrommel'
                ? t("cables", "logisticsNotifySameTrommel", "You can also lay this cable now — it's on the same drum:")
                : logisticsNotification.type === 'nearbySameType'
                  ? t("cables", "logisticsNotifyNearbySameType", "While you're at it, there's a nearby cable of the same type on a different drum:")
                  : t("cables", "logisticsNotifyNearbyDiffType", "Nearby cable of a different type that could also be laid:")}
            </p>

            <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "10px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 900, color: "#fff" }}>
                {logisticsNotification.cable.index_number != null ? `${t("cables","logisticsNotifyIndexNumber","#")}${logisticsNotification.cable.index_number} ` : ""}
                {logisticsNotification.cable.name}
              </p>
              {logisticsNotification.cable.cable_routes && (
                <p style={{ margin: 0, fontSize: 11, color: "#888", fontWeight: 600 }}>
                  {t("cables", "logisticsNotifyRoute", "Route:")} {logisticsNotification.cable.cable_routes.point_a_label} → {logisticsNotification.cable.cable_routes.point_b_label}
                </p>
              )}
              {logisticsNotification.cable.length != null && (
                <p style={{ margin: 0, fontSize: 11, color: "#888", fontWeight: 600 }}>
                  {t("cables", "logisticsNotifyLength", "Length:")} {logisticsNotification.cable.length}m
                  {logisticsNotification.cable.cable_type ? ` · ${logisticsNotification.cable.cable_type}` : ""}
                </p>
              )}
            </div>

            {logisticsNotification.trommelName && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "rgba(234,179,8,0.1)", borderRadius: 8, border: "1px solid rgba(234,179,8,0.2)" }}>
                <span style={{ fontSize: 16 }}>🔄</span>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: "#fde047" }}>
                  {t("cables", "logisticsNotifyNeedTrommel", "Bring drum:")} {logisticsNotification.trommelName}
                </p>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={handleClose}
                style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: "rgba(255,255,255,0.08)", color: "#aaa", fontWeight: 800, fontSize: 11, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.1em" }}
              >
                {t("cables", "logisticsNotifyDismiss", "Got it")}
              </button>
              {logisticsNotification.cable.cable_routes && (
                <button
                  onClick={handleOpenSuggested}
                  style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid rgba(56,189,248,0.4)", background: "rgba(56,189,248,0.1)", color: "#38bdf8", fontWeight: 800, fontSize: 11, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.1em" }}
                >
                  🗺 {t("cables", "logisticsNotifyOpenMap", "Open map")}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Short Cable Form Overlay */}
        {showShortCableForm && !shortCableLogistics && (
          <div style={{ position: "absolute", inset: 0, zIndex: 30000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", borderRadius: 20 }}>
            <div style={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 20, padding: 32, maxWidth: 400, width: "90%", display: "flex", flexDirection: "column", gap: 20, boxShadow: "0 24px 80px rgba(0,0,0,0.8)" }}>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 900, color: "#fb7185" }}>{t("cables", "shortCableTitle", "Resztka kabla na bębnie")}</p>
              <label style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "#94a3b8" }}>
                {t("cables", "shortCableEnterRemaining", "Ile metrů kabla faktycznie było na bębnie?")}
                <input 
                  type="number" 
                  value={remnantLength} 
                  onChange={e => setRemnantLength(e.target.value)}
                  placeholder="np. 80"
                  style={{ padding: "12px 16px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "#000", color: "#fff", fontSize: 16, fontWeight: 600, outline: "none" }}
                  autoFocus
                />
              </label>
              <div style={{ display: "flex", gap: 10 }}>
                <button 
                  onClick={handleShortCableSearch}
                  disabled={!remnantLength}
                  style={{ flex: 2, padding: "12px", borderRadius: 12, background: "#fb7185", color: "#fff", fontWeight: 900, fontSize: 13, cursor: "pointer", border: "none" }}
                >
                  🔍 {t("cables", "shortCableFindNewDrum", "Szukaj bębna")}
                </button>
                <button 
                  onClick={() => setShowShortCableForm(false)}
                  style={{ flex: 1, padding: "12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#94a3b8", fontWeight: 800, fontSize: 13, cursor: "pointer" }}
                >
                  {t("common", "cancel", "Anuluj")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Short Cable Logistics Result Overlay */}
        {shortCableLogistics && (
          <div style={{ position: "absolute", inset: 0, zIndex: 30000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", borderRadius: 20 }}>
            <div style={{ background: "#1e293b", border: "1px solid #38bdf8", borderRadius: 20, padding: 32, maxWidth: 420, width: "90%", display: "flex", flexDirection: "column", gap: 20, boxShadow: "0 24px 80px rgba(0,0,0,0.8)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <span style={{ fontSize: 32 }}>🚚</span>
                <div>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 900, color: "#fff", lineHeight: 1.5 }}>
                    {shortCableLogistics.status === 'confirm_move' && t("cables", "shortCableConfirmMove", "Znaleziono bęben {name}. Czy przenieść ten kabel na ten bęben?").replace("{name}", shortCableLogistics.targetTrommel?.name || "")}
                    {shortCableLogistics.status === 'confirm_assign_free' && t("cables", "shortCableAssignToFree", "Czy przypisać do bębna {name}, gdzie jest wolne miejsce?").replace("{name}", shortCableLogistics.targetTrommel?.name || "")}
                    {shortCableLogistics.status === 'no_space' && t("cables", "shortCableNoFreeSpace", "Brak wolnego miejsca na innych bębnach tego typu.")}
                    {shortCableLogistics.status === 'no_trommels' && t("cables", "shortCableNoReplacement", "Brak możliwości zamiany na inny bęben tego typu.")}
                  </p>
                  {(shortCableLogistics.status === 'no_space' || shortCableLogistics.status === 'no_trommels') && (
                    <p style={{ margin: "8px 0 0", fontSize: 13, color: "#94a3b8", fontWeight: 600 }}>
                      {t("cables", "shortCableStayUnassigned", "Kabel zostanie odpięty od bębna. Potwierdzasz?")}
                    </p>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button 
                  onClick={handleShortCableExecute}
                  style={{ flex: 1, padding: "12px", borderRadius: 12, background: "#38bdf8", color: "#0f172a", fontWeight: 900, fontSize: 13, cursor: "pointer", border: "none" }}
                >
                  {t("common", "save", "Potwierdź")}
                </button>
                <button 
                  onClick={() => setShortCableLogistics(null)}
                  style={{ padding: "12px 20px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#94a3b8", fontWeight: 800, fontSize: 13, cursor: "pointer" }}
                >
                  {t("common", "cancel", "Anuluj")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* map body */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden", minHeight: 300 }}>
          {hasCoords ? (
            <LeafletMap
              planId={activePlan === 1 ? route!.plan_id! : route!.plan_id_2!}
              token={token}
              routes={[{
                id: cable.id,
                name: cable.index_number != null ? `#${cable.index_number} ${cable.name}` : cable.name,
                trommelName: (() => {
                  const tr = trommels.find(t => t.id === cable.trommel_id);
                  const trNum = tr?.serial_number || tr?.index_number;
                  return tr ? (trNum != null ? `#${trNum} ${tr.name}` : tr.name) : null;
                })(),
                trommelId: cable.trommel_id,
                color: "#38bdf8",
                pinA: activePlan === 1 ? { x: route!.point_a_x!, y: route!.point_a_y! } : { x: route!.point_c_x!, y: route!.point_c_y! },
                pinB: activePlan === 1 ? { x: route!.point_b_x!, y: route!.point_b_y! } : { x: route!.point_d_x!, y: route!.point_d_y! },
                labelA: activePlan === 1 ? route!.point_a_label : "Wjazd z planu 1",
                labelB: activePlan === 1 ? (hasCoords2 ? "Przejście na plan 2" : route!.point_b_label) : route!.point_b_label,
                waypoints: activePlan === 1 ? (Array.isArray(route!.waypoints) ? route!.waypoints : []) : (Array.isArray(route!.waypoints_2) ? route!.waypoints_2 : [])
              }]}
              onSelectTrommel={onSelectTrommel}
              onEditCable={() => onEditCable?.(cable)}
            />
          ) : (
            <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: "#555" }}>
              <div style={{ fontSize: 48 }}>🗺</div>
              <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>
                {route ? t("cables","routeNoCoords","Trasa bez współrzędnych na mapie") : t("cables","noAssignedRoute","Brak przypisanej trasy")}
              </p>
              <p style={{ fontSize: 12, color: "#444", margin: 0 }}>
                {t("cables","useAddRouteHint","Uzyj przycisku Dodaj trase na mapie aby wyznaczyc punkty")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
