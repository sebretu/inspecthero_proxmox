"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { apiGet } from "@/lib/apiClient";
import { ChevronRight } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";



const PlanViewer = dynamic(() => import("@/components/PlanViewer"), {
    ssr: false,
    loading: () => <div style={{ padding: 16 }}>Loading viewer…</div>,
});

type TaskCoords = {
    id: string;
    x_norm?: number | null;
    y_norm?: number | null;
};

export default function PlanPageClient({ id }: { id: string }) {
    const { t } = useLanguage();
    const [title, setTitle] = useState(`Plan: ${id}`);

    const searchParams = useSearchParams();
    const router = useRouter();
    const focusTaskId = searchParams?.get("taskId") || null;
    const focusFehlerId = searchParams?.get("focusFehlerId") || null;
    const focusRevisionId = searchParams?.get("focusRevisionId") || null;
    const [allPlans, setAllPlans] = useState<any[]>([]);
    const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
    const [projects, setProjects] = useState<any[]>([]);

    const [focusPoint, setFocusPoint] = useState<{ x_norm: number; y_norm: number } | null>(null);
    const [revisions, setRevisions] = useState<any[]>([]);
    const [fehlers, setFehlers] = useState<any[]>([]);

    // Load all projects on mount
    useEffect(() => {
        apiGet<any[]>("/api/projects").then((ps) => {
            if (Array.isArray(ps)) setProjects(ps);
        }).catch(() => { });
    }, []);

    // Load plans for a given project
    const loadPlansForProject = (projectId: string) => {
        apiGet<any>(`/api/plans?projectId=${projectId}`).then((plansRes) => {
            const ps = plansRes?.data ?? plansRes;
            if (Array.isArray(ps)) {
                const sorted = [...ps].sort((a, b) => {
                    const bA = a.floors?.buildings?.name || "";
                    const bB = b.floors?.buildings?.name || "";
                    if (bA !== bB) return bA.localeCompare(bB);
                    const fA = a.floors?.name || "";
                    const fB = b.floors?.name || "";
                    return fA.localeCompare(fB);
                });
                setAllPlans(sorted);
            }
        }).catch(() => { });
    };

    useEffect(() => {
        apiGet<any>(`/api/plan?id=${id}`).then((res) => {
            const plan = res?.data ?? res;
            if (plan) {
                const pName = plan.project?.name || "Projekt?";
                const bName = plan.floor?.building?.name || "Budynek?";
                const fName = plan.floor?.name || "Piętro?";
                setTitle(`${pName} - ${bName} - ${fName}`);
                
                if (plan.project_id && plan.project_id !== currentProjectId) {
                    setCurrentProjectId(plan.project_id);
                    loadPlansForProject(plan.project_id);
                }
            }
        }).catch((err) => {
            console.error("Failed to load plan details for title", err);
        });
    }, [id]);

    // When user switches project via dropdown
    const handleProjectChange = (newProjectId: string) => {
        setCurrentProjectId(newProjectId);
        loadPlansForProject(newProjectId);
    };



    // Fetch task coordinates for focusPoint when a taskId is provided via URL
    useEffect(() => {
        if (!focusTaskId && !focusFehlerId && !focusRevisionId) {
            setFocusPoint(null);
            return;
        }

        const fetchFocusCoords = async () => {
            try {
                if (focusTaskId) {
                    const res = await apiGet<any>(`/api/task?id=${encodeURIComponent(focusTaskId)}`);
                    const task = res?.data ?? res;
                    if (task?.x_norm != null && task?.y_norm != null) {
                        setFocusPoint({ x_norm: task.x_norm, y_norm: task.y_norm });
                    }
                } else if (focusFehlerId) {
                    const res = await apiGet<any[]>(`/api/fehler?id=${focusFehlerId}`);
                    const item = Array.isArray(res) ? res[0] : res;
                    if (item?.x_norm != null && item?.y_norm != null) {
                        setFocusPoint({ x_norm: item.x_norm, y_norm: item.y_norm });
                    }
                } else if (focusRevisionId) {
                    const res = await apiGet<any[]>(`/api/revisions?id=${focusRevisionId}`);
                    const item = Array.isArray(res) ? res[0] : res;
                    if (item?.x_norm != null && item?.y_norm != null) {
                        setFocusPoint({ x_norm: item.x_norm, y_norm: item.y_norm });
                    }
                }
            } catch (err) {
                console.error("Failed to fetch focus coordinates", err);
                setFocusPoint(null);
            }
        };

        fetchFocusCoords();
    }, [focusTaskId, focusFehlerId, focusRevisionId]);

    useEffect(() => {
        if (!id) return;
        // Fetch revisions
        apiGet<any[]>(`/api/revisions?planId=${id}`).then(setRevisions).catch(() => { });
        // Fetch fehlers
        apiGet<any[]>(`/api/fehler?planId=${id}`).then(setFehlers).catch(() => { });
    }, [id]);

    return (
        <main style={{ padding: 16 }}>
            <div className="flex flex-col md:flex-row md:items-center gap-4 mb-6 relative z-[1000]">
                <div className="flex items-center gap-2">
                    <h1 className="text-xl md:text-2xl font-black tracking-tight text-ui-text uppercase">
                        {title.split(" - ")[0]} 
                        <span className="text-ui-muted mx-2 font-light">/</span>
                        <span className="text-ui-accent">{title.split(" - ").slice(1).join(" - ")}</span>
                    </h1>
                </div>

                {projects.length > 1 && (
                    <div className="flex items-center gap-3 bg-ui-card/50 backdrop-blur-md border border-ui-border rounded-xl p-1.5 pl-4 shadow-xl">
                        <span className="text-[10px] font-black uppercase tracking-widest text-ui-muted whitespace-nowrap">
                            {t("common", "plan", "Projekt")}
                        </span>
                        <select
                            value={currentProjectId || ""}
                            onChange={(e) => handleProjectChange(e.target.value)}
                            className="bg-ui-bg border border-ui-border text-ui-text text-xs font-bold rounded-lg px-4 py-2 focus:ring-2 focus:ring-ui-accent/20 outline-none cursor-pointer hover:bg-white/5 transition-all appearance-none pr-10 relative min-w-[150px]"
                            style={{
                                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23888' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                                backgroundRepeat: 'no-repeat',
                                backgroundPosition: 'right 12px center',
                                backgroundSize: '16px'
                            }}
                        >
                            {projects.map((p) => (
                                <option key={p.id} value={p.id}>{p.companies?.name ? `[${p.companies.name.toUpperCase()}] ` : ""}{p.name}</option>
                            ))}
                        </select>
                    </div>
                )}

                {allPlans.length > 0 && (
                    <div className="flex items-center gap-3 bg-ui-card/50 backdrop-blur-md border border-ui-border rounded-xl p-1.5 pl-4 shadow-xl">
                        <span className="text-[10px] font-black uppercase tracking-widest text-ui-muted whitespace-nowrap">
                            {t("common", "switchPlan", "Przełącz plan")}
                        </span>
                        <select
                            value={id}
                            onChange={(e) => router.push(`/plan/${e.target.value}${searchParams?.get("isQuestion") === "true" ? "?isQuestion=true" : ""}`)}
                            className="bg-ui-bg border border-ui-border text-ui-text text-xs font-bold rounded-lg px-4 py-2 focus:ring-2 focus:ring-ui-accent/20 outline-none cursor-pointer hover:bg-white/5 transition-all appearance-none pr-10 relative min-w-[200px]"
                            style={{
                                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23888' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                                backgroundRepeat: 'no-repeat',
                                backgroundPosition: 'right 12px center',
                                backgroundSize: '16px'
                            }}
                        >
                            {allPlans.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.floors?.buildings?.name} — {p.floors?.name} {p.is_current ? "" : `(v${p.version})`}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            <PlanViewer
                planId={id}
                focusTaskId={focusTaskId}
                focusFehlerId={focusFehlerId}
                focusRevisionId={focusRevisionId}
                focusPoint={focusPoint}
                isQuestion={searchParams?.get("isQuestion") === "true"}
                showCompleted={searchParams?.get("showCompleted") === "true"}
                revisions={revisions}
                fehlers={fehlers}
            />
        </main>
    );
}
