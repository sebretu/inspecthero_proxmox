"use client";
/**
 * Single Leaflet map for picking two cable endpoints (A and B).
 * Shows a live polyline between them while picking.
 * After both points are set, intermediate waypoints can be added
 * by clicking on the polyline or dragging existing waypoints.
 * No SSR — must be loaded via dynamic().
 */
import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useLanguage } from "@/contexts/LanguageContext";

const CRS = L.CRS.Simple;

interface Pin { x: number; y: number }

interface Props {
  planId: string;
  token: string | null;
  pinA: Pin | null;
  pinB: Pin | null;
  setPinA: (p: Pin) => void;
  setPinB: (p: Pin) => void;
  picking: "A" | "B";
  onPicked?: (which: "A" | "B") => void;
  waypoints: Pin[];
  setWaypoints: (pts: Pin[]) => void;
  labelA?: string;
  labelB?: string;
  readOnly?: boolean;
  lockA?: boolean;
  lockB?: boolean;
  calibrating?: boolean;
  onCalibrate?: (pixelDist: number) => void;
}

function makeIcon(letter: string, color: string, size = 34) {
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:3px solid #fff;display:flex;align-items:center;justify-content:center;font-size:${Math.floor(size * 0.4)}px;font-weight:900;color:#fff;box-shadow:0 4px 14px rgba(0,0,0,0.6);">${letter}</div>`,
    iconSize: [size, size] as [number, number],
    iconAnchor: [size / 2, size] as [number, number],
  });
}

function makeWaypointIcon(idx: number) {
  return L.divIcon({
    className: "",
    html: `<div style="width:22px;height:22px;border-radius:50%;background:#38bdf8;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:900;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.5);cursor:grab;">${idx + 1}</div>`,
    iconSize: [22, 22] as [number, number],
    iconAnchor: [11, 11] as [number, number],
  });
}

function makeCalibrationIcon(label: string) {
  return L.divIcon({
    className: "",
    html: `<div style="width:24px;height:24px;border-radius:50%;background:#ef4444;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:900;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.5);">${label}</div>`,
    iconSize: [24, 24] as [number, number],
    iconAnchor: [12, 12] as [number, number],
  });
}

function ClickHandler({
  meta, picking, onPin, pinA, pinB, waypoints, setWaypoints, readOnly, lockA, lockB, calibrating, onCalibrate
}: {
  meta: any; picking: "A" | "B";
  onPin: (p: Pin) => void;
  pinA: Pin | null; pinB: Pin | null;
  waypoints: Pin[]; setWaypoints: (pts: Pin[]) => void;
  readOnly?: boolean;
  lockA?: boolean;
  lockB?: boolean;
  calibrating?: boolean;
  onCalibrate?: (d: number) => void;
}) {
  const [calPts, setCalPts] = useState<Pin[]>([]);
  const W = meta.gridW * meta.tileSize;
  const H = meta.gridH * meta.tileSize;

  useMapEvents({
    click(e: any) {
      const pt = (CRS as any).latLngToPoint(e.latlng, meta.maxZoom);
      const clicked: Pin = { x: pt.x / W, y: pt.y / H };

      if (calibrating) {
        const next = [...calPts, clicked];
        if (next.length === 2) {
          const aspect = (meta.gridH * meta.tileSize) / (meta.gridW * meta.tileSize);
          const dx = (next[1].x - next[0].x);
          const dy = (next[1].y - next[0].y) * aspect;
          onCalibrate?.(Math.hypot(dx, dy));
          setCalPts([]);
        } else {
          setCalPts(next);
        }
        return;
      }

      if (readOnly) return;

      if (picking === "A") {
        if (lockA) return;
        onPin(clicked);
        return;
      }
      if (picking === "B" && !pinB) {
        if (lockB) return;
        onPin(clicked);
        return;
      }

      // Both A and B set — add a waypoint on click (only in "none" picking mode)
      if (pinA && pinB && picking === "B") {
        // Find best insert position (closest segment)
        const allPts = [pinA, ...waypoints, pinB];
        let bestIdx = waypoints.length; // insert at end before B
        let bestDist = Infinity;

        for (let i = 0; i < allPts.length - 1; i++) {
          const ax = allPts[i].x, ay = allPts[i].y;
          const bx = allPts[i + 1].x, by = allPts[i + 1].y;
          const cx = clicked.x, cy = clicked.y;
          const dx = bx - ax, dy = by - ay;
          const lenSq = dx * dx + dy * dy;
          const t = lenSq > 0 ? Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / lenSq)) : 0;
          const projX = ax + t * dx, projY = ay + t * dy;
          const dist = Math.hypot(cx - projX, cy - projY);
          if (dist < bestDist) { bestDist = dist; bestIdx = i; }
        }

        const next = [...waypoints];
        next.splice(bestIdx, 0, clicked);
        setWaypoints(next);
      }
    },
  });
  const MC = MapContainer as any;
  const Mk = Marker as any;
  const Pl = Polyline as any;

  return (
    <>
      {calPts.map((p, i) => (
        <Mk key={i} position={(CRS as any).pointToLatLng(L.point(p.x * W, p.y * H), meta.maxZoom)} icon={makeCalibrationIcon(i === 0 ? "1" : "2")} />
      ))}
      {calPts.length === 1 && (
        <Pl positions={[ (CRS as any).pointToLatLng(L.point(calPts[0].x * W, calPts[0].y * H), meta.maxZoom), (CRS as any).pointToLatLng(L.point(calPts[0].x * W, calPts[0].y * H), meta.maxZoom) ]} pathOptions={{ color: "#ef4444", dashArray: "4 4" }} />
      )}
    </>
  );
}

