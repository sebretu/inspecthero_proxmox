"use client";
import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import dynamic from "next/dynamic";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const CRS = L.CRS.Simple;
const P = dynamic(() => import("react-leaflet").then(m => m.Popup), { ssr: false }) as any;

interface Pin { x: number; y: number }

interface MapRoute {
  id: string;
  name: string;
  color: string;
  pinA: Pin;
  pinB: Pin;
  labelA: string;
  labelB: string;
  trommelName?: string | null;
  trommelId?: string | null;
  status?: string;
  waypoints?: Pin[];
  isVerified?: boolean;
}

interface Props {
  planId: string;
  token: string | null;
  routes: MapRoute[];
  onSelectCable?: (cableId: string) => void;
  onEditCable?: (cableId: string) => void;
  onSelectTrommel?: (trommelId: string) => void;
  onVerifyCable?: (cableId: string, manualIndex?: number) => void;
  onUpdateCableNumber?: (cableId: string, newIndex: number) => void;
  isAdmin?: boolean;
}

function makeIcon(letter: string, color: string, isSmall = false) {
  const size = isSmall ? 14 : 17;
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:1.5px solid #fff;display:flex;align-items:center;justify-content:center;font-size:${isSmall ? 6 : 8}px;font-weight:900;color:#fff;box-shadow:0 2px 4px rgba(0,0,0,0.5);">${letter}</div>`,
    iconSize: [size, size] as [number, number],
    iconAnchor: [size / 2, size / 2] as [number, number],
  });
}

function AutoFit({ bounds }: { bounds: any }) {
  const map = useMap();
  useEffect(() => { if (bounds) map.fitBounds(bounds, { padding: [60, 60] }); }, [bounds, map]);
  return null;
}

