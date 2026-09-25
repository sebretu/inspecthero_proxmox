"use client";

import React, { useEffect } from "react";
import dynamic from "next/dynamic";
import { X, ZoomIn, ZoomOut, RotateCcw, ExternalLink } from "lucide-react";

const AufmassCanvas = dynamic(() => import("@/components/aufmass/AufmassCanvas"), {
  ssr: false,
});

import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

interface PhotoLightboxProps {
  url: string | null;
  onClose: () => void;
  title?: string | null;
  shapes?: any[] | null;
  description?: string | null;
  author?: string | null;
  createdAt?: string | null;
}

/**
 * Reusable Photo Lightbox Component
 * Supports mobile pinch-to-zoom, double-tap, pan, and desktop wheel zoom.
 * Guaranteed to be on top of all modals (z-[200000]) with a fixed, high-contrast close button.
 */
export default function PhotoLightbox({ url, onClose, title, shapes, description, author, createdAt }: PhotoLightboxProps) {
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

  // Handle ESC key to close
  useEffect(() => {
    if (!url) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [url, onClose]);

  if (!url) return null;

  return (
    <div
      className="fixed inset-0 z-[200000] bg-black/95 backdrop-blur-lg flex items-center justify-center p-2 sm:p-4 md:p-6 animate-in fade-in duration-200 select-none"
      onClick={onClose}
    >
      {/* High-visibility Fixed Close button in top-right corner */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="fixed top-3 right-3 sm:top-5 sm:right-5 z-[200020] flex items-center gap-2 px-4 py-2.5 sm:px-5 sm:py-3 rounded-2xl bg-red-600 hover:bg-red-500 active:scale-95 text-white font-black text-xs sm:text-sm shadow-2xl transition-all cursor-pointer border-2 border-white/40 group"
        aria-label="Schließen"
        title="Schließen (Esc)"
      >
        <X className="w-5 h-5 stroke-[3] group-hover:rotate-90 transition-transform" />
        <span>Schließen ✕</span>
      </button>

      <div
        className="relative flex flex-col items-center justify-center w-full h-full max-w-7xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {shapes && shapes.length > 0 ? (
          <div className="w-full h-[85vh] rounded-xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] relative">
            <AufmassCanvas
              imageUrl={url}
              shapes={shapes}
              readOnly={true}
            />
          </div>
        ) : (
          <div className="relative w-full flex-1 flex items-center justify-center overflow-hidden min-h-0">
            <TransformWrapper
              initialScale={1}
              minScale={0.8}
              maxScale={8}
              centerOnInit={true}
              doubleClick={{ mode: "zoomIn", step: 1.5 }}
              pinch={{ step: 5 }}
              wheel={{ step: 0.2 }}
            >
              {({ zoomIn, zoomOut, resetTransform }) => (
                <>
                  {/* Floating zoom control buttons */}
                  <div className="fixed top-3 left-3 sm:top-5 sm:left-5 z-[200020] flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-md border border-white/25 rounded-2xl p-1 shadow-2xl">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        zoomIn();
                      }}
                      className="p-2 rounded-xl bg-white/10 hover:bg-white/25 text-white font-bold text-xs flex items-center justify-center transition-all active:scale-95"
                      title="Vergrößern (+)"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        zoomOut();
                      }}
                      className="p-2 rounded-xl bg-white/10 hover:bg-white/25 text-white font-bold text-xs flex items-center justify-center transition-all active:scale-95"
                      title="Verkleinern (-)"
                    >
                      <ZoomOut className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                       onClick={(e) => {
                         e.stopPropagation();
                         resetTransform();
                       }}
                       className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/25 text-white text-xs font-bold transition-all active:scale-95"
                       title="Originalgröße (100%)"
                     >
                       <RotateCcw className="w-3.5 h-3.5" />
                       <span>100%</span>
                     </button>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-blue-600/80 hover:bg-blue-500 text-white text-xs font-bold transition-all active:scale-95 no-underline"
                      title="Originalbild in neuem Fenster / Tab öffnen"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Neues Fenster</span>
                    </a>
                  </div>

                  <TransformComponent
                    wrapperStyle={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      touchAction: "none",
                    }}
                    contentStyle={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <img
                      src={url}
                      alt={description || "Foto Vorschau"}
                      style={{
                        maxWidth: "96vw",
                        maxHeight: description || author ? "74vh" : "86vh",
                        objectFit: "contain",
                      }}
                      className="rounded-xl shadow-[0_0_60px_rgba(0,0,0,0.9)] transition-shadow select-none cursor-grab active:cursor-grabbing max-h-full max-w-full"
                    />
                  </TransformComponent>
                </>
              )}
            </TransformWrapper>
          </div>
        )}

        {(title || description || author || createdAt) && (
          <div className="mt-2 bg-slate-900/95 border border-white/20 text-white rounded-2xl px-6 py-3 max-w-2xl text-center shadow-2xl backdrop-blur-md z-20 animate-fade-in">
            {title && (
              <h3 className="text-sm sm:text-base font-black text-amber-400 uppercase tracking-wider mb-1">
                {title}
              </h3>
            )}
            {description && <p className="text-xs sm:text-sm font-bold text-slate-100 mb-0.5">{description}</p>}
            <div className="text-[11px] text-slate-400 flex items-center justify-center gap-3 mt-0.5">
              {author && <span>👤 {author}</span>}
              {createdAt && <span>📅 {new Date(createdAt).toLocaleDateString()}</span>}
            </div>
          </div>
        )}

        {/* Subtle hint */}
        <div className="text-white/40 text-[10px] font-bold tracking-widest uppercase mt-1 pointer-events-none">
          Klicken zum Schließen • Zoomen mit Scrollrad / Pinch
        </div>
      </div>
    </div>
  );
}