export function CableRouteSingleMap({ planId, token, pinA, pinB, setPinA, setPinB, picking, onPicked, waypoints, setWaypoints, labelA = "A", labelB = "B", readOnly = false, lockA = false, lockB = false, calibrating = false, onCalibrate }: Props) {
  const { t } = useLanguage();
  const [meta, setMeta] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!planId) return;
    setMeta(null); setErr(null);
    fetch(`/api/tiles/${planId}/meta`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status}`)))
      .then(d => { if (d?.gridW) setMeta(d); else setErr("Invalid meta"); })
      .catch((e: any) => setErr(e.message));
  }, [planId, token]);

  const { mapBounds, posA, posB, posWaypoints, line } = useMemo(() => {
    if (!meta) return { mapBounds: null, posA: null, posB: null, posWaypoints: [], line: null };
    const W = meta.gridW * meta.tileSize;
    const H = meta.gridH * meta.tileSize;
    const z = meta.maxZoom;
    const toLL = (p: Pin) => (CRS as any).pointToLatLng(L.point(p.x * W, p.y * H), z);
    const sw = (CRS as any).pointToLatLng(L.point(0, H), z);
    const ne = (CRS as any).pointToLatLng(L.point(W, 0), z);
    const allPositions = pinA && pinB ? [toLL(pinA), ...waypoints.map(toLL), toLL(pinB)] : null;
    return {
      mapBounds: L.latLngBounds(sw, ne) as any,
      posA: pinA ? toLL(pinA) : null,
      posB: pinB ? toLL(pinB) : null,
      posWaypoints: waypoints.map(toLL),
      line: allPositions,
    };
  }, [meta, pinA, pinB, waypoints]);

  function handlePin(p: Pin) {
    if (picking === "A") { setPinA(p); onPicked?.("A"); }
    else { setPinB(p); onPicked?.("B"); }
  }

  function handleWaypointDrag(idx: number, latlng: { lat: number; lng: number }) {
    if (!meta) return;
    const W = meta.gridW * meta.tileSize;
    const H = meta.gridH * meta.tileSize;
    const pt = (CRS as any).latLngToPoint(latlng, meta.maxZoom);
    const newPt: Pin = { x: pt.x / W, y: pt.y / H };
    const next = [...waypoints];
    next[idx] = newPt;
    setWaypoints(next);
  }

  const handlePinDrag = useCallback((which: "A" | "B", latlng: { lat: number; lng: number }) => {
    if (!meta) return;
    const W = meta.gridW * meta.tileSize;
    const H = meta.gridH * meta.tileSize;
    const pt = (CRS as any).latLngToPoint(latlng, meta.maxZoom);
    const newPt: Pin = { x: pt.x / W, y: pt.y / H };
    if (which === "A") setPinA(newPt);
    else setPinB(newPt);
  }, [meta, setPinA, setPinB]);

  function handleRemoveWaypoint(idx: number) {
    const next = waypoints.filter((_, i) => i !== idx);
    setWaypoints(next);
  }

  const bothSet = !!pinA && !!pinB;

  if (err) return <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#f87171", fontSize: 13 }}>{t("common", "error", "Błąd")}: {err}</div>;
  if (!meta || !mapBounds) return <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontSize: 13 }}>{t("common", "loading", "Ładowanie...")}</div>;

  const MC = MapContainer as any;
  const Mk = Marker as any;
  const Pl = Polyline as any;

  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      <MC crs={CRS} bounds={mapBounds} center={mapBounds.getCenter()} zoom={0}
        minZoom={meta.minZoom} maxZoom={meta.maxZoom}
        style={{ height: "100%", width: "100%", background: "#111", cursor: "crosshair" }}>
        {token && <TileLayer url={`/api/tiles/${planId}/{z}/{x}/{y}.png?token=${token}`} />}
        <ClickHandler
          meta={meta} picking={picking} onPin={handlePin}
          pinA={pinA} pinB={pinB}
          waypoints={waypoints} setWaypoints={setWaypoints}
          readOnly={readOnly}
          lockA={lockA}
          lockB={lockB}
          calibrating={calibrating}
          onCalibrate={onCalibrate}
        />

        {/* Full route polyline */}
        {line && line.length >= 2 && (
          <Pl positions={line} pathOptions={{ color: "#38bdf8", weight: 3, opacity: 0.85, dashArray: bothSet ? undefined : "8 4" }} />
        )}

        {/* Endpoint Markers */}
        {posA && (
          <Mk
            position={posA}
            icon={makeIcon(labelA, "#22c55e")}
            title={readOnly || lockA ? undefined : `Punkt ${labelA}`}
            draggable={!readOnly && !lockA}
            eventHandlers={{
              dragend(e: any) { if (!readOnly && !lockA) handlePinDrag("A", e.target.getLatLng()); }
            }}
          />
        )}
        {posB && (
          <Mk
            position={posB}
            icon={makeIcon(labelB, "#f97316")}
            title={readOnly || lockB ? undefined : `Punkt ${labelB}`}
            draggable={!readOnly && !lockB}
            eventHandlers={{
              dragend(e: any) { if (!readOnly && !lockB) handlePinDrag("B", e.target.getLatLng()); }
            }}
          />
        )}

        {/* Waypoint Markers — draggable */}
        {bothSet && posWaypoints.map((pos, idx) => (
          <Mk
            key={idx}
            position={pos}
            icon={makeWaypointIcon(idx)}
            draggable={!readOnly}
            title={readOnly ? undefined : `Punkt pośredni ${idx + 1} (przeciągnij / dbl-click usuń)`}
            eventHandlers={{
              dragend(e: any) {
                if (!readOnly) handleWaypointDrag(idx, e.target.getLatLng());
              },
              dblclick() {
                if (!readOnly) handleRemoveWaypoint(idx);
              },
            }}
          />
        ))}
      </MC>

      {/* Hint overlay */}
      {bothSet && !readOnly && (
        <div style={{
          position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)",
          zIndex: 1000, background: "rgba(0,0,0,0.75)", borderRadius: 8,
          padding: "4px 12px", fontSize: 10, fontWeight: 700, color: "#38bdf8",
          pointerEvents: "none", whiteSpace: "nowrap",
        }}>
          📍 Kliknij na linii aby dodać punkt · Przeciągnij punkt · Dblclick aby usunąć
        </div>
      )}
    </div>
  );
}
