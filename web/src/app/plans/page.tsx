"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiDelete, apiGet, apiPatch, apiPost, getToken } from "@/lib/apiClient";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "@/contexts/LanguageContext";
import PlanCompositeThumbnail from "@/components/PlanCompositeThumbnail";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Project = { id: string; name: string; company_id?: string; companies?: { name: string } | null };
type Building = { id: string; name: string };
type Company = { id: string; name: string };

type Floor = {
  id: string;
  building_id: string;
  name: string;
  level: number;
};

type Plan = {
  id: string;
  project_id: string;
  floor_id: string;
  version: number;
  status: string;
  pdf_path: string;
  storage_bucket: string;
  storage_path: string | null;
  is_current: boolean;
  image_width: number | null;
  image_height: number | null;
  min_zoom?: number | null;
  magnification?: number | null;
};

export default function PlansPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [editingBuildingId, setEditingBuildingId] = useState<string | null>(null);
  const [editingBuildingName, setEditingBuildingName] = useState("");
  const [editingFloorId, setEditingFloorId] = useState<string | null>(null);
  const [editingFloorName, setEditingFloorName] = useState("");
  const [savingFloorName, setSavingFloorName] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [viewerProfile, setViewerProfile] = useState<{ id: string; role: string | null; company_id: string | null } | null>(null);

  // Cloning states
  const [isCloningPlan, setIsCloningPlan] = useState(false);
  const [cloneTargetProjectId, setCloneTargetProjectId] = useState("");
  const [cloneTargetBuildingId, setCloneTargetBuildingId] = useState("auto_create");
  const [cloneTargetFloorId, setCloneTargetFloorId] = useState("auto_create");
  const [cloneWithTasks, setCloneWithTasks] = useState(false);
  const [cloneLoading, setCloneLoading] = useState(false);
  const [cloneBuildings, setCloneBuildings] = useState<Building[]>([]);
  const [cloneFloors, setCloneFloors] = useState<Floor[]>([]);
  const [cloneError, setCloneError] = useState<string | null>(null);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [cloneMode, setCloneMode] = useState<"clone" | "move">("clone");

  const [customMinZoom, setCustomMinZoom] = useState<string>("default");
  const [customMagnification, setCustomMagnification] = useState<number>(0);
  const [savingZoom, setSavingZoom] = useState(false);

  const selectedPlan = plans.find(p => p.id === selectedPlanId);

  useEffect(() => {
    if (selectedPlan) {
      setCustomMinZoom(selectedPlan.min_zoom !== null && selectedPlan.min_zoom !== undefined ? String(selectedPlan.min_zoom) : "default");
      setCustomMagnification(selectedPlan.magnification !== null && selectedPlan.magnification !== undefined ? selectedPlan.magnification : 0);
    } else {
      setCustomMinZoom("default");
      setCustomMagnification(0);
    }
  }, [selectedPlanId, plans]);

  async function handleSaveZoomSettings() {
    if (!selectedPlanId) return;
    setSavingZoom(true);
    try {
      const token = await getToken();
      if (!token) {
        alert("Session expired. Please log in again.");
        router.push("/auth/login");
        return;
      }

      const minZoomVal = customMinZoom === "default" ? null : parseInt(customMinZoom, 10);
      const magVal = customMagnification;

      await apiPatch("/api/plans", {
        id: selectedPlanId,
        min_zoom: minZoomVal,
        magnification: magVal
      }, token);

      setPlans(prev => prev.map(p => {
        if (p.id === selectedPlanId) {
          return {
            ...p,
            min_zoom: minZoomVal,
            magnification: magVal
          };
        }
        return p;
      }));

      alert("Settings saved successfully! / Ustawienia zostały pomyślnie zapisane!");
    } catch (e: any) {
      alert(`Error saving settings: ${e.message}`);
    } finally {
      setSavingZoom(false);
    }
  }

  const normalizedRole = (viewerProfile?.role || "").toUpperCase();
  const isAdmin = normalizedRole === "ADMIN";

  const [favoritePlans, setFavoritePlans] = useState<Array<{ id: string; name: string; projectName?: string }>>(() => {
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("et4u_favorite_plans");
        return raw ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    }
    return [];
  });

  const favPlansRef = useRef<HTMLDivElement>(null);
  const scrollFavPlans = (offset: number) => {
    favPlansRef.current?.scrollBy({ left: offset, behavior: "smooth" });
  };

  const toggleFavoritePlan = (planId: string, planName: string, projName?: string) => {
    setFavoritePlans((prev) => {
      const exists = prev.some((f) => f.id === planId);
      let next;
      if (exists) {
        next = prev.filter((f) => f.id !== planId);
      } else {
        next = [...prev, { id: planId, name: planName, projectName: projName || "" }];
      }
      try {
        if (typeof window !== "undefined") {
          localStorage.setItem("et4u_favorite_plans", JSON.stringify(next));
        }
      } catch {}
      return next;
    });
  };

  async function loadAll(pid?: string) {
    setErr(null);
    try {
      const token = await getToken();
      if (!token) {
        router.push("/auth/login");
        return;
      }

      const [ps, comps] = await Promise.all([
        apiGet<Project[]>("/api/projects", token),
        apiGet<Company[]>("/api/companies", token).catch(() => [] as Company[])
      ]);
      setProjects(ps);
      setCompanies(comps);

      let savedPid: string | null = null;
      if (typeof window !== "undefined") {
        try {
          savedPid = localStorage.getItem("et4u_active_project_id");
        } catch {}
      }

      // Check if first favorite plan belongs to a valid project
      let favTargetPid: string | null = null;
      let favTargetPlanId: string | null = null;
      if (!pid && !projectId && favoritePlans.length > 0) {
        try {
          const firstFav = favoritePlans[0];
          const planRes = await apiGet<any>(`/api/plan?id=${firstFav.id}`, token);
          const planData = planRes?.data || planRes;
          if (planData?.project_id && ps.some(p => p.id === planData.project_id)) {
            favTargetPid = planData.project_id;
            favTargetPlanId = firstFav.id;
          }
        } catch {}
      }

      const validSavedPid = savedPid && ps.some(p => p.id === savedPid) ? savedPid : null;
      const usePid = pid || favTargetPid || projectId || validSavedPid || ps[0]?.id;
      if (!usePid) {
        setProjectId("");
        setBuildings([]);
        setFloors([]);
        setPlans([]);
        setSelectedPlanId("");
        return;
      }
      setProjectId(usePid);
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("et4u_active_project_id", usePid);
          const pObj = ps.find(p => p.id === usePid);
          if (pObj) localStorage.setItem("et4u_active_project_name", pObj.name);
        } catch {}
      }

      const [bs, fs, pls] = await Promise.all([
        apiGet<Building[]>(`/api/buildings?projectId=${encodeURIComponent(usePid)}`, token),
        apiGet<Floor[]>(`/api/floors?projectId=${encodeURIComponent(usePid)}`, token),
        apiGet<Plan[]>(`/api/plans?projectId=${encodeURIComponent(usePid)}&current=true`, token)
      ]);

      setBuildings(bs);
      setFloors(fs);
      setPlans(pls);

      if (pls.length > 0) {
        let chosenId = pls[0].id;
        if (favTargetPlanId && pls.some(p => p.id === favTargetPlanId)) {
          chosenId = favTargetPlanId;
          setSelectedPlanId(favTargetPlanId);
        } else {
          const favInPls = favoritePlans.find(fav => pls.some(p => p.id === fav.id));
          if (favInPls) {
            chosenId = favInPls.id;
            setSelectedPlanId(favInPls.id);
          } else if (!selectedPlanId || usePid !== projectId) {
            chosenId = pls[0].id;
            setSelectedPlanId(pls[0].id);
          }
        }

        const isDirect = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("direct") === "1";
        if (isDirect && chosenId) {
          router.replace(`/plan/${chosenId}`);
          return;
        }
      } else {
        setSelectedPlanId("");
      }
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function handleDeletePlan(planId: string) {
    if (!planId || !isAdmin) return;
    if (!confirm(t("plansPage", "deletePlanConfirm", "Delete plan and tiles?"))) return;

    setErr(null);
    setDeletingPlanId(planId);
    try {
      const token = await getToken();
      await apiDelete(`/api/plans?id=${encodeURIComponent(planId)}`, token!);
      await loadAll(projectId || undefined);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setDeletingPlanId(null);
    }
  }

  async function handleSaveNames(buildingId: string | undefined, newBuildingName: string, floorId: string, newFloorName: string) {
    if (!newFloorName.trim()) return;
    setSavingFloorName(true);
    setErr(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("No session token");

      // 1. Update existing building or create new if not present
      let resolvedBuildingId = buildingId;
      if (buildingId && newBuildingName.trim()) {
        await apiPatch(`/api/buildings`, { id: buildingId, name: newBuildingName.trim() }, token);
        setBuildings(prev => prev.map(b => b.id === buildingId ? { ...b, name: newBuildingName.trim() } : b));
      } else if (!buildingId && newBuildingName.trim() && projectId) {
        const createdBuilding = await apiPost<Building>(`/api/buildings`, { project_id: projectId, name: newBuildingName.trim() }, token);
        if (createdBuilding?.id) {
          resolvedBuildingId = createdBuilding.id;
          setBuildings(prev => [...prev, createdBuilding]);
        }
      }

      // 2. Update floor name (and attach building_id if created)
      const floorPayload: any = { id: floorId, name: newFloorName.trim() };
      if (resolvedBuildingId && resolvedBuildingId !== buildingId) {
        floorPayload.building_id = resolvedBuildingId;
      }
      await apiPatch(`/api/floors`, floorPayload, token);
      setFloors(prev => prev.map(f => f.id === floorId ? { ...f, name: newFloorName.trim(), building_id: resolvedBuildingId || f.building_id } : f));

      // 3. Reload in background to ensure all joins/relations are fresh
      loadAll(projectId || undefined);
    } catch (e: any) {
      setErr(e.message || "Failed to save names");
    } finally {
      setSavingFloorName(false);
      setEditingFloorId(null);
      setEditingBuildingId(null);
    }
  }

  useEffect(() => {
    let isMounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      if (!data?.session) {
        router.replace("/auth/login");
        return;
      }
      const authId = data.session.user.id;
      supabase.from("profiles").select("id, role, company_id").eq("id", authId).single().then(({ data: profile }) => {
        if (!isMounted) return;
        setViewerProfile(profile || null);
        setSessionChecked(true);
      });
    });
    return () => { isMounted = false; };
  }, [router]);

  useEffect(() => {
    if (!sessionChecked) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionChecked]);

  // Load target buildings for cloning
  useEffect(() => {
    if (!cloneTargetProjectId || !isCloningPlan) return;
    let active = true;
    (async () => {
      try {
        const token = await getToken();
        const bs = await apiGet<Building[]>(`/api/buildings?projectId=${encodeURIComponent(cloneTargetProjectId)}`, token!);
        if (!active) return;
        setCloneBuildings(bs);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => { active = false; };
  }, [cloneTargetProjectId, isCloningPlan]);

  // Load target floors for cloning
  useEffect(() => {
    if (!cloneTargetProjectId || !isCloningPlan) return;
    if (cloneTargetBuildingId === "auto_create") {
      setCloneFloors([]);
      setCloneTargetFloorId("auto_create");
      return;
    }
    let active = true;
    (async () => {
      try {
        const token = await getToken();
        const fs = await apiGet<Floor[]>(`/api/floors?projectId=${encodeURIComponent(cloneTargetProjectId)}`, token!);
        if (!active) return;
        const relevantFloors = cloneTargetBuildingId ? fs.filter(f => f.building_id === cloneTargetBuildingId) : [];
        setCloneFloors(relevantFloors);
        if (relevantFloors.length > 0) {
          setCloneTargetFloorId(relevantFloors[0].id);
        } else {
          setCloneTargetFloorId("");
        }
      } catch (e) {
        console.error(e);
      }
    })();
    return () => { active = false; };
  }, [cloneTargetProjectId, cloneTargetBuildingId, isCloningPlan]);

  async function handleClonePlan() {
    console.log("handleClonePlan execution start:", {
      selectedPlanId,
      cloneTargetProjectId,
      cloneTargetBuildingId,
      cloneTargetFloorId,
      cloneMode
    });
    if (!selectedPlanId || !cloneTargetProjectId || !cloneTargetFloorId) {
      alert(`Oops! Missing values. planId: ${selectedPlanId || "empty"}, targetProjectId: ${cloneTargetProjectId || "empty"}, targetFloorId: ${cloneTargetFloorId || "empty"}`);
      return;
    }
    setCloneLoading(true);
    setCloneError(null);
    try {
      const token = await getToken();
      const res = await fetch("/api/plans/clone", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          planId: selectedPlanId,
          targetProjectId: cloneTargetProjectId,
          targetBuildingId: cloneTargetBuildingId,
          targetFloorId: cloneTargetFloorId,
          cloneTasks: cloneWithTasks,
          mode: cloneMode,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error?.message || "Cloning failed");
      }
      setIsCloningPlan(false);
      alert("Plan assigned/cloned successfully!");
      await loadAll(projectId || undefined);
    } catch (e: any) {
      setCloneError(e.message);
    } finally {
      setCloneLoading(false);
    }
  }

  if (!sessionChecked) {
    return (
      <div className="min-h-screen bg-ui-bg flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-ui-border border-t-ui-accent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      className="min-h-screen bg-ui-bg text-ui-text selection:bg-ui-accent/30 overflow-x-hidden pb-20"
    >
      {/* Ambient Background Glows */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-ui-accent/5 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-ui-accent/5 blur-[120px] rounded-full"></div>
        <div className="absolute inset-0 opacity-[0.02]" style={{ backgroundImage: "radial-gradient(var(--ui-muted) 1px, transparent 0)", backgroundSize: "40px 40px" }}></div>
      </div>

      <div className="relative z-10 container mx-auto px-6 py-12 max-w-[1400px]">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-8 bg-ui-card backdrop-blur-3xl border border-ui-border p-10 md:p-14 rounded-2xl shadow-2xl">
          <div>
            <div className="text-ui-accent font-black text-[10px] uppercase tracking-[0.4em] mb-4">
              {t("plansPage", "kicker", "BLUEPRINT LIBRARY")}
            </div>
            <h1 className="text-4xl lg:text-5xl font-black tracking-tighter text-ui-text uppercase leading-none">
              📂 {t("plansPage", "title", "PLANS LIBRARY")}
            </h1>
            <p className="text-ui-muted text-xs mt-4 uppercase font-bold tracking-[0.3em]">
              {t("plansPage", "subtitle", "MANAGEMENT AND VERSIONING")}
            </p>
          </div>
          {isAdmin && (
            <Link href="/plans/upload" className="px-10 py-5 rounded-2xl bg-ui-accent text-ui-bg text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl shadow-ui-accent/20">
              {t("plansPage", "uploadBtn", "UPLOAD NEW PLAN")}
            </Link>
          )}
        </div>

        {/* Quick Access Bar: Active Project & Starred Plans */}
        <div className="mb-10 bg-ui-card/60 backdrop-blur-2xl border border-ui-border rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#FFD000] animate-pulse" />
              <span className="text-xs font-black uppercase tracking-widest text-ui-text">
                ⚡ {t("plansPage", "quickAccess", "Szybki dostęp")}:
              </span>
            </div>
            {projectId && (() => {
              const currentProj = projects.find(p => p.id === projectId);
              const compName = currentProj?.companies?.name || companies.find(c => c.id === currentProj?.company_id)?.name;
              return (
                <div className="text-[11px] font-bold text-ui-muted flex items-center gap-2 bg-black/30 px-3.5 py-1.5 rounded-xl border border-white/5">
                  <span>{t("plansPage", "activeProject", "Aktualny projekt:")}</span>
                  {compName && (
                    <span className="px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-400 text-[10px] font-black border border-blue-500/30">
                      🏢 {compName.toUpperCase()}
                    </span>
                  )}
                  <span className="text-[#FFD000] font-black">{currentProj?.name || projectId}</span>
                </div>
              );
            })()}
          </div>

          {/* Quick projects switch buttons */}
          {projects.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-ui-muted shrink-0">
                {t("plansPage", "projects", "Projekty:")}
              </span>
              {projects.map((p) => {
                const isActive = p.id === projectId;
                const compName = p.companies?.name || companies.find(c => c.id === p.company_id)?.name;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => loadAll(p.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border shrink-0 flex items-center gap-1.5 ${
                      isActive
                        ? "bg-[#FFD000]/20 border-[#FFD000] text-[#FFD000] shadow-md shadow-[#FFD000]/10"
                        : "bg-black/30 hover:bg-black/50 border-white/10 hover:border-white/20 text-ui-muted hover:text-white"
                    }`}
                  >
                    {compName && (
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-black border ${
                        isActive ? "bg-[#FFD000]/30 text-[#FFD000] border-[#FFD000]/40" : "bg-white/10 text-slate-300 border-white/10"
                      }`}>
                        {compName.toUpperCase()}
                      </span>
                    )}
                    <span>📁 {p.name}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Favorite plans chips */}
          {favoritePlans.length > 0 && (
            <div className="flex items-center gap-1.5 pt-2 border-t border-ui-border/30 max-w-full">
              <span className="text-[10px] font-black uppercase tracking-widest text-[#FFD000] shrink-0 mr-0.5 flex items-center gap-1">
                ⭐ {t("plansPage", "favoritePlans", "Ulubione plany:")}
              </span>
              <button
                type="button"
                onClick={() => scrollFavPlans(-200)}
                className="w-6 h-6 flex items-center justify-center rounded-lg bg-ui-card/80 hover:bg-ui-card border border-ui-border text-ui-muted hover:text-ui-text text-xs shrink-0 transition-all active:scale-95 cursor-pointer shadow-sm"
                title="Przewiń w lewo"
                aria-label="Przewiń w lewo"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <div
                ref={favPlansRef}
                className="flex items-center gap-2 overflow-x-auto py-1 px-0.5 flex-nowrap scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {favoritePlans.map((fav) => (
                  <div key={fav.id} className="inline-flex items-center rounded-xl bg-[#FFD000]/10 border border-[#FFD000]/30 overflow-hidden shrink-0 group leading-tight">
                    <Link
                      href={`/plan/${fav.id}`}
                      className="px-3 py-1.5 text-xs font-bold text-[#FFD000] hover:underline whitespace-nowrap flex items-center gap-1.5"
                      title={fav.name}
                    >
                      <span>⭐ {fav.name}</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => toggleFavoritePlan(fav.id, fav.name)}
                      title={t("plansPage", "removeFromFavorites", "Usuń z ulubionych")}
                      className="px-2 py-1.5 text-ui-muted hover:text-red-400 hover:bg-red-500/10 text-xs transition-colors shrink-0"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => scrollFavPlans(200)}
                className="w-6 h-6 flex items-center justify-center rounded-lg bg-ui-card/80 hover:bg-ui-card border border-ui-border text-ui-muted hover:text-ui-text text-xs shrink-0 transition-all active:scale-95 cursor-pointer shadow-sm"
                title="Przewiń w prawo"
                aria-label="Przewiń w prawo"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {err && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="p-6 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-black uppercase tracking-widest mb-8">
            ⚠️ {err}
          </motion.div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-10 items-start">
          {/* Left Column: Selection controls */}
          <div className="xl:col-span-4 space-y-8">
            <div className="bg-ui-card backdrop-blur-3xl border border-ui-border rounded-2xl p-10 space-y-10 shadow-2xl">
              {/* Project Selection */}
              <div className="space-y-4">
                <label className="text-[10px] font-black text-ui-muted uppercase tracking-widest ml-1">{t("plansPage", "projectCardTitle", "PROJECT")}</label>
                <div className="relative">
                  <select
                    value={projectId}
                    onChange={(e) => loadAll(e.target.value)}
                    className="w-full bg-black/40 border border-ui-border rounded-2xl px-6 py-4 text-xs font-bold text-ui-text outline-none appearance-none cursor-pointer focus:border-ui-accent/50 transition-all"
                  >
                    {projects.map(p => {
                      const compName = p.companies?.name || companies.find(c => c.id === p.company_id)?.name;
                      return (
                        <option key={p.id} value={p.id} className="bg-ui-bg">
                          🏢 {compName ? compName.toUpperCase() : "GLOBAL"} / 📁 {p.name.toUpperCase()}
                        </option>
                      );
                    })}
                  </select>
                  <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-ui-muted">▼</div>
                </div>
              </div>

              {/* Plan Selection */}
              <div className="space-y-4 pt-4 border-t border-ui-border/30">
                <label className="text-[10px] font-black text-ui-muted uppercase tracking-widest ml-1">{t("plansPage", "planCardTitle", "PLAN VERSION")}</label>
                <div className="relative">
                  <select
                    value={selectedPlanId}
                    onChange={(e) => {
                      setSelectedPlanId(e.target.value);
                      setEditingFloorId(null);
                    }}
                    className="w-full bg-black/40 border border-ui-border rounded-2xl px-6 py-4 text-xs font-bold text-ui-text outline-none appearance-none cursor-pointer focus:border-ui-accent/50 transition-all"
                  >
                    <option value="" disabled className="bg-ui-bg">{t("plansPage", "planSelectPlaceholder", "-- Select plan --")}</option>
                    {plans.map((p) => {
                      const floor = floors.find(f => f.id === p.floor_id);
                      const building = buildings.find(b => b.id === floor?.building_id);
                      const loc = [building?.name, floor?.name].filter(Boolean).join(" - ");
                      return (
                        <option key={p.id} value={p.id} className="bg-ui-bg">
                          {loc || `Plan v${p.version}`} (v{p.version} - {p.status})
                        </option>
                      );
                    })}
                  </select>
                  <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-ui-muted">▼</div>
                </div>
              </div>
            </div>

            {/* Helper card */}
            <div className="bg-ui-accent/5 border border-ui-accent/20 p-8 rounded-2xl">
              <h4 className="text-[10px] font-black text-ui-accent uppercase tracking-widest mb-2">
                {t("plansPage", "systemInfoTitle", "SYSTEM INFO")}
              </h4>
              <p className="text-ui-muted text-[10px] font-bold uppercase leading-relaxed">
                {t("plansPage", "systemInfoDesc", "PLANS ARE AUTOMATICALLY VERSIONED. DELETING A PLAN WILL REMOVE ALL ASSOCIATED TILES AND DATA PERSISTENTLY.")}
              </p>
            </div>
          </div>

          {/* Right Column: Preview and Management */}
          <div className="xl:col-span-8">
            <AnimatePresence mode="wait">
              {!selectedPlanId ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-ui-card backdrop-blur-3xl border border-ui-border rounded-2xl p-20 flex flex-col items-center justify-center text-center min-h-[600px] border-dashed"
                >
                  <div className="w-24 h-24 rounded-full bg-ui-border flex items-center justify-center text-4xl mb-8 opacity-50">
                    🔍
                  </div>
                  <h3 className="text-xl font-black text-ui-muted uppercase tracking-widest">
                    {t("plansPage", "planSelectPlaceholder", "Select a plan to preview")}
                  </h3>
                </motion.div>
              ) : (
                <motion.div
                  key={selectedPlanId}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="bg-ui-card backdrop-blur-3xl border border-ui-border rounded-2xl overflow-hidden shadow-2xl flex flex-col"
                >
                  <div className="p-8 md:p-12 border-b border-ui-border/50 bg-black/20 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div className="flex-1">
                      {editingFloorId ? (
                        <div className="w-full space-y-3 bg-black/40 p-4 rounded-2xl border border-ui-accent/30">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <label className="text-[10px] font-black text-ui-accent uppercase tracking-widest flex items-center gap-1">
                                🏢 GEBÄUDE (Budynek / Building)
                              </label>
                              <input
                                type="text"
                                value={editingBuildingName}
                                onChange={e => setEditingBuildingName(e.target.value)}
                                placeholder="Nazwa budynku / Gebäude"
                                className="w-full bg-black/60 border border-ui-border focus:border-ui-accent/60 rounded-xl px-4 py-2.5 text-xs font-bold text-ui-text outline-none transition-all"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-black text-[#FFD000] uppercase tracking-widest flex items-center gap-1">
                                📐 ETAGE / GESCHOSS (Piętro / Floor) *
                              </label>
                              <input
                                type="text"
                                value={editingFloorName}
                                onChange={e => setEditingFloorName(e.target.value)}
                                placeholder="Nazwa piętra / Etage"
                                className="w-full bg-black/60 border border-ui-border focus:border-[#FFD000]/60 rounded-xl px-4 py-2.5 text-xs font-bold text-ui-text outline-none transition-all"
                                autoFocus
                              />
                            </div>
                          </div>
                          <div className="flex justify-end gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingFloorId(null);
                                setEditingBuildingId(null);
                              }}
                              className="px-4 py-2 rounded-xl border border-ui-border bg-black/30 text-ui-muted hover:text-white text-[10px] font-black uppercase tracking-widest transition-all"
                            >
                              Anuluj / Cancel
                            </button>
                            <button
                              type="button"
                              disabled={savingFloorName || !editingFloorName.trim()}
                              onClick={() => {
                                handleSaveNames(editingBuildingId || undefined, editingBuildingName, editingFloorId, editingFloorName);
                              }}
                              className="px-6 py-2 rounded-xl bg-ui-accent text-ui-bg text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                            >
                              {savingFloorName ? "Zapisywanie..." : "💾 Zapisz / Save"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-4">
                          {selectedPlanId && (() => {
                            const p = plans.find(plan => plan.id === selectedPlanId);
                            const floor = floors.find(f => f.id === p?.floor_id);
                            const building = buildings.find(b => b.id === floor?.building_id);
                            const planName = [building?.name, floor?.name].filter(Boolean).join(" - ") || "Plan";
                            const isFav = favoritePlans.some(f => f.id === selectedPlanId);
                            return (
                              <button
                                type="button"
                                onClick={() => toggleFavoritePlan(selectedPlanId, planName, projects.find(pr => pr.id === projectId)?.name)}
                                title={isFav ? "Aus Favoriten entfernen / Usuń z ulubionych" : "Zu Favoriten hinzufügen / Dodaj do ulubionych"}
                                className={`p-2 rounded-xl border transition-all flex items-center justify-center shrink-0 ${
                                  isFav
                                    ? "bg-[#FFD000]/15 border-[#FFD000]/60 text-[#FFD000] shadow-[0_0_12px_rgba(255,208,0,0.3)]"
                                    : "bg-ui-card/50 border-ui-border text-ui-muted hover:text-[#FFD000] hover:border-[#FFD000]/30"
                                }`}
                              >
                                <span className="text-base leading-none">{isFav ? "⭐" : "☆"}</span>
                              </button>
                            );
                          })()}
                          <div className="flex flex-wrap items-center gap-3">
                            <h2 className="text-2xl md:text-3xl font-black text-ui-text uppercase tracking-tight flex items-center flex-wrap gap-2">
                              {(() => {
                                const p = plans.find(plan => plan.id === selectedPlanId);
                                const floor = floors.find(f => f.id === p?.floor_id);
                                const building = buildings.find(b => b.id === floor?.building_id);
                                return (
                                  <>
                                    <span className="text-ui-accent">🏢 {building?.name || "—"}</span>
                                    <span className="text-ui-muted font-normal">/</span>
                                    <span>📐 {floor?.name || "Unnamed"}</span>
                                  </>
                                );
                              })()}
                            </h2>
                            {isAdmin && (
                              <button 
                                onClick={() => {
                                  const p = plans.find(plan => plan.id === selectedPlanId);
                                  const floor = floors.find(f => f.id === p?.floor_id);
                                  const building = buildings.find(b => b.id === floor?.building_id);
                                  setEditingFloorId(floor?.id || null);
                                  setEditingFloorName(floor?.name || "");
                                  setEditingBuildingId(building?.id || null);
                                  setEditingBuildingName(building?.name || "");
                                }}
                                title="Edytuj budynek i piętro / Edit Building & Floor"
                                className="w-8 h-8 rounded-full bg-ui-border hover:bg-ui-accent hover:text-ui-bg flex items-center justify-center transition-all text-xs"
                              >
                                ✏️
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                      <div className="flex items-center gap-4 mt-3">
                        <span className="px-3 py-1 rounded-full bg-slate-800 text-slate-400 text-[10px] font-mono font-black uppercase tracking-widest">
                          VERSION {plans.find(p => p.id === selectedPlanId)?.version}
                        </span>
                        <span className="text-[10px] font-black text-ui-muted uppercase tracking-[0.2em]">
                          {plans.find(p => p.id === selectedPlanId)?.status}
                        </span>
                      </div>
                    </div>
                  </div>

                  <Link 
                    href={`/plan/${selectedPlanId}`} 
                    className="p-8 flex items-center justify-center bg-black/10 min-h-[400px] transition-all cursor-pointer group/preview"
                  >
                    <PlanCompositeThumbnail
                      planId={selectedPlanId}
                      size={800}
                      alt="Plan Preview"
                    />
                  </Link>

                  {isAdmin && (
                    <>
                      {/* 🔍 PLAN ZOOM CONFIGURATION */}
                      <div className="p-8 border-t border-ui-border/50 bg-black/30 space-y-6">
                        <div className="flex justify-between items-center">
                          <h4 className="text-[11px] font-black text-ui-accent uppercase tracking-[0.2em] flex items-center gap-2">
                            🔍 Zoom & Magnification / Ustawienia przybliżenia i powiększenia
                          </h4>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* Minimum Zoom */}
                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-ui-muted uppercase tracking-widest block">
                              Minimalne przybliżenie (Minimum Zoom)
                            </label>
                            <div className="relative">
                              <select
                                value={customMinZoom}
                                onChange={(e) => setCustomMinZoom(e.target.value)}
                                className="w-full bg-black/40 border border-ui-border rounded-xl px-4 py-3 text-xs font-bold text-ui-text outline-none appearance-none cursor-pointer focus:border-ui-accent/50 transition-all focus:ring-1 focus:ring-ui-accent/30"
                              >
                                <option value="default" className="bg-ui-bg">Domyślne (Default)</option>
                                <option value="1" className="bg-ui-bg">1 (Bardzo małe)</option>
                                <option value="2" className="bg-ui-bg">2</option>
                                <option value="3" className="bg-ui-bg">3</option>
                                <option value="4" className="bg-ui-bg">4</option>
                                <option value="5" className="bg-ui-bg">5 (Duże)</option>
                              </select>
                              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-ui-muted text-[10px]">▼</div>
                            </div>
                          </div>

                          {/* Magnification Override */}
                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-ui-muted uppercase tracking-widest block">
                              Powiększenie dla nieczytelnych planów (Magnification / Scale)
                            </label>
                            <div className="relative">
                              <select
                                value={customMagnification}
                                onChange={(e) => setCustomMagnification(parseInt(e.target.value, 10))}
                                className="w-full bg-black/40 border border-ui-border rounded-xl px-4 py-3 text-xs font-bold text-ui-text outline-none appearance-none cursor-pointer focus:border-ui-accent/50 transition-all focus:ring-1 focus:ring-ui-accent/30"
                              >
                                <option value="0" className="bg-ui-bg">Brak (Standard / 0x)</option>
                                <option value="1" className="bg-ui-bg">Lekkie powiększenie (+1)</option>
                                <option value="2" className="bg-ui-bg">Średnie powiększenie (+2)</option>
                                <option value="3" className="bg-ui-bg">Duże powiększenie (+3)</option>
                                <option value="4" className="bg-ui-bg">Bardzo duże powiększenie (+4)</option>
                                <option value="5" className="bg-ui-bg">Ekstremalne powiększenie (+5)</option>
                              </select>
                              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-ui-muted text-[10px]">▼</div>
                            </div>
                          </div>
                        </div>

                        <div className="flex justify-end pt-2">
                          <button
                            type="button"
                            onClick={handleSaveZoomSettings}
                            disabled={savingZoom}
                            className="px-6 py-3 rounded-xl bg-ui-accent text-ui-bg text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                          >
                            {savingZoom ? "Zapisywanie..." : "💾 Zapisz ustawienia przybliżenia"}
                          </button>
                        </div>
                      </div>

                      {isCloningPlan && (
                        <div className="p-8 border-t border-ui-border/50 bg-black/30 space-y-6">
                          <div className="flex justify-between items-center">
                            <h4 className="text-[11px] font-black text-ui-accent uppercase tracking-[0.2em]">
                              📋 ASSIGN / TRANSFER PLAN TO ANOTHER PROJECT
                            </h4>
                            <button 
                              onClick={() => {
                                setIsCloningPlan(false);
                                setCloneError(null);
                              }} 
                              className="text-xs text-ui-muted hover:text-ui-text transition-colors"
                            >
                              ✕
                            </button>
                          </div>

                          {/* Mode Selector Segment */}
                          <div className="flex bg-black/40 p-1.5 rounded-xl border border-ui-border max-w-sm">
                            <button
                              type="button"
                              onClick={() => setCloneMode("clone")}
                              className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                                cloneMode === "clone"
                                  ? "bg-ui-accent text-ui-bg shadow"
                                  : "text-ui-muted hover:text-ui-text"
                              }`}
                            >
                              📂 Clone / Copy Plan
                            </button>
                            <button
                              type="button"
                              onClick={() => setCloneMode("move")}
                              className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                                cloneMode === "move"
                                  ? "bg-amber-500 text-ui-bg shadow"
                                  : "text-ui-muted hover:text-ui-text"
                              }`}
                            >
                              🚀 Complete Move
                            </button>
                          </div>

                          {cloneError && (
                            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500 text-[10px] font-bold uppercase">
                              ⚠️ {cloneError}
                            </div>
                          )}

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* Target Project */}
                            <div className="space-y-2">
                              <label className="text-[9px] font-black text-ui-muted uppercase tracking-widest">
                                Target Project
                              </label>
                              <select
                                value={cloneTargetProjectId}
                                onChange={(e) => {
                                  setCloneTargetProjectId(e.target.value);
                                  setCloneTargetBuildingId("auto_create");
                                  setCloneTargetFloorId("auto_create");
                                }}
                                className="w-full bg-black/40 border border-ui-border rounded-xl px-4 py-3 text-xs font-bold text-ui-text outline-none appearance-none cursor-pointer focus:border-ui-accent/50 transition-all"
                              >
                                <option value="" className="bg-ui-bg">-- Select Project --</option>
                                {projects.map((p) => {
                                  const compName = p.companies?.name || companies.find(c => c.id === p.company_id)?.name;
                                  return (
                                    <option key={p.id} value={p.id} className="bg-ui-bg">
                                      🏢 {compName ? compName.toUpperCase() : "GLOBAL"} / 📁 {p.name.toUpperCase()}
                                    </option>
                                  );
                                })}
                              </select>
                            </div>

                            {/* Target Building */}
                            <div className="space-y-2">
                              <label className="text-[9px] font-black text-ui-muted uppercase tracking-widest">
                                Target Building
                              </label>
                              <select
                                value={cloneTargetBuildingId}
                                onChange={(e) => {
                                  setCloneTargetBuildingId(e.target.value);
                                  if (e.target.value === "auto_create") {
                                    setCloneTargetFloorId("auto_create");
                                  } else {
                                    setCloneTargetFloorId("");
                                  }
                                }}
                                className="w-full bg-black/40 border border-ui-border rounded-xl px-4 py-3 text-xs font-bold text-ui-text outline-none appearance-none cursor-pointer focus:border-ui-accent/50 transition-all"
                              >
                                <option value="auto_create" className="bg-ui-bg">✨ CREATE SAME BUILDING AUTOMATICALLY ✨</option>
                                {cloneBuildings.map(b => (
                                  <option key={b.id} value={b.id} className="bg-ui-bg">{b.name}</option>
                                ))}
                              </select>
                            </div>

                            {/* Target Floor */}
                            <div className="space-y-2">
                              <label className="text-[9px] font-black text-ui-muted uppercase tracking-widest">
                                Target Floor
                              </label>
                              <select
                                value={cloneTargetFloorId}
                                onChange={(e) => setCloneTargetFloorId(e.target.value)}
                                disabled={cloneTargetBuildingId === "auto_create"}
                                className="w-full bg-black/40 border border-ui-border rounded-xl px-4 py-3 text-xs font-bold text-ui-text outline-none appearance-none cursor-pointer focus:border-ui-accent/50 transition-all disabled:opacity-60"
                              >
                                <option value="auto_create" className="bg-ui-bg">✨ CREATE SAME FLOOR AUTOMATICALLY ✨</option>
                                {cloneTargetBuildingId !== "auto_create" && cloneFloors.map(f => (
                                  <option key={f.id} value={f.id} className="bg-ui-bg">{f.name} (Lvl {f.level})</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {/* Clone Tasks Toggle (only visible/applicable in clone mode) */}
                          {cloneMode === "clone" ? (
                            <div className="flex items-center gap-3 px-2">
                              <input
                                id="clone-tasks-check"
                                type="checkbox"
                                checked={cloneWithTasks}
                                onChange={(e) => setCloneWithTasks(e.target.checked)}
                                className="w-4 h-4 rounded border-ui-border bg-black/40 text-ui-accent focus:ring-ui-accent/30 cursor-pointer"
                              />
                              <label htmlFor="clone-tasks-check" className="text-[9px] font-black text-ui-text uppercase tracking-widest cursor-pointer select-none">
                                Clone all existing task markers (Pins) to the new project too?
                              </label>
                            </div>
                          ) : (
                            <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 text-amber-500 text-[10px] font-bold uppercase leading-relaxed">
                              💡 <strong>MOVE MODE ACTIVE:</strong> Moving this plan will physically transfer the plan itself along with all its current task markers directly into the new project, without making duplicate copies.
                            </div>
                          )}

                          <div className="flex justify-end gap-4">
                            <button
                              onClick={() => {
                                setIsCloningPlan(false);
                                setCloneError(null);
                              }}
                              className="px-6 py-3 rounded-xl border border-ui-border bg-black/20 text-ui-text text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handleClonePlan}
                              disabled={cloneLoading}
                              className={`px-6 py-3 rounded-xl text-ui-bg text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 ${
                                cloneMode === "move" ? "bg-amber-500" : "bg-ui-accent"
                              }`}
                            >
                              {cloneLoading ? "Processing..." : cloneMode === "move" ? "Confirm Complete Move" : "Confirm Clone / Copy"}
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="p-8 border-t border-ui-border/50 bg-black/40 flex justify-between items-center gap-4">
                        <button
                          onClick={() => {
                            setIsCloningPlan(!isCloningPlan);
                            setCloneTargetProjectId(projectId || "");
                            setCloneTargetBuildingId("auto_create");
                            setCloneTargetFloorId("auto_create");
                          }}
                          className="px-6 py-3 rounded-xl bg-ui-accent/10 border border-ui-accent/30 text-ui-accent text-[10px] font-black uppercase tracking-widest hover:bg-ui-accent hover:text-ui-bg transition-all"
                        >
                          {isCloningPlan ? "✕ CLOSE SHARE PANEL" : "📋 ASSIGN / CLONE / MOVE PLAN TO ANOTHER PROJECT"}
                        </button>
                        <button
                          onClick={() => router.push(`/admin/plans/${selectedPlanId}/versions`)}
                          className="px-6 py-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 text-[10px] font-black uppercase tracking-widest hover:bg-blue-500 hover:text-white transition-all"
                        >
                          🔄 VERSION MANAGER
                        </button>
                        <button
                          onClick={() => handleDeletePlan(selectedPlanId)}
                          disabled={deletingPlanId === selectedPlanId}
                          className="text-red-400 text-[10px] font-black uppercase tracking-widest hover:text-red-300 transition-colors py-3 px-6 border border-red-500/20 rounded-xl hover:bg-red-500/10"
                        >
                          {deletingPlanId === selectedPlanId ? "DELETING..." : "⚠️ DELETE PLAN PERMANENTLY"}
                        </button>
                      </div>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
