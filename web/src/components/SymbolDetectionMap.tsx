"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import { MapContainer as RLMapContainer, TileLayer as RLTileLayer, Marker as RLMarker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const MapContainer = RLMapContainer as any;
const TileLayer = RLTileLayer as any;
const Marker = RLMarker as any;

type Meta = {
  tileSize: number;
  minZoom: number;
  maxZoom: number;
  gridW: number;
  gridH: number;
  format?: string;
  activeVersionId?: string;
};

export interface PredictionItem {
  id: string;
  plan_id: string;
  x_norm: number;
  y_norm: number;
  predicted_symbol_type: string;
  predicted_circuit_code: string | null;
  confidence: number;
  matched_crop_id: string | null;
  status: string;
  metadata: any;
  created_at: string;
}

interface SymbolDetectionMapProps {
  planId: string;
  token: string | null;
  predictions: PredictionItem[];
  selectedPrediction: PredictionItem | null;
  onSelectPrediction: (pred: PredictionItem) => void;
}

const CRS = L.CRS.Simple;

// Marker icon cache
const iconCache: Record<string, any> = {};

function getMarkerIcon(type: string, confidence: number, isSelected: boolean) {
  const cacheKey = `${type}_${confidence.toFixed(2)}_${isSelected}`;
  if (iconCache[cacheKey]) return iconCache[cacheKey];

  let colorBg = "bg-emerald-500";
  let borderCol = "border-emerald-300";

  if (confidence < 0.85) {
    colorBg = "bg-rose-500";
    borderCol = "border-rose-300";
  } else if (confidence < 0.92) {
    colorBg = "bg-amber-500";
    borderCol = "border-amber-300";
  }

  const selectedRing = isSelected ? "ring-4 ring-cyan-400 scale-125 z-50 animate-pulse" : "";
  const pct = (confidence * 100).toFixed(0);

  const html = `
    <div class="relative flex items-center justify-center pointer-events-auto">
      <div class="w-6 h-6 rounded-full ${colorBg} border-2 ${borderCol} shadow-lg flex items-center justify-center text-[10px] font-black text-white ${selectedRing} transition-all duration-200 cursor-pointer">
        ${type.charAt(0).toUpperCase()}
      </div>
      <div class="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-slate-900/90 text-[9px] font-mono text-slate-200 px-1 py-0.2 rounded border border-slate-700 whitespace-nowrap pointer-events-none">
        ${pct}%
      </div>
    </div>
  `;

  const icon = L.divIcon({
    className: "symbol-detection-div-icon",
    html: html,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });

  iconCache[cacheKey] = icon;
  return icon;
}

// Controller to auto-center when a prediction is selected
function MapController({ selectedPred, worldPxW, worldPxH, maxZoom }: { selectedPred: PredictionItem | null; worldPxW: number; worldPxH: number; maxZoom: number }) {
  const map = useMap();
  const prevSelectedId = useRef<string | null>(null);

  useEffect(() => {
    if (selectedPred && selectedPred.id !== prevSelectedId.current) {
      prevSelectedId.current = selectedPred.id;
      const targetLatLng = CRS.pointToLatLng(L.point(selectedPred.x_norm * worldPxW, selectedPred.y_norm * worldPxH), maxZoom);
      map.flyTo(targetLatLng, Math.max(map.getZoom(), 2), { duration: 0.5 });
    }
  }, [selectedPred, worldPxW, worldPxH, maxZoom, map]);

  return null;
}

export default function SymbolDetectionMap({
  planId,
  token,
  predictions,
  selectedPrediction,
  onSelectPrediction
}: SymbolDetectionMapProps) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!planId) return;

    let isMounted = true;
    setLoading(true);

    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
      headers["X-App-Token"] = token;
    }

    fetch(`/api/tiles/${planId}/meta?token=${encodeURIComponent(token || '')}`, { headers })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Tiles meta status ${res.status}`);
        }
        return res.json();
      })
      .then((data: Meta) => {
        if (isMounted) {
          setMeta(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.warn(`[SymbolDetectionMap] Meta fetch failed for ${planId}:`, err.message);
          setMeta({
            tileSize: 256,
            minZoom: 1,
            maxZoom: 5,
            gridW: 28,
            gridH: 20,
            format: "png"
          });
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [planId, token]);

  const worldPxW = meta ? meta.gridW * meta.tileSize : 0;
  const worldPxH = meta ? meta.gridH * meta.tileSize : 0;

  const bounds = useMemo(() => {
    if (!meta) return null;
    const sw = CRS.pointToLatLng(L.point(0, worldPxH), meta.maxZoom);
    const ne = CRS.pointToLatLng(L.point(worldPxW, 0), meta.maxZoom);
    return L.latLngBounds(sw, ne);
  }, [worldPxW, worldPxH, meta]);

  const center = useMemo(() => {
    if (!bounds) return [0, 0] as [number, number];
    const c = bounds.getCenter();
    return [c.lat, c.lng] as [number, number];
  }, [bounds]);

  if (loading) {
    return (
      <div className="h-[650px] bg-slate-950 flex flex-col items-center justify-center text-slate-400 gap-3 border border-slate-800 rounded-xl">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
        <span className="text-xs font-medium">Ładowanie kafelków planu Leaflet...</span>
      </div>
    );
  }

  if (!meta || !bounds) {
    return (
      <div className="h-[650px] bg-slate-950 flex items-center justify-center text-slate-500 border border-slate-800 rounded-xl">
        Brak danych mapy dla wybranego planu.
      </div>
    );
  }

  const folder = meta.activeVersionId || planId;
  const minZoom = meta.minZoom || 1;
  const maxZoom = meta.maxZoom || 5;
  const startZoom = minZoom;
  const tileUrl = `/api/tiles/${folder}/{z}/{x}/{y}.${meta.format || "png"}${token ? '?token=' + encodeURIComponent(token) : ''}`;

  return (
    <div className="h-[650px] w-full relative rounded-xl overflow-hidden border border-slate-800 bg-white shadow-2xl">
      <MapContainer
        crs={CRS as any}
        center={center}
        zoom={startZoom}
        minZoom={minZoom}
        maxZoom={maxZoom + 2}
        bounds={bounds as any}
        maxBounds={bounds as any}
        maxBoundsViscosity={1.0}
        className="h-full w-full bg-white"
        attributionControl={false}
      >
        <TileLayer
          url={tileUrl}
          bounds={bounds as any}
          tileSize={meta.tileSize}
          maxNativeZoom={maxZoom}
          noWrap
        />

        <MapController selectedPred={selectedPrediction} worldPxW={worldPxW} worldPxH={worldPxH} maxZoom={maxZoom} />

        {predictions.map((pred) => {
          const isSelected = selectedPrediction?.id === pred.id;
          const latLng = CRS.pointToLatLng(L.point(pred.x_norm * worldPxW, pred.y_norm * worldPxH), maxZoom);
          const icon = getMarkerIcon(pred.predicted_symbol_type, pred.confidence, isSelected);

          return (
            <Marker
              key={pred.id}
              position={latLng}
              icon={icon as any}
              eventHandlers={{
                click: () => onSelectPrediction(pred)
              }}
            />
          );
        })}
      </MapContainer>
    </div>
  );
}