export function CableMapLeaflet({ planId, token, routes, onSelectCable, onEditCable, onSelectTrommel, onVerifyCable, onUpdateCableNumber, isAdmin }: Props) {
  const { t } = useLanguage();
  const [meta, setMeta] = useState<any>(null);
  const [manualIndexes, setManualIndexes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [highlightedCableId, setHighlightedCableId] = useState<string | null>(null);

  useEffect(() => {
    if (!planId) return;
    const url = `/api/tiles/${planId}/meta${!token ? "?public=true" : ""}`;
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`Status ${r.status}`)))
      .then(data => { if (data?.gridW) setMeta(data); else setError("Invalid meta"); })
      .catch((e: any) => setError(e.message));
  }, [planId, token]);

  const derived = useMemo(() => {
    if (!meta || routes.length === 0) return null;
    const W = meta.gridW * meta.tileSize;
    const H = meta.gridH * meta.tileSize;
    const z = meta.maxZoom;
    const toLL = (p: Pin) => (CRS as any).pointToLatLng(L.point(p.x * W, p.y * H), z);
    const sw = (CRS as any).pointToLatLng(L.point(0, H), z);
    const ne = (CRS as any).pointToLatLng(L.point(W, 0), z);

    const markerRegistry: Record<string, number> = {};

    const processedRoutes = routes.map(r => {
      const pA = toLL(r.pinA);
      const pB = toLL(r.pinB);
      
      const keyA = `A_${r.pinA.x.toFixed(6)}_${r.pinA.y.toFixed(6)}`;
      const keyB = `B_${r.pinB.x.toFixed(6)}_${r.pinB.y.toFixed(6)}`;
      
      const idxA = markerRegistry[keyA] || 0;
      markerRegistry[keyA] = idxA + 1;
      
      const idxB = markerRegistry[keyB] || 0;
      markerRegistry[keyB] = idxB + 1;

      const getOffsetPos = (pos: any, idx: number) => {
        if (idx === 0) return pos;
        const angle = (idx * 45) * (Math.PI / 180);
        const dist = 16;
        const p = (CRS as any).latLngToPoint(pos, z);
        return (CRS as any).pointToLatLng(L.point(p.x + Math.cos(angle) * dist, p.y + Math.sin(angle) * dist), z);
      };

      const mPosA = getOffsetPos(pA, idxA);
      const mPosB = getOffsetPos(pB, idxB);

      return {
        ...r,
        posA: pA,
        posB: pB,
        markerPosA: mPosA,
        markerPosB: mPosB,
        hasOffsetA: idxA > 0,
        hasOffsetB: idxB > 0,
        wps: (r.waypoints || []).map(toLL)
      };
    });

    const allPts = processedRoutes.flatMap(r => [r.posA, r.posB, ...r.wps]);

    return {
      mapBounds: L.latLngBounds(sw, ne) as any,
      cableBounds: L.latLngBounds(allPts) as any,
      processedRoutes
    };
  }, [meta, routes]);

  if (error) return <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#f87171", fontSize: 14, fontWeight: 700 }}>{t("common", "error", "Błąd")}: {error}</div>;
  if (!derived) return <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontSize: 14 }}>{t("common", "loading", "Ładowanie...")}</div>;
 
  const { mapBounds, cableBounds, processedRoutes } = derived;
 
  const MC = MapContainer as any;
  const TL = TileLayer as any;
  const Mk = Marker as any;
  const Pl = Polyline as any;
 
  return (
    <div style={{ height: "100%", width: "100%", position: "relative" }}>
      <style>{`
        @keyframes route-blink {
          0% { stroke-opacity: 1; stroke-width: 8; }
          50% { stroke-opacity: 0.3; stroke-width: 10; }
          100% { stroke-opacity: 1; stroke-width: 8; }
        }
        .blinking-route {
          animation: route-blink 0.6s infinite;
          stroke: #ef4444 !important;
        }
      `}</style>
      <MC 
        crs={CRS} 
        bounds={mapBounds} 
        center={mapBounds.getCenter()} 
        zoom={0} 
        minZoom={meta.minZoom} 
        maxZoom={meta.maxZoom + 2} 
        style={{ height: "100%", width: "100%", background: "#111" }}
      >
        <TL 
          url={`/api/tiles/${planId}/{z}/{x}/{y}.png?${token ? `token=${token}` : "public=true"}`} 
          maxNativeZoom={meta.maxZoom}
          maxZoom={meta.maxZoom + 2}
          noWrap={true}
          bounds={mapBounds}
        />
        <AutoFit bounds={cableBounds} />

        {processedRoutes.map(r => {
          const isDone = r.status === "done";
          const isHighlighted = highlightedCableId === r.id;
          const lineOpacity = isDone ? 0.35 : 0.85;
          const markerA = isDone ? "✓" : "A";
          const markerB = isDone ? "✓" : "B";
          const colorB = isDone ? "#22c55e" : "#f97316";

          const renderPopupContent = (isPointA: boolean) => (
            <P>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <div 
                  onClick={() => onSelectCable?.(r.id)}
                  style={{ cursor: "pointer", color: "#38bdf8", fontWeight: 900, textDecoration: "underline" }}
                >
                  {r.name}
                </div>
                {onEditCable && (
                  <button 
                    onClick={() => onEditCable(r.id)}
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, padding: "2px 6px", color: "#94a3b8", fontSize: 9, cursor: "pointer", fontWeight: 800 }}
                  >
                    EDIT
                  </button>
                )}
                {r.isVerified && (
                  <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: "rgba(16,185,129,0.15)", color: "#10b981", fontWeight: 900, border: "1px solid rgba(16,185,129,0.3)" }}>
                    VERIFIED
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>{isPointA ? "Start" : "Koniec"}: {isPointA ? r.labelA : r.labelB}</div>
              {r.trommelName && (
                <div 
                  onClick={() => r.trommelId && onSelectTrommel?.(r.trommelId)}
                  style={{ fontSize: 10, color: "#fbbf24", fontWeight: 800, marginTop: 2, cursor: r.trommelId ? "pointer" : "default", textDecoration: r.trommelId ? "underline" : "none" }}
                >
                  📦 {r.trommelName}
                </div>
              )}
              <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>Status: {r.status}</div>
              
                  {isAdmin && !r.isVerified && (
                    <div 
                      style={{ marginTop: 8, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 8 }}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          let msg = t("cables", "confirmVerifyCable", `Czy na pewno oznaczyć kabel "{name}" jako zweryfikowany?`).replace("{name}", r.name);
                          if (confirm(msg)) {
                            onVerifyCable?.(r.id);
                          }
                        }}
                        style={{ 
                          width: "100%",
                          padding: "8px", 
                          borderRadius: 8, 
                          background: "rgba(16,185,129,0.1)", 
                          border: "1px solid rgba(16,185,129,0.3)", 
                          color: "#10b981", 
                          fontSize: 11, 
                          fontWeight: 900, 
                          cursor: "pointer",
                          textTransform: "uppercase"
                        }}
                      >
                        {t("cables", "verifyBtn", "VERIFIZIEREN")}
                      </button>
                    </div>
                  )}
            </P>
          );

          return (
            <span key={r.id}>
              <Pl 
                positions={[r.posA, ...r.wps, r.posB]} 
                pathOptions={{ 
                  color: isHighlighted ? "#ef4444" : (r.isVerified ? "#64748b" : (isDone ? "#22c55e" : r.color)), 
                  weight: isHighlighted ? 8 : (isDone ? 3 : 5), 
                  opacity: isHighlighted ? 1 : lineOpacity,
                  dashArray: (r.isVerified && !isHighlighted) ? "10, 10" : undefined,
                  className: isHighlighted ? "blinking-route" : ""
                }} 
                eventHandlers={{
                  click: () => setHighlightedCableId(r.id === highlightedCableId ? null : r.id)
                }}
              />
              
              {r.hasOffsetA && <Pl positions={[r.posA, r.markerPosA]} pathOptions={{ color: "#fff", weight: 1, dashArray: "4,4", opacity: 0.5 }} />}
              {r.hasOffsetB && <Pl positions={[r.posB, r.markerPosB]} pathOptions={{ color: "#fff", weight: 1, dashArray: "4,4", opacity: 0.5 }} />}

              <Mk 
                position={r.markerPosA} 
                icon={makeIcon(markerA, "#22c55e", isDone)} 
                title={`${r.name}: ${r.labelA}`}
                eventHandlers={{
                  click: () => setHighlightedCableId(r.id === highlightedCableId ? null : r.id)
                }}
              >
                {renderPopupContent(true)}
              </Mk>
              <Mk 
                position={r.markerPosB} 
                icon={makeIcon(markerB, colorB, isDone)} 
                title={`${r.name}: ${r.labelB}`}
                eventHandlers={{
                  click: () => setHighlightedCableId(r.id === highlightedCableId ? null : r.id)
                }}
              >
                {renderPopupContent(false)}
              </Mk>
            </span>
          );
        })}
      </MC>
    </div>
  );
}
