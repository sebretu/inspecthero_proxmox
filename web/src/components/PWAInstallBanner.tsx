"use client";

import { usePWA } from "@/hooks/usePWA";

export function PWAInstallBanner() {
  const { canInstall, installApp, isOnline } = usePWA();

  return (
    <>
      {!isOnline && (
        <div
          style={{
            background: "#ff9800",
            color: "white",
            padding: "12px 16px",
            textAlign: "center",
            fontSize: "14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
          }}
        >
          📴 Jesteś offline - niektóre funkcje mogą być niedostępne
        </div>
      )}

      {canInstall && (
        <div
          style={{
            background: "#667eea",
            color: "white",
            padding: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            fontSize: "14px",
          }}
        >
          <span>📱 Zainstaluj aplikację, aby używać offline</span>
          <button
            onClick={installApp}
            style={{
              background: "white",
              color: "#667eea",
              border: "none",
              padding: "8px 16px",
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: "bold",
              fontSize: "14px",
            }}
          >
            Zainstaluj
          </button>
        </div>
      )}
    </>
  );
}
