"use client";
import React, { useState, useEffect } from "react";
import { X, FolderPlus, Check } from "lucide-react";
import type { CalculatedCategory } from "@repo/shared";
import { useProgressI18n } from "@/lib/project-progress/progressI18n";

interface AddCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; weight: number; description?: string; subproject?: string }) => Promise<void>;
  editingCategory?: CalculatedCategory | null;
  currentSubproject?: string;
  availableSubprojects?: string[];
}

export function AddCategoryModal({
  isOpen,
  onClose,
  onSubmit,
  editingCategory,
  currentSubproject = "General",
  availableSubprojects = ["General", "Mieter-Ausbau"],
}: AddCategoryModalProps) {
  const { p } = useProgressI18n();
  const [name, setName] = useState("");
  const [weight, setWeight] = useState<number | string>(20);
  const [description, setDescription] = useState("");
  const [subproject, setSubproject] = useState(currentSubproject === "ALL" ? "General" : currentSubproject);
  const [customSubproject, setCustomSubproject] = useState("");
  const [isCustom, setIsCustom] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editingCategory) {
      setName(editingCategory.name);
      setWeight(editingCategory.weight);
      setDescription(editingCategory.description || "");
      setSubproject(editingCategory.subproject || "General");
      setIsCustom(false);
    } else {
      setName("");
      setWeight(20);
      setDescription("");
      setSubproject(currentSubproject === "ALL" ? "General" : currentSubproject);
      setIsCustom(false);
    }
    setError(null);
  }, [editingCategory, currentSubproject, isOpen]);

  if (!isOpen) return null;

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

    const finalSubproject = isCustom ? customSubproject.trim() : subproject;
    if (isCustom && !finalSubproject) {
      setError(p.errorSubprojectRequired);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        weight: numWeight,
        description: description.trim() || undefined,
        subproject: finalSubproject || "General",
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
              <FolderPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-ui-text">
                {editingCategory ? p.editCategoryModalTitle : p.addCategoryModalTitle}
              </h3>
              <p className="text-xs text-ui-muted">
                {p.categoryHelpText}
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
          {/* Subproject Selector */}
          <div>
            <label className="block text-xs font-semibold text-ui-muted uppercase tracking-wider mb-1.5">
              {p.subprojectFieldLabel}
            </label>
            {!isCustom ? (
              <div className="flex items-center gap-2">
                <select
                  value={subproject}
                  onChange={(e) => {
                    if (e.target.value === "__NEW__") {
                      setIsCustom(true);
                      setCustomSubproject("");
                    } else {
                      setSubproject(e.target.value);
                    }
                  }}
                  className="w-full px-3.5 py-2.5 bg-ui-bg border border-ui-border rounded-xl text-ui-text font-semibold text-sm focus:outline-none focus:border-ui-accent transition"
                >
                  {availableSubprojects.map((sp) => (
                    <option key={sp} value={sp}>
                      {sp === "General" ? "Hauptbau / General" : sp}
                    </option>
                  ))}
                  <option value="__NEW__">{p.newSubproject}</option>
                </select>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  required
                  value={customSubproject}
                  onChange={(e) => setCustomSubproject(e.target.value)}
                  placeholder="z.B. Halle 3 Grundfos OG, Bauabschnitt B..."
                  className="w-full px-3.5 py-2.5 bg-ui-bg border border-ui-border rounded-xl text-ui-text font-semibold text-sm focus:outline-none focus:border-ui-accent transition"
                />
                <button
                  type="button"
                  onClick={() => setIsCustom(false)}
                  className="text-xs text-ui-accent hover:underline"
                >
                  ← {p.chooseExisting}
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-ui-muted uppercase tracking-wider mb-1.5">
              {p.nameLabel} *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={p.categoryNamePlaceholder}
              className="w-full px-4 py-2.5 bg-ui-bg border border-ui-border rounded-xl text-ui-text placeholder-ui-muted/50 focus:outline-none focus:border-ui-accent transition text-sm font-medium"
            />
          </div>

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
                placeholder="20"
                className="w-full px-4 py-2.5 bg-ui-bg border border-ui-border rounded-xl text-ui-text placeholder-ui-muted/50 focus:outline-none focus:border-ui-accent transition text-sm font-semibold"
              />
              <span className="absolute right-4 top-2.5 text-sm font-bold text-ui-muted">
                %
              </span>
            </div>
            <p className="mt-1 text-xs text-ui-muted">
              {p.categoryWeightDesc}
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ui-muted uppercase tracking-wider mb-1.5">
              {p.descriptionLabel}
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={p.categoryDescPlaceholder}
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
              {loading
                ? p.saving
                : editingCategory
                ? p.saveChanges
                : p.save}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
