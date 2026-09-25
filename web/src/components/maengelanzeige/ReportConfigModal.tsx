"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  SlidersHorizontal,
  Check,
  RotateCcw,
  Sparkles,
  Layers,
  FileText,
  Camera,
  MessageSquare,
  Building2,
  MapPin,
  CheckCircle2,
  Info,
} from "lucide-react";
import {
  ReportConfig,
  ReportPreset,
  MangelStatus,
  DEFAULT_REPORT_CONFIG,
  REPORT_PRESETS,
} from "@/types/maengelanzeige";

interface ReportConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: ReportConfig;
  onSave: (newConfig: ReportConfig) => void;
  isIndividual?: boolean;
  itemNumber?: string;
  onResetToDefault?: () => void;
}

const STATUS_FILTER_OPTIONS: Array<{
  value: MangelStatus;
  label: string;
  dotColor: string;
  borderColor: string;
  badgeBg: string;
  badgeText: string;
}> = [
  { value: "OPEN", label: "Offen", dotColor: "bg-amber-400", borderColor: "border-amber-500/40", badgeBg: "bg-amber-500/20", badgeText: "text-amber-300" },
  { value: "IN_PROGRESS", label: "In Bearbeitung", dotColor: "bg-blue-400", borderColor: "border-blue-500/40", badgeBg: "bg-blue-500/20", badgeText: "text-blue-300" },
  { value: "ZU_KLAEREN", label: "Zu klären", dotColor: "bg-purple-400", borderColor: "border-purple-500/40", badgeBg: "bg-purple-500/20", badgeText: "text-purple-300" },
  { value: "DONE", label: "Erledigt", dotColor: "bg-emerald-400", borderColor: "border-emerald-500/40", badgeBg: "bg-emerald-500/20", badgeText: "text-emerald-300" },
  { value: "NOT_RELEVANT", label: "Nicht relevant", dotColor: "bg-slate-400", borderColor: "border-slate-500/40", badgeBg: "bg-slate-500/20", badgeText: "text-slate-300" },
];

