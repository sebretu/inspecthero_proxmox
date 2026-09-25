"use client";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { MapContainer, TileLayer, Marker, Polyline, useMap, useMapEvents, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { apiPost, apiPatch, apiDelete } from "@/lib/apiClient";
import { Trash2, X, Plus, Link as LinkIcon, Globe, Camera } from "lucide-react";
import { BrowserMultiFormatReader } from "@zxing/library";
import { useNotification } from "@/contexts/NotificationContext";
import { useLanguage } from "@/contexts/LanguageContext";

const CRS = L.CRS.Simple;

interface Device {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  metadata?: any;
}

interface Connection {
  id: string;
  name: string;
  type: string;
  color: string;
}

interface Route {
  id: string;
  connection_id: string;
  source_device_id: string;
  target_device_id: string;
  waypoints: [number, number][];
  length_meters: number;
}

interface Props {
  projectId: string;
  planId: string;
  token: string | null;
  devices: Device[];
  connections: Connection[];
  routes: Route[];
  debugPoints?: { name: string, x: number, y: number }[];
  onSave: () => void;
  isAdmin: boolean;
  isLoggedIn: boolean;
  settings: any;
}

const makeDeviceIcon = (name: string, type: string, scale: number = 1, serial?: string, hash: number = 0) => {
    let bgColor = "bg-red-600";
    if (type === "GATEWAY") bgColor = "bg-purple-600";
    if (type === "CALIB") bgColor = "bg-amber-600";
    if (type === "DETECTOR_BLUE" || type === "detector_blue") bgColor = "bg-blue-600";
    if (type === "SIREN" || type === "sirene") bgColor = "bg-orange-600";
    if (type === "SIGNAL" || type === "dis_signalgeber") bgColor = "bg-amber-500";
    const size = Math.max(16, Math.floor(40 * scale));
    const fontSize = Math.max(8, Math.floor(14 * scale));
    const serialFontSize = Math.max(10, Math.floor(20 * scale));
    const dotSize = Math.max(6, Math.floor(12 * scale));
    
    const dirs = [[0,1.5], [1.5,0], [0,-1.5], [-1.5,0], [1.2,1.2], [-1.2,1.2], [1.2,-1.2], [-1.2,-1.2]];
    const dir = dirs[hash % dirs.length];
    const offsetX = dir[0] * size;
    const offsetY = dir[1] * size;
    
    return L.divIcon({
      className: "custom-div-icon",
      html: `
        <div class="relative flex items-center justify-center group" style="width:100%; height:100%;">
          <div style="width:${size}px; height:${size}px; z-index:100;" class="relative rounded-full ${bgColor} border-2 border-white flex items-center justify-center shadow-lg transition-transform group-hover:scale-125 group-hover:z-[9999]">
            <span style="font-size:${fontSize}px;" class="font-black text-white">${name}</span>
            ${serial ? `<div style="width:${dotSize}px; height:${dotSize}px;" class="absolute -top-1 -right-1 bg-green-500 border border-white rounded-full shadow-sm"></div>` : `<div style="width:${dotSize}px; height:${dotSize}px;" class="absolute -top-1 -right-1 bg-amber-500 border border-white rounded-full shadow-sm"></div>`}
          </div>
          ${serial ? `<div style="position:absolute; left:50%; top:50%; transform: translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px)); z-index:${10 - (hash%8)}; pointer-events:none;" class="opacity-0 group-hover:opacity-100 px-3 py-2 bg-white/95 border-2 border-blue-500 rounded-xl shadow-2xl transition-all duration-200 scale-50 group-hover:scale-150 group-hover:z-[10000]"><p style="margin:0; padding:0; line-height:1; font-size:${serialFontSize}px; font-weight:900; color:black; white-space:nowrap; font-family:sans-serif;">${serial}</p></div>` : ''}
        </div>`,
      iconSize: [size, size], iconAnchor: [size / 2, size / 2],
    });
};

function WaypointIcon() { return L.divIcon({ className: "", html: `<div style="width:10px;height:10px;border-radius:50%;background:#fff;border:2px solid #3b82f6;box-shadow:0 0 10px rgba(59,130,246,0.5);"></div>`, iconSize: [10, 10], iconAnchor: [5, 5] }); }

function MapEvents({ onClick, onZoom }: { onClick: (e: any, isDbl?: boolean) => void, onZoom: (z: number) => void }) {
  const map = useMapEvents({ click: (e: any) => onClick(e), dblclick: (e: any) => onClick(e, true), zoomend: () => onZoom(map.getZoom()) });
  return null;
}

function AutoFit({ bounds }: { bounds: any }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [30, 30] });
    }
  }, [bounds, map]);
  return null;
}

