"use client";
import React, { useState, useEffect, useCallback } from "react";
import { apiGet } from "@/lib/apiClient";
import { useLanguage } from "@/contexts/LanguageContext";
import { ProjectProgressDashboard } from "@/components/project-progress/ProjectProgressDashboard";
import type { ProjectProgressOverview } from "@repo/shared";
import { Building2, TrendingUp, AlertCircle, RefreshCw, Layers } from "lucide-react";

interface Project {
  id: string;
  name: string;
  companies?: { name: string } | null;
}

export default function ProgressClient() {
  const { t } = useLanguage();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string>("");
  const [selectedSubproject, setSelectedSubproject] = useState<string>("General");
  const [overview, setOverview] = useState<ProjectProgressOverview | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [role, setRole] = useState<string | null>(null);
  const [checkingRole, setCheckingRole] = useState(true);

  // 0. Verify role
  useEffect(() => {
    apiGet<any>("/api/me")
      .then((res) => {
        setRole(res?.profile?.role || "USER");
      })
      .catch(() => setRole("USER"))
      .finally(() => setCheckingRole(false));
  }, []);

  // 1. Fetch available projects
  useEffect(() => {
    if (checkingRole) return;
    setLoadingProjects(true);
    setError(null);
    apiGet<Project[]>("/api/projects")
      .then((data) => {
        const ps = data || [];
        setProjects(ps);
        if (ps.length > 0) {
          const savedId = typeof window !== "undefined" ? localStorage.getItem("inspecthero_selected_project_id") : null;
          const defaultProj = ps.find((p) => p.id === savedId) || ps[0];
          setProjectId(defaultProj.id);
        }
      })
      .catch((err) => setError(err?.message || t("common", "errorLoadingProjects", "Nie udało się załadować listy projektów.")))
      .finally(() => setLoadingProjects(false));
  }, [t, checkingRole]);

  // 2. Fetch project progress data whenever projectId or selectedSubproject changes
  const fetchOverview = useCallback(async () => {
    if (!projectId) {
      setOverview(null);
      return;
    }

    setLoadingOverview(true);
    setError(null);
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem("inspecthero_selected_project_id", projectId);
      }
      const data = await apiGet<ProjectProgressOverview>(
        `/api/projects/${projectId}/progress?subproject=${encodeURIComponent(selectedSubproject)}`
      );
      setOverview(data);
    } catch (err: any) {
      setError(err?.message || t("common", "errorLoadingProgress", "Nie udało się załadować postępu projektu."));
    } finally {
      setLoadingOverview(false);
    }
  }, [projectId, selectedSubproject, t]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  return (
    <div className="min-h-screen px-4 md:px-8 py-6 space-y-6">
      {/* Top Project Selector Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-ui-card border border-ui-border rounded-2xl p-4 shadow-lg backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-ui-accent/15 border border-ui-accent/30 flex items-center justify-center text-ui-accent flex-shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] uppercase font-extrabold text-ui-muted tracking-wider block">
              {t("common", "selectedProject", "Główny projekt (kontener)")}
            </span>
            <div className="flex items-center gap-2">
              <select
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  setSelectedSubproject("General");
                }}
                disabled={loadingProjects || projects.length === 0}
                className="bg-ui-bg border border-ui-border rounded-xl px-3 py-1.5 text-sm font-bold text-ui-text focus:outline-none focus:border-ui-accent transition cursor-pointer"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.companies?.name ? `(${p.companies.name})` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Status / Quick Actions */}
        <div className="flex items-center gap-3 self-end sm:self-center">
          <button
            type="button"
            onClick={() => fetchOverview()}
            disabled={loadingOverview}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-ui-border bg-ui-bg hover:bg-white/5 text-ui-muted hover:text-ui-text text-xs font-bold transition shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingOverview ? "animate-spin text-ui-accent" : ""}`} />
            <span>{t("common", "refresh", "Odśwież")}</span>
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 bg-red-500/15 border border-red-500/30 rounded-2xl text-red-400 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Non-admin access restricted notice */}
      {!checkingRole && role && role.toUpperCase() !== "ADMIN" && role.toUpperCase() !== "MODERATOR" && (
        <div className="p-6 bg-ui-card border border-ui-border rounded-3xl text-center max-w-lg mx-auto space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-ui-text">Dostęp zastrzeżony dla administratorów</h3>
          <p className="text-xs text-ui-muted leading-relaxed">
            Moduł ręcznego postępu prac (Project Progress) jest dostępny w menu administratora dla uprawnionych kierowników projektów.
          </p>
        </div>
      )}

      {/* Loading state */}
      {(checkingRole || loadingProjects || (loadingOverview && !overview)) && (
        <div className="py-24 text-center space-y-3">
          <div className="w-10 h-10 border-3 border-ui-accent/30 border-t-ui-accent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-ui-muted">
            {t("common", "loadingProgress", "Ładowanie danych postępu podprojektu...")}
          </p>
        </div>
      )}

      {/* Main Dashboard */}
      {!checkingRole && (role?.toUpperCase() === "ADMIN" || role?.toUpperCase() === "MODERATOR") && !loadingProjects && overview && (
        <ProjectProgressDashboard
          overview={overview}
          onRefresh={fetchOverview}
          projectId={projectId}
          selectedSubproject={selectedSubproject}
          onSelectSubproject={(sp) => setSelectedSubproject(sp)}
        />
      )}
    </div>
  );
}
