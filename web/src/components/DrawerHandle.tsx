import React from "react";

export function DrawerHandle({ onClick, isOpen }: { onClick: () => void; isOpen: boolean }) {
  return (
    <button
      aria-label={isOpen ? "Zwiń panel" : "Rozwiń panel"}
      onClick={onClick}
      style={{
        position: "absolute",
        left: -36,
        top: 40,
        width: 32,
        height: 64,
        borderRadius: "0 16px 16px 0",
        background: "#fff",
        border: "1px solid #ddd",
        boxShadow: "0 2px 8px rgba(0,0,0,0.10)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
        cursor: "pointer",
        padding: 0,
      }}
    >
      <span style={{ fontSize: 28, color: "#2F6BFF", fontWeight: 900, lineHeight: 1 }}>
        {isOpen ? "→" : "←"}
      </span>
    </button>
  );
}
