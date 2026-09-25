"use client";
import React, { useState, useEffect, useMemo } from "react";
import {
  X,
  Sparkles,
  Check,
  Loader2,
  AlertCircle,
  ShieldCheck,
  CheckSquare,
  Square,
  Percent,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useProgressI18n } from "@/lib/project-progress/progressI18n";
import { apiGet, apiPost } from "@/lib/apiClient";
import type { ProgressTemplate } from "@repo/shared";

interface ApplyTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  subproject: string;
  onSuccess: () => Promise<void>;
}

export function ApplyTemplateModal({
  isOpen,
  onClose,
  projectId,
  subproject,
  onSuccess,
}: ApplyTemplateModalProps) {
  const { language } = useLanguage();
  const { p } = useProgressI18n();
  const [templates, setTemplates] = useState<ProgressTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [templateDetails, setTemplateDetails] = useState<ProgressTemplate | null>(null);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [normalizeWeights, setNormalizeWeights] = useState<boolean>(true);
  const [importMode, setImportMode] = useState<"replace" | "append">("replace");

  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch templates list
  useEffect(() => {
    if (!isOpen) return;
    setLoadingList(true);
    setError(null);
    apiGet<ProgressTemplate[]>("/api/progress-templates")
      .then((data) => {
        const list = data || [];
        setTemplates(list);
        if (list.length > 0 && !selectedTemplateId) {
          const multi = list.find((t) => t.name.includes("Alle Gewerke") || t.name.includes("Komplett-Ausbau"));
          setSelectedTemplateId(multi ? multi.id : list[0].id);
        }
      })
      .catch((err) => setError(err?.message || p.errorSelectTemplate))
      .finally(() => setLoadingList(false));
  }, [isOpen]);

  // Fetch details of selected template
  useEffect(() => {
    if (!selectedTemplateId) {
      setTemplateDetails(null);
      setSelectedCategoryIds([]);
      return;
    }

    setLoadingDetails(true);
    apiGet<ProgressTemplate>(`/api/progress-templates/${selectedTemplateId}`)
      .then((data) => {
        setTemplateDetails(data);
        const topCats = (data.nodes || []).filter((n) => !n.parentId);
        setSelectedCategoryIds(topCats.map((c) => c.id));
      })
      .catch((err) => {
        console.error("Error loading template details:", err);
      })
      .finally(() => setLoadingDetails(false));
  }, [selectedTemplateId]);

  const topCategories = useMemo(() => {
    if (!templateDetails?.nodes) return [];
    return templateDetails.nodes.filter((n) => !n.parentId);
  }, [templateDetails]);

  // Calculate adjusted weights for display
  const calculatedCategoryWeights = useMemo(() => {
    const selectedCats = topCategories.filter((c) => selectedCategoryIds.includes(c.id));
    const totalSelectedWeight = selectedCats.reduce((sum, c) => sum + (Number(c.weight) || 0), 0);

    const weightMap = new Map<string, number>();
    if (!normalizeWeights || totalSelectedWeight <= 0) {
      selectedCats.forEach((c) => weightMap.set(c.id, Number(c.weight) || 0));
      return weightMap;
    }

    let runningSum = 0;
    selectedCats.forEach((c, idx) => {
      if (idx === selectedCats.length - 1) {
        weightMap.set(c.id, Math.max(0, Math.round((100.0 - runningSum) * 10) / 10));
      } else {
        const adj = Math.round(((Number(c.weight) / totalSelectedWeight) * 100.0) * 10) / 10;
        runningSum += adj;
        weightMap.set(c.id, adj);
      }
    });

    return weightMap;
  }, [topCategories, selectedCategoryIds, normalizeWeights]);

  const totalCalculatedWeight = useMemo(() => {
    let sum = 0;
    calculatedCategoryWeights.forEach((w) => {
      sum += w;
    });
    return Math.round(sum * 10) / 10;
  }, [calculatedCategoryWeights]);

  if (!isOpen) return null;

  const toggleCategory = (catId: string) => {
    setSelectedCategoryIds((prev) =>
      prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId]
    );
  };

  const selectAll = () => {
    setSelectedCategoryIds(topCategories.map((c) => c.id));
  };

  const deselectAll = () => {
    setSelectedCategoryIds([]);
  };

  const handleApply = async () => {
    if (!selectedTemplateId) {
      setError(p.errorSelectTemplate);
      return;
    }

    if (selectedCategoryIds.length === 0) {
      setError(p.errorSelectAtLeastOneTrade);
      return;
    }

    setIsApplying(true);
    setError(null);
    try {
      await apiPost(`/api/projects/${projectId}/progress/apply-template`, {
        templateId: selectedTemplateId,
        subproject,
        selectedCategoryIds,
        normalizeWeights,
        mode: importMode,
      });
      await onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || p.errorSelectTemplate);
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-ui-card border border-ui-border rounded-2xl shadow-2xl overflow-hidden p-6 md:p-7 space-y-5 my-8">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-ui-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-ui-accent/15 border border-ui-accent/30 flex items-center justify-center text-ui-accent flex-shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-ui-text">
                {p.applyTemplateTitle}
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

        {/* Template List Selector */}
        {loadingList ? (
          <div className="py-10 text-center space-y-2">
            <Loader2 className="w-8 h-8 animate-spin text-ui-accent mx-auto" />
            <p className="text-xs text-ui-muted font-medium">{p.loadingTemplates}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-ui-muted uppercase tracking-wider mb-2">
                {p.step1SelectTemplate}:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                {templates.map((tpl) => {
                  const isSelected = tpl.id === selectedTemplateId;
                  return (
                    <div
                      key={tpl.id}
                      onClick={() => setSelectedTemplateId(tpl.id)}
                      className={`p-3 rounded-xl border transition cursor-pointer flex flex-col gap-1 ${
                        isSelected
                          ? "bg-ui-accent/15 border-ui-accent ring-1 ring-ui-accent/30"
                          : "bg-ui-bg/70 border-ui-border hover:bg-ui-bg"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-xs font-bold text-ui-text truncate">{tpl.name}</span>
                        {tpl.isSystem && (
                          <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded-full bg-sky-500/15 border border-sky-500/30 text-sky-400 flex items-center gap-0.5">
                            <ShieldCheck className="w-2.5 h-2.5" />
                            {p.systemTemplateBadge}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-ui-muted">
                        {p.categoriesTitle}: <b className="text-ui-text">{tpl.categoryCount || 0}</b> | Items: <b className="text-ui-text">{tpl.nodeCount || 0}</b>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Trade / Category Selection Box */}
            <div className="p-4 bg-ui-bg/60 border border-ui-border rounded-xl space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <label className="text-xs font-bold text-ui-text uppercase tracking-wider block">
                    {p.step2SelectTrades}
                  </label>
                  <p className="text-[11px] text-ui-muted">
                    {p.applyTemplateSubtitle}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="text-[11px] font-semibold text-ui-accent hover:underline"
                  >
                    {p.selectAll}
                  </button>
                  <span className="text-ui-muted">|</span>
                  <button
                    type="button"
                    onClick={deselectAll}
                    className="text-[11px] font-semibold text-ui-muted hover:underline"
                  >
                    {p.deselectAll}
                  </button>
                </div>
              </div>

              {loadingDetails ? (
                <div className="py-6 text-center">
                  <Loader2 className="w-6 h-6 animate-spin text-ui-accent mx-auto" />
                </div>
              ) : (
                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {topCategories.map((cat) => {
                    const isChecked = selectedCategoryIds.includes(cat.id);
                    const calculatedWeight = calculatedCategoryWeights.get(cat.id) || 0;
                    return (
                      <div
                        key={cat.id}
                        onClick={() => toggleCategory(cat.id)}
                        className={`flex items-center justify-between p-2.5 rounded-lg border transition cursor-pointer ${
                          isChecked
                            ? "bg-ui-accent/10 border-ui-accent/50 text-ui-text"
                            : "bg-white/5 border-ui-border/50 text-ui-muted hover:bg-white/10"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-ui-accent flex-shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-ui-muted flex-shrink-0" />
                          )}
                          <span className="text-xs font-bold">{cat.name}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          {isChecked ? (
                            <span className="font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                              {calculatedWeight}%
                            </span>
                          ) : (
                            <span className="text-ui-muted line-through font-mono text-[11px]">
                              {cat.weight}%
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Proportional Weight Adjustment Controls */}
              <div className="pt-2 border-t border-ui-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={normalizeWeights}
                    onChange={(e) => setNormalizeWeights(e.target.checked)}
                    className="w-4 h-4 rounded text-ui-accent focus:ring-ui-accent border-ui-border bg-ui-bg"
                  />
                  <span className="font-semibold text-ui-text flex items-center gap-1">
                    <Percent className="w-3.5 h-3.5 text-ui-accent" />
                    {p.normalizeToggle}
                  </span>
                </label>

                <div className="flex items-center gap-2 font-bold">
                  <span className="text-ui-muted">{p.weight}:</span>
                  <span
                    className={`font-mono px-2 py-0.5 rounded ${
                      totalCalculatedWeight === 100
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                        : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    }`}
                  >
                    {totalCalculatedWeight}%
                  </span>
                </div>
              </div>
            </div>

            {/* Import Mode: Replace vs Append */}
            <div className="flex items-center gap-4 text-xs font-semibold text-ui-muted">
              <span>{language === "pl" ? "Tryb importu:" : "Importmodus:"}</span>
              <label className="flex items-center gap-1.5 cursor-pointer text-ui-text">
                <input
                  type="radio"
                  name="importMode"
                  value="replace"
                  checked={importMode === "replace"}
                  onChange={() => setImportMode("replace")}
                  className="text-ui-accent"
                />
                <span>{p.importModeReplace}</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-ui-text">
                <input
                  type="radio"
                  name="importMode"
                  value="append"
                  checked={importMode === "append"}
                  onChange={() => setImportMode("append")}
                  className="text-ui-accent"
                />
                <span>{p.importModeAppend}</span>
              </label>
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-ui-border">
          <button
            type="button"
            onClick={onClose}
            disabled={isApplying}
            className="px-4 py-2 text-sm font-semibold text-ui-muted hover:text-ui-text rounded-xl transition hover:bg-white/5"
          >
            {p.cancel}
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={isApplying || loadingList || !selectedTemplateId || selectedCategoryIds.length === 0}
            className="flex items-center gap-2 px-6 py-2.5 bg-ui-accent text-ui-bg rounded-xl font-bold text-sm hover:opacity-90 transition shadow-lg disabled:opacity-50"
          >
            {isApplying ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            <span>{isApplying ? p.saving : p.applyTemplateBtn}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
