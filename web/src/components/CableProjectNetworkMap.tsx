"use client";
import { useEffect, useMemo, useState, Fragment } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const CRS = L.CRS.Simple;
L.Icon.Default.imagePath = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/";

interface Pin { x: number; y: number }
interface Node { id: string; name: string; x: number; y: number; plan_id: string }
interface Bus { id: string; name: string; multi_plan_data: any[]; node_a_id: string; node_b_id: string; node_a?: Node; node_b?: Node; distance: number }

interface Props {
  planId: string;
  token: string | null;
  nodes: Node[];
  buses: Bus[];
}

function makeNodeIcon(name: string) {
  return L.divIcon({
    className: "",
    html: `
      <div style="
        width: 32px; height: 32px; 
        background: rgba(8, 17, 32, 0.9); 
        border: 2px solid #fbbf24; 
        border-radius: 10px; 
        display: flex; align-items: center; justify-content: center; 
        font-family: 'Inter', sans-serif; font-size: 10px; font-weight: 900; color: #fbbf24; 
        box-shadow: 0 0 15px rgba(251, 191, 36, 0.4), inset 0 0 10px rgba(251, 191, 36, 0.1);
        backdrop-filter: blur(4px);
        transform: rotate(0deg);
      ">
        ${name}
      </div>
    `,
    iconSize: [32, 32] as [number, number],
    iconAnchor: [16, 16] as [number, number],
  });
}

function AutoFit({ bounds }: { bounds: any }) {
  const map = useMap();
  useEffect(() => { if (bounds) map.fitBounds(bounds, { padding: [60, 60] }); }, [bounds, map]);
  return null;
}

export function CableProjectNetworkMap({ planId, token, nodes, buses }: Props) {
  const [meta, setMeta] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!planId) return;
    const url = `/api/tiles/${planId}/meta${!token ? "?public=true" : ""}`;
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`Status ${r.status}`)))
      .then(data => { if (data?.gridW) setMeta(data); else setError("Invalid meta"); })
      .catch((e: any) => setError(e.message));
  }, [planId, token]);

  const derived = useMemo(() => {
    if (!meta) return null;
    const W = meta.gridW * meta.tileSize;
    const H = meta.gridH * meta.tileSize;
    const z = meta.maxZoom;
    const toLL = (p: Pin) => (CRS as any).pointToLatLng(L.point(p.x * W, p.y * H), z);
    const sw = (CRS as any).pointToLatLng(L.point(0, H), z);
    const ne = (CRS as any).pointToLatLng(L.point(W, 0), z);

    const planNodes = nodes.filter(n => (n.plan_id || (n as any).planId) === planId);
    const planBuses = buses.filter(b => b.multi_plan_data && Array.isArray(b.multi_plan_data) && b.multi_plan_data.some(m => (m.planId || m.plan_id) === planId));

    const busLines = planBuses.map(b => {
      const stage = b.multi_plan_data.find(m => (m.planId || m.plan_id) === planId);
      if (!stage || !stage.pinA || !stage.pinB) return null;
      return [toLL(stage.pinA), ...(stage.waypoints || []).map(toLL), toLL(stage.pinB)];
    }).filter(Boolean);

    const allPts = [sw, ne, ...planNodes.map(n => toLL({ x: n.x, y: n.y })), ...busLines.flat()];

    return {
      mapBounds: L.latLngBounds(sw, ne) as any,
      contentBounds: L.latLngBounds(allPts) as any,
      posNodes: planNodes.map(n => ({ ...n, pos: toLL({ x: n.x, y: n.y }) })),
      lines: busLines as any[][],
    };
  }, [meta, nodes, buses, planId]);

  if (error) return <div className="h-full flex items-center justify-center bg-[#081120] text-red-400 font-bold">Error: {error}</div>;
  if (!derived || !meta) return (
    <div className="h-full flex items-center justify-center bg-[#081120]">
      <div className="flex flex-col items-center gap-4">
         <div className="w-10 h-10 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin"></div>
         <p className="text-[10px] font-black uppercase tracking-[0.4em] text-cyan-400">Loading Network Map...</p>
      </div>
    </div>
  );

  const { mapBounds, contentBounds, posNodes, lines } = derived;
  const MC = MapContainer as any;
  const Mk = Marker as any;
  const Pl = Polyline as any;

  return (
    <div className="h-full w-full bg-[#000] relative">
      <MC 
        key={planId} 
        crs={CRS} 
        bounds={mapBounds} 
        center={mapBounds.getCenter()} 
        zoom={0} 
        minZoom={meta.minZoom} 
        maxZoom={meta.maxZoom} 
        style={{ height: "100%", width: "100%", background: "#000" }}
      >
        <TileLayer url={`/api/tiles/${planId}/{z}/{x}/{y}.png?${token ? `token=${token}` : "public=true"}&v=${meta?.activeVersionId || ''}`} />
        <AutoFit bounds={contentBounds} />
        
        {lines.map((line, i) => (
          <Fragment key={i}>
            <Pl positions={line} pathOptions={{ color: "#06b6d4", weight: 6, opacity: 0.8, lineJoin: 'round' }} />
            <Pl positions={line} pathOptions={{ color: "#22d3ee", weight: 2, opacity: 1, lineJoin: 'round' }} />
          </Fragment>
        ))}

        {posNodes.map(n => (
          <Mk key={n.id} position={n.pos} icon={makeNodeIcon(n.name)} />
        ))}
      </MC>

      {/* Debug Info Overlay */}
      <div className="absolute top-4 right-4 z-[1000] bg-black/80 backdrop-blur-md p-4 rounded-2xl border border-white/10 flex flex-col gap-1 pointer-events-none">
         <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-400"></div>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Plan ID: {planId.slice(0,8)}</span>
         </div>
         <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400"></div>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Verteilery: {posNodes.length}</span>
         </div>
         <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Magistrale: {lines.length}</span>
         </div>
      </div>
    </div>
  );
}
