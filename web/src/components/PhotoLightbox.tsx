"use client";

import React, { useEffect } from "react";

interface PhotoLightboxProps {
  url: string | null;
  onClose: () => void;
}

/**
 * Reusable Photo Lightbox Component
 * Mimics the premium photo viewer logic from PlanMap.tsx
 */
export default function PhotoLightbox({ url, onClose }: PhotoLightboxProps) {
  // Prevent scrolling when lightbox is open
  useEffect(() => {
    if (url) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [url]);

  if (!url) return null;

  return (
    <div
      className="fixed inset-0 z-[99999] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 md:p-10 animate-in fade-in duration-300"
      onClick={onClose}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute top-6 right-6 w-12 h-12 rounded-full bg-white text-black flex items-center justify-center text-2xl font-bold shadow-2xl hover:scale-110 active:scale-95 transition-all z-10"
        aria-label="Close"
      >
        ✕
      </button>

      <div className="relative flex items-center justify-center group w-full h-full" onClick={(e) => e.stopPropagation()}>
        <img
          src={url}
          alt="Preview"
          style={{ maxWidth: "98vw", maxHeight: "90vh", objectFit: "contain" }}
          className="rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.5)] animate-in zoom-in-95 duration-300"
        />

        {/* Subtle hint that clicking background closes it */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-xs font-bold tracking-widest uppercase opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-md">
          Click outside to close
        </div>
      </div>
    </div>
  );
}
