"use client";
import React, { useState } from "react";
import { Check, Edit2, Trash2, History } from "lucide-react";
import type { CalculatedWorkItem } from "@repo/shared";
import { useProgressI18n } from "@/lib/project-progress/progressI18n";

interface WorkItemRowProps {
  item: CalculatedWorkItem;
  categoryWeight: number;
  onToggle: (item: CalculatedWorkItem) => Promise<void>;
  onProgressChange: (item: CalculatedWorkItem, newProgress: number) => Promise<void>;
  onEdit: (item: CalculatedWorkItem) => void;
  onDelete: (item: CalculatedWorkItem) => void;
  onViewAudit: (item: CalculatedWorkItem) => void;
}

export function WorkItemRow({
  item,
  onToggle,
  onProgressChange,
  onEdit,
  onDelete,
  onViewAudit,
}: WorkItemRowProps) {
  const { p } = useProgressI18n();
  const [sliderVal, setSliderVal] = useState<number>(item.progress);
  const [isUpdating, setIsUpdating] = useState(false);

  const isCompleted = item.progress >= 100;
  const isPartial = item.progress > 0 && item.progress < 100;

  const handleCheckboxClick = async () => {
    if (isUpdating) return;
    setIsUpdating(true);
    try {
      await onToggle(item);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSliderCommit = async () => {
    if (sliderVal === item.progress) return;
    setIsUpdating(true);
    try {
      await onProgressChange(item, sliderVal);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="group relative flex flex-col md:flex-row md:items-center justify-between p-3.5 bg-ui-bg/60 hover:bg-ui-bg border border-ui-border rounded-xl transition gap-3">
      {/* Left: Checkbox + Name & Description */}
      <div className="flex items-start md:items-center gap-3 flex-1 min-w-0">
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
            <div className="w-2.5 h-2.5 rounded-xs bg-amber-400" />
          ) : null}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-sm font-semibold truncate ${
                isCompleted ? "line-through text-ui-muted" : "text-ui-text"
              }`}
            >
              {item.name}
            </span>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-white/5 border border-ui-border text-ui-muted">
              {item.weight}% {p.weightInCategory}
            </span>
          </div>
          {item.description && (
            <p className="text-xs text-ui-muted truncate mt-0.5">{item.description}</p>
          )}
        </div>
      </div>

      {/* Middle: Progress Slider & Values */}
      <div className="flex items-center gap-4 flex-wrap md:flex-nowrap justify-between md:justify-end">
        {/* Slider & Progress Input */}
        <div className="flex items-center gap-2.5 w-full md:w-48">
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
              {item.progress}%
            </span>
          </div>
        </div>

        {/* Project Contribution Badge */}
        <div className="flex flex-col items-end min-w-[90px]">
          <span className="text-[10px] uppercase font-bold text-ui-muted tracking-wider">
            {p.contribution}
          </span>
          <span className="text-xs font-extrabold text-ui-accent">
            +{item.contributionToProject.toFixed(1)}%
          </span>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition">
          <button
            type="button"
            onClick={() => onViewAudit(item)}
            className="p-1.5 rounded-lg text-ui-muted hover:text-ui-text hover:bg-white/5 transition"
            title={p.auditHistory}
          >
            <History className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onEdit(item)}
            className="p-1.5 rounded-lg text-ui-muted hover:text-ui-text hover:bg-white/5 transition"
            title={p.edit}
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(item)}
            className="p-1.5 rounded-lg text-ui-muted hover:text-red-400 hover:bg-red-500/10 transition"
            title={p.delete}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
