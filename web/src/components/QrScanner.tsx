"use client";
import React, { useEffect, useState, useRef } from "react";
import { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } from "@zxing/library";
import { useLanguage } from "@/contexts/LanguageContext";

interface Props {
  onScan: (decodedText: string) => void;
  onClose: () => void;
}

export function QrScanner({ onScan, onClose }: Props) {
  const { t } = useLanguage();
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);

  useEffect(() => {
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX]);
    // Optionally we could enable TRY_HARDER but it uses more CPU. ZXing is usually good enough without it.
    hints.set(DecodeHintType.TRY_HARDER, true);

    const codeReader = new BrowserMultiFormatReader(hints);
    codeReaderRef.current = codeReader;
    
    if (videoRef.current) {
      codeReader.decodeFromConstraints(
        { video: { facingMode: "environment" } },
        videoRef.current,
        (result, err) => {
          if (result) {
            onScan(result.getText());
          }
          if (err && err.name !== "NotFoundException") {
             // Ignore background errors
          }
        }
      ).catch(err => {
        console.error("Camera error:", err);
        setError(t("cables", "cameraError", "Błąd aparatu: ") + err.message);
      });
    }

    return () => {
      if (codeReaderRef.current) {
        codeReaderRef.current.reset();
      }
    };
  }, [onScan, t]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)" }}>
      <style>
        {`
          #qr-video-container video {
            filter: contrast(120%) brightness(110%);
          }
        `}
      </style>
      <div style={{ width: "min(400px, 90vw)", background: "#1e293b", borderRadius: "16px", padding: "16px", display: "flex", flexDirection: "column", gap: "16px", border: "1px solid rgba(255,255,255,0.1)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, color: "#fff", fontSize: "16px", fontWeight: "bold" }}>{t("cables","scanQrTitle","Skaner QR")}</h3>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#888", fontSize: "20px", cursor: "pointer" }}>✕</button>
        </div>
        
        <div id="qr-video-container" style={{ width: "100%", background: "#000", borderRadius: "8px", overflow: "hidden", position: "relative", aspectRatio: "1/1" }}>
          <video 
            ref={videoRef} 
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
          {/* Viewfinder overlay */}
          <div style={{ position: "absolute", top: "15%", left: "15%", width: "70%", height: "70%", border: "2px solid rgba(255, 255, 255, 0.5)", borderRadius: "12px", boxShadow: "0 0 0 4000px rgba(0, 0, 0, 0.4)" }} />
        </div>
        
        {error && <p style={{ color: "#ef4444", fontSize: "14px", margin: 0, textAlign: "center" }}>{error}</p>}
        
        <p style={{ color: "#888", fontSize: "12px", textAlign: "center", margin: 0 }}>
          {t("cables","scanQrHint","Nakieruj aparat na kod QR wygenerowany dla bębna lub kabla.")}
        </p>
      </div>
    </div>
  );
}
