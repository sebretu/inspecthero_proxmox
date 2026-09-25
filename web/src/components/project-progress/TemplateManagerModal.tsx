"use client";
import React, { useState, useEffect } from "react";
import {
  X,
  Sparkles,
  Copy,
  Trash2,
  Loader2,
  ShieldCheck,
  AlertCircle,
  FolderTree,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useProgressI18n } from "@/lib/project-progress/progressI18n";
import { apiGet, apiPost, apiDelete } from "@/lib/apiClient";
import type { ProgressTemplate } from "@repo/shared";

interface TemplateManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyTemplate: (templateId: string) => void;
}

export function TemplateManagerModal({
  isOpen,
  onClose,
  onApplyTemplate,
}: TemplateManagerModalProps) {
  const { language } = useLanguage();
  const { p } = useProgressI18n();
  const [templates, setTemplates] = useState<ProgressTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchTemplates = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<ProgressTemplate[]>("/api/progress-templates");
      setTemplates(data || []);
    } catch (err: any) {
      setError(err?.message || "Fehler beim Laden der Vorlagen.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchTemplates();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDuplicate = async (tpl: ProgressTemplate) => {
    const customName = window.prompt(p.duplicatePrompt, `${tpl.name} (Kopie)`);
    if (!customName || !customName.trim()) return;

    setBusyId(tpl.id);
    try {
      await apiPost(`/api/progress-templates/${tpl.id}/duplicate`, {
        name: customName.trim(),
      });
      await fetchTemplates();
    } catch (err: any) {
      alert(err?.message || "Fehler beim Duplizieren.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (tpl: ProgressTemplate) => {
    if (tpl.isSystem) {
      alert(language === "pl" ? "Szablon systemowy jest chroniony i nie można go usunąć." : "Systemvorlagen sind geschützt und können nicht gelöscht werden.");
      return;
    }

    const confirmMsg = p.confirmDeleteTemplate.replace("{name}", tpl.name);
    if (!window.confirm(confirmMsg)) return;

    setBusyId(tpl.id);
    try {
      await apiDelete(`/api/progress-templates/${tpl.id}`);
      await fetchTemplates();
    } catch (err: any) {
      alert(err?.message || "Fehler beim Löschen.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl bg-ui-card border border-ui-border rounded-2xl shadow-2xl overflow-hidden p-6 md:p-7 space-y-5 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-ui-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-ui-accent/15 border border-ui-accent/30 flex items-center justify-center text-ui-accent">
              <FolderTree className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-ui-text">
                {p.templateManagerTitle}
              </h3>
              <p className="text-xs text-ui-muted">
                {p.templateManagerSubtitle}
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

        {/* Templates List */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {loading ? (
            <div className="py-16 text-center space-y-2">
              <Loader2 className="w-8 h-8 animate-spin text-ui-accent mx-auto" />
              <p className="text-xs text-ui-muted font-medium">{p.loadingTemplates}</p>
            </div>
          ) : templates.length === 0 ? (
            <div className="py-12 text-center text-ui-muted text-xs">
              {language === "pl" ? "Brak zdefiniowanych szablonów." : "Keine Vorlagen definiert."}
            </div>
          ) : (
            templates.map((tpl) => (
              <div
                key={tpl.id}
                className="p-4 bg-ui-bg/70 border border-ui-border rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-ui-border/80 transition"
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-ui-text">{tpl.name}</span>
                    {tpl.isSystem ? (
                      <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-sky-500/15 border border-sky-500/30 text-sky-400 flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" />
                        {p.systemTemplateBadge}
                      </span>
                    ) : (
                      <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-ui-accent/15 border border-ui-accent/30 text-ui-accent">
                        {p.customTemplateBadge}
                      </span>
                    )}
                  </div>

                  {tpl.description && (
                    <p className="text-xs text-ui-muted line-clamp-2 leading-relaxed">
                      {tpl.description}
                    </p>
                  )}

                  <div className="flex items-center gap-4 text-[11px] font-semibold text-ui-muted">
                    <span>{p.categoriesTitle}: <b className="text-ui-text">{tpl.categoryCount || 0}</b></span>
                    <span>Items: <b className="text-ui-text">{tpl.nodeCount || 0}</b></span>
                    <span>{p.weight}: <b className="text-emerald-400">{tpl.totalWeight || 100}%</b></span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0 self-end md:self-center">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onApplyTemplate(tpl.id);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-ui-accent text-ui-bg rounded-lg text-xs font-bold hover:opacity-90 transition shadow-xs"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{p.applyTemplate}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDuplicate(tpl)}
                    disabled={busyId === tpl.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-ui-border text-ui-text hover:bg-white/10 rounded-lg text-xs font-semibold transition"
                    title={p.duplicateTemplate}
                  >
                    {busyId === tpl.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{p.duplicateTemplate}</span>
                  </button>

                  {!tpl.isSystem && (
                    <button
                      type="button"
                      onClick={() => handleDelete(tpl)}
                      disabled={busyId === tpl.id}
                      className="p-1.5 rounded-lg text-ui-muted hover:text-red-400 hover:bg-red-500/10 transition"
                      title={p.deleteTemplate}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-ui-border flex-shrink-0">
          <p className="text-xs text-ui-muted">
            {language === "pl" ? "Szablony systemowe można swobodnie duplikować, aby dostosować wagi i pozycje." : "Systemvorlagen können dupliziert und individuell angepasst werden."}
          </p>
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