export default function BmaLeafletEditor({ 
  projectId, planId, token, devices, connections, routes, debugPoints = [], onSave, isAdmin, isLoggedIn, settings 
}: Props) {
  const { t } = useLanguage();
  const { showNotification } = useNotification();
  const [meta, setMeta] = useState<any>(null);
  const [currentZoom, setCurrentZoom] = useState(0);
  const [activeRouteId, setActiveRouteId] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "addDevice" | "addRoute">("view");
  const [sourceDeviceId, setSourceDeviceId] = useState<string | null>(null);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibPoints, setCalibPoints] = useState<[number, number][]>([]);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [serialNumber, setSerialNumber] = useState("");
  const [uploading, setUploading] = useState(false);
  const [isScanningSerial, setIsScanningSerial] = useState(false);
  const [pendingRoute, setPendingRoute] = useState<{ srcId: string, tgtId: string } | null>(null);
  const [newRouteName, setNewRouteName] = useState("");
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState<string | null>(null);
  const [localRoutes, setLocalRoutes] = useState<Route[]>([]);
  const [localDevicePos, setLocalDevicePos] = useState<Record<string, {x: number, y: number}>>({});
  const [visibleRouteNames, setVisibleRouteNames] = useState<string[]>([]);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [hasSetDefaultFilter, setHasSetDefaultFilter] = useState(false);

  useEffect(() => { setIsMounted(true); }, []);

  const allLoopNames = useMemo(() => {
    return Array.from(new Set(connections.map(c => c.name))).filter(n => n && n.toLowerCase() !== "auto-generated loop");
  }, [connections]);

  const isShowingAll = allLoopNames.length > 0 && allLoopNames.every(name => visibleRouteNames.includes(name));

  useEffect(() => {
    if (!hasSetDefaultFilter && allLoopNames.length > 0) {
      setVisibleRouteNames([allLoopNames[0]]);
      setHasSetDefaultFilter(true);
    }
  }, [allLoopNames, hasSetDefaultFilter]);

  // ESC key to close photo preview, editing modal, scanner, and reset drawing modes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedPhotoUrl(null);
        setEditingDevice(null);
        setIsScanningSerial(false);
        setPendingRoute(null);
        setIsCalibrating(false);
        setCalibPoints([]);
        if (mode !== "view") setMode("view");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode]);

  useEffect(() => {
    if (!planId) return;
    const url = `/api/tiles/${planId}/meta${!token ? "?public=true" : ""}`;
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.json()).then(data => { if (data.error) throw new Error(data.error); setMeta(data); setMetaError(null); setCurrentZoom(data.maxZoom - 2); })
      .catch(err => { console.error(err); setMetaError(err.message); });
  }, [planId, token]);

  const mapData = useMemo(() => {
    if (!meta || !meta.gridW || !meta.gridH || !meta.tileSize) return null;
    const W = meta.gridW * meta.tileSize; const H = meta.gridH * meta.tileSize; const z = meta.maxZoom;
    const toLL = (x: number, y: number) => { if (isNaN(x) || isNaN(y)) return L.latLng(0, 0); return (CRS as any).pointToLatLng(L.point(x * W, y * H), z); };
    const fromLL = (ll: any) => { if (!ll) return { x: 0, y: 0 }; const p = (CRS as any).latLngToPoint(ll, z); return { x: p.x / W, y: p.y / H }; };
    const bounds = L.latLngBounds((CRS as any).pointToLatLng(L.point(0, H), z), (CRS as any).pointToLatLng(L.point(W, 0), z));
    return { W, H, z, toLL, fromLL, bounds };
  }, [meta]);

  const getRouteColor = (name: string, connectionColor?: string) => {
    if (connectionColor) return connectionColor;
    const colors = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316", "#84cc16", "#a855f7", "#6366f1", "#14b8a6"];
    let hash = 0; for (let i = 0; i < name.length; i++) { hash = name.charCodeAt(i) + ((hash << 5) - hash); }
    return colors[Math.abs(hash) % colors.length];
  };

  const lastInteractionTime = useRef(0);
  useEffect(() => {
    if (Date.now() - lastInteractionTime.current < 1500) return;
    setLocalDevicePos(prev => {
      const next = { ...prev }; let changed = false;
      devices.forEach(d => { const current = prev[d.id]; if (!current || Math.sqrt(Math.pow(current.x - d.x, 2) + Math.pow(current.y - d.y, 2)) > 0.01) { next[d.id] = { x: d.x, y: d.y }; changed = true; } });
      return changed ? next : prev;
    });
  }, [devices]);
  useEffect(() => { if (Date.now() - lastInteractionTime.current < 1500) return; setLocalRoutes(prev => JSON.stringify(prev) !== JSON.stringify(routes) ? routes : prev); }, [routes]);

  const calculateLength = useCallback((pts: [number, number][]) => {
    if (!mapData || pts.length < 2) return 0;
    let lenPx = 0; for (let i = 0; i < pts.length - 1; i++) { const dx = (pts[i+1][0] - pts[i][0]) * mapData.W; const dy = (pts[i+1][1] - pts[i][1]) * mapData.H; lenPx += Math.sqrt(dx * dx + dy * dy); }
    return Math.ceil((lenPx / (settings?.scale_px_per_meter || 100)) * 1.1);
  }, [mapData, settings]);

  const polylineRefs = useRef<Record<string, any>>({});
  const updateRouteVisuals = (deviceId: string, latlng: any) => {
    localRoutes.forEach(route => {
      if ((route.source_device_id === deviceId || route.target_device_id === deviceId) && mapData) {
        const poly = polylineRefs.current[route.id];
        if (poly) {
          const sPos = route.source_device_id === deviceId ? latlng : mapData.toLL(localDevicePos[route.source_device_id]?.x || 0, localDevicePos[route.source_device_id]?.y || 0);
          const tPos = route.target_device_id === deviceId ? latlng : mapData.toLL(localDevicePos[route.target_device_id]?.x || 0, localDevicePos[route.target_device_id]?.y || 0);
          poly.setLatLngs([sPos, ...(route.waypoints || []).map(wp => mapData.toLL(wp[0], wp[1])), tPos]);
        }
      }
    });
  };

  const updateWaypointVisuals = (routeId: string, wpIndex: number, latlng: any) => {
    const poly = polylineRefs.current[routeId];
    if (poly && mapData) {
      const route = localRoutes.find(r => r.id === routeId);
      if (route) {
        const sPos = mapData.toLL(localDevicePos[route.source_device_id]?.x || 0, localDevicePos[route.source_device_id]?.y || 0);
        const tPos = mapData.toLL(localDevicePos[route.target_device_id]?.x || 0, localDevicePos[route.target_device_id]?.y || 0);
        poly.setLatLngs([sPos, ...(route.waypoints || []).map((wp, i) => i === wpIndex ? latlng : mapData.toLL(wp[0], wp[1])), tPos]);
      }
    }
  };

  const handleDeviceMove = async (id: string, latlng: any, isFinal = false) => {
    if (!mapData || !isAdmin) return; const { x, y } = mapData.fromLL(latlng);
    if (isFinal) { lastInteractionTime.current = Date.now(); setLocalDevicePos(prev => ({ ...prev, [id]: { x, y } })); await apiPatch("/api/bma/devices", { id, x, y }); onSave(); } else { updateRouteVisuals(id, latlng); }
  };

  const handleWaypointMove = async (routeId: string, wpIndex: number, latlng: any, isFinal = false) => {
    if (!mapData || !isAdmin) return;
    if (isFinal) {
        lastInteractionTime.current = Date.now(); let { x, y } = mapData.fromLL(latlng);
        const route = localRoutes.find(r => r.id === routeId);
        if (route) {
            const nextWps = [...route.waypoints]; nextWps[wpIndex] = [x, y];
            const s = devices.find(d => d.id === route.source_device_id); const t = devices.find(d => d.id === route.target_device_id);
            const len = calculateLength([[s?.x || 0, s?.y || 0], ...nextWps, [t?.x || 0, t?.y || 0]]);
            await apiPatch("/api/bma/connections", { type: "route", data: { id: routeId, waypoints: nextWps, length_meters: len } }); onSave();
        }
    } else { updateWaypointVisuals(routeId, wpIndex, latlng); }
  };

  const handleMapClick = async (e: any, isDbl = false) => {
    if (!mapData || e.originalEvent?.shiftKey) return; const { x, y } = mapData.fromLL(e.latlng);
    if (isCalibrating) {
        const pts = [...calibPoints, [x, y] as [number, number]];
        if (pts.length === 2) {
            const mStr = window.prompt("Enter distance in meters:"); const meters = parseFloat(mStr || "0");
            if (meters > 0) {
                const pxDist = Math.sqrt(Math.pow((pts[1][0]-pts[0][0])*mapData.W, 2) + Math.pow((pts[1][1]-pts[0][1])*mapData.H, 2));
                await apiPatch(`/api/bma/settings?projectId=${projectId}`, { scale_px_per_meter: pxDist / meters }); await apiPost(`/api/bma/recalculate-routes?projectId=${projectId}`, {}); onSave();
            }
            setCalibPoints([]); setIsCalibrating(false);
        } else { setCalibPoints(pts); }
        return;
    }
    if (mode === "addDevice" || isDbl) {
        if (!isAdmin) return; const name = window.prompt("Enter Device Name:");
        if (name) { await apiPost("/api/bma/devices", [{ project_id: projectId, plan_id: planId, name, type: "Manual", x, y }]); onSave(); if (mode === "addDevice") setMode("view"); }
    }
  };

  if (metaError) return <div className="h-full flex flex-col items-center justify-center bg-black/40 p-8"><Globe className="w-6 h-6 text-red-500" /><p className="text-[10px] font-black text-white uppercase mt-2">{metaError}</p></div>;
  if (!meta || !mapData) return <div className="h-full flex items-center justify-center text-slate-500 text-[10px] font-black uppercase animate-pulse">Loading Map...</div>;

  const { toLL, bounds, z } = mapData;
  const MC = MapContainer as any; const Mk = Marker as any; const Pl = Polyline as any; const TL = TileLayer as any;

  return (
    <div className="relative h-full w-full overflow-hidden">
      <style>{`
        .custom-div-icon:hover {
          z-index: 99999 !important;
        }
      `}</style>
      <MC key={planId} crs={CRS} center={bounds.getCenter()} zoom={currentZoom} minZoom={1} maxZoom={z + 2} style={{ height: "100%", width: "100%", background: "#ffffff" }}>
        <AutoFit bounds={bounds} />
        <TL url={`/api/tiles/${planId}/{z}/{x}/{y}.png?${token ? `token=${token}` : 'public=true'}&v=${meta?.activeVersionId || ''}`} maxNativeZoom={z} maxZoom={z + 2} />
        <MapEvents onClick={handleMapClick} onZoom={setCurrentZoom} />
        {devices.map(dev => {
          const pos = localDevicePos[dev.id] || { x: dev.x, y: dev.y }; const scale = Math.pow(0.8, (meta?.maxZoom || 0) - currentZoom);
          return (
            <Mk key={dev.id} position={toLL(pos.x, pos.y)} icon={makeDeviceIcon(dev.name, dev.type, scale, currentZoom >= (meta?.maxZoom || 0) ? dev.metadata?.serial_number : undefined, Math.floor(pos.x*100) + Math.floor(pos.y*100))} draggable={isAdmin} eventHandlers={{
              drag: (e: any) => handleDeviceMove(dev.id, e.target.getLatLng()),
              dragend: (e: any) => handleDeviceMove(dev.id, e.target.getLatLng(), true),
              click: (e: any) => { if (mode === "addRoute") { if (!sourceDeviceId) { setSourceDeviceId(dev.id); } else if (sourceDeviceId !== dev.id) {
                const s = devices.find(d => d.id === sourceDeviceId); const t = devices.find(d => d.id === dev.id);
                const len = calculateLength([[s?.x || 0, s?.y || 0], [t?.x || 0, t?.y || 0]]);
                apiPost("/api/bma/connections", { type: "route", data: { project_id: projectId, connection_id: connections[0]?.id || "", source_device_id: sourceDeviceId, target_device_id: dev.id, waypoints: [], length_meters: len, metadata: { cable_name: `${s?.name} bis ${t?.name}` } } }).then(() => onSave());
                setSourceDeviceId(null); setMode("view");
              } } }
            }}>
              <Popup>
                <div className="p-4 space-y-4 min-w-[200px] bg-slate-900 text-white rounded-2xl border border-white/10 shadow-2xl">
                  <p className="text-sm font-black uppercase text-center border-b border-white/5 pb-2">{dev.name}</p>
                  <div className="space-y-2">
                    {dev.metadata?.serial_number && (
                      <div className="bg-white/5 p-2 rounded-lg border border-white/5">
                        <p className="text-[8px] text-slate-500 uppercase font-black">Serial</p>
                        <p className="text-[10px] font-bold text-blue-400">{dev.metadata.serial_number}</p>
                      </div>
                    )}
                    <button 
                      onClick={() => { setEditingDevice(dev); setSerialNumber(dev.metadata?.serial_number || ""); }} 
                      className={`w-full py-2.5 ${isLoggedIn ? 'bg-red-600' : 'bg-slate-700'} text-white rounded-xl text-[10px] font-black uppercase shadow-lg`}
                    >
                      {isLoggedIn ? "Open Details" : "View Details"}
                    </button>
                    
                    {isAdmin && (
                      <button 
                        onClick={async (e) => { 
                          e.stopPropagation(); 
                          if (window.confirm("Delete this device?")) { 
                            await apiDelete(`/api/bma/devices?id=${dev.id}`); 
                            onSave(); 
                          } 
                        }} 
                        className="w-full py-2.5 bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white rounded-xl text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2 border border-red-600/20"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        DELETE DEVICE
                      </button>
                    )}
                  </div>
                </div>
              </Popup>
            </Mk>
          );
        })}
        {routes.map(route => {
          const s = devices.find(d => d.id === route.source_device_id); const t = devices.find(d => d.id === route.target_device_id); if (!s || !t) return null;
          const conn = connections.find(c => c.id === route.connection_id);
          if (!conn || !visibleRouteNames.includes(conn.name)) return null;
          const color = getRouteColor(conn?.name || route.id, conn?.color); const pts = [toLL(localDevicePos[s.id]?.x || s.x, localDevicePos[s.id]?.y || s.y), ...(route.waypoints || []).map(wp => toLL(wp[0], wp[1])), toLL(localDevicePos[t.id]?.x || t.x, localDevicePos[t.id]?.y || t.y)];
          return (
            <div key={route.id}>
              <Pl positions={pts} pathOptions={{ color, weight: activeRouteId === route.id ? 6 : 4, opacity: 0.8 }} ref={(el: any) => { if (el) polylineRefs.current[route.id] = el; }} eventHandlers={{ click: (e: any) => { setActiveRouteId(route.id); if (e.originalEvent?.shiftKey) { const { x, y } = mapData.fromLL(e.latlng); const nextWps = [...(route.waypoints || []), [x, y] as [number, number]]; const len = calculateLength([[s?.x || 0, s?.y || 0], ...nextWps, [t?.x || 0, t?.y || 0]]); apiPatch("/api/bma/connections", { type: "route", data: { id: route.id, waypoints: nextWps, length_meters: len } }).then(() => onSave()); } } }}>
                <Popup><div className="p-4 bg-slate-900 text-white rounded-2xl min-w-[150px]"><p className="text-sm font-black uppercase text-center">{conn?.name || "Route"}</p><p className="text-[10px] font-bold text-blue-400 text-center">{route.length_meters.toFixed(2)} m</p></div></Popup>
              </Pl>
              {activeRouteId === route.id && (route.waypoints || []).map((wp, idx) => <Mk key={`${route.id}-wp-${idx}`} position={toLL(wp[0], wp[1])} icon={WaypointIcon()} draggable={isAdmin} eventHandlers={{ drag: (e: any) => updateWaypointVisuals(route.id, idx, e.target.getLatLng()), dragend: (e: any) => handleWaypointMove(route.id, idx, e.target.getLatLng(), true) }} />)}
            </div>
          );
        })}
      </MC>

      {/* Floating HUD Elements */}
      <div className="absolute inset-0 pointer-events-none z-[1001]">
        <div className="absolute top-10 left-10 flex gap-3 pointer-events-auto">
          {isAdmin && (
            <>
              <button onClick={() => { setMode(mode === "addDevice" ? "view" : "addDevice"); setIsCalibrating(false); }} className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase ${mode === "addDevice" ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30" : "bg-black/60 text-slate-400 border border-white/10"}`}>{mode === "addDevice" ? "CANCEL" : "ADD DEVICE"}</button>
              <button onClick={() => { setIsCalibrating(!isCalibrating); setCalibPoints([]); setMode("view"); }} className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase ${isCalibrating ? "bg-amber-600 text-white shadow-lg shadow-amber-600/30" : "bg-black/60 text-slate-400 border border-white/10"}`}>{isCalibrating ? "CANCEL CALIB" : "CALIBRATE"}</button>
            </>
          )}
        </div>
        <div className="absolute bottom-6 left-6 right-6 md:bottom-auto md:top-10 md:right-10 md:left-auto flex flex-col items-end pointer-events-none">
          <div className="bg-black/80 backdrop-blur-2xl border border-white/10 p-4 rounded-xl shadow-2xl pointer-events-auto flex flex-col max-w-full overflow-hidden">
             <div className="flex md:flex-col gap-2 overflow-x-auto no-scrollbar p-1 max-w-[calc(100vw-3rem)]">
                <button onClick={() => setVisibleRouteNames(isShowingAll ? [] : allLoopNames)} className={`shrink-0 px-6 py-3 rounded-lg text-[9px] font-black uppercase border ${isShowingAll ? "bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/20" : "bg-white/5 border-white/5 text-slate-500 hover:text-white"}`}>Show All</button>
                {allLoopNames.map(name => {
                  const color = getRouteColor(name); const sel = visibleRouteNames.includes(name);
                  return <button key={name} onClick={() => setVisibleRouteNames(sel ? visibleRouteNames.filter(n => n !== name) : [...visibleRouteNames, name])} className={`shrink-0 px-6 py-3 rounded-lg text-[9px] font-black uppercase border flex items-center gap-3 ${sel ? "text-white" : "bg-white/5 border-white/5 text-slate-500 hover:text-white"}`} style={{ backgroundColor: sel ? `${color}33` : undefined, borderColor: sel ? color : undefined, boxShadow: sel ? `0 4px 12px ${color}44` : undefined }}>{name}</button>;
                })}
             </div>
          </div>
        </div>
      </div>

      {/* PORTALS FOR MODALS - Fixing z-index clipping and stacking issues */}
      {isMounted && typeof document !== "undefined" && createPortal(
        <>
          {editingDevice && (
            <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 md:p-10">
               <div className="absolute inset-0 bg-black/90 backdrop-blur-3xl" onClick={() => setEditingDevice(null)}></div>
               <div className="bg-[#0f172a] border border-white/10 rounded-3xl w-full max-w-lg p-6 md:p-10 space-y-8 shadow-2xl relative max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                  <button onClick={() => setEditingDevice(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white bg-white/5 p-4 rounded-full border border-white/10 active:scale-95 transition-all"><X className="w-8 h-8" /></button>
                  <div className="space-y-2"><h2 className="text-3xl font-black text-white uppercase tracking-tighter">{editingDevice.name}</h2><p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{isLoggedIn ? "Editor Mode" : "Viewer Mode"}</p></div>
                  <div className="space-y-6">
                     <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-4">Serial Number</label>
                        <div className="flex gap-2">
                           <input autoFocus={isLoggedIn} value={serialNumber} onChange={e => { e.stopPropagation(); setSerialNumber(e.target.value); }} disabled={!isLoggedIn} placeholder={isLoggedIn ? "Tap here to enter serial..." : "Not available"} className="flex-1 min-w-0 bg-black/60 border border-white/5 rounded-2xl px-6 py-5 text-lg font-black text-white outline-none focus:border-blue-500/50 transition-all shadow-inner disabled:opacity-30" />
                           {isLoggedIn && (
                              <label className={`flex-none aspect-square h-[68px] border rounded-2xl flex items-center justify-center transition-all ${isScanningSerial ? 'bg-amber-600/20 text-amber-500 border-amber-500/30 cursor-wait' : 'bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white border-blue-500/30 cursor-pointer'}`}>
                                 {isScanningSerial ? <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Camera className="w-6 h-6" />}
                                 <input type="file" accept="image/*" capture="environment" className="hidden" disabled={isScanningSerial || uploading} onChange={async (e) => {
                                    const f = e.target.files?.[0];
                                    if (!f) return;
                                    e.stopPropagation();
                                    setIsScanningSerial(true);
                                    setUploading(true);
                                    
                                    try {
                                       const fd = new FormData();
                                       fd.append("file", f);
                                       fetch("/api/upload", { method: "POST", body: fd, headers: { Authorization: `Bearer ${token}` } })
                                          .then(r => r.json())
                                          .then(async rj => {
                                             if (rj.ok) {
                                                const n = [...(editingDevice.metadata?.photos || []), rj.data.url];
                                                await apiPatch("/api/bma/devices", { id: editingDevice.id, metadata: { ...editingDevice.metadata, photos: n } });
                                                setEditingDevice({ ...editingDevice, metadata: { ...editingDevice.metadata, photos: n } });
                                                onSave();
                                                showNotification("Photo uploaded successfully", "success");
                                             }
                                          }).catch(console.error).finally(() => setUploading(false));

                                       const reader = new FileReader();
                                       reader.readAsDataURL(f);
                                       reader.onload = async () => {
                                          const dataUrl = reader.result as string;
                                          const base64 = dataUrl.split(',')[1];
                                          
                                          try {
                                             const zx = new BrowserMultiFormatReader();
                                             const img = new Image();
                                             img.src = dataUrl;
                                             await new Promise(r => img.onload = r);
                                             const result = await zx.decodeFromImageElement(img);
                                             if (result && result.getText()) {
                                                setSerialNumber(result.getText());
                                                showNotification("Scanned barcode instantly!", "success");
                                                setIsScanningSerial(false);
                                                return;
                                             }
                                          } catch(e) {
                                             console.log("ZXing failed, falling back to AI...", e);
                                          }

                                          try {
                                             const res = await fetch("/api/bma/scan-serial", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify({ imageBase64: base64 }) });
                                             const rj = await res.json();
                                             if (rj.serialNumber) { setSerialNumber(rj.serialNumber); showNotification("Serial scanned by AI", "success"); } 
                                             else { showNotification("Could not detect serial number", "error"); }
                                          } catch(e) {
                                             console.error(e);
                                             showNotification("Scan failed", "error");
                                          } finally {
                                             setIsScanningSerial(false);
                                          }
                                       };
                                    } catch(err) { console.error(err); setIsScanningSerial(false); setUploading(false); showNotification("Scan failed", "error"); }
                                 }} />
                              </label>
                           )}
                        </div>
                     </div>
                     <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-4">Photos</label>
                        <div className="grid grid-cols-3 gap-4">
                           {(editingDevice.metadata?.photos || []).map((p: string, i: number) => (
                               <div key={i} className="aspect-square rounded-2xl overflow-hidden bg-black/40 border border-white/5 relative group" onClick={(e) => { e.stopPropagation(); setSelectedPhotoUrl(p); }}>
                                   <img src={p} className="w-full h-full object-cover" />
                                   {isLoggedIn && <button onClick={async (e) => { e.stopPropagation(); if (window.confirm("Delete photo?")) { const n = (editingDevice.metadata?.photos || []).filter((_:any,idx:any)=>idx!==i); const newSerial = n.length === 0 ? "" : serialNumber; if (n.length === 0) setSerialNumber(""); const updatedMeta = { ...editingDevice.metadata, photos: n, serial_number: newSerial ? newSerial.trim() : null }; await apiPatch("/api/bma/devices", { id: editingDevice.id, metadata: updatedMeta }); setEditingDevice({ ...editingDevice, metadata: updatedMeta }); onSave(); showNotification("Photo deleted", "success"); } }} className="absolute inset-0 bg-red-600/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"><Trash2 className="w-6 h-6 text-white" /></button>}
                               </div>
                           ))}
                           {isLoggedIn && (
                             <label className="aspect-square rounded-2xl border-2 border-dashed border-white/10 bg-white/[0.02] flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-white/5 transition-all" onClick={e => e.stopPropagation()}>
                                <Plus className="w-6 h-6 text-blue-500" />
                                <span className="text-[8px] font-black text-slate-500 uppercase">Upload</span>
                                <input type="file" className="hidden" accept="image/*" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; setUploading(true); try { const fd = new FormData(); fd.append("file", f); const res = await fetch("/api/upload", { method: "POST", body: fd, headers: { Authorization: `Bearer ${token}` } }); const rj = await res.json(); if (rj.ok) { const n = [...(editingDevice.metadata?.photos || []), rj.data.url]; await apiPatch("/api/bma/devices", { id: editingDevice.id, metadata: { ...editingDevice.metadata, photos: n } }); setEditingDevice({ ...editingDevice, metadata: { ...editingDevice.metadata, photos: n } }); onSave(); } } finally { setUploading(false); } }} />
                             </label>
                           )}
                        </div>
                     </div>
                  </div>
                  {isLoggedIn && <button disabled={isScanningSerial || uploading} onClick={async (e) => { e.stopPropagation(); const trimmed = serialNumber.trim(); const updatedMeta = { ...editingDevice.metadata, serial_number: trimmed ? trimmed : null }; await apiPatch("/api/bma/devices", { id: editingDevice.id, metadata: updatedMeta }); setEditingDevice(null); onSave(); showNotification("Saved successfully", "success"); }} className="w-full py-6 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:shadow-none disabled:active:scale-100 disabled:cursor-not-allowed text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-2xl shadow-blue-600/20 active:scale-95 transition-all">SAVE CHANGES</button>}
               </div>
            </div>
          )}
          {selectedPhotoUrl && (
            <div className="fixed inset-0 z-[11000] flex items-center justify-center p-4">
               <div className="absolute inset-0 bg-black/98 backdrop-blur-lg" onClick={() => setSelectedPhotoUrl(null)}></div>
               <button onClick={() => setSelectedPhotoUrl(null)} className="absolute top-10 right-10 text-white bg-white/10 p-5 rounded-full z-[11001] active:scale-95 transition-all"><X className="w-8 h-8" /></button>
               <img src={selectedPhotoUrl} className="max-w-full max-h-full object-contain rounded-3xl relative z-[11001] shadow-2xl" onClick={e => e.stopPropagation()} />
            </div>
          )}
          {pendingRoute && (
            <div className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/80 backdrop-blur-xl p-8">
               <div className="bg-[#0f172a] border border-white/10 p-8 rounded-3xl shadow-2xl w-full max-w-md space-y-6" onClick={e => e.stopPropagation()}>
                  <h2 className="text-xl font-black text-white uppercase italic">Name New Route</h2>
                  <input value={newRouteName} onChange={e => setNewRouteName(e.target.value)} placeholder="Enter name (e.g. Loop 1)..." className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white font-bold outline-none focus:border-blue-500/50" />
                  <div className="flex gap-4">
                     <button onClick={() => setPendingRoute(null)} className="flex-1 py-4 bg-white/5 text-white rounded-2xl font-black uppercase text-[10px] active:scale-95 transition-all">CANCEL</button>
                     <button onClick={() => { if (newRouteName.trim()) {
                       const s = devices.find(d => d.id === pendingRoute.srcId); const t = devices.find(d => d.id === pendingRoute.tgtId);
                       const len = calculateLength([[s?.x || 0, s?.y || 0], [t?.x || 0, t?.y || 0]]);
                       apiPost("/api/bma/connections", { type: "route", data: { project_id: projectId, connection_id: connections[0]?.id || "", source_device_id: pendingRoute.srcId, target_device_id: pendingRoute.tgtId, waypoints: [], length_meters: len, metadata: { cable_name: `${s?.name} bis ${t?.name}`, connection_name: newRouteName.trim() } } }).then(() => onSave());
                       setPendingRoute(null);
                     } }} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-[10px] shadow-lg shadow-blue-600/20 active:scale-95 transition-all">CREATE</button>
                  </div>
               </div>
            </div>
          )}
        </>,
        document.body
      )}
    </div>
  );
}
