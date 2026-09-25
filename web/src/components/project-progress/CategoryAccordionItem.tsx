"use client";
import React, { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  Plus,
  Edit2,
  Trash2,
  History,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import type { CalculatedCategory, ProgressTreeNode } from "@repo/shared";
import { HierarchicalWorkNode } from "./HierarchicalWorkNode";
import { useProgressI18n } from "@/lib/project-progress/progressI18n";

interface CategoryAccordionItemProps {
  category: CalculatedCategory;
  onAddWorkItem: (category: CalculatedCategory) => void;
  onAddSubwork: (parentNode: ProgressTreeNode) => void;
  onEditCategory: (category: CalculatedCategory) => void;
  onDeleteCategory: (category: CalculatedCategory) => void;
  onViewCategoryAudit: (category: CalculatedCategory) => void;
  onBalanceCategory?: (category: CalculatedCategory) => void;
  onToggleWorkItem: (node: ProgressTreeNode) => Promise<void>;
  onWorkItemProgressChange: (node: ProgressTreeNode, newProgress: number) => Promise<void>;
  onEditWorkItem: (node: ProgressTreeNode) => void;
  onDeleteWorkItem: (node: ProgressTreeNode) => void;
  onViewWorkItemAudit: (node: ProgressTreeNode) => void;
}

export function CategoryAccordionItem({
  category,
  onAddWorkItem,
  onAddSubwork,
  onEditCategory,
  onDeleteCategory,
  onViewCategoryAudit,
  onBalanceCategory,
  onToggleWorkItem,
  onWorkItemProgressChange,
  onEditWorkItem,
  onDeleteWorkItem,
  onViewWorkItemAudit,
}: CategoryAccordionItemProps) {
  const { p } = useProgressI18n();
  const [isExpanded, setIsExpanded] = useState(true);

  const isUnderAllocated = category.allocationStatus === "UNDER_ALLOCATED";
  const isOverAllocated = category.allocationStatus === "OVER_ALLOCATED";
  const childrenNodes = category.children || category.items || [];

  return (
    <div className="bg-ui-card border border-ui-border rounded-2xl shadow-lg overflow-hidden transition-all duration-200 hover:border-ui-border/80">
      {/* Category Header */}
      <div className="p-4 md:p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* Title & expand button */}
          <div className="flex items-center gap-3 flex-1 min-w-[240px]">
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1.5 rounded-lg text-ui-muted hover:text-ui-text hover:bg-white/5 transition"
            >
              {isExpanded ? (
                <ChevronDown className="w-5 h-5 text-ui-accent" />
              ) : (
                <ChevronRight className="w-5 h-5 text-ui-muted" />
              )}
            </button>

            <div className="w-10 h-10 rounded-xl bg-ui-accent/15 border border-ui-accent/30 flex items-center justify-center text-ui-accent flex-shrink-0">
              <Folder className="w-5 h-5" />
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-base font-bold text-ui-text">{category.name}</h4>
                <span className="text-xs font-extrabold px-2.5 py-0.5 rounded-full bg-ui-accent/10 border border-ui-accent/30 text-ui-accent">
                  {category.weight}%
                </span>
              </div>
              {category.description && (
                <p className="text-xs text-ui-muted mt-0.5">{category.description}</p>
              )}
            </div>
          </div>

          {/* Progress & Contribution Metrics */}
          <div className="flex items-center gap-5 flex-wrap">
            <div className="text-right">
              <div className="text-[11px] uppercase font-bold text-ui-muted tracking-wider">
                {p.progressLabel}
              </div>
              <div className="text-sm font-black text-ui-text">
                {category.progress.toFixed(1)}%
              </div>
            </div>

            <div className="text-right pl-4 border-l border-ui-border">
              <div className="text-[11px] uppercase font-bold text-ui-muted tracking-wider">
                {p.contribution}
              </div>
              <div className="text-sm font-black text-emerald-400">
                +{category.contributionToProject.toFixed(1)}%
              </div>
            </div>

            {/* Actions menu */}
            <div className="flex items-center gap-1.5 pl-2 border-l border-ui-border">
              <button
                type="button"
                onClick={() => onAddWorkItem(category)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-ui-accent/15 hover:bg-ui-accent/25 border border-ui-accent/30 text-ui-accent rounded-xl text-xs font-bold transition shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{p.addWorkItem}</span>
              </button>

              <button
                type="button"
                onClick={() => onViewCategoryAudit(category)}
                className="p-1.5 rounded-lg text-ui-muted hover:text-ui-text hover:bg-white/5 transition"
                title={p.auditHistory}
              >
                <History className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => onEditCategory(category)}
                className="p-1.5 rounded-lg text-ui-muted hover:text-ui-text hover:bg-white/5 transition"
                title={p.edit}
              >
                <Edit2 className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => onDeleteCategory(category)}
                className="p-1.5 rounded-lg text-ui-muted hover:text-red-400 hover:bg-red-500/10 transition"
                title={p.delete}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Category Progress Bar */}
        <div className="space-y-1.5 pt-1">
          <div className="w-full h-2.5 bg-ui-bg rounded-full overflow-hidden border border-ui-border flex">
            <div
              className="h-full bg-gradient-to-r from-ui-accent to-emerald-400 transition-all duration-500 ease-out"
              style={{ width: `${Math.min(100, Math.max(0, category.progress))}%` }}
            />
          </div>

          {/* Allocation sub-status */}
          <div className="flex items-center justify-between text-xs text-ui-muted flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold">{childrenNodes.length} {p.colTrade}</span>
              <span>•</span>
              {category.allocationStatus === "BALANCED" ? (
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>{p.balanced}</span>
                </span>
              ) : isUnderAllocated ? (
                <span className="text-amber-400 font-bold flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  <span>{p.underAllocated} ({category.allocation.toFixed(1)}% / 100%)</span>
                </span>
              ) : (
                <span className="text-red-400 font-bold flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  <span>{p.overAllocated} ({category.allocation.toFixed(1)}%)</span>
                </span>
              )}
            </div>

            {category.allocationStatus !== "BALANCED" && childrenNodes.length > 0 && onBalanceCategory && (
              <button
                type="button"
                onClick={() => onBalanceCategory(category)}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-ui-accent/10 border border-ui-accent/30 text-ui-accent hover:bg-ui-accent/20 font-bold text-[11px] transition shadow-xs cursor-pointer"
                title={p.balanceEqually}
              >
                ⚖️ {p.balanceEqually}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Accordion Content (Work Items List) */}
      {isExpanded && (
        <div className="p-4 md:p-5 pt-0 border-t border-ui-border/40 bg-ui-bg/30">
          {childrenNodes.length === 0 ? (
            <div className="p-8 text-center bg-ui-bg/40 border border-dashed border-ui-border rounded-xl space-y-3">
              <p className="text-xs text-ui-muted">
                {p.noCategoriesTitle}
              </p>
              <button
                type="button"
                onClick={() => onAddWorkItem(category)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-ui-accent text-ui-bg rounded-xl text-xs font-bold hover:opacity-90 transition shadow-md"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{p.addWorkItem}</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {childrenNodes.map((childNode) => (
                <HierarchicalWorkNode
                  key={childNode.id}
                  node={childNode}
                  depth={0}
                  onToggle={onToggleWorkItem}
                  onProgressChange={onWorkItemProgressChange}
                  onAddSubwork={onAddSubwork}
                  onEdit={onEditWorkItem}
                  onDelete={onDeleteWorkItem}
                  onViewAudit={onViewWorkItemAudit}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
