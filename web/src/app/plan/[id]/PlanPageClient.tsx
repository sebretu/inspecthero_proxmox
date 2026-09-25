"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useMemo, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { apiGet } from "@/lib/apiClient";
import { ChevronRight, ChevronLeft } from "lucide-react";
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

    // Load plans for a given project (only active/current versions)
    const loadPlansForProject = (projectId: string) => {
        apiGet<any>(`/api/plans?projectId=${projectId}&current=true`).then((plansRes) => {
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
                if (plan.project_id) {
                    try {
                        localStorage.setItem("et4u_active_project_id", plan.project_id);
                        if (pName) localStorage.setItem("et4u_active_project_name", pName);
                    } catch {}
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
        try {
            if (typeof window !== "undefined") {
                localStorage.setItem("et4u_active_plan_id", id);
            }
        } catch {}
        // Fetch revisions
        apiGet<any[]>(`/api/revisions?planId=${id}`).then(setRevisions).catch(() => { });
        // Fetch fehlers
        apiGet<any[]>(`/api/fehler?planId=${id}`).then(setFehlers).catch(() => { });
    }, [id]);

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

    const favPlansContainerRef = useRef<HTMLDivElement>(null);
    const scrollFavPlans = (offset: number) => {
        favPlansContainerRef.current?.scrollBy({ left: offset, behavior: "smooth" });
    };

    const isCurrentPlanFavorite = useMemo(() => {
        return favoritePlans.some(f => f.id === id);
    }, [favoritePlans, id]);

    const toggleCurrentPlanFavorite = () => {
        setFavoritePlans((prev) => {
            const exists = prev.some(f => f.id === id);
            let next;
            if (exists) {
                next = prev.filter(f => f.id !== id);
            } else {
                next = [...prev, { id, name: title, projectName: title.split(" - ")[0] || "" }];
            }
            try {
                if (typeof window !== "undefined") {
                    localStorage.setItem("et4u_favorite_plans", JSON.stringify(next));
                }
            } catch {}
            return next;
        });
    };

    return (
        <main className="relative" style={{ padding: 16 }}>
            <div className="flex flex-col gap-3 mb-4 relative z-[1000] w-full">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <button
                            type="button"
                            onClick={toggleCurrentPlanFavorite}
                            title={isCurrentPlanFavorite ? "Aus Favoriten entfernen / Usuń z ulubionych" : "Zu Favoriten hinzufügen / Dodaj do ulubionych"}
                            className={`p-2 rounded-xl border transition-all flex items-center justify-center shrink-0 ${
                                isCurrentPlanFavorite 
                                    ? "bg-[#FFD000]/15 border-[#FFD000]/60 text-[#FFD000] shadow-[0_0_12px_rgba(255,208,0,0.3)]" 
                                    : "bg-ui-card/50 border-ui-border text-ui-muted hover:text-[#FFD000] hover:border-[#FFD000]/30"
                            }`}
                        >
                            <span className="text-base leading-none">{isCurrentPlanFavorite ? "⭐" : "☆"}</span>
                        </button>
                        <h1 className="text-lg md:text-2xl font-black tracking-tight text-ui-text uppercase truncate">
                            {title.split(" - ")[0]} 
                            <span className="text-ui-muted mx-2 font-light">/</span>
                            <span className="text-ui-accent">{title.split(" - ").slice(1).join(" - ")}</span>
                        </h1>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap max-w-full">
                    {projects.length > 1 && (
                        <div className="flex items-center gap-2 bg-ui-card/50 backdrop-blur-md border border-ui-border rounded-xl p-1 pl-3 shadow-xl shrink-0">
                            <span className="text-[10px] font-black uppercase tracking-widest text-ui-muted whitespace-nowrap">
                                {t("common", "plan", "Projekt")}
                            </span>
                            <select
                                value={currentProjectId || ""}
                                onChange={(e) => handleProjectChange(e.target.value)}
                                className="bg-ui-bg border border-ui-border text-ui-text text-xs font-bold rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-ui-accent/20 outline-none cursor-pointer hover:bg-white/5 transition-all appearance-none pr-7 relative max-w-[140px] truncate"
                                style={{
                                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23888' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                                    backgroundRepeat: 'no-repeat',
                                    backgroundPosition: 'right 8px center',
                                    backgroundSize: '14px'
                                }}
                            >
                                {projects.map((p) => (
                                    <option key={p.id} value={p.id}>{p.companies?.name ? `[${p.companies.name.toUpperCase()}] ` : ""}{p.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {allPlans.length > 0 && (
                        <div className="flex items-center gap-2 bg-ui-card/50 backdrop-blur-md border border-ui-border rounded-xl p-1 pl-3 shadow-xl shrink-0">
                            <span className="text-[10px] font-black uppercase tracking-widest text-ui-muted whitespace-nowrap">
                                {t("common", "switchPlan", "Przełącz plan")}
                            </span>
                            <select
                                value={id}
                                onChange={(e) => router.push(`/plan/${e.target.value}${searchParams?.get("isQuestion") === "true" ? "?isQuestion=true" : ""}`)}
                                className="bg-ui-bg border border-ui-border text-ui-text text-xs font-bold rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-ui-accent/20 outline-none cursor-pointer hover:bg-white/5 transition-all appearance-none pr-7 relative max-w-[170px] sm:max-w-[240px] truncate"
                                style={{
                                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23888' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                                    backgroundRepeat: 'no-repeat',
                                    backgroundPosition: 'right 8px center',
                                    backgroundSize: '14px'
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

                {/* Line 1 of icons: External toolbar slot outside Leaflet */}
                <div id="plan-external-top-toolbar" className="flex items-center gap-1 sm:gap-1.5 max-w-full overflow-x-auto flex-nowrap py-0.5" />

                {/* Favorite Plans Fast Switcher Bar */}
                {favoritePlans.length > 0 && (
                    <div className="flex items-center gap-1.5 max-w-full py-1">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[#FFD000] shrink-0 mr-0.5 flex items-center gap-1">
                            ⭐ Ulubione:
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
                            ref={favPlansContainerRef}
                            className="flex items-center gap-1.5 overflow-x-auto py-1 px-0.5 flex-nowrap scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                        >
                            {favoritePlans.map((fav) => {
                                const isCurrent = fav.id === id;
                                return (
                                    <button
                                        key={fav.id}
                                        type="button"
                                        onClick={() => router.push(`/plan/${fav.id}`)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all border shrink-0 leading-tight ${
                                            isCurrent 
                                                ? "bg-[#FFD000]/20 border-[#FFD000] text-[#FFD000] shadow-[0_0_10px_rgba(255,208,0,0.2)] font-black" 
                                                : "bg-ui-card/60 hover:bg-ui-card border-ui-border/60 hover:border-[#FFD000]/40 text-ui-text hover:text-[#FFD000]"
                                        }`}
                                        title={fav.name || `Plan ${fav.id.slice(0, 6)}`}
                                    >
                                        {fav.name || `Plan ${fav.id.slice(0, 6)}`}
                                    </button>
                                );
                            })}
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

                {/* Line 2 of icons: Quick symbols insertion bar */}
                <div id="plan-quick-symbols-bar" className="flex items-center gap-1 max-w-full overflow-x-auto flex-nowrap py-0.5" />
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
