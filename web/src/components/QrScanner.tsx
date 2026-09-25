"use client";
import React, { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

interface Props {
  onScan: (decodedText: string) => void;
  onClose: () => void;
}

export function QrScanner({ onScan, onClose }: Props) {
  const { t } = useLanguage();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"starting" | "scanning" | "error">("starting");
  const scannerRef = useRef<any>(null);
  const mountedRef = useRef(true);
  const scannedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    scannedRef.current = false;

    let html5QrCode: any = null;

    const start = async () => {
      try {
        // Dynamically import html5-qrcode (client-side only)
        const { Html5Qrcode } = await import("html5-qrcode");

        if (!mountedRef.current) return;

        html5QrCode = new Html5Qrcode("qr-reader-element");
        scannerRef.current = html5QrCode;

        await html5QrCode.start(
          { facingMode: "environment" },
          {
            fps: 15,
            qrbox: { width: 260, height: 260 },
            aspectRatio: 1.0,
            disableFlip: false,
          },
          (decodedText: string) => {
            if (scannedRef.current || !mountedRef.current) return;
            scannedRef.current = true;
            // Stop scanner safely then call onScan
            try {
              const state = html5QrCode.getState();
              if (state === 2 || state === 3) { // SCANNING or PAUSED
                html5QrCode.stop().catch(() => {}).finally(() => {
                  onScan(decodedText);
                });
              } else {
                onScan(decodedText);
              }
            } catch (e) {
              onScan(decodedText);
            }
          },
          () => {
            // per-frame error — ignore, this fires constantly when no QR visible
          }
        );

        if (mountedRef.current) setStatus("scanning");
      } catch (err: any) {
        console.error("QR scanner error:", err);
        if (mountedRef.current) {
          setStatus("error");
          setError(err?.message || "Błąd aparatu");
        }
      }
    };

    start();

    return () => {
      mountedRef.current = false;
      stopScannerSafe();
    };
  }, [onScan]);

  const stopScannerSafe = () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState?.();
        if (state === 2 || state === 3) {
          scannerRef.current.stop().catch(() => {});
        } else {
          scannerRef.current.clear?.();
        }
      } catch (e) {
        console.warn("Ignored stop error", e);
      }
    }
  };

  const handleClose = () => {
    stopScannerSafe();
    onClose();
  };

  // File upload fallback — sends to server-side jsQR endpoint
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus("starting");
    setError(null);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const resp = await fetch("/api/decode-qr", { method: "POST", body: formData });
      if (resp.ok) {
        const json = await resp.json();
        if (json.data) {
          scannedRef.current = true;
          stopScannerSafe();
          onScan(json.data);
          return;
        }
      }
      setError(t("charger", "scanError", "Nie udało się odczytać kodu QR ze zdjęcia."));
      setStatus("scanning");
    } catch (err: any) {
      setError(err?.message || "Błąd");
      setStatus("error");
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 99999,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.92)", backdropFilter: "blur(8px)"
    }}>
      <div style={{
        width: "min(420px, 95vw)",
        background: "#0f172a",
        borderRadius: "20px",
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 25px 60px rgba(0,0,0,0.8)"
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: "linear-gradient(135deg,#ea580c,#dc2626)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18
            }}>📷</div>
            <div>
              <h3 style={{ margin: 0, color: "#fff", fontSize: "14px", fontWeight: 900, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                {t("cables", "scanQrTitle", "Skaner QR")}
              </h3>
              <p style={{ margin: 0, color: "#64748b", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                {status === "starting" ? "Uruchamianie..." : status === "scanning" ? "Nakieruj aparat na kod QR" : "Błąd"}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            style={{
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
              color: "#94a3b8", fontSize: "18px", cursor: "pointer",
              width: 36, height: 36, borderRadius: 10, display: "flex",
              alignItems: "center", justifyContent: "center", flexShrink: 0
            }}
          >✕</button>
        </div>

        {/* Scanner viewport */}
        <div style={{ position: "relative", borderRadius: "14px", overflow: "hidden", background: "#000" }}>
          {/* The html5-qrcode library renders its video into this div */}
          <div
            id="qr-reader-element"
            style={{ width: "100%", minHeight: "300px" }}
          />

          {/* Corner frame overlay */}
          {status === "scanning" && (
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
              {/* Top-left */}
              <div style={{ position: "absolute", top: "20%", left: "12%", width: 40, height: 40, borderTop: "3px solid #ea580c", borderLeft: "3px solid #ea580c", borderRadius: "4px 0 0 0" }} />
              {/* Top-right */}
              <div style={{ position: "absolute", top: "20%", right: "12%", width: 40, height: 40, borderTop: "3px solid #ea580c", borderRight: "3px solid #ea580c", borderRadius: "0 4px 0 0" }} />
              {/* Bottom-left */}
              <div style={{ position: "absolute", bottom: "20%", left: "12%", width: 40, height: 40, borderBottom: "3px solid #ea580c", borderLeft: "3px solid #ea580c", borderRadius: "0 0 0 4px" }} />
              {/* Bottom-right */}
              <div style={{ position: "absolute", bottom: "20%", right: "12%", width: 40, height: 40, borderBottom: "3px solid #ea580c", borderRight: "3px solid #ea580c", borderRadius: "0 0 4px 0" }} />
              {/* Scan line animation */}
              <div style={{
                position: "absolute", left: "12%", right: "12%",
                height: "2px", background: "linear-gradient(90deg,transparent,#ea580c,transparent)",
                animation: "scanline 2s ease-in-out infinite",
                top: "50%"
              }} />
            </div>
          )}

          {/* Loading spinner */}
          {status === "starting" && (
            <div style={{
              position: "absolute", inset: 0, display: "flex",
              flexDirection: "column", alignItems: "center", justifyContent: "center",
              background: "#000", gap: 12, minHeight: 300
            }}>
              <div style={{
                width: 40, height: 40, border: "3px solid rgba(234,88,12,0.2)",
                borderTop: "3px solid #ea580c", borderRadius: "50%",
                animation: "spin 0.8s linear infinite"
              }} />
              <p style={{ color: "#64748b", fontSize: 12, margin: 0, fontWeight: 700 }}>Uruchamianie kamery...</p>
            </div>
          )}
        </div>

        {/* Error message */}
        {error && (
          <div style={{
            background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: 10, padding: "10px 14px",
            color: "#f87171", fontSize: 12, fontWeight: 700
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* File upload fallback */}
        <label style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          padding: "12px 16px",
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 12, fontSize: 12, fontWeight: 800,
          color: "#94a3b8", cursor: "pointer", textTransform: "uppercase",
          letterSpacing: "0.08em", transition: "all 0.2s"
        }}>
          <span>🖼️</span> Wybierz zdjęcie z galerii
          <input
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleFileUpload}
          />
        </label>

        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes scanline {
            0%, 100% { top: 22%; opacity: 0.8; }
            50% { top: 78%; opacity: 1; }
          }
          /* Fix html5-qrcode internal styles for dark mode */
          #qr-reader-element { border: none !important; }
          #qr-reader-element video { border-radius: 0 !important; }
          #qr-reader-element img { display: none !important; }
          #qr-reader-element button { display: none !important; }
          #qr-reader-element select { display: none !important; }
          #qr-reader-element #qr-reader__dashboard { display: none !important; }
          #qr-reader-element #qr-reader__status_span { display: none !important; }
        `}</style>
      </div>
    </div>
  );
}
