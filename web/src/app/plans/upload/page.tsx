"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiGet, apiPost, getToken, getApiUrl } from "@/lib/apiClient";
import { supabase } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";

type Project = { id: string; name: string; company_id?: string | null; companies?: { name: string } | null };
type Building = { id: string; name: string };
type Floor = { id: string; name: string; level: number | null; building_id: string };

export default function PlansUploadPage() {
  const router = useRouter();
  const { t } = useLanguage();

  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [viewerProfile, setViewerProfile] = useState<{ id: string; role: string | null } | null>(null);

  const [projects, setProjects] = useState<Project[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);

  const [projectId, setProjectId] = useState("");
  const [buildingId, setBuildingId] = useState("");
  const [floorId, setFloorId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // Creation states
  const [newBuildingName, setNewBuildingName] = useState("");
  const [creatingBuilding, setCreatingBuilding] = useState(false);
  const [newFloorName, setNewFloorName] = useState("");
  const [newFloorLevel, setNewFloorLevel] = useState("");
  const [creatingFloor, setCreatingFloor] = useState(false);

  const isAdmin = (viewerProfile?.role || "").toUpperCase() === "ADMIN";

  const handleAuthRedirect = useCallback((message: string) => {
    const msg = message.toLowerCase();
    if (msg.includes("bearer token") || msg.includes("auth_required") || msg.includes("auth invalid")) {
      router.replace("/auth/login");
      return true;
    }
    return false;
  }, [router]);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (!data?.session) {
        router.replace("/auth/login");
        return;
      }
      const authId = data.session.user.id;
      supabase.from("profiles").select("id, role").eq("id", authId).single().then(({ data: profile }) => {
        if (!active) return;
        setViewerProfile(profile || null);
        setSessionChecked(true);
      });
    });
    return () => { active = false; };
  }, [router]);

  useEffect(() => {
    if (!sessionChecked || !isAdmin) return;
    let active = true;
    setProjectsLoading(true);
    (async () => {
      try {
        const token = await getToken();
        if (!token) { handleAuthRedirect("Missing token"); return; }
        const ps = await apiGet<Project[]>("/api/projects", token);
        if (!active) return;
        setProjects(ps);
        if (ps.length > 0 && !projectId) setProjectId(ps[0].id);
      } catch (e: any) {
        if (active) setErr(e.message);
      } finally {
        if (active) setProjectsLoading(false);
      }
    })();
    return () => { active = false; };
  }, [sessionChecked, isAdmin, projectId, handleAuthRedirect]);

  useEffect(() => {
    if (!projectId || !sessionChecked || !isAdmin) return;
    let active = true;
    (async () => {
      try {
        const token = await getToken();
        const bs = await apiGet<Building[]>(`/api/buildings?projectId=${encodeURIComponent(projectId)}`, token!);
        if (!active) return;
        setBuildings(bs);
        if (bs.length > 0 && !bs.find(b => b.id === buildingId)) setBuildingId(bs[0].id);
      } catch (e: any) { if (active) setErr(e.message); }
    })();
    return () => { active = false; };
  }, [projectId, sessionChecked, isAdmin, buildingId]);

  useEffect(() => {
    if (!projectId || !sessionChecked || !isAdmin) return;
    let active = true;
    (async () => {
      try {
        const token = await getToken();
        const fs = await apiGet<Floor[]>(`/api/floors?projectId=${encodeURIComponent(projectId)}`, token!);
        if (!active) return;
        const relevantFloors = buildingId ? fs.filter(f => f.building_id === buildingId) : [];
        setFloors(relevantFloors);
        if (relevantFloors.length > 0 && !relevantFloors.find(f => f.id === floorId)) setFloorId(relevantFloors[0].id);
      } catch (e: any) { if (active) setErr(e.message); }
    })();
    return () => { active = false; };
  }, [projectId, buildingId, sessionChecked, isAdmin, floorId]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.type === "application/pdf") setFile(droppedFile);
      else setErr(t("planUpload", "errorMissingFile", "Please select a PDF file."));
    }
  };

  async function createBuilding() {
    if (!projectId || !newBuildingName.trim()) return;
    setCreatingBuilding(true);
    try {
      const created = await apiPost<Building>("/api/buildings", { project_id: projectId, name: newBuildingName.trim() });
      setBuildings(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setBuildingId(created.id);
      setNewBuildingName("");
    } catch (e: any) { setErr(e.message); }
    finally { setCreatingBuilding(false); }
  }

  async function createFloor() {
    if (!projectId || !newFloorName.trim()) return;
    setCreatingFloor(true);
    try {
      const level = newFloorLevel.trim() === "" ? null : Number(newFloorLevel);
      const created = await apiPost<Floor>("/api/floors", { projectId, buildingId, name: newFloorName.trim(), level });
      setFloors(prev => [...prev, created].sort((a, b) => (a.level || 0) - (b.level || 0)));
      setFloorId(created.id);
      setNewFloorName("");
      setNewFloorLevel("");
    } catch (e: any) { setErr(e.message); }
    finally { setCreatingFloor(false); }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !projectId || !floorId) {
      setErr(t("planUpload", "errorMissingFields", "Fill in all fields."));
      return;
    }
    setBusy(true); setErr(null); setOk(null);
    try {
      const token = await getToken();
      const fd = new FormData();
      fd.append("projectId", projectId);
      fd.append("floorId", floorId);
      fd.append("file", file);
      const r = await fetch(getApiUrl("/api/plans/upload"), {
        method: "POST",
        body: fd,
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || "Upload failed");
      setOk(t("planUpload", "success", "Plan uploaded successfully."));
      if (j.data?.id) router.push(`/plan/${j.data.id}`);
      setFile(null);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  if (!sessionChecked) {
    return (
      <div className="min-h-screen bg-ui-bg flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-ui-border border-t-ui-accent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-ui-bg flex items-center justify-center p-6 text-center">
        <div className="bg-ui-card backdrop-blur-3xl border border-ui-border p-12 rounded-2xl shadow-2xl max-w-md">
          <div className="text-6xl mb-6">🔒</div>
          <h1 className="text-2xl font-black text-ui-text uppercase tracking-tight mb-4">
            {t("planUpload", "adminOnlyTitle", "Access restricted")}
          </h1>
          <p className="text-ui-muted font-bold mb-8">
            {t("planUpload", "adminOnlyBody", "Only administrators can upload plans.")}
          </p>
          <Link href="/plans" className="inline-block px-8 py-4 rounded-2xl bg-ui-accent text-ui-bg text-xs font-black uppercase tracking-widest">
            {t("planUpload", "back", "BACK TO PLANS")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      className="min-h-screen bg-transparent text-ui-text selection:bg-ui-accent/30 overflow-x-hidden pb-20"
    >
      {/* Ambient Background Glows */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-ui-accent/5 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-ui-accent/5 blur-[120px] rounded-full"></div>
        <div className="absolute inset-0 opacity-[0.02]" style={{ backgroundImage: "radial-gradient(var(--ui-muted) 1px, transparent 0)", backgroundSize: "40px 40px" }}></div>
      </div>

      <div className="relative z-10 container mx-auto px-6 py-12 max-w-[1200px]">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-8 bg-ui-card backdrop-blur-3xl border border-ui-border p-10 md:p-14 rounded-2xl shadow-2xl">
          <div>
            <div className="text-ui-accent font-black text-[10px] uppercase tracking-[0.4em] mb-4">
              {t("planUpload", "kicker", "ENGINEERING TOOLS")}
            </div>
            <h1 className="text-4xl lg:text-5xl font-black tracking-tighter text-ui-text uppercase leading-none">
              📄 {t("planUpload", "title", "PLAN UPLOAD")}
            </h1>
            <p className="text-ui-muted text-xs mt-4 uppercase font-bold tracking-[0.3em]">
              {t("planUpload", "subtitle", "VERSIONED PDF INGESTION")}
            </p>
          </div>
          <Link href="/plans" className="px-8 py-4 rounded-2xl border border-ui-border bg-black/20 text-ui-text text-[10px] font-black uppercase tracking-widest hover:border-ui-accent/30 transition-all">
            {t("planUpload", "back", "BACK TO PLANS")}
          </Link>
        </div>

        {(err || ok) && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }} 
            animate={{ opacity: 1, y: 0 }}
            className={`p-6 rounded-2xl text-xs font-black uppercase tracking-widest mb-8 flex items-center gap-4 ${
              err ? "bg-red-500/10 border border-red-500/30 text-red-400" : "bg-green-500/10 border border-green-500/30 text-green-400"
            }`}
          >
            <span>{err ? "⚠️" : "✅"}</span> {err || ok}
          </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* Left Column: Form Controls */}
          <div className="space-y-8">
            <div className="bg-ui-card backdrop-blur-3xl border border-ui-border rounded-2xl p-10 space-y-10 shadow-2xl">
              
              {/* Project Selection */}
              <div className="space-y-4">
                <label className="text-[10px] font-black text-ui-muted uppercase tracking-widest ml-1">{t("planUpload", "projectName", "PROJECT")}</label>
                <div className="relative">
                  <select
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    className="w-full bg-black/40 border border-ui-border rounded-2xl px-6 py-4 text-xs font-bold text-ui-text outline-none appearance-none cursor-pointer focus:border-ui-accent/50 transition-all"
                  >
                    {projects.map(p => (
                      <option key={p.id} value={p.id} className="bg-ui-bg">
                        {p.companies?.name ? `[${p.companies.name.toUpperCase()}] ` : ""}{p.name}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-ui-muted">▼</div>
                </div>
              </div>

              {/* Building Selection & Add */}
              <div className="space-y-4">
                <label className="text-[10px] font-black text-ui-muted uppercase tracking-widest ml-1">{t("planUpload", "buildingName", "BUILDING")}</label>
                <div className="relative">
                  <select
                    value={buildingId}
                    onChange={(e) => setBuildingId(e.target.value)}
                    className="w-full bg-black/40 border border-ui-border rounded-2xl px-6 py-4 text-xs font-bold text-ui-text outline-none appearance-none cursor-pointer focus:border-ui-accent/50 transition-all"
                  >
                    {buildings.map(b => <option key={b.id} value={b.id} className="bg-ui-bg">{b.name}</option>)}
                    {buildings.length === 0 && <option value="" className="bg-ui-bg">{t("planUpload", "noFloors", "NO BUILDINGS FOUND")}</option>}
                  </select>
                  <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-ui-muted">▼</div>
                </div>
                
                <div className="flex gap-3 mt-4">
                  <input
                    type="text"
                    value={newBuildingName}
                    onChange={e => setNewBuildingName(e.target.value)}
                    placeholder={t("planUpload", "newBuildingName", "New building name")}
                    className="flex-1 bg-black/40 border border-ui-border rounded-xl px-5 py-3 text-[10px] font-bold text-ui-text outline-none focus:border-ui-accent/30 transition-all"
                  />
                  <button
                    onClick={createBuilding}
                    disabled={!newBuildingName.trim() || creatingBuilding}
                    className="px-6 rounded-xl bg-ui-accent/10 border border-ui-accent/30 text-ui-accent text-lg font-bold hover:bg-ui-accent hover:text-ui-bg transition-all disabled:opacity-30"
                  >
                    {creatingBuilding ? "..." : "＋"}
                  </button>
                </div>
              </div>

              {/* Floor Selection & Add */}
              <div className="space-y-4 pt-4 border-t border-ui-border/30">
                <label className="text-[10px] font-black text-ui-muted uppercase tracking-widest ml-1">{t("planUpload", "floorName", "FLOOR")}</label>
                <div className="relative">
                  <select
                    value={floorId}
                    onChange={(e) => setFloorId(e.target.value)}
                    className="w-full bg-black/40 border border-ui-border rounded-2xl px-6 py-4 text-xs font-bold text-ui-text outline-none appearance-none cursor-pointer focus:border-ui-accent/50 transition-all"
                  >
                    {floors.map(f => <option key={f.id} value={f.id} className="bg-ui-bg">{f.name} (Level {f.level})</option>)}
                    {floors.length === 0 && <option value="" className="bg-ui-bg">{t("planUpload", "noFloors", "NO FLOORS FOUND")}</option>}
                  </select>
                  <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-ui-muted">▼</div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                  <input
                    type="text"
                    value={newFloorName}
                    onChange={e => setNewFloorName(e.target.value)}
                    placeholder={t("planUpload", "newFloorName", "Floor name")}
                    className="bg-black/40 border border-ui-border rounded-xl px-5 py-3 text-[10px] font-bold text-ui-text outline-none focus:border-ui-accent/30 transition-all"
                  />
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={newFloorLevel}
                      onChange={e => setNewFloorLevel(e.target.value)}
                      placeholder={t("planUpload", "newFloorLevel", "Lvl")}
                      className="w-20 bg-black/40 border border-ui-border rounded-xl px-5 py-3 text-[10px] font-bold text-ui-text outline-none focus:border-ui-accent/30 transition-all"
                    />
                    <button
                      onClick={createFloor}
                      disabled={!newFloorName.trim() || creatingFloor}
                      className="flex-1 rounded-xl bg-ui-accent/10 border border-ui-accent/30 text-ui-accent text-[10px] font-black uppercase tracking-widest hover:bg-ui-accent hover:text-ui-bg transition-all disabled:opacity-30"
                    >
                      {creatingFloor ? "..." : "＋ ADD FLOOR"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Upload Zone */}
          <div className="space-y-8">
            <motion.div 
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={`relative bg-ui-card backdrop-blur-3xl border-2 border-dashed rounded-2xl p-10 h-full min-h-[500px] flex flex-col items-center justify-center text-center transition-all duration-500 overflow-hidden ${
                dragActive ? "border-ui-accent bg-ui-accent/5 scale-[1.02]" : "border-ui-border bg-black/10 hover:border-ui-accent/30"
              } ${file ? "border-solid border-ui-accent/50" : ""}`}
            >
              <AnimatePresence mode="wait">
                {!file ? (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="space-y-8"
                  >
                    <div className="w-24 h-24 rounded-full bg-ui-accent/10 flex items-center justify-center mx-auto text-4xl shadow-2xl shadow-ui-accent/20">
                      📂
                    </div>
                    <div>
                      <h3 className="text-2xl font-black text-ui-text uppercase tracking-tight mb-2">
                        {t("planUpload", "file", "DROP PDF HERE")}
                      </h3>
                      <p className="text-ui-muted font-bold uppercase text-[10px] tracking-[0.2em]">
                        {t("planUpload", "formDescription", "OR CLICK TO BROWSE FILES")}
                      </p>
                    </div>
                    <label className="inline-block px-10 py-5 rounded-2xl bg-ui-accent text-ui-bg text-xs font-black uppercase tracking-widest cursor-pointer shadow-xl shadow-ui-accent/30 hover:scale-105 active:scale-95 transition-all">
                      {t("planUpload", "submit", "SELECT FILE")}
                      <input type="file" accept="application/pdf" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
                    </label>
                  </motion.div>
                ) : (
                  <motion.div
                    key="file"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="space-y-10 w-full"
                  >
                    <div className="w-24 h-24 rounded-2xl bg-green-500/20 flex items-center justify-center mx-auto text-4xl shadow-2xl shadow-green-500/20 border border-green-500/30">
                      ✅
                    </div>
                    <div className="px-10">
                      <h3 className="text-xl font-black text-white uppercase tracking-tight truncate mb-2">
                        {file.name}
                      </h3>
                      <div className="inline-block px-3 py-1 rounded-lg bg-slate-800 text-slate-400 text-[10px] font-mono font-bold">
                        {(file.size / (1024 * 1024)).toFixed(2)} MB
                      </div>
                    </div>

                    <div className="flex flex-col gap-4 px-10">
                      <button
                        onClick={onSubmit}
                        disabled={busy || !projectId || !floorId}
                        className="w-full bg-ui-accent text-ui-bg py-5 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] shadow-xl shadow-ui-accent/30 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                      >
                        {busy ? "..." : t("planUpload", "submit", "UPLOAD PLAN NOW")}
                      </button>
                      <button
                        onClick={() => setFile(null)}
                        disabled={busy}
                        className="text-ui-muted text-[10px] font-black uppercase tracking-widest hover:text-red-400 transition-colors"
                      >
                        {t("common", "cancel", "REMOVE FILE")}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Decorative corner accents */}
              <div className="absolute top-0 left-0 w-20 h-20 border-t-2 border-l-2 border-ui-accent/20 rounded-tl-[3.5rem]" />
              <div className="absolute bottom-0 right-0 w-20 h-20 border-b-2 border-r-2 border-ui-accent/20 rounded-br-[3.5rem]" />
            </motion.div>

            <div className="bg-amber-500/10 border border-amber-500/30 p-8 rounded-2xl flex gap-5 items-start">
              <span className="text-2xl mt-1">💡</span>
              <div>
                <div className="text-amber-500 text-[10px] font-black uppercase tracking-widest mb-1">{t("planUpload", "tip", "PRO TIP")}</div>
                <p className="text-ui-muted text-[10px] font-bold uppercase leading-relaxed">
                  {t("planUpload", "tip", "PROJECT ID AND FLOOR ID GENERATE AUTOMATICALLY. ENSURE THE PDF IS OPTIMIZED FOR WEB VIEWING.")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
