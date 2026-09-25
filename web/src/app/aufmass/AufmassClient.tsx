"use client";

import React, { useEffect, useState } from "react";
import { apiGet, apiPost, apiDelete, getApiUrl, getToken } from "@/lib/apiClient";
import { getPlanImageBase64 } from "@/lib/planImageHelper";
import { renderAnnotatedImage } from "@/lib/aufmassRenderer";
import { useLanguage } from "@/contexts/LanguageContext";
import { useRouter } from "next/navigation";
import { pdf } from "@react-pdf/renderer";
import { AufmassPdf } from "../reports/AufmassPdf";

export default function AufmassClient() {
  const { t, language } = useLanguage();
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const [showNewModal, setShowNewModal] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [newProjectId, setNewProjectId] = useState("");
  const [newPlanId, setNewPlanId] = useState("");
  const [newType, setNewType] = useState<"aufmass" | "zusatz" | "baubehinderung" | "bestellung" | "fragen">("aufmass");
  const [newName, setNewName] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [creating, setCreating] = useState(false);

  const [generatingPdf, setGeneratingPdf] = useState<string | null>(null);

  useEffect(() => {
    if (showNewModal && projects.length === 0) {
      apiGet<any[]>("/api/projects").then(p => {
        if (p && p.length > 0) {
          setProjects(p);
          setNewProjectId(p[0].id);
        }
      });
    }
  }, [showNewModal]);

  useEffect(() => {
    if (newProjectId) {
      apiGet<any[]>(`/api/plans?projectId=${encodeURIComponent(newProjectId)}`).then(pl => {
        if (pl && pl.length > 0) {
          setPlans(pl);
          setNewPlanId(pl[0].id);
        } else {
          setPlans([]);
          setNewPlanId("");
        }
      });
    }
  }, [newProjectId]);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const data = await apiGet<any[]>("/api/aufmass/sessions");
      setSessions(data || []);
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleCreateSession = async () => {
    if (!newProjectId || !newPlanId || !newName) return;
    setCreating(true);
    try {
      const res = await apiPost<any>("/api/aufmass/sessions", {
        project_id: newProjectId,
        plan_id: newPlanId,
        session_type: newType,
        name: newName,
        client_name: newType === 'aufmass' ? newClientName : null,
        client_phone: newType === 'aufmass' ? newClientPhone : null,
        client_email: newType === 'aufmass' ? newClientEmail : null,
      });
      router.push(`/aufmass/${res.id}`);
    } catch (e: any) {
      alert("Failed to create session: " + e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDownloadPdf = async (session: any) => {
    try {
      setGeneratingPdf(session.id);
      
      const [materials, labor, markers, photos] = await Promise.all([
        apiGet<any[]>(`/api/aufmass/materials?sessionId=${session.id}`),
        apiGet<any[]>(`/api/aufmass/labor?sessionId=${session.id}`),
        apiGet<any[]>(`/api/aufmass/markers?sessionId=${session.id}`),
        apiGet<any[]>(`/api/aufmass-photos?sessionId=${session.id}`)
      ]);

      const annotatedPhotos = await Promise.all((photos || []).map(async (photo, index) => {
        let base64Image = "";
        try {
          // Fetch original image as base64 first to avoid Canvas CORS tainting
          const res = await fetch(getApiUrl(photo.url));
          const blob = await res.blob();
          const origBase64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
          base64Image = origBase64; // Fallback to original if rendering fails

          const versions = await apiGet<any[]>(`/api/aufmass/versions?sessionId=${session.id}&photoId=${photo.id}`);
          const latestShapes = versions && versions.length > 0 ? versions[0].data : [];
          base64Image = await renderAnnotatedImage(origBase64, latestShapes || [], photo.created_at);
        } catch(e) {
          console.error("Failed to render annotated photo for PDF", e);
        }
        return {
          id: photo.id,
          url: photo.url,
          caption: photo.caption || '',
          index: index + 1,
          annotatedBase64: base64Image
        };
      }));

      let planImageBase64 = "";
      let planWidth = 1000;
      let planHeight = 700;
      if (session.plan_id) {
         try {
           const plansRes = await apiGet<any[]>(`/api/plans?projectId=${session.project_id}`);
           const currentPlan = plansRes?.find(p => p.id === session.plan_id);
           if (currentPlan) {
             const token = await getToken();
             const b64 = await getPlanImageBase64(currentPlan, token);
             if (b64) planImageBase64 = b64;
             if (currentPlan.image_width) planWidth = currentPlan.image_width;
             if (currentPlan.image_height) planHeight = currentPlan.image_height;
           }
         } catch (e) {
           console.error("Failed to load plan map for PDF", e);
         }
      }

      const planLocationDict = {
        pl: "Lokalizacja na planie",
        de: "Standort auf dem Plan",
        sk: "Umiestnenie na pláne",
        en: "Location on plan"
      };
      const planLocationText = planLocationDict[language as keyof typeof planLocationDict] || planLocationDict.en;

      const doc = (
        <AufmassPdf
          session={session}
          materials={materials || []}
          labor={labor || []}
          annotatedPhotos={annotatedPhotos}
          planImageBase64={planImageBase64}
          planWidth={planWidth}
          planHeight={planHeight}
          projectName={session.projects?.name || session.project_id || "Project"}
          translations={{
            planLocation: planLocationText,
            questionLabel: t("aufmass", "questionLabel", "Question"),
            answerLabel: t("aufmass", "answerLabel", "Answer"),
            descriptionTab: t("aufmass", "descriptionTab", "Description"),
            owner: t("footer", "owner", "Inhaber: Marcin Slapinski"),
          }}
          markers={markers || []}
        />
      );

      const asPdf = pdf();
      asPdf.updateContainer(doc);
      const blob = await asPdf.toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const defaultName = `${session.session_type === 'zusatz' ? 'Zusatz' : session.session_type === 'baubehinderung' ? 'Baubehinderung' : session.session_type === 'bestellung' ? 'Bestellung' : session.session_type === 'fragen' ? 'Fragen' : 'Aufmass'}_${session.name.replace(/[^a-zA-Z0-9]/g, "_")}`;
      const enterFilenameDict = {
        pl: "Wprowadź nazwę pliku dla PDF:",
        de: "Geben Sie den Dateinamen für das PDF ein:",
        sk: "Zadajte názov súboru pre PDF:",
        en: "Enter filename for PDF:"
      };
      const enterFilenameText = enterFilenameDict[language as keyof typeof enterFilenameDict] || enterFilenameDict.en;
      
      const customName = window.prompt(enterFilenameText, defaultName);
      if (customName === null) return; // User cancelled
      
      a.download = `${customName || defaultName}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      const failedPdfDict = {
        pl: "Nie udało się wygenerować PDF: ",
        de: "Fehler beim Generieren der PDF: ",
        sk: "Nepodarilo sa vygenerovať PDF: ",
        en: "Failed to generate PDF: "
      };
      const failedPdfText = failedPdfDict[language as keyof typeof failedPdfDict] || failedPdfDict.en;
      alert(failedPdfText + err.message);
    } finally {
      setGeneratingPdf(null);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tighter text-ui-text">
            {t("nav", "aufmass", "Aufmaß & Zusatzplanung")}
          </h1>
          <p className="text-[11px] font-bold text-ui-muted/50 uppercase tracking-widest mt-1">
            {t("aufmass", "subtitle", "All Measurement and Planning Sessions")}
          </p>
        </div>
        <div className="flex gap-4">
          <button
            onClick={() => setShowNewModal(true)}
            className="px-6 py-2 rounded-lg bg-ui-accent text-ui-bg text-[10px] font-black uppercase tracking-widest hover:brightness-110 transition-all shadow-[0_0_20px_rgba(56,189,248,0.2)]"
          >
            {t("aufmass", "newSessionBtn", "+ New Aufmaß / Zusatz")}
          </button>
          <button
            onClick={fetchSessions}
            className="w-10 h-10 flex items-center justify-center rounded-lg bg-white/5 border border-ui-border text-ui-muted hover:text-ui-text hover:bg-white/10 transition-all"
          >
            ↻
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 mb-8 bg-danger/10 border border-danger/20 rounded-xl text-danger text-xs font-black uppercase tracking-widest">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center p-12 text-sm font-black uppercase tracking-widest text-ui-muted animate-pulse">
          {t("common", "loading", "Ładowanie...")}
        </div>
      ) : sessions.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-ui-border/30 rounded-xl text-[12px] font-black uppercase tracking-widest text-ui-muted/50">
          {t("aufmass", "noSessions", "No Aufmaß sessions found.")}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sessions.map((session) => (
            <div key={session.id} className="bg-ui-card border border-ui-border rounded-xl p-6 flex flex-col gap-4 shadow-xl hover:shadow-2xl transition-all">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-black text-ui-text leading-tight">{session.name}</h3>
                  <div className="text-[10px] font-bold text-ui-muted uppercase tracking-wider mt-1">
                    {new Date(session.created_at).toLocaleDateString()} · {session.profiles?.full_name || "Unknown"}
                  </div>
                </div>
                <div className={`px-2 py-1 rounded text-[8px] font-black uppercase tracking-widest ${
                  session.status === 'completed' ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'
                }`}>
                  {session.status}
                </div>
              </div>
              
              <p className="text-xs text-ui-muted/80 font-medium line-clamp-2 min-h-[2rem]">
                {session.description || t("aufmass", "noDescription", "No description provided.")}
              </p>
              <div className="text-[10px] font-bold text-ui-accent uppercase tracking-widest">
                {t("aufmass", "type", "Type")}: {session.session_type === 'zusatz' ? t("aufmass", "zusatz", "Zusatzplanung") : session.session_type === 'baubehinderung' ? t("aufmass", "baubehinderung", "Baubehinderung") : session.session_type === 'bestellung' ? t("aufmass", "bestellung", "Bestellung") : session.session_type === 'fragen' ? t("aufmass", "fragen", "Fragen") : t("aufmass", "aufmass", "Aufmaß")}
              </div>

              <div className="flex gap-3 mt-2 pt-4 border-t border-ui-border/50">
                <button
                  onClick={() => router.push(`/aufmass/${session.id}`)}
                  className="flex-1 py-2 rounded-lg bg-ui-accent/10 border border-ui-accent/20 text-ui-accent text-[10px] font-black uppercase tracking-widest hover:bg-ui-accent hover:text-ui-bg transition-all"
                >
                  {t("aufmass", "editBtn", "Edit / Map / Photos")}
                </button>
                <button
                  onClick={() => handleDownloadPdf(session)}
                  disabled={generatingPdf === session.id}
                  className="flex-1 py-2 rounded-lg bg-white/5 border border-ui-border text-ui-text text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all disabled:opacity-50"
                >
                  {generatingPdf === session.id ? t("aufmass", "generating", "Generating...") : "PDF"}
                </button>
                <button
                  onClick={async () => {
                    if (!confirm(t("aufmass", "deleteSessionConfirm", "Are you sure you want to delete this session?"))) return;
                    try {
                      await apiDelete(`/api/aufmass/sessions?id=${session.id}`);
                      fetchSessions();
                    } catch (e: any) {
                      setError(e.message);
                    }
                  }}
                  className="w-10 flex-shrink-0 py-2 rounded-lg bg-danger/10 border border-danger/20 text-danger text-[12px] font-black hover:bg-danger hover:text-white transition-all flex items-center justify-center"
                  title="Delete Session"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => {
          setShowNewModal(false);
          setNewClientName("");
          setNewClientPhone("");
          setNewClientEmail("");
          setNewName("");
        }}>
          <div className="bg-ui-card w-full max-w-md rounded-xl p-6 shadow-2xl border border-ui-border flex flex-col" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-black uppercase tracking-tighter text-ui-text mb-6">
              {t("aufmass", "createModalTitle", "Create New Session")}
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-ui-muted uppercase tracking-widest mb-1 block">
                  {t("common", "name", "Name")}
                </label>
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder={t("aufmass", "namePlaceholder", "E.g. Aufmaß Kabeltrassen")}
                  className="w-full bg-ui-bg border border-ui-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-ui-accent transition-all text-ui-text"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-ui-muted uppercase tracking-widest mb-1 block">
                  {t("common", "project", "Project")}
                </label>
                <select
                  value={newProjectId}
                  onChange={e => setNewProjectId(e.target.value)}
                  className="w-full bg-ui-bg border border-ui-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-ui-accent transition-all text-ui-text"
                >
                  {projects.map(p => <option key={p.id} value={p.id}>{p.companies?.name ? `[${p.companies.name.toUpperCase()}] ` : ""}{p.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-ui-muted uppercase tracking-widest mb-1 block">
                  {t("common", "plan", "Plan")}
                </label>
                <select
                  value={newPlanId}
                  onChange={e => setNewPlanId(e.target.value)}
                  className="w-full bg-ui-bg border border-ui-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-ui-accent transition-all text-ui-text"
                >
                  {plans.map(p => {
                    const bName = p.floors?.buildings?.name || p.floor?.building?.name || p.floor?.buildings?.name || "";
                    const fName = p.floors?.name || p.floor?.name || "";
                    const parts = [bName, fName].filter(Boolean);
                    const name = parts.length > 0 ? parts.join(" - ") : (p.name || p.id);
                    return <option key={p.id} value={p.id}>{name} {p.version ? `(v${p.version})` : ""}</option>;
                  })}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-ui-muted uppercase tracking-widest mb-1 block">
                  {t("aufmass", "type", "Type")}
                </label>
                <select
                  value={newType}
                  onChange={e => setNewType(e.target.value as any)}
                  className="w-full bg-ui-bg border border-ui-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-ui-accent transition-all text-ui-text"
                >
                  <option value="aufmass">{t("aufmass", "aufmass", "Aufmaß")}</option>
                  <option value="zusatz">{t("aufmass", "zusatz", "Zusatzplanung")}</option>
                  <option value="baubehinderung">{t("aufmass", "baubehinderung", "Baubehinderung")}</option>
                  <option value="bestellung">{t("aufmass", "bestellung", "Bestellung")}</option>
                  <option value="fragen">{t("aufmass", "fragen", "Fragen")}</option>
                </select>
              </div>

              {newType === 'aufmass' && (
                <div className="space-y-4 pt-4 border-t border-ui-border/50">
                  <h3 className="text-xs font-black uppercase tracking-widest text-ui-text">
                    {t("aufmass", "clientDetailsTitle", "Client Contact Details (Optional)")}
                  </h3>
                  <div>
                    <label className="text-[10px] font-bold text-ui-muted uppercase tracking-widest mb-1 block">
                      {t("aufmass", "clientNameLabel", "Name / Company")}
                    </label>
                    <input
                      value={newClientName}
                      onChange={e => setNewClientName(e.target.value)}
                      placeholder={t("aufmass", "clientNamePlaceholder", "e.g. John Doe / ACME Corp")}
                      className="w-full bg-ui-bg border border-ui-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-ui-accent transition-all text-ui-text"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-ui-muted uppercase tracking-widest mb-1 block">
                        {t("common", "phone", "Phone")}
                      </label>
                      <input
                        value={newClientPhone}
                        onChange={e => setNewClientPhone(e.target.value)}
                        placeholder="+49..."
                        className="w-full bg-ui-bg border border-ui-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-ui-accent transition-all text-ui-text"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-ui-muted uppercase tracking-widest mb-1 block">
                        {t("common", "email", "Email")}
                      </label>
                      <input
                        value={newClientEmail}
                        type="email"
                        onChange={e => setNewClientEmail(e.target.value)}
                        placeholder="client@example.com"
                        className="w-full bg-ui-bg border border-ui-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-ui-accent transition-all text-ui-text"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-8 flex gap-3">
              <button
                onClick={() => {
                  setShowNewModal(false);
                  setNewClientName("");
                  setNewClientPhone("");
                  setNewClientEmail("");
                  setNewName("");
                }}
                className="flex-1 py-3 rounded-lg bg-white/5 hover:bg-white/10 text-ui-text text-xs font-black uppercase tracking-widest transition-all"
              >
                {t("common", "cancel", "Cancel")}
              </button>
              <button
                onClick={handleCreateSession}
                disabled={creating || !newProjectId || !newPlanId || !newName}
                className="flex-1 py-3 rounded-lg bg-ui-accent hover:brightness-110 text-ui-bg text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50 shadow-[0_0_20px_rgba(56,189,248,0.2)]"
              >
                {creating ? t("common", "creating", "Creating...") : t("aufmass", "createBtn", "Create")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
