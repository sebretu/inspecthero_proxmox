"use client";

import React from "react";
import {
  X,
  Download,
  Eye,
  FileText,
  Building2,
  MapPin,
  Camera,
  ShieldCheck,
  UserCheck,
  CheckCircle2,
  Clock,
  AlertCircle,
  SlidersHorizontal,
} from "lucide-react";
import {
  MaengelanzeigeDocument,
  MaengelanzeigeItem,
  ReportConfig,
} from "@/types/maengelanzeige";
import PhotoLightbox from "@/components/PhotoLightbox";

interface ReportPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: MaengelanzeigeDocument | null;
  projectName: string;
  projectAddress?: string | null;
  items: MaengelanzeigeItem[];
  globalConfig: ReportConfig;
  onOpenConfig: () => void;
  onDownloadPdf: (customTitle?: string) => void;
  exportingPdf: boolean;
}

export function ReportPreviewModal({
  isOpen,
  onClose,
  document,
  projectName,
  projectAddress,
  items,
  globalConfig,
  onOpenConfig,
  onDownloadPdf,
  exportingPdf,
}: ReportPreviewModalProps) {
  const [lightboxUrl, setLightboxUrl] = React.useState<string | null>(null);
  const [reportTitle, setReportTitle] = React.useState<string>("");

  React.useEffect(() => {
    if (document) {
      setReportTitle(globalConfig.customReportName || document.title || "");
    }
  }, [document, globalConfig.customReportName]);

  if (!isOpen || !document) return null;

  // Filter items that are included in the report and match status filter
  const includedStatuses = globalConfig.includedStatuses || ["OPEN", "IN_PROGRESS", "ZU_KLAEREN", "DONE"];
  const selectedItems = items.filter(
    (i) =>
      (i.is_selected === true || i.is_selected === undefined) &&
      includedStatuses.includes(i.status as any)
  );

  return (
    <div className="fixed inset-0 z-[100020] bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-ui-card border border-ui-border rounded-3xl w-full max-w-4xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-ui-border flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-ui-accent/20 border border-ui-accent/40 flex items-center justify-center text-ui-accent">
              <Eye className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-ui-text uppercase tracking-wide flex items-center gap-2">
                Bericht-Vorschau
                <span className="text-xs font-bold text-ui-accent bg-ui-accent/20 px-2.5 py-0.5 rounded-lg border border-ui-accent/30">
                  {selectedItems.length} Mängel
                </span>
              </h2>
              <p className="text-xs text-ui-muted font-medium">
                {reportTitle || document.title} • {projectName}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-ui-muted hover:text-ui-text hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Preview Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-grow bg-slate-950/40">
          {/* Editable Report Name / Filename Input */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-ui-card border border-ui-border shadow-md flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-2 text-xs font-bold text-ui-text whitespace-nowrap">
              <FileText className="w-4 h-4 text-ui-accent" />
              <span>Name des Berichts (Dateiname):</span>
            </div>
            <input
              type="text"
              value={reportTitle}
              onChange={(e) => setReportTitle(e.target.value)}
              placeholder={document.title}
              className="flex-1 px-3.5 py-2 rounded-xl bg-ui-bg border border-ui-border text-xs sm:text-sm font-bold text-ui-text placeholder:text-ui-muted/50 focus:outline-none focus:border-ui-accent transition-colors"
            />
          </div>

          {/* Report Paper Header Simulation */}
          <div className="p-4 sm:p-5 rounded-2xl bg-ui-card border border-ui-border shadow-md space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-ui-border/60">
              <div>
                <h3 className="text-sm sm:text-base font-black text-ui-text">
                  Mängelanzeige – Dokumentationsbericht
                </h3>
                <p className="text-xs text-ui-accent font-bold mt-0.5">{reportTitle || document.title}</p>
              </div>
              <div className="text-left sm:text-right text-xs text-ui-muted">
                <div>Datum: <span className="font-bold text-ui-text">{new Date().toLocaleDateString("de-DE")}</span></div>
                <div>Projekt: <span className="font-bold text-ui-text">{projectName}</span></div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <div className="p-2 rounded-xl bg-white/5 border border-white/5">
                <span className="text-[10px] text-ui-muted uppercase block font-bold">Mängel Gesamt</span>
                <span className="font-black text-ui-text text-sm">{selectedItems.length}</span>
              </div>
              <div className="p-2 rounded-xl bg-white/5 border border-white/5">
                <span className="text-[10px] text-ui-muted uppercase block font-bold">Erledigt</span>
                <span className="font-black text-emerald-400 text-sm">
                  {selectedItems.filter((i) => i.status === "DONE").length}
                </span>
              </div>
              <div className="p-2 rounded-xl bg-white/5 border border-white/5 col-span-2 sm:col-span-1">
                <span className="text-[10px] text-ui-muted uppercase block font-bold">In Bearbeitung / Offen</span>
                <span className="font-black text-blue-400 text-sm">
                  {selectedItems.filter((i) => i.status !== "DONE").length}
                </span>
              </div>
            </div>
          </div>

          {/* Cards List in Report */}
          {selectedItems.length === 0 ? (
            <div className="p-12 text-center bg-ui-card border border-ui-border rounded-2xl">
              <p className="text-xs text-ui-muted">Keine Mängel für den Bericht ausgewählt.</p>
            </div>
          ) : (
            selectedItems.map((item, index) => {
              // Resolve effective config (item custom override fallback to global)
              const cfg = item.custom_report_config || globalConfig;
              const isCustom = !!item.custom_report_config;

              const photos = item.photos || [];
              const filteredPhotos = photos.filter((p) => {
                const isBefore =
                  p.photo_type === "BEFORE" ||
                  (p.photo_type as any) === "VORHER" ||
                  p.caption?.startsWith("[VORHER]");
                if (isBefore && !cfg.includeBeforePhotos) return false;
                if (!isBefore && !cfg.includeAfterPhotos) return false;
                return true;
              });

              return (
                <div
                  key={item.id}
                  className="p-4 sm:p-5 rounded-2xl bg-ui-card border border-ui-border/80 shadow-sm space-y-3"
                >
                  {/* Card Header */}
                  <div className="flex items-center justify-between pb-2 border-b border-ui-border/40">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-lg bg-ui-accent/20 border border-ui-accent/40 text-ui-accent font-black text-xs">
                        Punkt {item.item_number || `${index + 1}`}
                      </span>
                      <span className="text-[11px] text-ui-muted font-medium">
                        Seite {item.page_number}
                      </span>
                      {isCustom && (
                        <span className="text-[10px] font-bold text-blue-300 bg-blue-500/20 px-2 py-0.5 rounded border border-blue-500/30">
                          Bericht: Individuell
                        </span>
                      )}
                    </div>

                    {cfg.includeStatus && (
                      <span
                        className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-md border ${
                          item.status === "DONE"
                            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                            : item.status === "IN_PROGRESS"
                            ? "bg-blue-500/20 text-blue-400 border-blue-500/40"
                            : item.status === "ZU_KLAEREN"
                            ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                            : item.status === "NOT_RELEVANT"
                            ? "bg-slate-700/50 text-slate-300 border-slate-600"
                            : "bg-amber-500/20 text-amber-400 border-amber-500/40"
                        }`}
                      >
                        {item.status === "DONE"
                          ? "Erledigt"
                          : item.status === "IN_PROGRESS"
                          ? "In Bearbeitung"
                          : item.status === "ZU_KLAEREN"
                          ? "Zu klären"
                          : item.status === "NOT_RELEVANT"
                          ? "Nicht relevant"
                          : "Offen"}
                      </span>
                    )}
                  </div>

                  {/* Trade & Location */}
                  {(cfg.includeTrade || cfg.includeLocation) && (
                    <div className="flex flex-wrap gap-2 text-xs">
                      {cfg.includeTrade && item.trade_or_company && (
                        <span className="flex items-center gap-1 font-bold text-ui-text bg-white/5 px-2.5 py-1 rounded-lg border border-white/10">
                          <Building2 className="w-3.5 h-3.5 text-ui-accent" />
                          {item.trade_or_company}
                        </span>
                      )}
                      {cfg.includeLocation && item.location && (
                        <span className="flex items-center gap-1 font-medium text-ui-muted bg-white/5 px-2.5 py-1 rounded-lg border border-white/10">
                          <MapPin className="w-3.5 h-3.5 text-amber-400" />
                          {item.location}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Original Mangel Text */}
                  {cfg.includeOriginalText && (
                    <div className="p-3 rounded-xl bg-white/[0.02] border border-ui-border text-xs text-ui-text leading-relaxed">
                      <span className="text-[10px] font-bold text-ui-muted uppercase block mb-0.5">
                        Original Mängelanzeige:
                      </span>
                      {item.original_text}
                    </div>
                  )}

                  {/* Bauleitung Comment */}
                  {cfg.includeAdminDoc && item.our_documentation && (
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
                      <span className="text-[10px] font-bold text-amber-400 uppercase block mb-0.5 flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Bauleitung / Admin:
                      </span>
                      {item.our_documentation}
                    </div>
                  )}

                  {/* Mitarbeiter Comment */}
                  {cfg.includeUserDoc && item.user_documentation && (
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300">
                      <span className="text-[10px] font-bold text-emerald-400 uppercase block mb-0.5 flex items-center gap-1">
                        <UserCheck className="w-3.5 h-3.5" />
                        Mitarbeiter-Rückmeldung:
                      </span>
                      {item.user_documentation}
                    </div>
                  )}

                  {/* Photos Grid */}
                  {filteredPhotos.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                      {filteredPhotos.map((photo) => {
                        const isBefore =
                          photo.photo_type === "BEFORE" ||
                          (photo.photo_type as any) === "VORHER" ||
                          photo.caption?.startsWith("[VORHER]");

                        return (
                          <div
                            key={photo.id}
                            onClick={() => setLightboxUrl(photo.url)}
                            className="rounded-xl border border-ui-border bg-ui-bg overflow-hidden flex flex-col cursor-pointer hover:border-ui-accent transition-all group/p shadow-sm"
                            title="Klicken für Vollbild"
                          >
                            <div className="relative h-24 bg-black/60 flex items-center justify-center overflow-hidden">
                              <img
                                src={photo.url}
                                alt="Foto Vorschau"
                                className="w-full h-full object-contain group-hover/p:scale-105 transition-transform"
                              />
                              <span
                                className={`absolute top-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase text-white ${
                                  isBefore ? "bg-blue-600" : "bg-emerald-600"
                                }`}
                              >
                                {isBefore ? "Vorher" : "Nachher"}
                              </span>
                            </div>
                            {photo.caption && (
                              <p className="text-[10px] text-ui-text/80 p-1.5 truncate">
                                {photo.caption.replace(/^\[(VORHER|NACHHER)\]\s*/, "")}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-ui-border flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white/[0.02]">
          <button
            type="button"
            onClick={onOpenConfig}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-ui-border text-xs font-bold text-ui-muted hover:text-ui-text hover:bg-white/5 transition-all"
          >
            <SlidersHorizontal className="w-4 h-4 text-ui-accent" />
            <span>Bericht-Inhalt anpassen</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl border border-ui-border text-xs font-bold text-ui-muted hover:text-ui-text hover:bg-white/5 transition-all"
            >
              Schließen
            </button>
            <button
              type="button"
              onClick={() => onDownloadPdf(reportTitle)}
              disabled={exportingPdf || selectedItems.length === 0}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-ui-accent hover:bg-ui-accent/90 text-black font-black text-xs tracking-wide transition-all shadow-lg shadow-ui-accent/20 active:scale-95 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>{exportingPdf ? "Erstelle PDF..." : "PDF jetzt herunterladen"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Fullscreen Photo Lightbox */}
      {lightboxUrl && (
        <PhotoLightbox
          url={lightboxUrl}
          onClose={() => setLightboxUrl(null)}
        />
      )}
    </div>
  );
}

export default ReportPreviewModal;
