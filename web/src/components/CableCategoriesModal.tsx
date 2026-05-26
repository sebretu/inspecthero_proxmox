"use client";
import { useState, useEffect } from "react";
import { apiGet, apiPost, apiDelete } from "@/lib/apiClient";
import dynamic from "next/dynamic";

const SingleMap = dynamic(
  () => import("./CableRouteSingleMap").then(m => ({ default: m.CableRouteSingleMap })),
  { ssr: false }
);

interface Pin { x: number; y: number }

interface Category {
  id: string;
  project_id: string;
  name: string;
  plan_id: string;
  point_a_x: number;
  point_a_y: number;
  point_a_label: string;
}

interface Props {
  projectId: string;
  token: string | null;
  onClose: () => void;
}

import { useLanguage } from "@/contexts/LanguageContext";

export function CableCategoriesModal({ projectId, token, onClose }: Props) {
  const { t } = useLanguage();
  const [categories, setCategories] = useState<Category[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Create mode state
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLabel, setNewLabel] = useState("Punkt A");
  const [planId, setPlanId] = useState("");
  const [pinA, setPinA] = useState<Pin | null>(null);

  useEffect(() => {
    Promise.all([
      apiGet<Category[]>(`/api/cable-categories?projectId=${projectId}`),
      apiGet<any[]>(`/api/plans?projectId=${projectId}`)
    ]).then(([cats, p]) => {
      setCategories(cats || []);
      const ps = (p || []).map((p: any) => {
        const floorName = p.floors?.name || "";
        const buildingName = p.floors?.buildings?.name || "";
        const version = p.version ? `v${p.version}` : "";
        const fileName = p.pdf_path?.split('/').pop() || "";
        const label = [buildingName, floorName, version, fileName].filter(Boolean).join(" · ") || p.id.slice(0, 8);
        return { id: p.id, name: label };
      });
      setPlans(ps);
    }).finally(() => setLoading(false));
  }, [projectId]);

  async function handleCreate() {
    if (!newName.trim() || !planId || !pinA) return;
    try {
      const cat = await apiPost<Category>("/api/cable-categories", {
        project_id: projectId,
        name: newName.trim(),
        plan_id: planId,
        point_a_x: pinA.x,
        point_a_y: pinA.y,
        point_a_label: newLabel.trim() || "Rozdzielnia"
      });
      setCategories(prev => [...prev, cat]);
      setIsCreating(false);
      setNewName("");
      setNewLabel(t("cables", "pointAnameLabel", "Punkt A"));
      setPlanId("");
      setPinA(null);
    } catch (e) {
      alert("Error saving category");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t("cables", "deleteCategoryConfirm", "Czy na pewno chcesz usunąć tę rozdzielnię/kategorię? Kable pozostaną przypisane do swoich tras."))) return;
    try {
      await apiDelete(`/api/cable-categories?id=${id}`);
      setCategories(prev => prev.filter(c => c.id !== id));
    } catch {}
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 30000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)" }}>
      <div style={{ width: "min(800px, 94vw)", maxHeight: "90vh", background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        
        <div style={{ padding: "16px 22px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: "#fff" }}>{t("cables", "categoriesModalTitle", "⚙️ Kategorie (Rozdzielnie)")}</h2>
          <button onClick={onClose} style={{ background: "transparent", color: "#888", border: "none", fontSize: 16, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ padding: 22, overflowY: "auto", flex: 1 }}>
          {loading ? (
            <div style={{ color: "#888" }}>{t("common", "loading", "Ładowanie...")}</div>
          ) : isCreating ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", gap: 10 }}>
                <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, color: "#aaa", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>
                  {t("cables", "categoryNameLabel", "Nazwa kategorii (Rozdzielni)")}
                  <input value={newName} onChange={e => setNewName(e.target.value)} placeholder={t("cables", "categoryNamePlaceholder", "np. Notbeleuchtung")} style={{ padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "#000", color: "#fff" }} />
                </label>
                <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, color: "#aaa", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>
                  {t("cables", "pointAnameLabel", "Nazwa Punktu A")}
                  <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder={t("cables", "pointAnamePlaceholder", "np. Szafa 1")} style={{ padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "#000", color: "#fff" }} />
                </label>
              </div>

              <label style={{ display: "flex", flexDirection: "column", gap: 4, color: "#aaa", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>
                {t("cables", "planSelectLabel", "Plan budynku")}
                <select value={planId} onChange={e => { setPlanId(e.target.value); setPinA(null); }} style={{ padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "#000", color: "#fff" }}>
                  <option value="">{t("cables", "planSelectPlaceholder", "Wybierz plan...")}</option>
                  {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>

              {planId && (
                <div style={{ height: 350, borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)", position: "relative" }}>
                  <div style={{ position: "absolute", top: 10, left: 10, zIndex: 1000, background: "rgba(0,0,0,0.8)", padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 800, color: "#38bdf8" }}>
                    {t("cables", "clickMapPointA", "📍 Kliknij na mapie, aby ustawić Punkt A")}
                  </div>
                  <SingleMap
                    planId={planId} token={token}
                    pinA={pinA} pinB={pinA} // fake pinB to prevent line drawing bugs if any, or just pass pinA
                    setPinA={setPinA} setPinB={() => {}}
                    picking="A"
                    waypoints={[]} setWaypoints={() => {}}
                  />
                </div>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                <button onClick={() => setIsCreating(false)} style={{ flex: 1, padding: 12, borderRadius: 10, background: "rgba(255,255,255,0.05)", color: "#fff", border: "1px solid rgba(255,255,255,0.1)", fontWeight: 800, cursor: "pointer" }}>{t("cables", "cancelBtn", "Anuluj")}</button>
                <button onClick={handleCreate} disabled={!newName || !planId || !pinA} style={{ flex: 2, padding: 12, borderRadius: 10, background: (!newName || !planId || !pinA) ? "rgba(255,255,255,0.1)" : "#38bdf8", color: (!newName || !planId || !pinA) ? "#888" : "#000", border: "none", fontWeight: 900, cursor: (!newName || !planId || !pinA) ? "not-allowed" : "pointer" }}>
                  {t("cables", "saveCategoryBtn", "Zapisz Kategorię")}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <button onClick={() => setIsCreating(true)} style={{ width: "100%", padding: 14, borderRadius: 12, background: "rgba(56,189,248,0.1)", border: "1px dashed rgba(56,189,248,0.4)", color: "#38bdf8", fontWeight: 800, cursor: "pointer" }}>
                {t("cables", "addCategoryBtn", "+ Dodaj nową Kategorię (Rozdzielnię)")}
              </button>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {categories.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 30, color: "#666", fontSize: 13, fontWeight: 600 }}>{t("cables", "noCategories", "Brak zapisanych kategorii.")}</div>
                ) : categories.map(c => (
                  <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>{t("cables", "pointAnameLabel", "Punkt A")}: <span style={{ color: "#38bdf8" }}>{c.point_a_label}</span></div>
                    </div>
                    <button onClick={() => handleDelete(c.id)} style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "none", padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>{t("cables", "deleteBtn", "Usuń")}</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
