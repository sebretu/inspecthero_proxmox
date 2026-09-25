"use client";
import React, { useState, useEffect } from "react";
import { X, CheckSquare, Check } from "lucide-react";
import type { CalculatedWorkItem, CalculatedCategory, ProgressTreeNode } from "@repo/shared";
import { useProgressI18n } from "@/lib/project-progress/progressI18n";

interface AddWorkItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  category: ProgressTreeNode | CalculatedCategory | null;
  onSubmit: (data: {
    name: string;
    weight: number;
    progress: number;
    description?: string;
  }) => Promise<void>;
  editingItem?: ProgressTreeNode | CalculatedWorkItem | null;
}

export function AddWorkItemModal({
  isOpen,
  onClose,
  category,
  onSubmit,
  editingItem,
}: AddWorkItemModalProps) {
  const { p } = useProgressI18n();
  const [name, setName] = useState("");
  const [weight, setWeight] = useState<number | string>(30);
  const [progress, setProgress] = useState<number | string>(0);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editingItem) {
      setName(editingItem.name);
      setWeight(editingItem.weight);
      setProgress(editingItem.progress);
      setDescription(editingItem.description || "");
    } else {
      setName("");
      // Suggest remaining weight in category if available
      const currentAlloc = category?.allocation || 0;
      const remaining = Math.max(0, 100 - currentAlloc);
      setWeight(remaining > 0 ? remaining : 25);
      setProgress(0);
      setDescription("");
    }
    setError(null);
  }, [editingItem, category, isOpen]);

  if (!isOpen || !category) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(p.errorNameRequired);
      return;
    }

    const numWeight = Number(weight);
    if (Number.isNaN(numWeight) || numWeight < 0 || numWeight > 100) {
      setError(p.errorWeightRange);
      return;
    }

    const numProgress = Number(progress);
    if (Number.isNaN(numProgress) || numProgress < 0 || numProgress > 100) {
      setError(p.errorProgressRange);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        weight: numWeight,
        progress: numProgress,
        description: description.trim() || undefined,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || p.errorNameRequired);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-ui-card border border-ui-border rounded-2xl shadow-2xl overflow-hidden p-6">
        <div className="flex items-center justify-between pb-4 border-b border-ui-border mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-ui-accent/15 border border-ui-accent/30 flex items-center justify-center text-ui-accent">
              <CheckSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-ui-text">
                {editingItem ? p.editWorkItemModalTitle : p.addWorkItemModalTitle}
              </h3>
              <p className="text-xs text-ui-muted">
                {category.name} ({category.weight}%)
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
          <div className="mb-4 p-3 bg-red-500/15 border border-red-500/30 rounded-xl text-red-400 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-ui-muted uppercase tracking-wider mb-1.5">
              {p.nameLabel} *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={p.workNamePlaceholder}
              className="w-full px-4 py-2.5 bg-ui-bg border border-ui-border rounded-xl text-ui-text placeholder-ui-muted/50 focus:outline-none focus:border-ui-accent transition text-sm font-medium"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-ui-muted uppercase tracking-wider mb-1.5">
                {p.weightPercentLabel} *
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  required
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  placeholder="30"
                  className="w-full px-4 py-2.5 bg-ui-bg border border-ui-border rounded-xl text-ui-text placeholder-ui-muted/50 focus:outline-none focus:border-ui-accent transition text-sm font-semibold"
                />
                <span className="absolute right-3.5 top-2.5 text-sm font-bold text-ui-muted">
                  %
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ui-muted uppercase tracking-wider mb-1.5">
                {p.progressPercentLabel}
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={progress}
                  onChange={(e) => setProgress(e.target.value)}
                  placeholder="0"
                  className="w-full px-4 py-2.5 bg-ui-bg border border-ui-border rounded-xl text-ui-text placeholder-ui-muted/50 focus:outline-none focus:border-ui-accent transition text-sm font-semibold"
                />
                <span className="absolute right-3.5 top-2.5 text-sm font-bold text-ui-muted">
                  %
                </span>
              </div>
            </div>
          </div>

          {/* Quick Progress Presets */}
          <div>
            <span className="text-[11px] font-semibold text-ui-muted uppercase tracking-wider block mb-1">
              {p.quickProgress}
            </span>
            <div className="flex items-center gap-2">
              {[0, 25, 50, 75, 100].map((pr) => (
                <button
                  key={pr}
                  type="button"
                  onClick={() => setProgress(pr)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition ${
                    Number(progress) === pr
                      ? "bg-ui-accent text-ui-bg border-ui-accent"
                      : "bg-ui-bg border-ui-border text-ui-muted hover:text-ui-text"
                  }`}
                >
                  {pr}%
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ui-muted uppercase tracking-wider mb-1.5">
              {p.descriptionLabel}
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={p.workDescPlaceholder}
              className="w-full px-4 py-2 bg-ui-bg border border-ui-border rounded-xl text-ui-text placeholder-ui-muted/50 focus:outline-none focus:border-ui-accent transition text-sm resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-ui-border">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-semibold text-ui-muted hover:text-ui-text rounded-xl transition hover:bg-white/5"
            >
              {p.cancel}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 bg-ui-accent text-ui-bg rounded-xl font-bold text-sm hover:opacity-90 transition shadow-lg disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              {loading ? p.saving : editingItem ? p.saveChanges : p.addWorkItem}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
