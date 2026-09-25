"use client";
import React, { useState } from "react";
import {
  FolderPlus,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Info,
  Layers,
  Sparkles,
  RefreshCw,
  GitBranch,
  Building2,
  Plus,
  Trash2,
  FolderTree,
  FileText,
  Sliders,
  Download,
  Loader2,
} from "lucide-react";
import type {
  ProjectProgressOverview,
  CalculatedCategory,
  ProgressTreeNode,
  SubprojectSummary,
} from "@repo/shared";
import { CategoryAccordionItem } from "./CategoryAccordionItem";
import { AddCategoryModal } from "./AddCategoryModal";
import { AddWorkItemModal } from "./AddWorkItemModal";
import { AddSubprojectModal } from "./AddSubprojectModal";
import { ApplyTemplateModal } from "./ApplyTemplateModal";
import { TemplateManagerModal } from "./TemplateManagerModal";
import { ProgressReportModal } from "./ProgressReportModal";
import { CustomizeTradesModal } from "./CustomizeTradesModal";
import { ProgressAuditDrawer } from "./ProgressAuditDrawer";
import { apiPost, apiPatch, apiDelete } from "@/lib/apiClient";
import { toggleItemCompletion } from "@/lib/project-progress/itemCalculator";
import { downloadProjectProgressPdf } from "@/lib/project-progress/progressPdfExport";
import { useLanguage } from "@/contexts/LanguageContext";
import { useProgressI18n } from "@/lib/project-progress/progressI18n";

interface ProjectProgressDashboardProps {
  overview: ProjectProgressOverview;
  onRefresh: () => Promise<void>;
  projectId: string;
  selectedSubproject: string;
  onSelectSubproject: (subproject: string) => void;
}

