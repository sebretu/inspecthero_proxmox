import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, CircleMarker, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getApiUrl, getToken } from "@/lib/apiClient";

const CRS = L.CRS.Simple;

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "/leaflet/images/marker-icon-2x.png",
  iconUrl: "/leaflet/images/marker-icon.png",
  shadowUrl: "/leaflet/images/marker-shadow.png",
});

const createRedIcon = (index: number) => L.divIcon({
  className: "premium-marker-wrapper",
  html: `<div style="background: #ef4444; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 11px;">O${index}</div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const createBlueIcon = (index: number) => L.divIcon({
  className: "premium-marker-wrapper",
  html: `<div style="background: #3b82f6; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 11px;">D${index}</div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

export default function DraftOverlayMap({
  planId,
  draftVersionId,
  opacity,
  anchorsOld,
  anchorsDraft,
  setAnchorsOld,
  setAnchorsDraft,
  nudgeMode = false,
  offsetX = 0,
  offsetY = 0,
  scale = 1,
  rotation = 0,
  dragToAlign = false,
  setOffsetX,
  setOffsetY
}: {
  planId: string;
  draftVersionId: string;
  opacity: number;
  anchorsOld: {x: number, y: number}[];
  anchorsDraft: {x: number, y: number}[];
  setAnchorsOld: any;
  setAnchorsDraft: any;
  nudgeMode?: boolean;
  offsetX?: number;
  offsetY?: number;
  scale?: number;
  rotation?: number;
  dragToAlign?: boolean;
  setOffsetX?: (x: number) => void;
  setOffsetY?: (y: number) => void;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [meta, setMeta] = useState<any>(null);
  const [existingPins, setExistingPins] = useState<any[]>([]);

  const [isMouseDown, setIsMouseDown] = useState(false);
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });
  const [dragStartOffset, setDragStartOffset] = useState({ x: 0, y: 0 });

  const getNudgeCoords = (x: number, y: number) => {
    if (!nudgeMode) return { x, y };
    const r = (rotation * Math.PI) / 180;
    const nx = scale * (Math.cos(r) * x - Math.sin(r) * y) + offsetX;
    const ny = scale * (Math.sin(r) * x + Math.cos(r) * y) + offsetY;
    return { x: nx, y: ny };
  };

  useEffect(() => {
    getToken().then(t => {
      setToken(t);
      if (t) {
        fetch(getApiUrl(`/api/tiles/${planId}/meta`), {
          headers: { Authorization: `Bearer ${t}` }
        })
        .then(r => r.json())
        .then(setMeta)
        .catch(() => {});

        fetch(getApiUrl(`/api/plans/${planId}/pins`), {
          headers: { Authorization: `Bearer ${t}` }
        })
        .then(r => r.json())
        .then(res => {
          if (res.ok) setExistingPins(res.data || []);
        })
        .catch(() => {});
      }
    });
  }, [planId]);

  if (!meta || !token) return <div className="p-8 text-center text-white bg-black/40">Loading map resources...</div>;
  if (meta.error || !meta.gridW) return <div className="p-8 text-center text-red-500 bg-black/40">Error loading map metadata: {meta.error || "Missing grid data"}</div>;

  const worldPxW = meta.gridW * meta.tileSize;
  const worldPxH = meta.gridH * meta.tileSize;
  
  const bounds = L.latLngBounds(
    CRS.pointToLatLng(L.point(0, worldPxH), meta.maxZoom),
    CRS.pointToLatLng(L.point(worldPxW, 0), meta.maxZoom)
  );

  function MapEvents() {
    const map = useMap();

    useEffect(() => {
      if (dragToAlign) {
        map.dragging.disable();
      } else {
        map.dragging.enable();
      }
    }, [dragToAlign, map]);

    useMapEvents({
      click: (e: any) => {
        if (nudgeMode || dragToAlign) return;
        const p = CRS.latLngToPoint(e.latlng, meta.maxZoom);
        setAnchorsDraft([...anchorsDraft, { x: p.x / worldPxW, y: p.y / worldPxH }]);
      },
      contextmenu: (e: any) => {
        if (nudgeMode || dragToAlign) return;
        const p = CRS.latLngToPoint(e.latlng, meta.maxZoom);
        setAnchorsOld([...anchorsOld, { x: p.x / worldPxW, y: p.y / worldPxH }]);
      },
      mousedown: (e: any) => {
        if (!dragToAlign || !setOffsetX || !setOffsetY) return;
        setIsMouseDown(true);
        setDragStartPos({ x: e.containerPoint.x, y: e.containerPoint.y });
        setDragStartOffset({ x: offsetX, y: offsetY });
      },
      mousemove: (e: any) => {
        if (!dragToAlign || !isMouseDown || !setOffsetX || !setOffsetY) return;
        const dx = e.containerPoint.x - dragStartPos.x;
        const dy = e.containerPoint.y - dragStartPos.y;

        const zoom = map.getZoom();
        const scaleAtZoom = Math.pow(2, zoom - meta.maxZoom);

        const deltaX = dx / (worldPxW * scaleAtZoom);
        const deltaY = dy / (worldPxH * scaleAtZoom);

        setOffsetX(dragStartOffset.x + deltaX);
        setOffsetY(dragStartOffset.y + deltaY);
      },
      mouseup: () => {
        setIsMouseDown(false);
      }
    });
    return null;
  }

  const MapContainerAny: any = MapContainer;

  return (
    <MapContainerAny
      crs={CRS}
      center={bounds.getCenter()}
      zoom={meta.minZoom}
      minZoom={meta.minZoom}
      maxZoom={meta.maxZoom}
      bounds={bounds}
      maxBounds={bounds}
      style={{ height: "100%", width: "100%", background: "#fff" }}
    >
      <TileLayer 
        url={getApiUrl(`/api/tiles/${planId}/{z}/{x}/{y}.png?token=${token}&v=${(meta as any)?.activeVersionId || ''}`)} 
        {...({ maxNativeZoom: meta.maxZoom } as any)}
      />
      <TileLayer 
        url={getApiUrl(`/api/tiles/${draftVersionId}/{z}/{x}/{y}.png?token=${token}`)} 
        {...({ maxNativeZoom: meta.maxZoom } as any)}
        opacity={opacity}
      />
      
      <MapEvents />

      {/* Render Existing Pins */}
      {existingPins.map((pin) => {
        const coords = getNudgeCoords(pin.x, pin.y);
        return (
          <CircleMarker
            key={`pin-${pin.id}`}
            center={CRS.pointToLatLng(L.point(coords.x * worldPxW, coords.y * worldPxH), meta.maxZoom)}
            {...({
              radius: 7,
              pathOptions: {
                fillColor: pin.type === "stromkreis" ? "#10b981" : pin.type === "task" ? "#f59e0b" : "#8b5cf6",
                fillOpacity: 0.85,
                color: "#ffffff",
                weight: 2
              }
            } as any)}
          >
            <Tooltip {...({ direction: "top", offset: [0, -6], opacity: 0.9 } as any)}>
              <span className="font-bold text-xs text-black">
                [{pin.type.toUpperCase()}] {pin.label}
              </span>
            </Tooltip>
          </CircleMarker>
        );
      })}

      {!nudgeMode && anchorsOld.map((a, i) => (
        <Marker 
          key={`old-${i}`} 
          position={CRS.pointToLatLng(L.point(a.x * worldPxW, a.y * worldPxH), meta.maxZoom)} 
          // @ts-ignore
          icon={createRedIcon(i + 1)} 
        />
      ))}

      {!nudgeMode && anchorsDraft.map((a, i) => (
        <Marker 
          key={`draft-${i}`} 
          position={CRS.pointToLatLng(L.point(a.x * worldPxW, a.y * worldPxH), meta.maxZoom)} 
          // @ts-ignore
          icon={createBlueIcon(i + 1)} 
        />
      ))}
    </MapContainerAny>
  );
}
