"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, ZoomControl } from "react-leaflet";

type Meta = {
  tileSize: number;
  minZoom: number;
  maxZoom: number;
  gridW: number; // tiles at maxZoom
  gridH: number; // tiles at maxZoom
};

export default function PlanViewer({ planId }: { planId: string }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await fetch(`/tiles/${planId}/meta.json`, { cache: "no-store" });
      if (!r.ok) throw new Error(`meta.json fetch failed: ${r.status}`);
      const j = (await r.json()) as Meta;

      if (
        typeof j?.tileSize !== "number" ||
        typeof j?.minZoom !== "number" ||
        typeof j?.maxZoom !== "number" ||
        typeof j?.gridW !== "number" ||
        typeof j?.gridH !== "number"
      ) {
        throw new Error("meta.json ma zły format");
      }

      if (!cancelled) setMeta(j);
    })().catch((e) => {
      console.error("[PlanViewer] meta load error:", e);
      if (!cancelled) setMeta(null);
    });

    return () => {
      cancelled = true;
    };
  }, [planId]);

  // ✅ CRS dla kafli XYZ (y dodatnie w dół)
  const crs = useMemo(() => {
    return L.Util.extend({}, L.CRS.Simple, {
      // domyślnie CRS.Simple odwraca oś Y (lat -> -y),
      // my chcemy y rosnące w dół jak w kaflach XYZ
      transformation: new L.Transformation(1, 0, 1, 0),
    });
  }, []);

  const { bounds, center, startZoom } = useMemo(() => {
    if (!meta) return { bounds: null as any, center: null as any, startZoom: 0 };

    const scale = Math.pow(2, meta.maxZoom);
    const maxPxW = meta.gridW * meta.tileSize; // px na maxZoom
    const maxPxH = meta.gridH * meta.tileSize;

    // ✅ jednostki "na zoom=0"
    const w0 = maxPxW / scale;
    const h0 = maxPxH / scale;

    const b = L.latLngBounds(
      L.latLng(0, 0),
      L.latLng(h0, w0)
    );

    const c = b.getCenter();
    const z = Math.max(meta.minZoom, meta.maxZoom - 1);

    return { bounds: b, center: c, startZoom: z };
  }, [meta]);

  useEffect(() => {
    if (!meta || !bounds || !mapRef.current) return;

    const map = mapRef.current;

    // ✅ ważne: po mount (gdy kontener ma rozmiar) dopasuj
    // robimy to 2x (raf + timeout), bo Next/React potrafi przestawiać layout
    requestAnimationFrame(() => {
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [20, 20], animate: false });
      setTimeout(() => {
        map.invalidateSize();
        map.fitBounds(bounds, { padding: [20, 20], animate: false });
      }, 50);
    });
  }, [meta, bounds]);

  if (!meta) {
    return (
      <div style={{ height: "70vh", display: "grid", placeItems: "center" }}>
        <div>Ładowanie planu…</div>
      </div>
    );
  }

  return (
    <div style={{ height: "70vh", width: "100%" }}>
      <MapContainer
        whenCreated={(m) => (mapRef.current = m)}
        crs={crs as any}
        center={center}
        zoom={startZoom}
        minZoom={meta.minZoom}
        maxZoom={meta.maxZoom}
        zoomControl={false}
        // ✅ trzymamy użytkownika w obrębie planszy
        bounds={bounds}
        maxBounds={bounds}
        maxBoundsViscosity={0.9}
        style={{ height: "100%", width: "100%", background: "#fff" }}
      >
        <ZoomControl position="topright" />

        <TileLayer
          url={`/api/tiles/${planId}/{z}/{x}/{y}.png`}
          tileSize={meta.tileSize}
          minZoom={meta.minZoom}
          maxZoom={meta.maxZoom}
          minNativeZoom={meta.minZoom}
          maxNativeZoom={meta.maxZoom}
          // ✅ to jest XYZ, więc tms MUSI być false (albo brak)
          tms={false}
          // ✅ ważne: nie owijamy świata
          noWrap={true}
          // (nie dawaj tutaj bounds=... — to potrafi psuć docinanie)
          keepBuffer={4}
        />
      </MapContainer>
    </div>
  );
}
