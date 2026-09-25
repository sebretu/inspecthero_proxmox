"use client";
import React, { useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Plus,
  Edit2,
  Trash2,
  History,
  AlertTriangle,
  CheckCircle2,
  Layers,
  FolderTree,
} from "lucide-react";
import type { ProgressTreeNode } from "@repo/shared";
import { useProgressI18n } from "@/lib/project-progress/progressI18n";

interface HierarchicalWorkNodeProps {
  node: ProgressTreeNode;
  depth?: number;
  onToggle: (node: ProgressTreeNode) => Promise<void>;
  onProgressChange: (node: ProgressTreeNode, newProgress: number) => Promise<void>;
  onAddSubwork: (parentNode: ProgressTreeNode) => void;
  onEdit: (node: ProgressTreeNode) => void;
  onDelete: (node: ProgressTreeNode) => void;
  onViewAudit: (node: ProgressTreeNode) => void;
}

export function HierarchicalWorkNode({
  node,
  depth = 0,
  onToggle,
  onProgressChange,
  onAddSubwork,
  onEdit,
  onDelete,
  onViewAudit,
}: HierarchicalWorkNodeProps) {
  const { p } = useProgressI18n();
  const [isExpanded, setIsExpanded] = useState(true);
  const [sliderVal, setSliderVal] = useState<number>(node.progress);
  const [isUpdating, setIsUpdating] = useState(false);

  const isCompleted = node.progress >= 100;
  const isPartial = node.progress > 0 && node.progress < 100;
  const isLeaf = node.isLeaf;

  const isUnderAllocated = !isLeaf && node.allocationStatus === "UNDER_ALLOCATED";
  const isOverAllocated = !isLeaf && node.allocationStatus === "OVER_ALLOCATED";

  const handleCheckboxClick = async () => {
    if (isUpdating || !isLeaf) return;
    setIsUpdating(true);
    try {
      await onToggle(node);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSliderCommit = async () => {
    if (!isLeaf || sliderVal === node.progress) return;
    setIsUpdating(true);
    try {
      await onProgressChange(node, sliderVal);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className={`space-y-2 ${depth > 0 ? "pt-1" : ""}`}>
      {/* Node Row */}
      <div
        className={`group relative flex flex-col md:flex-row md:items-center justify-between p-3.5 border rounded-xl transition gap-3 shadow-xs ${
          isLeaf
            ? "bg-ui-bg/60 hover:bg-ui-bg border-ui-border"
            : "bg-ui-card/90 border-ui-border hover:border-ui-border/80 shadow-md"
        }`}
      >
        {/* Left Section: Controls & Title */}
        <div className="flex items-start md:items-center gap-3 flex-1 min-w-0">
          {/* Expand/Collapse for Parent, or Checkbox for Leaf */}
          {!isLeaf ? (
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="mt-0.5 md:mt-0 p-1 rounded-lg text-ui-muted hover:text-ui-accent hover:bg-white/5 transition flex-shrink-0"
              title={isExpanded ? p.collapseSubworks : p.expandSubworks}
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-ui-accent" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleCheckboxClick}
              disabled={isUpdating}
              className={`mt-0.5 md:mt-0 w-6 h-6 rounded-lg flex items-center justify-center border transition flex-shrink-0 ${
                isCompleted
                  ? "bg-emerald-500 border-emerald-500 text-black shadow-md shadow-emerald-500/20"
                  : isPartial
                  ? "bg-amber-500/20 border-amber-500/50 text-amber-400"
                  : "bg-ui-card border-ui-border text-ui-muted hover:border-ui-accent"
              }`}
              title={isCompleted ? p.markIncomplete : p.markComplete}
            >
              {isCompleted ? (
                <Check className="w-4 h-4 stroke-[3]" />
              ) : isPartial ? (
                <div className="w-2 h-2 rounded-xs bg-amber-400" />
              ) : null}
            </button>
          )}

          {/* Title & Description */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`text-sm font-semibold truncate ${
                  isLeaf && isCompleted ? "line-through text-ui-muted" : "text-ui-text"
                }`}
              >
                {node.name}
              </span>

              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-white/5 border border-ui-border text-ui-muted">
                {p.weight}: {node.weight}%
              </span>

              {!isLeaf && (
                <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-md bg-ui-accent/10 border border-ui-accent/20 text-ui-accent flex items-center gap-1">
                  <FolderTree className="w-3 h-3" />
                  <span>{node.children.length} {p.addSubwork.replace("+", "").trim()}</span>
                </span>
              )}
            </div>

            {node.description && (
              <p className="text-xs text-ui-muted truncate mt-0.5">{node.description}</p>
            )}

            {/* Parent node mini progress bar */}
            {!isLeaf && (
              <div className="mt-2 space-y-1 max-w-md">
                <div className="w-full h-1.5 bg-ui-bg rounded-full overflow-hidden border border-ui-border flex">
                  <div
                    className="h-full bg-gradient-to-r from-ui-accent to-emerald-400 transition-all duration-500 ease-out"
                    style={{ width: `${Math.min(100, Math.max(0, node.progress))}%` }}
                  />
                </div>

                {isUnderAllocated && (
                  <span className="text-[10px] font-bold text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    <span>{p.underAllocated} ({node.allocation.toFixed(1)}% / 100%)</span>
                  </span>
                )}
                {isOverAllocated && (
                  <span className="text-[10px] font-bold text-red-400 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    <span>{p.overAllocated} ({node.allocation.toFixed(1)}%)</span>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Section: Slider / Progress + Contribution + Actions */}
        <div className="flex items-center gap-4 flex-wrap md:flex-nowrap justify-between md:justify-end">
          {/* Progress Control (Slider for leaf, Badge for parent) */}
          {isLeaf ? (
            <div className="flex items-center gap-2.5 w-full md:w-44">
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={sliderVal}
                onChange={(e) => setSliderVal(Number(e.target.value))}
                onMouseUp={handleSliderCommit}
                onTouchEnd={handleSliderCommit}
                className="w-full accent-ui-accent h-1.5 bg-ui-border rounded-lg appearance-none cursor-pointer"
              />
              <div className="w-12 text-right">
                <span
                  className={`text-xs font-bold ${
                    isCompleted
                      ? "text-emerald-400"
                      : isPartial
                      ? "text-amber-400"
                      : "text-ui-muted"
                  }`}
                >
                  {node.progress}%
                </span>
              </div>
            </div>
          ) : (
            <div className="text-right min-w-[70px]">
              <span className="text-[10px] uppercase font-bold text-ui-muted tracking-wider block">
                {p.progressLabel}
              </span>
              <span className="text-xs font-black text-ui-text">
                {node.progress.toFixed(1)}%
              </span>
            </div>
          )}

          {/* Project Contribution Badge */}
          <div className="flex flex-col items-end min-w-[85px]">
            <span className="text-[10px] uppercase font-bold text-ui-muted tracking-wider">
              {p.contribution}
            </span>
            <span className="text-xs font-extrabold text-ui-accent">
              +{node.contributionToProject.toFixed(1)}%
            </span>
          </div>

          {/* Actions Menu */}
          <div className="flex items-center gap-1 opacity-90 group-hover:opacity-100 transition">
            {/* Add Subwork button */}
            <button
              type="button"
              onClick={() => onAddSubwork(node)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-ui-accent/15 border border-ui-accent/30 text-ui-accent hover:bg-ui-accent/25 text-xs font-bold transition"
              title={p.addSubwork}
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{p.addSubwork}</span>
            </button>

            <button
              type="button"
              onClick={() => onViewAudit(node)}
              className="p-1.5 rounded-lg text-ui-muted hover:text-ui-text hover:bg-white/5 transition"
              title={p.auditHistory}
            >
              <History className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => onEdit(node)}
              className="p-1.5 rounded-lg text-ui-muted hover:text-ui-text hover:bg-white/5 transition"
              title={p.edit}
            >
              <Edit2 className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => onDelete(node)}
              className="p-1.5 rounded-lg text-ui-muted hover:text-red-400 hover:bg-red-500/10 transition"
              title={p.delete}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Recursive Children Container */}
      {!isLeaf && isExpanded && node.children.length > 0 && (
        <div className="pl-6 md:pl-8 border-l-2 border-ui-border/60 ml-3 md:ml-4 space-y-2">
          {node.children.map((child) => (
            <HierarchicalWorkNode
              key={child.id}
              node={child}
              depth={depth + 1}
              onToggle={onToggle}
              onProgressChange={onProgressChange}
              onAddSubwork={onAddSubwork}
              onEdit={onEdit}
              onDelete={onDelete}
              onViewAudit={onViewAudit}
            />
          ))}
        </div>
      )}
    </div>
  );
}