export function ReportConfigModal({
  isOpen,
  onClose,
  config,
  onSave,
  isIndividual = false,
  itemNumber,
  onResetToDefault,
}: ReportConfigModalProps) {
  const [currentConfig, setCurrentConfig] = useState<ReportConfig>(config);
  const [selectedPreset, setSelectedPreset] = useState<ReportPreset>("CUSTOM");

  useEffect(() => {
    if (isOpen) {
      setCurrentConfig(config);
      detectMatchingPreset(config);
    }
  }, [isOpen, config]);

  const detectMatchingPreset = (cfg: ReportConfig) => {
    const keys: (keyof ReportConfig)[] = [
      "includeOriginalText",
      "includeStatus",
      "includeTrade",
      "includeCompany",
      "includeLocation",
      "includeRoom",
      "includeBeforePhotos",
      "includeAfterPhotos",
      "includeAdminDoc",
      "includeUserDoc",
    ];

    for (const presetKey of ["FULL", "MANGEL_STATUS", "MANGEL_PHOTOS", "MANGEL_COMMENTS"] as ReportPreset[]) {
      const pCfg = REPORT_PRESETS[presetKey].config;
      const match = keys.every((k) => cfg[k] === pCfg[k]);
      if (match) {
        setSelectedPreset(presetKey);
        return;
      }
    }
    setSelectedPreset("CUSTOM");
  };

  if (!isOpen) return null;

  const includedStatuses = currentConfig.includedStatuses || ["OPEN", "IN_PROGRESS", "ZU_KLAEREN", "DONE"];

  const handleApplyPreset = (presetKey: ReportPreset) => {
    setSelectedPreset(presetKey);
    if (presetKey !== "CUSTOM") {
      setCurrentConfig(REPORT_PRESETS[presetKey].config);
    }
  };

  const handleToggle = (key: keyof ReportConfig) => {
    const updated = { ...currentConfig, [key]: !currentConfig[key] };
    setCurrentConfig(updated);
    detectMatchingPreset(updated);
  };

  const handleToggleStatus = (statusVal: MangelStatus) => {
    let updated: MangelStatus[];
    if (includedStatuses.includes(statusVal)) {
      if (includedStatuses.length <= 1) return; // Keep at least one
      updated = includedStatuses.filter((s) => s !== statusVal);
    } else {
      updated = [...includedStatuses, statusVal];
    }
    const newCfg = { ...currentConfig, includedStatuses: updated };
    setCurrentConfig(newCfg);
    setSelectedPreset("CUSTOM");
  };

  const handleSetQuickStatusFilter = (type: "ONLY_OPEN" | "OPEN_AND_PROGRESS" | "ALL_ACTIVE" | "ALL") => {
    let updated: MangelStatus[];
    if (type === "ONLY_OPEN") {
      updated = ["OPEN"];
    } else if (type === "OPEN_AND_PROGRESS") {
      updated = ["OPEN", "IN_PROGRESS", "ZU_KLAEREN"];
    } else if (type === "ALL_ACTIVE") {
      updated = ["OPEN", "IN_PROGRESS", "ZU_KLAEREN", "DONE"];
    } else {
      updated = ["OPEN", "IN_PROGRESS", "ZU_KLAEREN", "DONE", "NOT_RELEVANT"];
    }
    const newCfg = { ...currentConfig, includedStatuses: updated };
    setCurrentConfig(newCfg);
    setSelectedPreset("CUSTOM");
  };

  const handleResetToStandard = () => {
    if (isIndividual && onResetToDefault) {
      onResetToDefault();
      onClose();
      return;
    }
    setCurrentConfig(DEFAULT_REPORT_CONFIG);
    setSelectedPreset("FULL");
  };

  const handleSave = () => {
    onSave(currentConfig);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100020] bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-ui-card border border-ui-border rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-ui-border flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-ui-accent/20 border border-ui-accent/40 flex items-center justify-center text-ui-accent">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-ui-text uppercase tracking-wide">
                {isIndividual && itemNumber
                  ? `Mangel ${itemNumber} – Bericht-Inhalt`
                  : "Bericht-Inhalt konfigurieren"}
              </h2>
              <p className="text-xs text-ui-muted font-medium">
                {isIndividual
                  ? "Individuelle Ausnahme für diesen Mangel"
                  : "Globale Standard-Einstellungen für alle Mängel im Bericht"}
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

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-grow">
          {/* 1. Status Filter für Bericht Export (Nur im globalen Modus) */}
          {!isIndividual && (
            <div className="p-4 rounded-2xl bg-ui-accent/[0.04] border border-ui-accent/30 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-ui-accent">
                  <CheckCircle2 className="w-4 h-4 text-ui-accent" />
                  <span>Status-Filter für PDF-Export</span>
                </div>

                {/* Quick select buttons */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleSetQuickStatusFilter("ONLY_OPEN")}
                    className="px-2 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-bold hover:bg-amber-500/25 transition-colors"
                  >
                    🔴 Nur Offen
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetQuickStatusFilter("OPEN_AND_PROGRESS")}
                    className="px-2 py-1 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-300 text-[10px] font-bold hover:bg-blue-500/25 transition-colors"
                  >
                    Offen & Bearbeitung
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetQuickStatusFilter("ALL_ACTIVE")}
                    className="px-2 py-1 rounded-lg bg-white/5 border border-ui-border text-ui-muted text-[10px] font-bold hover:text-ui-text transition-colors"
                  >
                    Alle aktiven
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetQuickStatusFilter("ALL")}
                    className="px-2 py-1 rounded-lg bg-white/5 border border-ui-border text-ui-muted text-[10px] font-bold hover:text-ui-text transition-colors"
                  >
                    Alle
                  </button>
                </div>
              </div>

              <p className="text-[11px] text-ui-muted">
                Wählen Sie, welche Mängel je nach Status in das Dokument aufgenommen werden:
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                {STATUS_FILTER_OPTIONS.map((st) => {
                  const isChecked = includedStatuses.includes(st.value);
                  return (
                    <label
                      key={st.value}
                      onClick={() => handleToggleStatus(st.value)}
                      className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer select-none transition-all ${
                        isChecked
                          ? `${st.badgeBg} ${st.borderColor} ${st.badgeText} ring-1 ring-white/10 font-bold shadow-sm`
                          : "bg-white/[0.01] border-ui-border text-ui-muted/50 hover:bg-white/5"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}} // handled by label onClick
                        className="w-4 h-4 rounded text-ui-accent focus:ring-ui-accent cursor-pointer"
                      />
                      <span className={`w-2.5 h-2.5 rounded-full ${st.dotColor} flex-shrink-0`} />
                      <span className="text-xs truncate">{st.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2. Bericht-Name / Dateiname */}
          {!isIndividual && (
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-ui-border space-y-2">
              <label className="text-xs font-black uppercase tracking-wider text-ui-text flex items-center gap-2">
                <FileText className="w-4 h-4 text-ui-accent" />
                <span>Name des Berichts / Dateiname</span>
              </label>
              <input
                type="text"
                value={currentConfig.customReportName || ""}
                onChange={(e) => setCurrentConfig({ ...currentConfig, customReportName: e.target.value })}
                placeholder="z.B. Mängelanzeige Dokumentation (leer lassen für Standard)"
                className="w-full px-3.5 py-2.5 rounded-xl bg-ui-bg border border-ui-border text-xs sm:text-sm text-ui-text placeholder:text-ui-muted/50 focus:outline-none focus:border-ui-accent transition-colors font-medium"
              />
              <p className="text-[10px] text-ui-muted">
                Wird als Titel auf dem Deckblatt und als Dateiname beim PDF-Download verwendet.
              </p>
            </div>
          )}

          {/* 3. Vorlagen / Presets */}
          <div className="space-y-2.5">
            <label className="text-xs font-black uppercase tracking-wider text-ui-muted flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-ui-accent" />
              Vorlage / Preset auswählen
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(Object.keys(REPORT_PRESETS) as ReportPreset[]).map((pKey) => {
                const preset = REPORT_PRESETS[pKey];
                const active = selectedPreset === pKey;
                return (
                  <button
                    key={pKey}
                    type="button"
                    onClick={() => handleApplyPreset(pKey)}
                    className={`p-2.5 rounded-2xl border text-left transition-all ${
                      active
                        ? "bg-ui-accent/15 border-ui-accent text-ui-accent ring-1 ring-ui-accent/40 font-bold"
                        : "bg-white/[0.02] border-ui-border text-ui-muted hover:text-ui-text hover:bg-white/5"
                    }`}
                  >
                    <div className="text-xs font-black truncate">{preset.name}</div>
                    <div className="text-[10px] text-ui-muted/80 line-clamp-1 mt-0.5 font-normal">
                      {preset.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Checkboxes Group: MANGEL */}
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-ui-border space-y-3">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-ui-text">
              <FileText className="w-4 h-4 text-ui-accent" />
              <span>Mangel</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-ui-bg border border-ui-border cursor-pointer hover:border-ui-accent/40 transition-colors">
                <input
                  type="checkbox"
                  checked={currentConfig.includeOriginalText}
                  onChange={() => handleToggle("includeOriginalText")}
                  className="w-4 h-4 rounded text-ui-accent focus:ring-ui-accent cursor-pointer"
                />
                <span className="text-xs font-bold text-ui-text">Original Mangel</span>
              </label>

              <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-ui-bg border border-ui-border cursor-pointer hover:border-ui-accent/40 transition-colors">
                <input
                  type="checkbox"
                  checked={currentConfig.includeStatus}
                  onChange={() => handleToggle("includeStatus")}
                  className="w-4 h-4 rounded text-ui-accent focus:ring-ui-accent cursor-pointer"
                />
                <span className="text-xs font-bold text-ui-text">Status</span>
              </label>

              <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-ui-bg border border-ui-border cursor-pointer hover:border-ui-accent/40 transition-colors">
                <input
                  type="checkbox"
                  checked={currentConfig.includeTrade}
                  onChange={() => handleToggle("includeTrade")}
                  className="w-4 h-4 rounded text-ui-accent focus:ring-ui-accent cursor-pointer"
                />
                <span className="text-xs font-bold text-ui-text">Gewerk</span>
              </label>

              <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-ui-bg border border-ui-border cursor-pointer hover:border-ui-accent/40 transition-colors">
                <input
                  type="checkbox"
                  checked={currentConfig.includeCompany}
                  onChange={() => handleToggle("includeCompany")}
                  className="w-4 h-4 rounded text-ui-accent focus:ring-ui-accent cursor-pointer"
                />
                <span className="text-xs font-bold text-ui-text">Firma</span>
              </label>

              <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-ui-bg border border-ui-border cursor-pointer hover:border-ui-accent/40 transition-colors">
                <input
                  type="checkbox"
                  checked={currentConfig.includeLocation}
                  onChange={() => handleToggle("includeLocation")}
                  className="w-4 h-4 rounded text-ui-accent focus:ring-ui-accent cursor-pointer"
                />
                <span className="text-xs font-bold text-ui-text">Ort</span>
              </label>

              <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-ui-bg border border-ui-border cursor-pointer hover:border-ui-accent/40 transition-colors">
                <input
                  type="checkbox"
                  checked={currentConfig.includeRoom}
                  onChange={() => handleToggle("includeRoom")}
                  className="w-4 h-4 rounded text-ui-accent focus:ring-ui-accent cursor-pointer"
                />
                <span className="text-xs font-bold text-ui-text">Raum</span>
              </label>
            </div>
          </div>

          {/* 3. Checkboxes Group: FOTOS */}
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-ui-border space-y-3">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-ui-text">
              <Camera className="w-4 h-4 text-blue-400" />
              <span>Fotos</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-ui-bg border border-ui-border cursor-pointer hover:border-blue-500/40 transition-colors">
                <input
                  type="checkbox"
                  checked={currentConfig.includeBeforePhotos}
                  onChange={() => handleToggle("includeBeforePhotos")}
                  className="w-4 h-4 rounded text-blue-500 focus:ring-blue-500 cursor-pointer"
                />
                <span className="text-xs font-bold text-ui-text">📸 Vorher-Fotos</span>
              </label>

              <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-ui-bg border border-ui-border cursor-pointer hover:border-emerald-500/40 transition-colors">
                <input
                  type="checkbox"
                  checked={currentConfig.includeAfterPhotos}
                  onChange={() => handleToggle("includeAfterPhotos")}
                  className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                />
                <span className="text-xs font-bold text-ui-text">📸 Nachher-Fotos</span>
              </label>
            </div>

            {/* Original Links */}
            <div className="pt-2 border-t border-ui-border/50">
              <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-blue-500/[0.06] border border-blue-500/30 cursor-pointer hover:border-blue-500/50 transition-colors">
                <input
                  type="checkbox"
                  checked={currentConfig.includeHdPhotoLinks !== false}
                  onChange={() =>
                    setCurrentConfig({
                      ...currentConfig,
                      includeHdPhotoLinks: currentConfig.includeHdPhotoLinks === false ? true : false,
                    })
                  }
                  className="w-4 h-4 rounded text-blue-500 focus:ring-blue-500 cursor-pointer"
                />
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-blue-300">
                    🔗 Link zum Originalbild (in voller Größe) unter dem Foto anzeigen
                  </span>
                  <span className="text-[10px] text-ui-muted">
                    Ermöglicht das Anklicken des Fotos im PDF, um das Original in voller Größe direkt im Browser zu öffnen.
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* 4. Checkboxes Group: KOMMENTARE */}
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-ui-border space-y-3">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-ui-text">
              <MessageSquare className="w-4 h-4 text-amber-400" />
              <span>Kommentare</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-ui-bg border border-ui-border cursor-pointer hover:border-amber-500/40 transition-colors">
                <input
                  type="checkbox"
                  checked={currentConfig.includeAdminDoc}
                  onChange={() => handleToggle("includeAdminDoc")}
                  className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 cursor-pointer"
                />
                <span className="text-xs font-bold text-ui-text">📋 Bauleitung / Admin</span>
              </label>

              <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-ui-bg border border-ui-border cursor-pointer hover:border-emerald-500/40 transition-colors">
                <input
                  type="checkbox"
                  checked={currentConfig.includeUserDoc}
                  onChange={() => handleToggle("includeUserDoc")}
                  className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                />
                <span className="text-xs font-bold text-ui-text">✍ Mitarbeiter / User</span>
              </label>
            </div>
          </div>

          {/* Info Banner */}
          <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-ui-accent/10 border border-ui-accent/20 text-xs text-ui-text">
            <Info className="w-4 h-4 text-ui-accent flex-shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              {isIndividual
                ? "Diese individuellen Einstellungen überschreiben für diesen Mangel die Standard-Bericht-Konfiguration."
                : "Diese Einstellungen gelten standardmäßig für alle Mängel in diesem Bericht."}
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-ui-border flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white/[0.02]">
          <button
            type="button"
            onClick={handleResetToStandard}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-ui-border text-xs font-bold text-ui-muted hover:text-ui-text hover:bg-white/5 transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Auf Standard zurücksetzen</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl border border-ui-border text-xs font-bold text-ui-muted hover:text-ui-text hover:bg-white/5 transition-all"
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-6 py-2.5 rounded-xl bg-ui-accent hover:bg-ui-accent/90 text-black font-black text-xs transition-all shadow-lg shadow-ui-accent/20 active:scale-95"
            >
              <Check className="w-4 h-4" />
              <span>Speichern</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ReportConfigModal;
