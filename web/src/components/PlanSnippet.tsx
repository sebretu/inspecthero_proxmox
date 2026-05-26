"use client";
import { useEffect, useState, useMemo } from "react";
import { apiGet, getApiUrl, getToken } from "@/lib/apiClient";

type PlanMeta = {
    tileSize: number;
    minZoom: number;
    maxZoom: number;
    gridW: number;
    gridH: number;
    limits?: Record<string, { maxX: number; maxY: number }>;
};

interface PlanSnippetProps {
    planId: string;
    itemId?: string; // ID of Fehler or Revision for deep linking
    x_norm: number;
    y_norm: number;
    type: "FEHLER" | "REVISION";
}

/**
 * PlanSnippet - Optimized Thumbnail Version
 * Uses a single static tile image instead of a full Leaflet map for performance and reliability.
 */
export default function PlanSnippet({ planId, itemId, x_norm, y_norm, type }: PlanSnippetProps) {
    const [meta, setMeta] = useState<PlanMeta | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        let alive = true;
        
        // Parallel fetch for token and meta
        const fetchMeta = async () => {
            try {
                const token = await getToken();
                const headers: HeadersInit = {};
                if (token) headers.Authorization = `Bearer ${token}`;
                
                const r = await fetch(getApiUrl(`/api/tiles/${planId}/meta`), { 
                    cache: 'no-store',
                    headers
                });
                if (!r.ok) return null;
                return await r.json();
            } catch { return null; }
        };

        Promise.all([
            getToken(),
            fetchMeta()
        ]).then(([t, m]) => {
            if (!alive) return;
            setToken(t);
            setMeta(m);
            setLoading(false);
            if (!m) setError(true);
        });

        return () => { alive = false; };
    }, [planId]);

    const tileUrl = useMemo(() => {
        if (!meta || !planId) return null;

        const xNorm = typeof x_norm === "number" ? x_norm : Number(x_norm);
        const yNorm = typeof y_norm === "number" ? y_norm : Number(y_norm);
        if (!Number.isFinite(xNorm) || !Number.isFinite(yNorm)) return null;

        // Use a fixed medium zoom for thumbnails (Level 3 or 4)
        const targetZoom = Math.max(meta.minZoom, Math.min(meta.maxZoom, 3));
        const zoomKey = String(targetZoom);

        const maxX = meta.limits?.[zoomKey]?.maxX ?? Math.pow(2, targetZoom) - 1;
        const maxY = meta.limits?.[zoomKey]?.maxY ?? Math.pow(2, targetZoom) - 1;

        // Calculate tile coordinates at target zoom level
        const x = Math.min(Math.max(0, Math.floor(xNorm * (maxX + 1))), maxX);
        const y = Math.min(Math.max(0, Math.floor(yNorm * (maxY + 1))), maxY);

        return getApiUrl(`/api/tiles/${planId}/${targetZoom}/${x}/${y}.png` + (token ? `?token=${token}` : ""));
    }, [meta, planId, x_norm, y_norm, token]);

    const markerEmoji = type === "FEHLER" ? "⚠️" : "📋";
    const focusParam = type === "FEHLER" ? "focusFehlerId" : "focusRevisionId";
    const redirectUrl = itemId ? `/plan/${planId}?${focusParam}=${itemId}` : `/plan/${planId}`;

    if (loading) {
        return (
            <div className="w-full h-full bg-black/5 animate-pulse flex items-center justify-center">
                <div className="w-1 h-1 bg-ui-accent rounded-full" />
            </div>
        );
    }

    if (error || !tileUrl) {
        return (
            <div className="w-full h-full bg-black/10 flex items-center justify-center text-[8px] font-black text-ui-muted opacity-30 uppercase tracking-widest">
                No Plan
            </div>
        );
    }

    return (
        <a 
            href={redirectUrl}
            className="relative w-full h-full group/snippet overflow-hidden block cursor-pointer"
            title="Open plan viewer"
        >
            <img 
                src={tileUrl} 
                alt="Map context"
                className="w-full h-full object-cover transition-transform duration-700 group-hover/snippet:scale-125"
                onError={() => setError(true)}
            />
            {/* Custom Marker Overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="relative">
                    {/* Pulsing Highlight Background */}
                    <div className={`absolute inset-0 -m-2 rounded-full animate-ping opacity-20 ${type === 'FEHLER' ? 'bg-amber-500' : 'bg-indigo-500'}`} />
                    
                    {/* Emoji Marker */}
                    <div className={`relative w-8 h-8 rounded-full border-2 border-white shadow-2xl flex items-center justify-center text-sm transform transition-transform duration-300 group-hover/snippet:scale-110 ${type === 'FEHLER' ? 'bg-amber-500 shadow-amber-500/50' : 'bg-indigo-500 shadow-indigo-500/50'}`}>
                        {markerEmoji}
                    </div>
                </div>
            </div>
            {/* Gradient Overlay and Scanline Effect */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
            <div className="absolute inset-0 bg-white/5 opacity-0 group-hover/snippet:opacity-100 transition-opacity pointer-events-none" />
        </a>
    );
}
