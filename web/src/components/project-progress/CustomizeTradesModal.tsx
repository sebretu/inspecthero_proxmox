"use client";
import React, { useState, useEffect } from "react";
import {
  X,
  Sliders,
  Check,
  Loader2,
  Percent,
  AlertCircle,
  Plus,
  CheckSquare,
  Square,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useProgressI18n } from "@/lib/project-progress/progressI18n";
import { apiGet, apiPost } from "@/lib/apiClient";
import type { CalculatedCategory, ProgressTemplate } from "@repo/shared";

interface CustomizeTradesModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  subproject: string;
  categories: CalculatedCategory[];
  onSuccess: () => Promise<void>;
}

export function CustomizeTradesModal({
  isOpen,
  onClose,
  projectId,
  subproject,
  categories,
  onSuccess,
}: CustomizeTradesModalProps) {
  const { language } = useLanguage();
  const { p } = useProgressI18n();
  const [isNormalizing, setIsNormalizing] = useState(false);
  const [isAddingTrade, setIsAddingTrade] = useState(false);
  const [templates, setTemplates] = useState<ProgressTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [selectedTemplate, setSelectedTemplate] = useState<ProgressTemplate | null>(null);
  const [selectedCatIdsToAdd, setSelectedCatIdsToAdd] = useState<string[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Load templates list
  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setSuccessMsg(null);
    setLoadingTemplates(true);
    apiGet<ProgressTemplate[]>("/api/progress-templates")
      .then((data) => {
        const list = data || [];
        setTemplates(list);
        if (list.length > 0) {
          const multi = list.find((t) => t.name.includes("Alle Gewerke") || t.name.includes("Komplett-Ausbau"));
          const chosenId = multi ? multi.id : list[0].id;
          setSelectedTemplateId(chosenId);
        }
      })
      .catch((err) => {
        console.error("Failed to load templates for trade manager:", err);
        setError(p.loadingTemplates);
      })
      .finally(() => setLoadingTemplates(false));
  }, [isOpen]);

  // Load template details when selectedTemplateId changes
  useEffect(() => {
    if (!selectedTemplateId) {
      setSelectedTemplate(null);
      return;
    }
    setLoadingDetails(true);
    apiGet<ProgressTemplate>(`/api/progress-templates/${selectedTemplateId}`)
      .then((full) => {
        setSelectedTemplate(full);
        setSelectedCatIdsToAdd([]);
      })
      .catch((err) => {
        console.error("Error loading template details:", err);
        setError(p.loadingTemplates);
      })
      .finally(() => setLoadingDetails(false));
  }, [selectedTemplateId]);

  if (!isOpen) return null;

  const totalCurrentWeight = Math.round(
    categories.reduce((sum, c) => sum + (Number(c.weight) || 0), 0) * 10
  ) / 10;

  const handleNormalize = async () => {
    setIsNormalizing(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await apiPost(`/api/projects/${projectId}/progress/normalize-weights`, {
        subproject,
      });
      setSuccessMsg(language === "pl" ? "Pomyślnie wyrównano wagi do 100%!" : "Gewichtungen erfolgreich auf 100% normiert!");
      await onSuccess();
    } catch (err: any) {
      setError(err?.message || "Fehler beim Normieren der Gewichte.");
    } finally {
      setIsNormalizing(false);
    }
  };

  const handleAddSelectedTrades = async () => {
    if (!selectedTemplate || selectedCatIdsToAdd.length === 0) {
      setError(p.errorSelectAtLeastOneTrade);
      return;
    }
    setIsAddingTrade(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await apiPost(`/api/projects/${projectId}/progress/apply-template`, {
        templateId: selectedTemplate.id,
        subproject,
        selectedCategoryIds: selectedCatIdsToAdd,
        normalizeWeights: true,
        mode: "append",
      });
      setSuccessMsg(language === "pl" ? `Pomyślnie dodano ${selectedCatIdsToAdd.length} branż(e) i zaktualizowano wagi!` : `${selectedCatIdsToAdd.length} Gewerke hinzugefügt und Gewichte angepasst!`);
      setSelectedCatIdsToAdd([]);
      await onSuccess();
    } catch (err: any) {
      console.error("Error adding trades:", err);
      setError(err?.message || p.errorSelectAtLeastOneTrade);
    } finally {
      setIsAddingTrade(false);
    }
  };

  const templateTopCats = (selectedTemplate?.nodes || []).filter((n) => !n.parentId);
  const existingNames = new Set(categories.map((c) => c.name.toLowerCase().trim()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-ui-card border border-ui-border rounded-2xl shadow-2xl overflow-hidden p-6 md:p-7 space-y-5 my-8">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-ui-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-ui-accent/15 border border-ui-accent/30 flex items-center justify-center text-ui-accent flex-shrink-0">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-ui-text">
                {p.customizeTradesTitle}
              </h3>
              <p className="text-xs text-ui-muted">
                {p.scopeFloor}: <b className="text-ui-accent">{subproject === "General" ? "Hauptbau / General" : subproject}</b>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-ui-muted hover:text-ui-text hover:bg-white/5 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3.5 bg-red-500/15 border border-red-500/30 rounded-xl text-red-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3.5 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs flex items-center gap-2">
            <Check className="w-4 h-4 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* 1. Current Categories & Proportional Adjust Button */}
        <div className="p-4 bg-ui-bg/60 border border-ui-border rounded-xl space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="text-xs font-bold text-ui-text uppercase tracking-wider block">
                {language === "pl" ? "1. Aktualnie zainstalowane kategorie/branże:" : "1. Aktuelle Gewerke in diesem Bereich:"}
              </span>
              <p className="text-[11px] text-ui-muted">
                {p.categoriesDesc}
              </p>
            </div>
            <div className="flex items-center gap-2 font-bold text-xs">
              <span className="text-ui-muted">{p.weight}:</span>
              <span
                className={`font-mono px-2 py-0.5 rounded ${
                  totalCurrentWeight === 100
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                }`}
              >
                {totalCurrentWeight}%
              </span>
            </div>
          </div>

          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
            {categories.length === 0 ? (
              <p className="text-xs text-ui-muted italic py-2">{p.noCategoriesTitle}</p>
            ) : (
              categories.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-ui-border/50 text-xs"
                >
                  <span className="font-semibold text-ui-text">{cat.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-ui-accent bg-ui-accent/10 px-2 py-0.5 rounded">
                      {cat.weight}%
                    </span>
                    <span className="text-ui-muted text-[11px]">
                      {p.progressLabel}: <b className="text-ui-text">{Math.round(cat.progress)}%</b>
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Quick Auto-Normalize Button */}
          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={handleNormalize}
              disabled={isNormalizing || categories.length === 0}
              className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-ui-accent/20 to-emerald-500/20 border border-ui-accent/40 text-ui-text hover:border-ui-accent rounded-xl text-xs font-bold transition shadow-xs disabled:opacity-50"
            >
              {isNormalizing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-ui-accent" />
              ) : (
                <Percent className="w-3.5 h-3.5 text-emerald-400" />
              )}
              <span>{p.autoBalanceBtn}</span>
            </button>
          </div>
        </div>

        {/* 2. Add Missing Trade Scopes from Catalog */}
        <div className="p-4 bg-ui-bg/60 border border-ui-border rounded-xl space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="text-xs font-bold text-ui-text uppercase tracking-wider block">
                {p.step2SelectTrades}
              </span>
              <p className="text-[11px] text-ui-muted">
                {p.customizeTradesSubtitle}
              </p>
            </div>

            {/* Template Selector Dropdown */}
            {templates.length > 1 && (
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="bg-ui-bg border border-ui-border text-ui-text text-xs rounded-lg px-2.5 py-1.5 outline-none focus:border-ui-accent"
              >
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {loadingDetails ? (
            <div className="py-6 text-center">
              <Loader2 className="w-6 h-6 animate-spin text-ui-accent mx-auto" />
              <p className="text-xs text-ui-muted mt-1">{p.loadingTemplates}</p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {templateTopCats.map((tCat) => {
                const alreadyExists = existingNames.has(tCat.name.toLowerCase().trim());
                const isSelected = selectedCatIdsToAdd.includes(tCat.id);

                return (
                  <div
                    key={tCat.id}
                    onClick={() => {
                      if (alreadyExists) return;
                      setSelectedCatIdsToAdd((prev) =>
                        prev.includes(tCat.id) ? prev.filter((id) => id !== tCat.id) : [...prev, tCat.id]
                      );
                    }}
                    className={`flex items-center justify-between p-2.5 rounded-lg border transition ${
                      alreadyExists
                        ? "opacity-50 bg-white/5 border-ui-border/30 cursor-not-allowed"
                        : isSelected
                        ? "bg-ui-accent/15 border-ui-accent cursor-pointer ring-1 ring-ui-accent/40"
                        : "bg-white/5 border-ui-border/50 hover:bg-white/10 cursor-pointer"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      {alreadyExists ? (
                        <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      ) : isSelected ? (
                        <CheckSquare className="w-4 h-4 text-ui-accent flex-shrink-0" />
                      ) : (
                        <Square className="w-4 h-4 text-ui-muted flex-shrink-0" />
                      )}
                      <span className="text-xs font-semibold text-ui-text">{tCat.name}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {alreadyExists ? (
                        <span className="text-[10px] uppercase font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                          {language === "pl" ? "Zainstalowano" : "Vorhanden"}
                        </span>
                      ) : (
                        <span className="text-xs font-mono text-ui-muted">+{tCat.weight}%</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {selectedCatIdsToAdd.length > 0 && (
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={handleAddSelectedTrades}
                disabled={isAddingTrade}
                className="flex items-center gap-1.5 px-4 py-2 bg-ui-accent text-ui-bg rounded-xl text-xs font-bold hover:opacity-90 transition shadow-md disabled:opacity-50"
              >
                {isAddingTrade ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                <span>{language === "pl" ? `Dołącz wybrane branże (${selectedCatIdsToAdd.length}) i dostosuj wagi` : `Ausgewählte (${selectedCatIdsToAdd.length}) hinzufügen`}</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end pt-3 border-t border-ui-border">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-sm font-semibold text-ui-muted hover:text-ui-text rounded-xl transition hover:bg-white/5"
          >
            {p.close}
          </button>
        </div>
      </div>
    </div>
  );
}
