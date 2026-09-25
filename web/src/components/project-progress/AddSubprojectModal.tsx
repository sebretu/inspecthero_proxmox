"use client";
import React, { useState, useEffect } from "react";
import {
  X,
  GitBranch,
  Plus,
  Check,
  Loader2,
  Building2,
  Layers,
  Sparkles,
  CheckSquare,
  Square,
  Edit2,
  Save,
  Trash2,
  Users,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useProgressI18n } from "@/lib/project-progress/progressI18n";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/apiClient";

interface SubprojectDbItem {
  id: string;
  name: string;
  parent_group?: string | null;
  parent_id?: string | null;
  description?: string | null;
}

interface AddSubprojectModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  onSelectSubproject: (name: string) => void;
  onRefresh: () => Promise<void>;
  existingSubprojects?: string[];
}

export function AddSubprojectModal({
  isOpen,
  onClose,
  projectId,
  onSelectSubproject,
  onRefresh,
}: AddSubprojectModalProps) {
  const { language } = useLanguage();
  const { p } = useProgressI18n();
  const [tabMode, setTabMode] = useState<"tenant" | "single" | "manage">("tenant");

  // Mode 1: Tenant Fit-out Package (Mieter-Ausbau Paket)
  const [tenantName, setTenantName] = useState("");
  const [selectedFloors, setSelectedFloors] = useState<string[]>([
    "EG",
    "1.OG",
  ]);
  const [customFloorInput, setCustomFloorInput] = useState("");

  // Mode 2: Single Subproject
  const [singleName, setSingleName] = useState("");
  const [parentGroup, setParentGroup] = useState("");

  // Mode 3: Manage / Link Existing Subprojects
  const [dbSubprojects, setDbSubprojects] = useState<SubprojectDbItem[]>([]);
  const [loadingDbSubs, setLoadingDbSubs] = useState(false);
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [editingSubName, setEditingSubName] = useState("");
  const [editingSubGroup, setEditingSubGroup] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadSubprojectsList = () => {
    setLoadingDbSubs(true);
    apiGet<SubprojectDbItem[]>(`/api/projects/${projectId}/progress/subprojects`)
      .then((res) => {
        setDbSubprojects(res || []);
      })
      .catch((err) => console.error("Error loading subprojects in modal:", err))
      .finally(() => setLoadingDbSubs(false));
  };

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setSuccessMsg(null);
    loadSubprojectsList();
  }, [isOpen, projectId]);

  if (!isOpen) return null;

  const defaultFloorOptions = [
    "EG",
    "1.OG",
    "2.OG",
    "3.OG",
    "4.OG",
    "UG / Keller",
    "DG / Dach",
    "Halle",
    "Außenanlagen",
  ];

  const tenantPresets = [
    "Grundfos",
    "Praxis Dr. Schmidt",
    "Büro TechCorp",
    "Kanzlei & Partner",
    "Lidl / Retail",
    "Fitness Lounge",
  ];

  const toggleFloor = (floor: string) => {
    setSelectedFloors((prev) =>
      prev.includes(floor) ? prev.filter((f) => f !== floor) : [...prev, floor]
    );
  };

  const addCustomFloor = () => {
    const trimmed = customFloorInput.trim();
    if (!trimmed) return;
    if (!selectedFloors.includes(trimmed)) {
      setSelectedFloors((prev) => [...prev, trimmed]);
    }
    setCustomFloorInput("");
  };

  // 1. Submit Tenant Fit-out Package
  const handleTenantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTenant = tenantName.trim();
    if (!cleanTenant) {
      setError(language === "pl" ? "Podaj nazwę najemcy (np. Grundfos, Praxis Dr. Schmidt)." : "Bitte Mietername eingeben (z.B. Grundfos, Praxis Dr. Schmidt).");
      return;
    }

    if (selectedFloors.length === 0) {
      setError(language === "pl" ? "Wybierz co najmniej jedno piętro / zakres dla tego najemcy." : "Bitte mindestens ein Geschoss auswählen.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const batchItems = selectedFloors.map((floor) => {
        const fullName = `${cleanTenant} ${floor}`;

        return {
          name: fullName,
          parent_group: cleanTenant,
        };
      });

      await apiPost(`/api/projects/${projectId}/progress/subprojects`, {
        batch: batchItems,
      });

      const firstSubName = batchItems[0].name;
      onSelectSubproject(firstSubName);
      await onRefresh();
      setTenantName("");
      onClose();
    } catch (err: any) {
      console.error("Error creating tenant package:", err);
      setError(err?.message || "Fehler beim Erstellen des Mieter-Ausbaus.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2. Submit Single Subproject
  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = singleName.trim();
    if (!trimmed) {
      setError(p.errorSubprojectRequired);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await apiPost(`/api/projects/${projectId}/progress/subprojects`, {
        name: trimmed,
        parent_group: parentGroup.trim() || null,
      });
      onSelectSubproject(trimmed);
      await onRefresh();
      setSingleName("");
      onClose();
    } catch (err: any) {
      setError(err?.message || p.errorSubprojectRequired);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 3. Save existing subproject modification (link to tenant group or rename)
  const handleSaveSubprojectEdit = async (item: SubprojectDbItem) => {
    setIsSubmitting(true);
    setError(null);
    try {
      await apiPatch(`/api/projects/${projectId}/progress/subprojects`, {
        id: item.id,
        name: item.name,
        newName: editingSubName.trim() || item.name,
        parent_group: editingSubGroup.trim() || null,
      });
      setEditingSubId(null);
      setSuccessMsg(language === "pl" ? `Zaktualizowano przypisanie dla "${item.name}"!` : `Zuordnung für „${item.name}“ aktualisiert!`);
      loadSubprojectsList();
      await onRefresh();
    } catch (err: any) {
      setError(err?.message || "Fehler beim Aktualisieren.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-xl bg-ui-card border border-ui-border rounded-2xl shadow-2xl overflow-hidden p-6 md:p-7 space-y-5 my-8">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-ui-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-ui-accent/15 border border-ui-accent/30 flex items-center justify-center text-ui-accent flex-shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-ui-text">
                {p.manageSubprojectsTitle}
              </h3>
              <p className="text-xs text-ui-muted">
                {p.subprojectSubtitle}
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

        {/* Mode Selector Tabs */}
        <div className="flex items-center p-1 bg-ui-bg/70 border border-ui-border rounded-xl">
          <button
            type="button"
            onClick={() => {
              setTabMode("tenant");
              setError(null);
              setSuccessMsg(null);
            }}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
              tabMode === "tenant"
                ? "bg-ui-accent text-ui-bg shadow-sm"
                : "text-ui-muted hover:text-ui-text"
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>{language === "pl" ? "Nowy Najemca (Pakiet)" : "Neuer Mieter-Ausbau (Paket)"}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setTabMode("single");
              setError(null);
              setSuccessMsg(null);
            }}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
              tabMode === "single"
                ? "bg-ui-accent text-ui-bg shadow-sm"
                : "text-ui-muted hover:text-ui-text"
            }`}
          >
            <GitBranch className="w-3.5 h-3.5" />
            <span>{language === "pl" ? "Pojedyncze Piętro" : "Einzelner Bereich / Geschoss"}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setTabMode("manage");
              setError(null);
              setSuccessMsg(null);
            }}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
              tabMode === "manage"
                ? "bg-ui-accent text-ui-bg shadow-sm"
                : "text-ui-muted hover:text-ui-text"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>{language === "pl" ? `Podepnij Istniejące (${dbSubprojects.length})` : `Bestehende zuweisen (${dbSubprojects.length})`}</span>
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-xl text-red-400 text-xs flex items-center gap-2">
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs flex items-center gap-2">
            <Check className="w-4 h-4" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Tab 1: Tenant Package Creator */}
        {tabMode === "tenant" && (
          <form onSubmit={handleTenantSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-ui-muted uppercase tracking-wider mb-1.5">
                {p.tenantNameLabel} *
              </label>
              <input
                type="text"
                required
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
                placeholder={p.tenantNamePlaceholder}
                className="w-full px-4 py-2.5 bg-ui-bg border border-ui-border rounded-xl text-ui-text placeholder-ui-muted/50 focus:outline-none focus:border-ui-accent transition text-sm font-medium"
                autoFocus
              />

              {/* Presets */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {tenantPresets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setTenantName(preset)}
                    className="px-2.5 py-1 bg-white/5 border border-ui-border rounded-lg text-[11px] font-medium text-ui-muted hover:text-ui-text hover:border-ui-accent transition"
                  >
                    + {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Floor Checkboxes */}
            <div className="p-4 bg-ui-bg/50 border border-ui-border rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-ui-text uppercase tracking-wider block">
                  {language === "pl" ? "Wybierz piętra dla tego najemcy:" : "Geschosse für diesen Mieter wählen:"}
                </span>
                <span className="text-[11px] text-ui-accent font-semibold">
                  {language === "pl" ? `Zaznaczono: ${selectedFloors.length}` : `Ausgewählt: ${selectedFloors.length}`}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {defaultFloorOptions.map((floor) => {
                  const isChecked = selectedFloors.includes(floor);
                  return (
                    <div
                      key={floor}
                      onClick={() => toggleFloor(floor)}
                      className={`flex items-center gap-2 p-2 rounded-lg border transition cursor-pointer text-xs ${
                        isChecked
                          ? "bg-ui-accent/15 border-ui-accent text-ui-text font-bold"
                          : "bg-white/5 border-ui-border/50 text-ui-muted hover:bg-white/10"
                      }`}
                    >
                      {isChecked ? (
                        <CheckSquare className="w-4 h-4 text-ui-accent flex-shrink-0" />
                      ) : (
                        <Square className="w-4 h-4 text-ui-muted flex-shrink-0" />
                      )}
                      <span className="truncate">{floor}</span>
                    </div>
                  );
                })}
              </div>

              {/* Custom Floor Input */}
              <div className="flex items-center gap-2 pt-2 border-t border-ui-border/50">
                <input
                  type="text"
                  value={customFloorInput}
                  onChange={(e) => setCustomFloorInput(e.target.value)}
                  placeholder={language === "pl" ? "Inne piętro / zakres (np. Magazyn)..." : "Weiteres Geschoss / Bereich (z.B. Lager)..."}
                  className="flex-1 bg-ui-bg border border-ui-border rounded-lg px-3 py-1.5 text-xs text-ui-text outline-none focus:border-ui-accent"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomFloor();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={addCustomFloor}
                  disabled={!customFloorInput.trim()}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/15 text-ui-text rounded-lg text-xs font-bold transition disabled:opacity-50"
                >
                  {language === "pl" ? "Dodaj" : "Hinzufügen"}
                </button>
              </div>

              {/* Preview of created names */}
              {tenantName.trim() && selectedFloors.length > 0 && (
                <div className="p-2.5 bg-ui-bg/70 border border-ui-border/60 rounded-lg text-xs space-y-1">
                  <span className="font-bold text-ui-muted block text-[10px] uppercase">
                    {language === "pl" ? "Zostaną utworzone podprojekty:" : "Erstellte Bereiche:"}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedFloors.map((fl) => {
                      const label = fl === "Główny / Gesamt" ? `${tenantName.trim()} (Główny)` : `${tenantName.trim()} ${fl}`;
                      return (
                        <span key={fl} className="px-2 py-0.5 rounded bg-ui-accent/10 border border-ui-accent/30 text-ui-text text-[11px] font-mono">
                          {label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-ui-border">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-semibold text-ui-muted hover:text-ui-text rounded-xl transition hover:bg-white/5"
              >
                {p.cancel}
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !tenantName.trim() || selectedFloors.length === 0}
                className="flex items-center gap-2 px-6 py-2.5 bg-ui-accent text-ui-bg rounded-xl font-bold text-sm hover:opacity-90 transition shadow-lg disabled:opacity-50"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                <span>{isSubmitting ? p.saving : language === "pl" ? `Utwórz pakiet (${selectedFloors.length} pięter)` : `Paket erstellen (${selectedFloors.length} Geschosse)`}</span>
              </button>
            </div>
          </form>
        )}

        {/* Tab 2: Single Subproject */}
        {tabMode === "single" && (
          <form onSubmit={handleSingleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-ui-muted uppercase tracking-wider mb-1.5">
                {p.scopeNameLabel} *
              </label>
              <input
                type="text"
                required
                value={singleName}
                onChange={(e) => setSingleName(e.target.value)}
                placeholder={p.scopeNamePlaceholder}
                className="w-full px-4 py-2.5 bg-ui-bg border border-ui-border rounded-xl text-ui-text placeholder-ui-muted/50 focus:outline-none focus:border-ui-accent transition text-sm font-medium"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ui-muted uppercase tracking-wider mb-1.5">
                {p.tenantNameLabel}
              </label>
              <input
                type="text"
                value={parentGroup}
                onChange={(e) => setParentGroup(e.target.value)}
                placeholder={p.tenantNamePlaceholder}
                className="w-full px-4 py-2.5 bg-ui-bg border border-ui-border rounded-xl text-ui-text placeholder-ui-muted/50 focus:outline-none focus:border-ui-accent transition text-sm font-medium"
              />
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-ui-border">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-semibold text-ui-muted hover:text-ui-text rounded-xl transition hover:bg-white/5"
              >
                {p.cancel}
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !singleName.trim()}
                className="flex items-center gap-2 px-6 py-2.5 bg-ui-accent text-ui-bg rounded-xl font-bold text-sm hover:opacity-90 transition shadow-lg disabled:opacity-50"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                <span>{isSubmitting ? p.saving : p.addSubprojectBtn}</span>
              </button>
            </div>
          </form>
        )}

        {/* Tab 3: Manage / Link Existing Subprojects */}
        {tabMode === "manage" && (
          <div className="space-y-4">
            <div>
              <span className="text-xs font-bold text-ui-text uppercase tracking-wider block">
                {language === "pl" ? "Zarządzaj istniejącymi podprojektami i przypisz je do najemców:" : "Bestehende Bereiche verwalten und Mietern zuordnen:"}
              </span>
              <p className="text-[11px] text-ui-muted">
                {language === "pl" ? "Przypisz nadrzędnego najemcę (np. Grundfos, Sapporo) do istniejących podprojektów, aby uporządkować je w zakładkach i raportach." : "Ordnen Sie einen übergeordneten Mieter zu, um Geschosse übersichtlich zusammenzufassen."}
              </p>
            </div>

            {loadingDbSubs ? (
              <div className="py-8 text-center">
                <Loader2 className="w-6 h-6 animate-spin text-ui-accent mx-auto" />
              </div>
            ) : dbSubprojects.length === 0 ? (
              <div className="p-4 text-center text-xs text-ui-muted border border-dashed border-ui-border rounded-xl">
                {language === "pl" ? "Brak zapisanych podprojektów." : "Keine Bereiche vorhanden."}
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1 scrollbar-thin">
                {dbSubprojects.map((sub) => {
                  const isEditing = editingSubId === sub.id;

                  if (isEditing) {
                    return (
                      <div
                        key={sub.id}
                        className="p-3 rounded-xl bg-ui-accent/10 border border-ui-accent space-y-2.5 text-xs"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] uppercase font-bold text-ui-muted block mb-1">{p.nameLabel}:</label>
                            <input
                              type="text"
                              value={editingSubName}
                              onChange={(e) => setEditingSubName(e.target.value)}
                              className="w-full bg-ui-bg border border-ui-border rounded-lg px-2.5 py-1.5 text-ui-text text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] uppercase font-bold text-ui-muted block mb-1">{p.parentTenant}:</label>
                            <input
                              type="text"
                              value={editingSubGroup}
                              onChange={(e) => setEditingSubGroup(e.target.value)}
                              placeholder={p.tenantNamePlaceholder}
                              className="w-full bg-ui-bg border border-ui-border rounded-lg px-2.5 py-1.5 text-ui-text text-xs font-semibold"
                            />
                          </div>
                        </div>

                        {/* Quick Presets for Edit */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <span className="text-[10px] text-ui-muted font-bold">{p.parentTenant}:</span>
                          {tenantPresets.map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => setEditingSubGroup(preset)}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold border transition ${
                                editingSubGroup.toLowerCase() === preset.toLowerCase()
                                  ? "bg-ui-accent text-ui-bg border-ui-accent"
                                  : "bg-white/5 border-ui-border text-ui-muted hover:text-ui-text hover:border-ui-accent"
                              }`}
                            >
                              {preset}
                            </button>
                          ))}
                        </div>

                        <div className="flex justify-end gap-2 pt-1 border-t border-ui-border/50">
                          <button
                            type="button"
                            onClick={() => setEditingSubId(null)}
                            className="px-3 py-1.5 text-xs text-ui-muted hover:text-ui-text font-semibold rounded-lg hover:bg-white/5"
                          >
                            {p.cancel}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveSubprojectEdit(sub)}
                            disabled={isSubmitting}
                            className="flex items-center gap-1 px-4 py-1.5 bg-ui-accent text-ui-bg rounded-lg text-xs font-bold shadow-md"
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span>{p.saveChanges}</span>
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={sub.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-ui-border/50 text-xs hover:border-ui-border transition"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-ui-accent/15 text-ui-accent flex items-center justify-center flex-shrink-0">
                          <GitBranch className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <span className="font-bold text-ui-text block">{sub.name}</span>
                          {sub.parent_group ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-sky-300 bg-sky-500/15 px-2 py-0.5 rounded-md border border-sky-500/30 font-semibold mt-0.5">
                              <Building2 className="w-3 h-3" />
                              <span>{p.parentTenant} {sub.parent_group}</span>
                            </span>
                          ) : (
                            <span className="text-[10px] text-amber-400/80 italic mt-0.5 block">
                              {language === "pl" ? "Brak przypisanego najemcy" : "Kein Mieter zugeordnet"}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingSubId(sub.id);
                            setEditingSubName(sub.name);
                            // Auto-infer group if not set
                            let defaultGrp = sub.parent_group || "";
                            if (!defaultGrp) {
                              if (sub.name.toLowerCase().includes("grundfos")) defaultGrp = "Grundfos";
                              else if (sub.name.toLowerCase().includes("sapporo") || sub.name.toLowerCase().includes("saporro")) defaultGrp = "Sapporo";
                              else if (sub.name.toLowerCase().includes("praxis")) defaultGrp = "Praxis Dr. Schmidt";
                            }
                            setEditingSubGroup(defaultGrp);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-300 hover:bg-sky-500/20 text-xs font-bold transition"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>{p.edit}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onSelectSubproject(sub.name);
                            onClose();
                          }}
                          className="px-3 py-1.5 rounded-lg bg-ui-accent/15 border border-ui-accent/30 text-ui-accent hover:bg-ui-accent/25 text-xs font-bold transition"
                        >
                          {language === "pl" ? "Wybierz" : "Wählen"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-end pt-3 border-t border-ui-border">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-semibold text-ui-muted hover:text-ui-text rounded-xl transition hover:bg-white/5"
              >
                {p.close}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
