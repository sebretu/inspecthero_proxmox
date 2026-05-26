"use client";
import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface MapPinPickerProps {
    planId: string;
    token: string | null;
    onPin: (x_norm: number, y_norm: number) => void;
    pinned: { x: number; y: number } | null;
    accentColor?: string;
    label?: string;
}

const CRS = L.CRS.Simple;

export function MapPinPicker({ planId, token, onPin, pinned, accentColor = "#06b6d4", label }: MapPinPickerProps) {
    const [meta, setMeta] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!planId) return;
        setMeta(null);
        setError(null);
        fetch(`/api/tiles/${planId}/meta`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
            .then(async (r) => {
                if (!r.ok) {
                    const text = await r.text();
                    throw new Error(text || `Status ${r.status}`);
                }
                return r.json();
            })
            .then((data) => {
                if (!data || typeof data.gridW !== "number") {
                    throw new Error("Invalid meta.json");
                }
                setMeta(data);
            })
            .catch((err) => {
                console.error("[MapPinPicker] Fetch failed:", err);
                setError(err.message);
            });
    }, [planId, token]);

    const bounds = useMemo(() => {
        if (!meta) return null;
        const worldPxW = meta.gridW * meta.tileSize;
        const worldPxH = meta.gridH * meta.tileSize;
        const sw = CRS.pointToLatLng(L.point(0, worldPxH), meta.maxZoom);
        const ne = CRS.pointToLatLng(L.point(worldPxW, 0), meta.maxZoom);
        return L.latLngBounds(sw, ne);
    }, [meta]);

    if (!mounted) return null;

    if (error) {
        return (
            <div style={{ height: 400, borderRadius: 12, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.05)", display: "flex", alignItems: "center", justifyContent: "center", color: "#f87171", padding: 20, textAlign: "center" }}>
                Error: {error}
            </div>
        );
    }

    if (!meta || !bounds) {
        return (
            <div style={{ height: 400, borderRadius: 12, border: "2px dashed rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.02)", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.3)" }}>
                Loading plan...
            </div>
        );
    }

    const worldPxW = meta.gridW * meta.tileSize;
    const worldPxH = meta.gridH * meta.tileSize;
    const pinLatLng = pinned ? CRS.pointToLatLng(L.point(pinned.x * worldPxW, pinned.y * worldPxH), meta.maxZoom) : null;

    const pinIcon = L.divIcon({
        className: "",
        html: `<div style="font-size:32px;filter:drop-shadow(0 4px 8px rgba(0,0,0,0.5));">📍</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
    });

    const MapContainerAny = MapContainer as any;
    const MarkerAny = Marker as any;

    function ClickHandler() {
        useMapEvents({
            click(e: any) {
                // If the user's click should only be processed when they are allowed to pin:
                // Since this component is shared, we'll let it process.
                const p = CRS.latLngToPoint(e.latlng, meta.maxZoom);
                onPin(p.x / worldPxW, p.y / worldPxH);
            },
        });
        return null;
    }

    function AutoCenter({ pos }: { pos: any }) {
        const map = useMap();
        const [hasCentered, setHasCentered] = useState(false);
        useEffect(() => {
            if (pos && !hasCentered) {
                // Determine a good zoom level to see the marker clearly (max zoom - 1, or at least 1)
                const targetZoom = Math.max(meta.maxZoom - 1, 1);
                map.setView(pos, targetZoom, { animate: true });
                setHasCentered(true);
            }
        }, [pos, map, hasCentered]);
        return null;
    }

    return (
        <div style={{ height: 400, borderRadius: 12, overflow: "hidden", border: `2px solid ${accentColor}40`, position: "relative" }}>
            <MapContainerAny
                crs={CRS}
                bounds={bounds}
                center={bounds.getCenter()}
                zoom={0}
                minZoom={meta.minZoom}
                maxZoom={meta.maxZoom}
                style={{ height: "100%", background: "#111" }}
            >
                {token && <TileLayer url={`/api/tiles/${planId}/{z}/{x}/{y}.png?token=${token}`} />}
                <ClickHandler />
                {pinLatLng && <AutoCenter pos={pinLatLng} />}
                {pinLatLng && <MarkerAny position={pinLatLng} icon={pinIcon} />}
            </MapContainerAny>
            <div style={{ position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)", zIndex: 1000, background: "rgba(0,0,0,0.7)", color: "white", padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700, pointerEvents: "none" }}>
                {label || "CLICK ON MAP TO PIN LOCATION"}
            </div>
        </div>
    );
}
