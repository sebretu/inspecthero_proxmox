"use client";

import React, { useEffect, useMemo, useState } from "react";
import { getToken, getApiUrl } from "@/lib/apiClient";

type TilesMeta = {
  limits?: Record<string, { maxX: number; maxY: number }>;
};

interface PlanCompositeThumbnailProps {
  planId: string;
  zoom?: number;
  size?: number;
  alt?: string;
}

// Renders a 2x2 grid for zoom 1 (tiles 1/0/0, 1/0/1, 1/1/0, 1/1/1)
const PlanCompositeThumbnail: React.FC<PlanCompositeThumbnailProps> = ({ planId, zoom = 1, size = 480, alt = "Plan thumbnail" }) => {
  const [meta, setMeta] = useState<TilesMeta | null>(null);
  const [metaError, setMetaError] = useState(false);
  const [tileError, setTileError] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    getToken().then(setToken);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setMeta(null);
    setMetaError(false);
    setTileError(false);

    const loadMeta = async () => {
      try {
        const t = token ? `token=${token}` : "";
        const cb = `_cb=${Date.now()}`;
        const query = [t, cb].filter(Boolean).join("&");
        const res = await fetch(getApiUrl(`/api/tiles/${planId}/meta?${query}`), { cache: "no-store" });
        if (!res.ok) throw new Error(`meta ${res.status}`);
        const data = (await res.json()) as TilesMeta;
        if (!cancelled) setMeta(data);
      } catch (e) {
        if (!cancelled) setMetaError(true);
      }
    };

    if (token !== null) { // wait for token check (even if null)
      loadMeta();
    }

    return () => {
      cancelled = true;
    };
  }, [planId, token]);

  const limit = meta?.limits?.[String(zoom)];
  const columns = Math.max(1, (limit?.maxX ?? 1) + 1);
  const rows = Math.max(1, (limit?.maxY ?? 1) + 1);
  const scale = size / Math.max(columns, rows);
  const cellSize = Number.isFinite(scale) && scale > 0 ? scale : size / 2;
  const width = columns * cellSize;
  const height = rows * cellSize;
  const gridTemplateColumns = `repeat(${columns}, ${cellSize}px)`;
  const gridTemplateRows = `repeat(${rows}, ${cellSize}px)`;

  const tileSrc = (x: number, y: number) => {
    const t = token ? `token=${token}` : "";
    const cb = `_cb=${Date.now()}`;
    const query = [t, cb].filter(Boolean).join("&");
    return getApiUrl(`/api/tiles/${planId}/${zoom}/${x}/${y}.png?${query}`);
  };
  const tiles = useMemo(() => {
    if (!token && token !== null) return null; // loading or no token? if no token, maybe we should still try? 
    // actually getToken returns null if not logged in. 
    // If not logged in, images will fail anyway with 401. 

    return Array.from({ length: rows }).flatMap((_, y) =>
      Array.from({ length: columns }).map((__, x) => (
        <img
          key={`${x}-${y}`}
          src={tileSrc(x, y)}
          alt={alt}
          style={{ width: cellSize, height: cellSize, objectFit: "contain", background: "#eee" }}
          onError={() => setTileError(true)}
        />
      ))
    );
  }, [rows, columns, planId, alt, cellSize, zoom, token]); // ✅ Added token to dependency array

  // Wait for token to load
  if (!token && token !== null) {
    return (
      <div
        style={{
          width,
          height,
          background: "#f8f8f8",
          borderRadius: 8,
          border: "1px solid #ccc",
        }}
      />
    );
  }

  if (metaError || tileError) {
    return (
      <img
        src={getApiUrl("/assets/plan-placeholder.svg")}
        alt={alt}
        style={{ width: size, height: size, opacity: 0.5, border: "1px solid #ccc", borderRadius: 8 }}
      />
    );
  }

  return (
    <div
      style={{
        width: "100%",
        maxWidth: width,
        aspectRatio: `${width} / ${height}`,
        display: "grid",
        gridTemplateColumns,
        gridTemplateRows,
        border: "1px solid #ccc",
        borderRadius: 8,
        overflow: "hidden",
        background: "#f8f8f8",
      }}
    >
      {tiles}
    </div>
  );
};

export default PlanCompositeThumbnail;
