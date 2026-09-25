"use client";
import React, { useState } from "react";
import {
  X,
  Printer,
  FileText,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  User,
  Building2,
  Download,
  Loader2,
} from "lucide-react";
import type { ProjectProgressOverview, ProgressTreeNode } from "@repo/shared";
import { useLanguage } from "@/contexts/LanguageContext";
import { downloadProjectProgressPdf } from "@/lib/project-progress/progressPdfExport";

interface ProgressReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  overview: ProjectProgressOverview;
}

export function ProgressReportModal({
  isOpen,
  onClose,
  overview,
}: ProgressReportModalProps) {
  const { t } = useLanguage();
  const [isExporting, setIsExporting] = useState(false);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleExportPdf = async () => {
    setIsExporting(true);
    try {
      await downloadProjectProgressPdf({
        overview,
        projectName: overview.projectName || "ET⚡U.DE Projekt",
        subproject: overview.categories?.[0]?.subproject || "General",
      });
    } catch (err: any) {
      console.error("PDF export error:", err);
      alert("Nie udało się wygenerować pliku PDF: " + (err?.message || "Nieznany błąd"));
    } finally {
      setIsExporting(false);
    }
  };

  // Flatten tree for clean table listing with depth
  const flatRows: Array<{ node: ProgressTreeNode; depth: number }> = [];

  function collectRows(nodes: ProgressTreeNode[], depth = 0) {
    nodes.forEach((n) => {
      flatRows.push({ node: n, depth });
      if (n.children && n.children.length > 0) {
        collectRows(n.children, depth + 1);
      }
    });
  }

  collectRows(overview.treeNodes || []);

  const totalLeafCount = flatRows.filter((r) => r.node.isLeaf).length;
  const completedLeafCount = flatRows.filter(
    (r) => r.node.isLeaf && r.node.progress >= 100
  ).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in print:p-0 print:bg-white print:static print:z-auto">
      <div className="relative w-full max-w-4xl bg-ui-card border border-ui-border rounded-3xl shadow-2xl overflow-hidden p-6 md:p-8 space-y-6 max-h-[92vh] flex flex-col print:border-none print:shadow-none print:max-h-none print:p-4 print:text-black print:bg-white">
        {/* Header - Screen only controls */}
        <div className="flex items-center justify-between pb-4 border-b border-ui-border print:hidden flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-ui-accent/15 border border-ui-accent/30 flex items-center justify-center text-ui-accent">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-ui-text">
                {t("common", "progressReportTitle", "Raport Postępu Prac / Fortschrittsbericht")}
              </h3>
              <p className="text-xs text-ui-muted">
                Eksport bezpośredni do pliku PDF lub wydruk
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={isExporting}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-black rounded-xl font-bold text-xs hover:bg-emerald-400 transition shadow-md disabled:opacity-50"
            >
              {isExporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>{isExporting ? "Generowanie..." : "Pobierz plik PDF"}</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-2 px-3 py-2 bg-white/10 text-ui-text rounded-xl font-bold text-xs hover:bg-white/15 transition"
            >
              <Printer className="w-4 h-4" />
              <span>Drukuj</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-ui-muted hover:text-ui-text hover:bg-white/5 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Report Body */}
        <div className="flex-1 overflow-y-auto space-y-6 pr-1 print:overflow-visible print:pr-0">
          {/* Document Title Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-ui-border/70 print:border-black/20">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-ui-accent print:text-blue-700">
                <Building2 className="w-4 h-4" />
                <span>ET⚡U.DE • Project Progress Report</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-black text-ui-text print:text-black mt-1">
                {overview.projectName || "Projekt"}
              </h1>
              <p className="text-sm font-semibold text-ui-muted print:text-gray-700">
                Zakres prac / Mieter-Ausbau:{" "}
                <b className="text-ui-text print:text-black">
                  {overview.currentSubproject === "General"
                    ? "Hauptbau / General"
                    : overview.currentSubproject}
                </b>
              </p>
            </div>

            <div className="text-right sm:text-right space-y-1 text-xs text-ui-muted print:text-gray-600">
              <div className="flex items-center gap-1.5 sm:justify-end">
                <Calendar className="w-3.5 h-3.5" />
                <span>Data raportu: {new Date().toLocaleDateString("pl-PL")}</span>
              </div>
              <div>Stan alokacji: <b>{overview.projectAllocationStatus}</b></div>
            </div>
          </div>

          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 print:gap-2">
            <div className="p-4 bg-ui-bg/70 border border-ui-border rounded-2xl print:border-gray-300 print:bg-gray-50">
              <span className="text-[11px] uppercase font-bold text-ui-muted print:text-gray-600 block">
                Wykonanie ogółem
              </span>
              <span className="text-2xl md:text-3xl font-black text-ui-accent print:text-blue-600">
                {overview.projectProgress.toFixed(1)}%
              </span>
            </div>

            <div className="p-4 bg-ui-bg/70 border border-ui-border rounded-2xl print:border-gray-300 print:bg-gray-50">
              <span className="text-[11px] uppercase font-bold text-ui-muted print:text-gray-600 block">
                Alokacja wag
              </span>
              <span className="text-2xl md:text-3xl font-black text-ui-text print:text-black">
                {overview.projectAllocation.toFixed(1)}%
              </span>
            </div>

            <div className="p-4 bg-ui-bg/70 border border-ui-border rounded-2xl print:border-gray-300 print:bg-gray-50">
              <span className="text-[11px] uppercase font-bold text-ui-muted print:text-gray-600 block">
                Główne kategorie
              </span>
              <span className="text-2xl md:text-3xl font-black text-ui-text print:text-black">
                {overview.treeNodes?.length || 0}
              </span>
            </div>

            <div className="p-4 bg-ui-bg/70 border border-ui-border rounded-2xl print:border-gray-300 print:bg-gray-50">
              <span className="text-[11px] uppercase font-bold text-ui-muted print:text-gray-600 block">
                Ukończone pozycje
              </span>
              <span className="text-2xl md:text-3xl font-black text-emerald-400 print:text-emerald-700">
                {completedLeafCount} / {totalLeafCount}
              </span>
            </div>
          </div>

          {/* Detailed Progress Table */}
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-ui-text print:text-black uppercase tracking-wider">
              Szczegółowa struktura i postęp prac
            </h3>

            <div className="overflow-x-auto border border-ui-border rounded-2xl print:border-gray-400">
              <table className="w-full text-left text-xs">
                <thead className="bg-ui-bg border-b border-ui-border text-ui-muted print:bg-gray-100 print:text-black uppercase text-[10px] font-extrabold">
                  <tr>
                    <th className="py-3 px-4">Pozycja / Kategoria / Zadanie</th>
                    <th className="py-3 px-3 text-center">Waga</th>
                    <th className="py-3 px-3 text-center">Wykonanie</th>
                    <th className="py-3 px-3 text-center">Wkład w projekt</th>
                    <th className="py-3 px-3 text-right">Status / Wykonawca</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ui-border/50 print:divide-gray-300">
                  {flatRows.map(({ node, depth }) => {
                    const isRoot = depth === 0;
                    const isCompleted = node.progress >= 100;
                    const isPartial = node.progress > 0 && node.progress < 100;

                    return (
                      <tr
                        key={node.id}
                        className={`${
                          isRoot
                            ? "bg-ui-card/60 font-bold print:bg-gray-50"
                            : "hover:bg-white/5 print:hover:bg-transparent"
                        }`}
                      >
                        <td className="py-2.5 px-4">
                          <div
                            className="flex items-center gap-1.5"
                            style={{ paddingLeft: `${depth * 18}px` }}
                          >
                            {depth > 0 && (
                              <span className="text-ui-muted print:text-gray-400">└─</span>
                            )}
                            <span
                              className={`${
                                isRoot
                                  ? "text-sm font-bold text-ui-text print:text-black"
                                  : "text-xs text-ui-text/90 print:text-gray-900"
                              }`}
                            >
                              {node.name}
                            </span>
                          </div>
                        </td>

                        <td className="py-2.5 px-3 text-center font-semibold text-ui-muted print:text-gray-700">
                          {node.weight}%
                        </td>

                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`font-black ${
                              isCompleted
                                ? "text-emerald-400 print:text-emerald-700"
                                : isPartial
                                ? "text-amber-400 print:text-amber-700"
                                : "text-ui-muted print:text-gray-500"
                            }`}
                          >
                            {node.progress.toFixed(1)}%
                          </span>
                        </td>

                        <td className="py-2.5 px-3 text-center font-bold text-ui-accent print:text-blue-700">
                          +{node.contributionToProject.toFixed(2)}%
                        </td>

                        <td className="py-2.5 px-3 text-right text-[11px] text-ui-muted print:text-gray-600">
                          {isCompleted ? (
                            <span className="text-emerald-400 print:text-emerald-700 font-bold">
                              ✓ Ukończono {node.completedAt ? new Date(node.completedAt).toLocaleDateString("pl-PL") : ""}
                            </span>
                          ) : isPartial ? (
                            <span className="text-amber-400 print:text-amber-700 font-bold">
                              W trakcie ({node.progress}%)
                            </span>
                          ) : (
                            <span className="text-ui-muted print:text-gray-400">Oczekuje</span>
                          )}
                          {node.completedByName && (
                            <div className="text-[10px] text-ui-muted">
                              ({node.completedByName})
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
