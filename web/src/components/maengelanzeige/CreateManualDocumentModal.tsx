"use client";

import React, { useState } from "react";
import { X, FilePlus, Folder, Loader2 } from "lucide-react";
import { getToken } from "@/lib/apiClient";

interface Project {
  id: string;
  name: string;
  companies?: { name: string } | null;
}

interface CreateManualDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: Project[];
  selectedProjectId: string;
  onCreated: (newDoc: any) => void;
}

export function CreateManualDocumentModal({
  isOpen,
  onClose,
  projects,
  selectedProjectId,
  onCreated,
}: CreateManualDocumentModalProps) {
  const [projectId, setProjectId] = useState<string>(selectedProjectId || (projects[0]?.id ?? ""));
  const [title, setTitle] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Bitte geben Sie einen Namen für die Mängelliste ein.");
      return;
    }
    if (!projectId) {
      setError("Bitte wählen Sie ein Projekt aus.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const token = await getToken();
      const res = await fetch("/api/maengelanzeige/documents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          projectId,
          title: title.trim(),
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error?.message || "Fehler beim Erstellen der Liste");
      }

      onCreated(json.data);
      onClose();
    } catch (err: any) {
      setError(err.message || "Unerwarteter Fehler");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100020] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-ui-card border border-ui-border rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-ui-border flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-ui-accent/20 border border-ui-accent/40 flex items-center justify-center text-ui-accent">
              <FilePlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-ui-text uppercase tracking-wide">
                Neue Mängelliste erstellen
              </h2>
              <p className="text-xs text-ui-muted font-medium">
                Manuelle Liste für Begehungen und Prüfungen ohne PDF
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-ui-muted hover:text-ui-text hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs font-bold text-red-400">
              {error}
            </div>
          )}

          {/* Project Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-ui-text flex items-center gap-1.5">
              <Folder className="w-3.5 h-3.5 text-ui-accent" />
              <span>Projekt</span>
            </label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-ui-bg border border-ui-border text-xs sm:text-sm font-bold text-ui-text focus:outline-none focus:border-ui-accent transition-colors"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.companies?.name ? `[${p.companies.name.toUpperCase()}] ` : ""}{p.name}
                </option>
              ))}
            </select>
          </div>

          {/* List Title */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-ui-text block">
              Name der Mängelliste
            </label>
            <input
              type="text"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`z.B. Begehung Brandschutz ${new Date().toLocaleDateString("de-DE")}`}
              className="w-full px-3.5 py-2.5 rounded-xl bg-ui-bg border border-ui-border text-xs sm:text-sm font-bold text-ui-text placeholder:text-ui-muted/50 focus:outline-none focus:border-ui-accent transition-colors"
            />
            <p className="text-[11px] text-ui-muted">
              Sie können der Liste direkt nach der Erstellung beliebig viele Mängel und Vorher-Fotos hinzufügen.
            </p>
          </div>

          {/* Footer Buttons */}
          <div className="pt-3 border-t border-ui-border flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-ui-border text-xs font-bold text-ui-muted hover:text-ui-text hover:bg-white/5 transition-all"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={loading || !title.trim()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-ui-accent hover:bg-ui-accent/90 text-black font-black text-xs tracking-wide transition-all shadow-lg shadow-ui-accent/20 active:scale-95 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FilePlus className="w-4 h-4" />}
              <span>{loading ? "Wird erstellt..." : "+ Liste erstellen"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateManualDocumentModal;
