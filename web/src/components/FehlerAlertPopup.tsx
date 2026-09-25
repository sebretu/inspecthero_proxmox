"use client";
import { useEffect, useState, useCallback } from "react";
import { apiGet, getToken } from "@/lib/apiClient";
import PhotoLightbox from "@/components/PhotoLightbox";

interface FehlerAlert {
    id: string;
    title: string;
    description: string | null;
    priority: string;
    status: string;
    created_at: string;
    fehler_photos?: { id: string; url: string; photo_type: string }[];
}

interface FehlerAlertPopupProps {
    currentUserId?: string | null;
    onViewFehler?: (fehler: any) => void;
}

const POLL_INTERVAL_MS = 30_000; // 30 seconds

export function FehlerAlertPopup({ currentUserId, onViewFehler }: FehlerAlertPopupProps) {
    const [alerts, setAlerts] = useState<FehlerAlert[]>([]);
    const [dismissed, setDismissed] = useState<Set<string>>(new Set());
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    const checkForNewFehler = useCallback(async () => {
        if (!currentUserId) return;
        try {
            const data = await apiGet<FehlerAlert[]>(`/api/fehler?assignedUserId=${currentUserId}&status=OPEN&limit=20`);
            if (!data) return;
            // Only show CRITICAL fehler that are assigned to the user
            const criticalFehlers = data.filter((f) => f.status === "OPEN" && f.priority === "CRITICAL");
            setAlerts(criticalFehlers);
        } catch {
            // silently ignore
        }
    }, [currentUserId]);

    useEffect(() => {
        if (!currentUserId) return;
        checkForNewFehler();
        const interval = setInterval(checkForNewFehler, POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [currentUserId, checkForNewFehler]);

    // Also listen for new fehler events dispatched by FehlerModal
    useEffect(() => {
        const handler = () => { checkForNewFehler(); };
        window.addEventListener("fehler-created", handler);
        return () => window.removeEventListener("fehler-created", handler);
    }, [checkForNewFehler]);

    const visible = alerts.filter((a) => !dismissed.has(a.id));
    if (visible.length === 0) return null;

    return (
        <div style={{
            position: "fixed", inset: 0, zIndex: 99999,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)",
            padding: 24, gap: 20
        }}>
            {visible.map((alert) => (
                <div key={alert.id} style={{
                    width: "100%",
                    maxWidth: 580,
                    background: "linear-gradient(135deg, #1a0505 0%, #2d0808 100%)",
                    border: "1px solid #ef4444",
                    borderRadius: 24,
                    padding: "32px",
                    boxShadow: "0 20px 80px rgba(239,68,68,0.5), 0 0 0 1px rgba(239,68,68,0.2)",
                    animation: "fehlerPopIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
                    position: "relative",
                    overflow: "hidden",
                }}>
                    {/* Animated red glow border */}
                    <div style={{
                        position: "absolute", inset: 0, borderRadius: 16,
                        background: "linear-gradient(135deg, rgba(239,68,68,0.08) 0%, transparent 60%)",
                        pointerEvents: "none"
                    }} />

                    {/* Header */}
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 16 }}>
                        <div style={{
                            fontSize: 32, flexShrink: 0,
                            animation: "fehlerPulse 1.2s ease-in-out infinite",
                        }}>🚨</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                                fontSize: 13, fontWeight: 800, color: "#ef4444",
                                textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 6
                            }}>
                                {alert.priority === "CRITICAL" ? "⚡ KRITISCH"
                                    : alert.priority === "HIGH" ? "🔴 HOHE PRIORITÄT"
                                        : alert.priority === "NORMAL" ? "🟡 NORMAL"
                                            : "🟢 NIEDRIG"} — Sofortige Reaktion erforderlich
                            </div>
                            <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", lineHeight: 1.3 }}>
                                {alert.title}
                            </div>
                        </div>
                        <button
                            onClick={() => setDismissed((prev) => new Set([...prev, alert.id]))}
                            style={{ background: "none", border: "none", color: "#666", fontSize: 16, cursor: "pointer", flexShrink: 0, padding: 0, lineHeight: 1 }}
                        >
                            ✕
                        </button>
                    </div>

                    {alert.description && (
                        <div style={{ fontSize: 15, color: "#ccc", marginBottom: 20, lineHeight: 1.6 }}>
                            {alert.description.slice(0, 200)}{alert.description.length > 200 ? "…" : ""}
                        </div>
                    )}

                    {/* Photo preview */}
                    {alert.fehler_photos && alert.fehler_photos.length > 0 && (
                        <div
                            style={{
                                marginBottom: 24, borderRadius: 16, overflow: "hidden",
                                border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.5)",
                                aspectRatio: "16/9", display: "flex", alignItems: "center", justifyContent: "center",
                                cursor: "zoom-in"
                            }}
                            onClick={() => {
                                const url = alert.fehler_photos?.find(p => p.photo_type === "BEFORE")?.url || alert.fehler_photos?.[0]?.url;
                                if (url) setPreviewUrl(url);
                            }}
                        >
                            <img
                                src={alert.fehler_photos.find(p => p.photo_type === "BEFORE")?.url || alert.fehler_photos[0].url}
                                alt="Usterka"
                                style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                            />
                        </div>
                    )}

                    <div style={{ display: "flex", gap: 12 }}>
                        <button
                            onClick={() => {
                                onViewFehler?.(alert);
                                setDismissed((prev) => new Set([...prev, alert.id]));
                            }}
                            style={{
                                flex: 2, padding: "14px 20px", borderRadius: 12, border: "none",
                                background: "linear-gradient(135deg, #ef4444, #dc2626)",
                                color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer",
                                boxShadow: "0 4px 15px rgba(239,68,68,0.4)"
                            }}
                        >
                            🔍 Zur Mängelmeldung
                        </button>
                        <button
                            onClick={() => setDismissed((prev) => new Set([...prev, alert.id]))}
                            style={{
                                flex: 1, padding: "14px 20px", borderRadius: 12, border: "1px solid rgba(239,68,68,0.3)",
                                background: "rgba(239,68,68,0.1)", color: "#fca5a5", fontWeight: 700, fontSize: 15, cursor: "pointer",
                            }}
                        >
                            Später
                        </button>
                    </div>
                </div>
            ))}

            <style>{`
                @keyframes fehlerPopIn {
                    0% { opacity: 0; transform: scale(0.9) translateY(20px); }
                    100% { opacity: 1; transform: scale(1) translateY(0); }
                }
                @keyframes fehlerPulse {
                    0%, 100% { transform: scale(1); }
                    50%       { transform: scale(1.2); }
                }
            `}</style>

            <PhotoLightbox
                url={previewUrl}
                onClose={() => setPreviewUrl(null)}
            />
        </div>
    );
}