export function ProjectProgressDashboard({
  overview,
  onRefresh,
  projectId,
  selectedSubproject,
  onSelectSubproject,
}: ProjectProgressDashboardProps) {
  const { t, language } = useLanguage();
  const { p, langKey } = useProgressI18n();

  // Modal states
  const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CalculatedCategory | null>(null);

  const [isAddWorkItemOpen, setIsAddWorkItemOpen] = useState(false);
  const [targetParentForWork, setTargetParentForWork] = useState<ProgressTreeNode | CalculatedCategory | null>(null);
  const [editingWorkItem, setEditingWorkItem] = useState<ProgressTreeNode | null>(null);

  const [isAddSubprojectOpen, setIsAddSubprojectOpen] = useState(false);
  const [isApplyTemplateOpen, setIsApplyTemplateOpen] = useState(false);
  const [isCustomizeTradesOpen, setIsCustomizeTradesOpen] = useState(false);
  const [isTemplateManagerOpen, setIsTemplateManagerOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // Audit drawer state
  const [auditNodeId, setAuditNodeId] = useState<string | null>(null);
  const [auditNodeName, setAuditNodeName] = useState<string | null>(null);

  const [isBusy, setIsBusy] = useState(false);

  const isProjectUnderAllocated = overview.projectAllocationStatus === "UNDER_ALLOCATED";
  const isProjectOverAllocated = overview.projectAllocationStatus === "OVER_ALLOCATED";

  // Auto-switch away from General if tenant subprojects exist
  React.useEffect(() => {
    if (selectedSubproject === "General" && overview.availableSubprojects && overview.availableSubprojects.length > 0) {
      const nonGeneral = overview.availableSubprojects.find(
        (s) => s.toLowerCase() !== "general" && !s.includes("(Główny)") && !s.includes("Gesamt")
      );
      if (nonGeneral) {
        onSelectSubproject(nonGeneral);
      }
    }
  }, [selectedSubproject, overview.availableSubprojects, onSelectSubproject]);

  const handleExportPdf = async () => {
    setIsExportingPdf(true);
    try {
      await downloadProjectProgressPdf({
        overview,
        projectName: overview.projectName || "ET⚡U.DE Projekt",
        subproject: selectedSubproject === "General" ? "Hauptbau / General" : selectedSubproject,
        language,
      });
    } catch (err: any) {
      console.error("PDF export error:", err);
      alert((p.pdfExportError || "PDF Error: ") + (err?.message || ""));
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleExportTenantPdf = async (groupName: string, subs: string[], avgProg: number) => {
    setIsExportingPdf(true);
    try {
      const scopeTitle =
        language === "pl"
          ? `${groupName} (Wszystkie piętra / Całość)`
          : language === "en"
          ? `${groupName} (All Floors / Overall)`
          : `${groupName} (Alle Geschosse / Gesamt)`;

      await downloadProjectProgressPdf({
        overview,
        projectName: overview.projectName || "Projekt",
        tenantName: groupName,
        subproject: scopeTitle,
        language,
      });
    } catch (err: any) {
      console.error("PDF tenant export error:", err);
      alert((p.pdfExportError || "PDF Error: ") + (err?.message || ""));
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Category Actions
  const handleCategorySubmit = async (data: {
    name: string;
    weight: number;
    description?: string;
    subproject?: string;
  }) => {
    const targetSub = data.subproject || selectedSubproject || "General";
    if (editingCategory) {
      await apiPatch(`/api/projects/${projectId}/progress/nodes/${editingCategory.id}`, {
        ...data,
        subproject: targetSub,
      });
    } else {
      await apiPost(`/api/projects/${projectId}/progress`, {
        ...data,
        parentId: null,
        nodeType: "CATEGORY",
        subproject: targetSub,
      });
    }
    await onRefresh();
  };

  const handleDeleteCategory = async (category: CalculatedCategory) => {
    const childCount = category.children?.length || category.items?.length || 0;
    const confirmMsg = (childCount > 0 ? p.confirmDeleteCatWithChildren : p.confirmDeleteCat)
      .replace("{name}", category.name)
      .replace("{count}", String(childCount));

    if (!window.confirm(confirmMsg)) return;

    setIsBusy(true);
    try {
      await apiDelete(`/api/projects/${projectId}/progress/nodes/${category.id}`);
      await onRefresh();
    } finally {
      setIsBusy(false);
    }
  };

  // Work Item Actions (N-Level)
  const handleWorkItemSubmit = async (data: {
    name: string;
    weight: number;
    progress: number;
    description?: string;
  }) => {
    if (editingWorkItem) {
      await apiPatch(`/api/projects/${projectId}/progress/nodes/${editingWorkItem.id}`, data);
    } else if (targetParentForWork) {
      await apiPost(`/api/projects/${projectId}/progress`, {
        ...data,
        parentId: targetParentForWork.id,
        subproject: targetParentForWork.subproject || selectedSubproject || "General",
        nodeType: "WORK_ITEM",
      });
    }
    await onRefresh();
  };

  const handleToggleWorkItem = async (node: ProgressTreeNode) => {
    const nextProgress = toggleItemCompletion(node.progress);
    await apiPatch(`/api/projects/${projectId}/progress/nodes/${node.id}`, {
      progress: nextProgress,
    });
    await onRefresh();
  };

  const handleWorkItemProgressChange = async (
    node: ProgressTreeNode,
    newProgress: number
  ) => {
    await apiPatch(`/api/projects/${projectId}/progress/nodes/${node.id}`, {
      progress: newProgress,
    });
    await onRefresh();
  };

  const handleDeleteWorkItem = async (node: ProgressTreeNode) => {
    const childCount = node.children?.length || 0;
    const confirmMsg = (childCount > 0 ? p.confirmDeleteItemWithChildren : p.confirmDeleteItem)
      .replace("{name}", node.name)
      .replace("{count}", String(childCount));

    if (!window.confirm(confirmMsg)) return;
    setIsBusy(true);
    try {
      await apiDelete(`/api/projects/${projectId}/progress/nodes/${node.id}`);
      await onRefresh();
    } finally {
      setIsBusy(false);
    }
  };

  const handleBalanceCategory = async (cat: CalculatedCategory) => {
    setIsBusy(true);
    try {
      await apiPost(`/api/projects/${projectId}/progress/normalize-weights`, {
        parentId: cat.id,
        mode: "equal",
      });
      await onRefresh();
    } catch (err: any) {
      console.error("Failed to balance category:", err);
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteSubproject = async () => {
    if (selectedSubproject === "General") return;
    const confirmMsg = p.confirmDeleteSubproject.replace("{name}", selectedSubproject);
    if (!window.confirm(confirmMsg)) return;

    setIsBusy(true);
    try {
      await apiDelete(
        `/api/projects/${projectId}/progress/subprojects?name=${encodeURIComponent(selectedSubproject)}`
      );
      onSelectSubproject("General");
      await onRefresh();
    } finally {
      setIsBusy(false);
    }
  };

  const summaries = overview.subprojectSummaries || [];
  const availableSubs = overview.availableSubprojects || ["General", "Mieter-Ausbau"];

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16 animate-fade-in">
      {/* Subproject Selection Tabs & Template Toolbar */}
      <div className="bg-ui-card border border-ui-border rounded-2xl p-3 shadow-md backdrop-blur-md space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-ui-muted flex items-center gap-1.5">
            <GitBranch className="w-3.5 h-3.5 text-ui-accent" />
            <span>{p.subprojectsTitle}</span>
          </span>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Export PDF Button */}
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={isExportingPdf}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500/20 to-ui-accent/20 border border-emerald-500/40 text-emerald-300 hover:border-emerald-400 text-xs font-bold transition shadow-xs disabled:opacity-50"
              title={p.exportPdf}
            >
              {isExportingPdf ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
              ) : (
                <Download className="w-3.5 h-3.5 text-emerald-400" />
              )}
              <span>{isExportingPdf ? p.generatingPdf : p.exportPdf}</span>
            </button>

            {/* Apply Muster Button */}
            <button
              type="button"
              onClick={() => setIsApplyTemplateOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-ui-accent/20 to-sky-400/20 border border-ui-accent/40 text-ui-accent hover:border-ui-accent text-xs font-bold transition shadow-xs"
              title={p.applyTemplate}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{p.applyTemplate}</span>
            </button>

            {/* Customize Trades & Weights */}
            <button
              type="button"
              onClick={() => setIsCustomizeTradesOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-ui-accent/10 border border-ui-accent/30 text-ui-text hover:bg-ui-accent/20 text-xs font-semibold transition"
              title={p.customizeTrades}
            >
              <Sliders className="w-3.5 h-3.5 text-ui-accent" />
              <span>{p.customizeTrades}</span>
            </button>

            {/* Template Manager */}
            <button
              type="button"
              onClick={() => setIsTemplateManagerOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-ui-border text-ui-text hover:bg-white/10 text-xs font-semibold transition"
              title={p.manageTemplates}
            >
              <FolderTree className="w-3.5 h-3.5 text-ui-muted" />
              <span>{p.manageTemplates}</span>
            </button>

            {/* Add Subproject */}
            <button
              type="button"
              onClick={() => setIsAddSubprojectOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-ui-accent/15 border border-ui-accent/30 text-ui-accent hover:bg-ui-accent/25 text-xs font-bold transition shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{p.newSubproject}</span>
            </button>
          </div>
        </div>

        {/* Subproject tabs grouped by tenant / parent group */}
        <div className="space-y-2.5 pt-1">
          {(() => {
            // Group subprojects by tenant/parent group
            const groupsMap = new Map<string, string[]>();
            const groupProgressMap = new Map<string, { sum: number; count: number }>();

            availableSubs.forEach((sub) => {
              const summary = summaries.find((s) => s.name.toLowerCase() === sub.toLowerCase());
              let groupName = (summary as any)?.parentGroup;

              if (groupName) {
                const grpLower = groupName.toLowerCase().trim();
                if (grpLower === "saporro" || grpLower === "sapporo") {
                  groupName = "Sapporo";
                } else if (grpLower === "grundfos") {
                  groupName = "Grundfos";
                }
              }

              if (!groupName) {
                if (sub.toLowerCase() === "general") {
                  groupName = "General / Hauptbau";
                } else if (sub.toLowerCase().includes("grundfos")) {
                  groupName = "Grundfos";
                } else if (sub.toLowerCase().includes("sapporo") || sub.toLowerCase().includes("saporro")) {
                  groupName = "Sapporo";
                } else if (sub.toLowerCase().includes("praxis")) {
                  groupName = "Praxis Dr. Schmidt";
                } else {
                  groupName = "Inne Podprojekty";
                }
              }

              if (sub.toLowerCase().includes("(główny)") || sub.toLowerCase().includes("gesamt")) {
                return;
              }

              if (!groupsMap.has(groupName)) {
                groupsMap.set(groupName, []);
                groupProgressMap.set(groupName, { sum: 0, count: 0 });
              }
              groupsMap.get(groupName)!.push(sub);

              if (summary) {
                const cur = groupProgressMap.get(groupName)!;
                cur.sum += summary.progress;
                cur.count += 1;
              }
            });

            const hasOtherGroups = Array.from(groupsMap.keys()).some((k) => k !== "General / Hauptbau");
            const filteredEntries = Array.from(groupsMap.entries()).filter(([grpName, subs]) => {
              if (grpName === "General / Hauptbau" && hasOtherGroups) {
                return false;
              }
              return subs.length > 0;
            });

            return filteredEntries.map(([groupName, subs]) => {
              if (subs.length === 0) return null;
              const groupStat = groupProgressMap.get(groupName);
              const groupAvgProg = groupStat && groupStat.count > 0 ? groupStat.sum / groupStat.count : 0;
              const isGroupActive =
                selectedSubproject.toLowerCase() === `${groupName} (wszystkie)`.toLowerCase() ||
                selectedSubproject.toLowerCase() === groupName.toLowerCase() ||
                subs.some((s) => s.toLowerCase() === selectedSubproject.toLowerCase());

              const isOverallSelected =
                selectedSubproject.toLowerCase() === `${groupName} (wszystkie)`.toLowerCase() ||
                selectedSubproject.toLowerCase() === `${groupName} (gesamt)`.toLowerCase() ||
                selectedSubproject.toLowerCase() === `${groupName} (all)`.toLowerCase() ||
                selectedSubproject.toLowerCase() === groupName.toLowerCase();

              return (
                <div
                  key={groupName}
                  className={`p-2.5 rounded-xl border transition ${
                    isGroupActive
                      ? "bg-ui-accent/5 border-ui-accent/40"
                      : "bg-white/[0.02] border-ui-border/40 hover:border-ui-border"
                  }`}
                >
                  <div className="flex items-center justify-between pb-2 px-1 flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectSubproject(groupName)}
                      className="text-xs font-extrabold text-ui-text uppercase tracking-wider flex items-center gap-1.5 hover:text-ui-accent transition cursor-pointer"
                      title={p.clickToViewTenantTotal}
                    >
                      <Building2 className="w-4 h-4 text-ui-accent" />
                      <span>{groupName}</span>
                    </button>

                    <div className="flex items-center gap-2">
                      {groupStat && groupStat.count > 0 && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-mono bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 rounded-full text-emerald-300 font-bold">
                          <span>{p.tenantAvg}</span>
                          <b className="text-emerald-400">{groupAvgProg.toFixed(1)}%</b>
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => handleExportTenantPdf(groupName, subs, groupAvgProg)}
                        disabled={isExportingPdf}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 text-[11px] font-bold transition shadow-xs disabled:opacity-50"
                        title={p.pdfTenantTotal}
                      >
                        <Download className="w-3 h-3 text-emerald-400" />
                        <span>PDF {groupName}</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-thin">
                    {/* All floors / Gesamt tab for this tenant */}
                    <button
                      type="button"
                      onClick={() => onSelectSubproject(groupName)}
                      className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition whitespace-nowrap shadow-xs ${
                        isOverallSelected
                          ? "bg-ui-accent text-ui-bg border-ui-accent shadow-md scale-[1.02]"
                          : "bg-sky-500/10 border-sky-500/30 text-sky-300 hover:bg-sky-500/20"
                      }`}
                    >
                      <Sparkles className="w-3 h-3 text-sky-300" />
                      <span>{p.allFloorsTotal}</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-black ${
                          isOverallSelected
                            ? "bg-black/20 text-white"
                            : "bg-white/10 text-emerald-400 border border-white/5"
                        }`}
                      >
                        {groupAvgProg.toFixed(1)}%
                      </span>
                    </button>

                    {subs.map((sub) => {
                      const summary = summaries.find((s) => s.name.toLowerCase() === sub.toLowerCase());
                      const prog = summary ? summary.progress : 0;
                      const isSelected = selectedSubproject.toLowerCase() === sub.toLowerCase();

                      return (
                        <button
                          key={sub}
                          type="button"
                          onClick={() => onSelectSubproject(sub)}
                          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border transition whitespace-nowrap shadow-xs ${
                            isSelected
                              ? "bg-ui-accent text-ui-bg border-ui-accent shadow-md scale-[1.02]"
                              : "bg-ui-bg/80 border-ui-border text-ui-muted hover:text-ui-text hover:bg-white/5"
                          }`}
                        >
                          <span>{sub === "General" ? "Hauptbau / General" : sub}</span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-black ${
                              isSelected
                                ? "bg-black/20 text-white"
                                : "bg-white/10 text-emerald-400 border border-white/5"
                            }`}
                          >
                            {prog.toFixed(1)}%
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      </div>

      {/* Top Hero Banner */}
      <div className="relative overflow-hidden bg-ui-card border border-ui-border rounded-3xl p-6 md:p-8 shadow-2xl backdrop-blur-xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2.5">
            {/* Hierarchy Breadcrumbs */}
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <div className="w-7 h-7 rounded-lg bg-ui-accent/20 text-ui-accent flex items-center justify-center font-black">
                <TrendingUp className="w-3.5 h-3.5" />
              </div>

              <span className="text-ui-muted">{p.mainProject}</span>
              <span className="font-bold text-ui-text bg-white/5 px-2 py-0.5 rounded border border-ui-border">
                {overview.projectName || "Projekt"}
              </span>

              <span className="text-ui-muted">➔</span>

              <span className="text-ui-muted">{p.parentTenant}</span>
              <span className="font-bold text-sky-300 bg-sky-500/10 px-2.5 py-0.5 rounded-full border border-sky-500/30">
                {(overview as any).activeParentGroup ||
                  (selectedSubproject.toLowerCase().includes("grundfos")
                    ? "Grundfos"
                    : selectedSubproject.toLowerCase().includes("sapporo") || selectedSubproject.toLowerCase().includes("saporro")
                    ? "Sapporo"
                    : selectedSubproject.includes("Praxis")
                    ? "Praxis Dr. Schmidt"
                    : selectedSubproject === "General"
                    ? "General / Hauptbau"
                    : "Mieter-Ausbau")}
              </span>

              <span className="text-ui-muted">➔</span>

              <span className="font-extrabold text-ui-accent uppercase tracking-wider">
                {p.scopeFloor} {selectedSubproject === "General" ? "Hauptbau / General" : selectedSubproject}
              </span>
            </div>

            <div className="flex items-center gap-3 flex-wrap pt-1">
              <h2 className="text-2xl md:text-3xl font-black text-ui-text">
                {selectedSubproject === "General" ? "Hauptbau / General" : selectedSubproject}
              </h2>

              {/* Link / Edit Parent Group Button */}
              <button
                type="button"
                onClick={() => setIsAddSubprojectOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-300 hover:bg-sky-500/20 text-xs font-semibold transition"
                title={p.assignTenant}
              >
                <GitBranch className="w-3.5 h-3.5" />
                <span>{p.assignTenant}</span>
              </button>

              {selectedSubproject !== "General" && (
                <button
                  type="button"
                  onClick={handleDeleteSubproject}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 text-xs font-semibold transition"
                  title={p.deleteSubproject}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{p.deleteSubproject}</span>
                </button>
              )}
            </div>

            <p className="text-xs text-ui-muted max-w-2xl leading-relaxed">
              {p.subprojectDesc}
            </p>
          </div>

          {/* Big Progress Counter */}
          <div className="flex items-center gap-4 bg-ui-bg/70 border border-ui-border rounded-2xl p-4 md:px-6 md:py-4 shadow-inner flex-shrink-0">
            <div className="text-right">
              <span className="text-xs uppercase font-extrabold text-ui-muted tracking-wider block">
                {p.subprojectProgress}
              </span>
              <span className="text-4xl md:text-5xl font-black text-ui-text tracking-tight">
                {overview.projectProgress.toFixed(1)}
                <span className="text-2xl text-ui-accent font-extrabold ml-1">%</span>
              </span>
            </div>
          </div>
        </div>

        {/* Global Progress Bar */}
        <div className="mt-6 space-y-2 relative z-10">
          <div className="w-full h-4 bg-ui-bg rounded-full overflow-hidden border border-ui-border flex p-0.5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-ui-accent via-sky-400 to-emerald-400 transition-all duration-700 ease-out shadow-lg"
              style={{ width: `${Math.min(100, Math.max(0, overview.projectProgress))}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs font-bold text-ui-muted">
            <span className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-ui-accent" />
              <span>{p.allocationLabel}</span>
              <b
                className={`${
                  isProjectOverAllocated
                    ? "text-red-400"
                    : isProjectUnderAllocated
                    ? "text-amber-400"
                    : "text-emerald-400"
                }`}
              >
                {overview.projectAllocation.toFixed(1)}% / 100.0%
              </b>
            </span>

            {isProjectUnderAllocated && (
              <span className="text-amber-400 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>{p.underAllocated} ({(100 - overview.projectAllocation).toFixed(1)}% {p.freeWeight})</span>
              </span>
            )}
            {isProjectOverAllocated && (
              <span className="text-red-400 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>{p.overAllocated} ({p.excessWeight} {(overview.projectAllocation - 100).toFixed(1)}%)</span>
              </span>
            )}
            {overview.projectAllocationStatus === "BALANCED" && (
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{p.balanced}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Check if current selection is an aggregated tenant overview (Alle Geschosse) */}
      {(() => {
        const floorBreakdown = (overview as any).floorBreakdown as { name: string; progress: number; itemsCount: number }[] | undefined;
        const cleanSub = selectedSubproject.trim().toLowerCase();
        const isOverallView =
          cleanSub === "grundfos" ||
          cleanSub === "sapporo" ||
          cleanSub === "praxis dr. schmidt" ||
          cleanSub.includes("gesamt") ||
          cleanSub.includes("wszystkie") ||
          cleanSub.endsWith(" (all)") ||
          cleanSub === "all" ||
          cleanSub.endsWith(" (całość)") ||
          cleanSub.endsWith(" (total)");

        if (isOverallView) {
          return (
            <div className="space-y-6">
              {/* Floor Switcher Cards */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-extrabold uppercase tracking-wider text-ui-text flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-ui-accent" />
                    <span>{p.tenantScopesTitle}</span>
                  </h3>
                  <span className="text-xs text-ui-muted font-medium">
                    {p.floorsCount} <b className="text-ui-text">{floorBreakdown?.length || 2}</b>
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(floorBreakdown || []).map((floor) => (
                    <div
                      key={floor.name}
                      className="bg-ui-card border border-ui-border hover:border-ui-accent/50 rounded-2xl p-5 shadow-lg transition-all duration-200 flex flex-col justify-between gap-4 group"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <span className="text-[11px] font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-md border border-sky-500/20">
                            {p.scopeTitle}
                          </span>
                          <h4 className="text-lg font-black text-ui-text group-hover:text-ui-accent transition">
                            {floor.name}
                          </h4>
                          <p className="text-xs text-ui-muted">
                            {p.tradeItemsCount} {floor.itemsCount || 0}
                          </p>
                        </div>

                        <div className="text-right">
                          <span className="text-2xl font-black text-emerald-400">
                            {Math.round(floor.progress)}%
                          </span>
                          <span className="block text-[10px] text-ui-muted uppercase font-bold">
                            {p.progressLabel}
                          </span>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="space-y-2">
                        <div className="w-full h-2.5 bg-ui-bg rounded-full overflow-hidden border border-ui-border/50">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-ui-accent to-emerald-400 transition-all duration-500"
                            style={{ width: `${Math.min(100, Math.max(0, floor.progress))}%` }}
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => onSelectSubproject(floor.name)}
                          className="w-full mt-2 py-2.5 px-4 rounded-xl bg-ui-accent/15 hover:bg-ui-accent text-ui-accent hover:text-ui-bg font-bold text-xs flex items-center justify-center gap-2 transition duration-200 shadow-xs"
                        >
                          <span>{p.openAndEditFloor} {floor.name} ➔</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Read-Only Executive Summary Table */}
              <div className="bg-ui-card border border-ui-border rounded-3xl p-6 shadow-xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-ui-border">
                  <div>
                    <h3 className="text-base font-black text-ui-text flex items-center gap-2">
                      <Layers className="w-4 h-4 text-ui-accent" />
                      <span>{p.overallTradesTitle}</span>
                    </h3>
                    <p className="text-xs text-ui-muted pt-0.5">
                      {p.overallTradesSubtitle}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleExportPdf}
                    disabled={isExportingPdf}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 text-xs font-bold transition shadow-sm self-start sm:self-auto"
                  >
                    <Download className="w-4 h-4 text-emerald-400" />
                    <span>{p.downloadTotalPdf}</span>
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-ui-border text-ui-muted uppercase text-[10px] font-extrabold tracking-wider">
                        <th className="py-2.5 px-3">{p.colTrade}</th>
                        <th className="py-2.5 px-3 text-center">{p.colWeight}</th>
                        <th className="py-2.5 px-3 text-left w-1/3">{p.colProgress}</th>
                        <th className="py-2.5 px-3 text-right">{p.colContrib}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ui-border/40">
                      {overview.categories.map((cat) => {
                        const prog = Math.round(cat.progress || 0);
                        const contrib = Number((cat as any).contribution || cat.contributionToProject || 0).toFixed(1);

                        return (
                          <tr key={cat.id} className="hover:bg-white/[0.02] transition">
                            <td className="py-3 px-3 font-bold text-ui-text">
                              <span>{cat.name}</span>
                            </td>
                            <td className="py-3 px-3 text-center font-mono font-semibold text-ui-muted">
                              {Number(cat.weight || 0).toFixed(1)}%
                            </td>
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-3">
                                <div className="flex-1 h-2 bg-ui-bg rounded-full overflow-hidden border border-ui-border/40">
                                  <div
                                    className={`h-full rounded-full transition-all ${
                                      prog === 100
                                        ? "bg-emerald-400"
                                        : prog > 0
                                        ? "bg-ui-accent"
                                        : "bg-transparent"
                                    }`}
                                    style={{ width: `${Math.min(100, Math.max(0, prog))}%` }}
                                  />
                                </div>
                                <span
                                  className={`w-10 text-right font-black font-mono ${
                                    prog === 100 ? "text-emerald-400" : prog > 0 ? "text-ui-accent" : "text-ui-muted"
                                  }`}
                                >
                                  {prog}%
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right font-mono font-bold text-emerald-400">
                              +{contrib}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        }

        // Standard Single Subproject Interactive View (EG or OG)
        return (
          <>
            {/* Categories Toolbar & Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-ui-text flex items-center gap-2">
                  <span>{p.categoriesTitle} ({overview.categories.length})</span>
                </h3>
                <p className="text-xs text-ui-muted">
                  {p.categoriesDesc}: <b className="text-ui-text">{selectedSubproject}</b>.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsApplyTemplateOpen(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-ui-card border border-ui-border text-ui-text rounded-xl font-bold text-sm hover:bg-white/5 transition shadow-sm"
                >
                  <Sparkles className="w-4 h-4 text-ui-accent" />
                  <span>{p.applyTemplate}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setEditingCategory(null);
                    setIsAddCategoryOpen(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-ui-accent text-ui-bg rounded-xl font-bold text-sm hover:opacity-90 transition shadow-lg"
                >
                  <FolderPlus className="w-4 h-4" />
                  <span>{p.addCategoryBtn} {selectedSubproject}</span>
                </button>
              </div>
            </div>

            {/* Categories Accordion List */}
            {overview.categories.length === 0 ? (
              <div className="bg-ui-card border border-dashed border-ui-border rounded-3xl p-12 text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-ui-accent/15 border border-ui-accent/30 text-ui-accent flex items-center justify-center mx-auto">
                  <FolderPlus className="w-8 h-8" />
                </div>
                <div className="space-y-1 max-w-md mx-auto">
                  <h4 className="text-base font-bold text-ui-text">{p.noCategoriesTitle}</h4>
                  <p className="text-xs text-ui-muted">
                    {p.noCategoriesDesc}
                  </p>
                </div>
                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsApplyTemplateOpen(true)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-ui-accent text-ui-bg rounded-xl font-bold text-sm hover:opacity-90 transition shadow-lg"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>{p.applyDefaultMuster}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setEditingCategory(null);
                      setIsAddCategoryOpen(true);
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-ui-border text-ui-text rounded-xl font-bold text-sm hover:bg-white/10 transition"
                  >
                    <FolderPlus className="w-4 h-4" />
                    <span>{p.createManually}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {overview.categories.map((cat) => (
                  <CategoryAccordionItem
                    key={cat.id}
                    category={cat}
                    onAddWorkItem={(c) => {
                      setTargetParentForWork(c);
                      setEditingWorkItem(null);
                      setIsAddWorkItemOpen(true);
                    }}
                    onAddSubwork={(parentNode) => {
                      setTargetParentForWork(parentNode);
                      setEditingWorkItem(null);
                      setIsAddWorkItemOpen(true);
                    }}
                    onEditCategory={(c) => {
                      setEditingCategory(c);
                      setIsAddCategoryOpen(true);
                    }}
                    onDeleteCategory={handleDeleteCategory}
                    onBalanceCategory={handleBalanceCategory}
                    onToggleWorkItem={handleToggleWorkItem}
                    onWorkItemProgressChange={handleWorkItemProgressChange}
                    onEditWorkItem={(node) => {
                      setTargetParentForWork(cat);
                      setEditingWorkItem(node);
                      setIsAddWorkItemOpen(true);
                    }}
                    onDeleteWorkItem={handleDeleteWorkItem}
                    onViewWorkItemAudit={(node) => {
                      setAuditNodeId(node.id);
                      setAuditNodeName(node.name);
                    }}
                    onViewCategoryAudit={(c) => {
                      setAuditNodeId(c.id);
                      setAuditNodeName(c.name);
                    }}
                  />
                ))}
              </div>
            )}
          </>
        );
      })()}

      {/* Modals & Drawers */}
      <AddCategoryModal
        isOpen={isAddCategoryOpen}
        onClose={() => setIsAddCategoryOpen(false)}
        onSubmit={handleCategorySubmit}
        editingCategory={editingCategory}
        currentSubproject={selectedSubproject}
        availableSubprojects={availableSubs}
      />

      <AddWorkItemModal
        isOpen={isAddWorkItemOpen}
        onClose={() => setIsAddWorkItemOpen(false)}
        category={targetParentForWork}
        onSubmit={handleWorkItemSubmit}
        editingItem={editingWorkItem}
      />

      <AddSubprojectModal
        isOpen={isAddSubprojectOpen}
        onClose={() => setIsAddSubprojectOpen(false)}
        projectId={projectId}
        onRefresh={onRefresh}
        onSelectSubproject={(newSubName) => {
          onSelectSubproject(newSubName);
        }}
      />

      <ApplyTemplateModal
        isOpen={isApplyTemplateOpen}
        onClose={() => setIsApplyTemplateOpen(false)}
        projectId={projectId}
        subproject={selectedSubproject}
        onSuccess={onRefresh}
      />

      <CustomizeTradesModal
        isOpen={isCustomizeTradesOpen}
        onClose={() => setIsCustomizeTradesOpen(false)}
        projectId={projectId}
        subproject={selectedSubproject}
        categories={overview.categories || []}
        onSuccess={onRefresh}
      />

      <TemplateManagerModal
        isOpen={isTemplateManagerOpen}
        onClose={() => setIsTemplateManagerOpen(false)}
        onApplyTemplate={(tplId) => {
          setIsApplyTemplateOpen(true);
        }}
      />

      <ProgressReportModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        overview={overview}
      />

      <ProgressAuditDrawer
        isOpen={Boolean(auditNodeId)}
        onClose={() => {
          setAuditNodeId(null);
          setAuditNodeName(null);
        }}
        projectId={projectId}
        nodeId={auditNodeId}
        nodeName={auditNodeName}
      />
    </div>
  );
}
