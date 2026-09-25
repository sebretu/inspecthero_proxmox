"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { apiGet, apiPost, getApiUrl } from "@/lib/apiClient";
import qs from "qs";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTaskNumericLabel } from "@/lib/taskNumber";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { pdf } from "@react-pdf/renderer";
import ReportPdf from "./ReportPdf";
import RevisionPdf from "./RevisionPdf";
import FehlerPdf from "./FehlerPdf";
import CablesPdf from "./CablesPdf";
import TrommelsPdf from "./TrommelsPdf";
import QrLabelsPdf from "./QrLabelsPdf";
import QrLabelsPdfZebra from './QrLabelsPdfZebra';
import { ChargersPdf } from "./ChargersPdf";
import { BrotherProvider } from '@/lib/brotherProvider';
import { generateQrBase64, generateDataMatrixBase64 } from "@/lib/qrUtils";
import FragenPdf from "./FragenPdf";
import PlanElementsPdf, { ExportPlanData, extractAndSortAufkleberItems } from "./PlanElementsPdf";
import { getPiktoDirection } from "@/lib/bmaSymbolsData";


// No PDFViewer needed as we download directly

type Plan = {
    id: string;
    project_id: string;
    version: number;
    is_current: boolean;
    created_at: string;
    image_path: string;
    floor_id?: string;
    image_width?: number;
    image_height?: number;
    imageBase64?: string;
};

type Project = {
    id: string;
    name: string;
    companies?: { name: string } | null;
};

type Building = {
    id: string;
    name: string;
};

type Floor = {
    id: string;
    name: string;
    building_id: string;
};

type TaskStatus = "OPEN" | "IN_PROGRESS" | "DONE_WAITING_APPROVAL" | "APPROVED" | "REJECTED" | "CANCELLED";
type PhotoMode = "BEFORE" | "AFTER" | "BOTH";
type RepoTab = "BERICHTE" | "REVISION" | "FEHLER" | "KABLE" | "TROMMLE" | "QRCODE" | "LADEGERÄTE" | "FRAGEN" | "PLAN_ELEMENTS";

// Revision types matching what we saw in the admin client
type RevisionPhoto = {
    id: string;
    url: string;
    created_at: string;
};

type Revision = {
    id: string;
    title: string;
    description: string | null;
    project_id: string;
    plan_id: string | null;
    x_norm: number | null;
    y_norm: number | null;
    created_at: string;
    revision_photos: RevisionPhoto[];
};

// Fehler types matching what we saw in the admin client
type FehlerPhoto = { id: string; url: string; photo_type: string; created_at: string };
type FehlerProfile = { id: string; full_name: string } | null;
type Fehler = {
    id: string;
    title: string;
    description: string | null;
    project_id: string;
    plan_id: string | null;
    x_norm: number | null;
    y_norm: number | null;
    priority: string;
    status: string;
    assigned_user_id: string | null;
    created_at: string;
    fehler_photos: FehlerPhoto[];
    profiles?: FehlerProfile;
};

const ALL_STATUSES: TaskStatus[] = [
    "OPEN",
    "IN_PROGRESS",
    "DONE_WAITING_APPROVAL",
    "APPROVED",
    "REJECTED",
    "CANCELLED",
];

// Helper to convert URL to Base64 with strict validation AND re-encoding
const urlToBase64 = async (
    url: string,
    token?: string | null,
    maxDim: number = 1200,
    quality: number = 0.8
): Promise<string | null> => {
    try {
        console.log(`[Reports] Fetching image: ${url}`);
        const headers: RequestInit = {};

        if (token) {
            headers.headers = { Authorization: `Bearer ${token}` };
        }

        const response = await fetch(url, headers);

        if (!response.ok) {
            console.warn(`[Reports] Fetch failed for ${url}: ${response.status}`);
            return null;
        }

        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.startsWith("image/")) {
            console.error(`[Reports] Invalid content-type for ${url}: ${contentType}`);
            const text = await response.text();
            console.error(`[Reports] Response content preview: ${text.substring(0, 100)}`);
            return null;
        }

        const blob = await response.blob();
        if (blob.size === 0) {
            console.warn(`[Reports] Empty blob for ${url}`);
            return null;
        }

        // 1. Convert Blob to Data URL
        const rawBase64 = await new Promise<string | null>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });

        if (!rawBase64) return null;

        // If high resolution is requested (e.g. plan drawings >= 4000px), return raw high-res directly
        if (maxDim >= 4000) {
            return rawBase64;
        }

        // 2. Load into Image & Re-encode via Canvas to JPEG for regular task photos
        return new Promise((resolve) => {
            const img = new window.Image();
            img.onload = () => {
                try {
                    let w = img.width;
                    let h = img.height;
                    if (w > maxDim || h > maxDim) {
                        const ratio = Math.min(maxDim / w, maxDim / h);
                        w = Math.round(w * ratio);
                        h = Math.round(h * ratio);
                    }

                    const canvas = document.createElement("canvas");
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext("2d");
                    if (!ctx) {
                        console.error("[Reports] Canvas context failed");
                        resolve(null);
                        return;
                    }
                    ctx.fillStyle = "#FFFFFF";
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0, w, h);
                    const cleanBase64 = canvas.toDataURL("image/jpeg", quality);
                    console.log(`[Reports] Re-encoded ${url} to JPEG (${w}x${h}) @ ${quality}`);
                    resolve(cleanBase64);
                } catch (err) {
                    console.error(`[Reports] Canvas re-encoding failed for ${url}`, err);
                    resolve(rawBase64);
                }
            };
            img.onerror = (err) => {
                console.error(`[Reports] Browser failed to decode image for ${url}`, err);
                resolve(rawBase64);
            };
            img.src = rawBase64;
        });

    } catch (e) {
        console.error(`[Reports] Error processing ${url}`, e);
        return null;
    }
};

export default function ReportsClient() {
    const { t, language } = useLanguage();
    const [projects, setProjects] = useState<Project[]>([]);
    const [selectedProjectId, setSelectedProjectId] = useState<string>("");

    const [plans, setPlans] = useState<Plan[]>([]);
    const [selectedPlanIds, setSelectedPlanIds] = useState<Set<string>>(new Set());

    const [buildings, setBuildings] = useState<Building[]>([]);
    const [floors, setFloors] = useState<Floor[]>([]);

    const [selectedStatuses, setSelectedStatuses] = useState<Set<TaskStatus>>(new Set(["OPEN", "IN_PROGRESS"]));

    const [dateFrom, setDateFrom] = useState<string>("");
    const [dateTo, setDateTo] = useState<string>("");

    const [photoMode, setPhotoMode] = useState<PhotoMode>("BOTH");

    const [isGenerating, setIsGenerating] = useState(false);
    const [statusMessage, setStatusMessage] = useState("");
    const [customFileName, setCustomFileName] = useState("");
    const [savedReports, setSavedReports] = useState<{ filename: string; createdAt: string; size: number }[]>([]);

    const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
    const [assignedUsers, setAssignedUsers] = useState<{ id: string; name: string }[]>([]);

    const [activeTab, setActiveTab] = useState<RepoTab>("BERICHTE");
    const [revisions, setRevisions] = useState<Revision[]>([]);
    const [fehlerList, setFehlerList] = useState<Fehler[]>([]);
    const [questionsList, setQuestionsList] = useState<any[]>([]);
    const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(new Set());
    const [chargersList, setChargersList] = useState<any[]>([]);
    const [selectedChargerIds, setSelectedChargerIds] = useState<Set<string>>(new Set());
    const [cableIncludePhotos, setCableIncludePhotos] = useState(true);
    const [cableExportType, setCableExportType] = useState<"standard" | "by_category">("standard");
    const [cableIncludeCompanyInfo, setCableIncludeCompanyInfo] = useState(true);
    const [chargerIncludePin, setChargerIncludePin] = useState(true);
    const [qrSelectedCables, setQrSelectedCables] = useState<Set<string>>(new Set());
    const [qrSelectedTrommels, setQrSelectedTrommels] = useState<Set<string>>(new Set());
    const [qrCablesList, setQrCablesList] = useState<any[]>([]);
    const [qrTrommelsList, setQrTrommelsList] = useState<any[]>([]);
    const [qrPrinterType, setQrPrinterType] = useState<"brother_50x24" | "brother_40x18" | "zebra" | "brother_csv">("brother_40x18");
    
    // New states for task selection
    const [taskSearchQuery, setTaskSearchQuery] = useState("");
    const [availableTasks, setAvailableTasks] = useState<any[]>([]);
    const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
    const [isLoadingTasks, setIsLoadingTasks] = useState(false);

    // Plan Elements export options
    const [peOptMeasurements, setPeOptMeasurements] = useState(true);
    const [peOptKlappen, setPeOptKlappen] = useState(true);
    const [peOptAbdeckung, setPeOptAbdeckung] = useState(true);
    const [peOptAnderungen, setPeOptAnderungen] = useState(true);
    const [peOptNotlicht, setPeOptNotlicht] = useState(true);
    const [peOptBma, setPeOptBma] = useState(true);
    const [peOptLighting, setPeOptLighting] = useState(true);
    const [peOptHeating, setPeOptHeating] = useState(true);
    const [peOptKabelbahn, setPeOptKabelbahn] = useState(true);
    const [peOptKabelauslass, setPeOptKabelauslass] = useState(true);
    const [peOptCables, setPeOptCables] = useState(true);
    const [peOptFreeLines, setPeOptFreeLines] = useState(true);
    const [peOptKabelzugliste, setPeOptKabelzugliste] = useState(true);
    const [peSchemaBackground, setPeSchemaBackground] = useState<"grundriss" | "white">("grundriss");
    const [peOptPhotoPins, setPeOptPhotoPins] = useState(true);
    const [peOptMontageDoku, setPeOptMontageDoku] = useState(true);
    const [peOptDamage, setPeOptDamage] = useState(true);
    const [peOptPlanOverview, setPeOptPlanOverview] = useState(true);
    const [peOptLampTypes, setPeOptLampTypes] = useState(true);
    const [peReservePerKreis, setPeReservePerKreis] = useState<number>(0);
    const [peKabelhinweisText, setPeKabelhinweisText] = useState<string>("Hinweise zur Kabelverlegung: Bitte nur zertifizierte E30/E90 Funktionserhalt-Kabel verwenden.");
    const [savedHinweisTemplates, setSavedHinweisTemplates] = useState<string[]>([]);
    const [peElementsInfo, setPeElementsInfo] = useState<Record<string, { measurements: number; klappen: number; bma: number; pins: number }>>({});
    const [peIsLoadingInfo, setPeIsLoadingInfo] = useState(false);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const savedText = localStorage.getItem('pe_kabelhinweis_text');
            if (savedText != null) {
                setPeKabelhinweisText(savedText);
            }

            try {
                const rawTemplates = localStorage.getItem('pe_kabelhinweis_templates');
                if (rawTemplates) {
                    const parsed = JSON.parse(rawTemplates);
                    if (Array.isArray(parsed)) {
                        setSavedHinweisTemplates(parsed);
                    }
                } else {
                    const defaults = [
                        "Hinweise zur Kabelverlegung: Bitte nur zertifizierte E30/E90 Funktionserhalt-Kabel verwenden.",
                        "Hinweis: Alle Kabelzüge nach DIN 4102-12 (E30-E90) verlegen und protokollieren.",
                    ];
                    setSavedHinweisTemplates(defaults);
                    localStorage.setItem('pe_kabelhinweis_templates', JSON.stringify(defaults));
                }
            } catch (e) {}
        }
    }, []);

    const handleHinweisTextChange = (val: string) => {
        setPeKabelhinweisText(val);
        if (typeof window !== 'undefined') {
            localStorage.setItem('pe_kabelhinweis_text', val);
        }
    };

    const handleSaveHinweisTemplate = () => {
        const text = peKabelhinweisText.trim();
        if (!text) return;
        if (savedHinweisTemplates.includes(text)) return;
        const next = [text, ...savedHinweisTemplates];
        setSavedHinweisTemplates(next);
        if (typeof window !== 'undefined') {
            localStorage.setItem('pe_kabelhinweis_templates', JSON.stringify(next));
            localStorage.setItem('pe_kabelhinweis_text', text);
        }
    };

    const handleDeleteHinweisTemplate = (templateToDelete: string) => {
        const next = savedHinweisTemplates.filter(t => t !== templateToDelete);
        setSavedHinweisTemplates(next);
        if (typeof window !== 'undefined') {
            localStorage.setItem('pe_kabelhinweis_templates', JSON.stringify(next));
        }
    };

    const selectedProject = projects.find(p => p.id === selectedProjectId);
    const projectNameWithCompany = selectedProject
        ? (selectedProject.companies?.name 
            ? `[${selectedProject.companies.name.toUpperCase()}] ${selectedProject.name}` 
            : selectedProject.name)
        : selectedProjectId;


    const fetchSavedReports = async () => {
        try {
            const data = await apiGet<{ filename: string; createdAt: string; size: number }[]>("/api/reports/list");
            if (Array.isArray(data)) {
                setSavedReports(data);
            }
        } catch (err) {
            console.error("Failed to load saved reports", err);
        }
    };

    // Initial Load
    useEffect(() => {
        fetchSavedReports();
        apiGet<Project[]>("/api/projects").then((data) => {
            if (Array.isArray(data) && data.length > 0) {
                setProjects(data);
                // Use localStorage to remember last selected project
                const saved = typeof window !== 'undefined' ? localStorage.getItem('selectedProjectId') : null;
                const preferred = saved && data.find(p => p.id === saved) ? saved : data[0].id;
                setSelectedProjectId(preferred);
            }
        }).catch(err => console.error("Failed to load projects", err));
    }, []);

    const handleDownloadReport = async (filename: string) => {
        try {
            // Must fetch with auth token because API requires it
            const token = await import("@/lib/apiClient").then(m => m.getToken());
            const res = await fetch(`/api/reports/${filename}`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                alert(t("common", "error", "Error") + ": " + (err.error || res.statusText));
                return;
            }

            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error("Download failed", e);
            alert(t("common", "error", "Error"));
        }
    };

    const handleDeleteReport = async (filename: string) => {
        if (!confirm(t("reports", "confirmDeleteReport") || "Delete this report?")) return;
        try {
            // Use apiDelete to ensure token is attached
            await import("@/lib/apiClient").then(m => m.apiDelete(`/api/reports/${filename}`));
            fetchSavedReports();
        } catch (e: any) {
            console.error("Delete failed", e);
            alert(t("common", "error", "Error") + ": " + e.message);
        }
    };

    // Load Plans, Buildings, Floors, and Assigned Users when Project changes
    useEffect(() => {
        if (!selectedProjectId) {
            setPlans([]);
            setBuildings([]);
            setFloors([]);
            setAssignedUsers([]);
            setSelectedUserIds(new Set());
            setSelectedTaskIds(new Set());
            return;
        }

        setSelectedTaskIds(new Set());

        // Fetch assigned users — get task user IDs first, then names from profiles
        Promise.all([
            apiGet<any[]>(`/api/tasks?projectId=${selectedProjectId}&limit=1000`),
            apiGet<any[]>(`/api/profiles?limit=1000`),
        ]).then(([tasks, profiles]) => {
            if (!Array.isArray(tasks)) return;
            const profileMap: Record<string, string> = {};
            if (Array.isArray(profiles)) {
                profiles.forEach((p: any) => { profileMap[p.id] = p.full_name || p.email || p.id; });
            }
            const userMap: Record<string, string> = {};
            tasks.forEach((t: any) => {
                if (t.assigned_user_id) {
                    userMap[t.assigned_user_id] = profileMap[t.assigned_user_id] || t.assigneeName || t.assigned_user_name || t.assigned_user_id;
                }
            });
            setAssignedUsers(Object.entries(userMap).map(([id, name]) => ({ id, name })));
        }).catch(() => setAssignedUsers([]));


        // Fetch Plans
        apiGet<Plan[]>(`/api/plans?projectId=${selectedProjectId}&current=true`).then((data) => {
            setPlans(data || []);
        }).catch(err => console.error("Failed to load plans", err));

        // Fetch Buildings
        apiGet<Building[]>(`/api/buildings?projectId=${selectedProjectId}`).then((data) => {
            setBuildings(data || []);
        }).catch(err => console.error("Failed to load buildings", err));

        // Fetch Floors
        apiGet<Floor[]>(`/api/floors?projectId=${selectedProjectId}`).then((data) => {
            setFloors(data || []);
        }).catch(err => console.error("Failed to load floors", err));

        // Fetch Revisions for markers
        apiGet<Revision[]>(`/api/revisions?projectId=${selectedProjectId}&limit=1000`).then((data) => {
            setRevisions(data || []);
        }).catch(err => console.error("Failed to load revisions", err));

        // Fetch Fehler for markers
        apiGet<Fehler[]>(`/api/fehler?projectId=${selectedProjectId}&limit=1000`).then((data) => {
            setFehlerList(data || []);
        }).catch(err => console.error("Failed to load fehler", err));

    }, [selectedProjectId]);

    const handlePlanToggle = (planId: string) => {
        const next = new Set(selectedPlanIds);
        if (next.has(planId)) {
            next.delete(planId);
        } else {
            next.add(planId);
        }
        setSelectedPlanIds(next);
    };

    const handleUserToggle = (userId: string) => {
        const next = new Set(selectedUserIds);
        if (next.has(userId)) {
            next.delete(userId);
        } else {
            next.add(userId);
        }
        setSelectedUserIds(next);
    };

    const handleStatusToggle = (status: TaskStatus) => {
        const next = new Set(selectedStatuses);
        if (next.has(status)) {
            next.delete(status);
        } else {
            next.add(status);
        }
        setSelectedStatuses(next);
    };

    const autoSelectFilteredPlans = async () => {
        if (!selectedProjectId) return;
        try {
            const query = new URLSearchParams({
                projectId: selectedProjectId,
                limit: "1000",
            });
            if (dateFrom) query.append("due_from", dateFrom);
            if (dateTo) query.append("due_to", dateTo);

            const allTasks = await apiGet<any[]>(`/api/tasks?${query.toString()}`);
            if (!Array.isArray(allTasks)) return;

            const filteredTasks = allTasks.filter(t =>
                (selectedStatuses.size === 0 || selectedStatuses.has(t.status)) &&
                (selectedUserIds.size === 0 || selectedUserIds.has(t.assigned_user_id)) &&
                (!taskSearchQuery || 
                    t.title?.toLowerCase().includes(taskSearchQuery.toLowerCase()) || 
                    t.description?.toLowerCase().includes(taskSearchQuery.toLowerCase()) ||
                    getTaskNumericLabel(t.id).toLowerCase().includes(taskSearchQuery.toLowerCase())
                )
            );

            const planIdsWithTasks = new Set(filteredTasks.map(t => t.plan_id).filter(Boolean));
            
            // CRITICAL: Always keep plans that contain manually selected tasks
            if (selectedTaskIds.size > 0) {
                availableTasks.forEach(t => {
                    if (selectedTaskIds.has(t.id) && t.plan_id) {
                        planIdsWithTasks.add(t.plan_id);
                    }
                });
            }

            setSelectedPlanIds(planIdsWithTasks);
        } catch (err) {
            console.error("Auto-select failed", err);
        }
    };

    // Auto-select plans that have tasks matching current filters
    useEffect(() => {
        if (activeTab === "BERICHTE") {
            // If the user has manually selected tasks, use only those plans
            if (selectedTaskIds.size > 0) {
                const plansFromSelectedTasks = new Set<string>();
                availableTasks.forEach(t => {
                    if (selectedTaskIds.has(t.id) && t.plan_id) {
                        plansFromSelectedTasks.add(t.plan_id);
                    }
                });
                // When in manual task selection mode, we strictly follow those tasks' plans
                // BUT we don't want to completely overwrite if we are just searching.
                // Actually, the user wants "auto attach plans where are tasks I choose"
                setSelectedPlanIds(plansFromSelectedTasks);
            } else {
                // Otherwise use the regular auto-select logic
                autoSelectFilteredPlans();
            }
        } else if (activeTab === "REVISION") {
            // Select plans that have revisions
            const planIdsWithRevisions = new Set(revisions.map(r => r.plan_id).filter(Boolean) as string[]);
            setSelectedPlanIds(planIdsWithRevisions);
        } else if (activeTab === "FEHLER") {
            // Select plans that have errors
            const planIdsWithFehler = new Set(fehlerList.map(f => f.plan_id).filter(Boolean) as string[]);
            setSelectedPlanIds(planIdsWithFehler);
        } else if (activeTab === "KABLE" || activeTab === "TROMMLE" || activeTab === "QRCODE") {
            // Select all plans initially for cables/trommels/qr
            setSelectedPlanIds(new Set(plans.map(p => p.id)));
        } else if (activeTab === "LADEGERÄTE") {
            const planIdsWithChargers = new Set(chargersList.map(c => c.plan_id).filter(Boolean) as string[]);
            setSelectedPlanIds(planIdsWithChargers);
        } else if (activeTab === "FRAGEN") {
            const planIdsWithQuestions = new Set(questionsList.map(q => q.plan_id).filter(Boolean) as string[]);
            setSelectedPlanIds(planIdsWithQuestions);
        }
    }, [selectedProjectId, selectedStatuses, selectedUserIds, dateFrom, dateTo, activeTab, revisions, fehlerList, plans, selectedTaskIds, availableTasks, taskSearchQuery, questionsList]);

    // Fetch available tasks for the list view
    useEffect(() => {
        if (!selectedProjectId || activeTab !== "BERICHTE") {
            setAvailableTasks([]);
            return;
        }

        const fetchTasksForList = async () => {
            setIsLoadingTasks(true);
            try {
                const query = new URLSearchParams({
                    projectId: selectedProjectId,
                    limit: "1000",
                });
                if (dateFrom) query.append("due_from", dateFrom);
                if (dateTo) query.append("due_to", dateTo);

                const allTasks = await apiGet<any[]>(`/api/tasks?${query.toString()}`);
                if (Array.isArray(allTasks)) {
                    setAvailableTasks(allTasks);
                }
            } catch (err) {
                console.error("Failed to fetch tasks for list", err);
            } finally {
                setIsLoadingTasks(false);
            }
        };

        fetchTasksForList();
    }, [selectedProjectId, dateFrom, dateTo, activeTab]);

    const filteredTasksForList = useMemo(() => {
        return availableTasks.filter(t => {
            const matchesStatus = selectedStatuses.size === 0 || selectedStatuses.has(t.status);
            const matchesUser = selectedUserIds.size === 0 || selectedUserIds.has(t.assigned_user_id);
            const matchesSearch = !taskSearchQuery || 
                t.title?.toLowerCase().includes(taskSearchQuery.toLowerCase()) || 
                t.description?.toLowerCase().includes(taskSearchQuery.toLowerCase()) ||
                getTaskNumericLabel(t.id).toLowerCase().includes(taskSearchQuery.toLowerCase());
            
            return matchesStatus && matchesUser && matchesSearch;
        });
    }, [availableTasks, selectedStatuses, selectedUserIds, taskSearchQuery]);

    const handleTaskToggle = (taskId: string) => {
        const next = new Set(selectedTaskIds);
        if (next.has(taskId)) {
            next.delete(taskId);
        } else {
            next.add(taskId);
        }
        setSelectedTaskIds(next);
    };

    const enrichPlansWithImages = async (plans: Plan[], selectedPlanIds: Set<string>, token: string | null) => {
        return Promise.all(plans.map(async (plan) => {
            if (!selectedPlanIds.has(plan.id)) return plan;
            console.log(`[Reports] Preparing high-res plan canvas for ${plan.id.slice(0, 8)}...`);

            let b64: string | null = null;
            let imgW: number = plan.image_width || 3000;
            let imgH: number = plan.image_height || 2000;
            let gridW: number = imgW;
            let gridH: number = imgH;

            // 1. Fetch metadata to get true image dimensions and tile grid dimensions
            try {
                const metaUrl = getApiUrl(`/api/tiles/${plan.id}/meta${token ? `?token=${encodeURIComponent(token)}` : ''}`);
                const metaRes = await fetch(metaUrl, {
                    headers: token ? { "Authorization": `Bearer ${token}` } : {}
                });
                if (metaRes.ok) {
                    const meta = await metaRes.json();
                    const tSize = meta.tileSize || 256;
                    gridW = (meta.gridW || 1) * tSize;
                    gridH = (meta.gridH || 1) * tSize;
                    if (meta.imageWidth) imgW = meta.imageWidth;
                    if (meta.imageHeight) imgH = meta.imageHeight;
                }
            } catch (e) {
                console.warn(`[Reports] Meta fetch failed for ${plan.id}`, e);
            }

            // 2. Fetch rendered plan image (from /api/plans/render with 200 DPI, or plan.image_path)
            try {
                const renderUrl = getApiUrl(`/api/plans/render?plan_id=${plan.id}&dpi=200${token ? `&token=${encodeURIComponent(token)}` : ''}`);
                b64 = await urlToBase64(renderUrl, token, 6144, 0.95);
            } catch (e) {}

            if (!b64 && plan.image_path) {
                b64 = await urlToBase64(plan.image_path, token, 6144, 0.95);
            }

            return {
                ...plan,
                imageBase64: b64 || undefined,
                image_width: imgW,
                image_height: imgH,
                grid_width: gridW,
                grid_height: gridH,
            };
        }));
    };

    const stitchShapesOnPhoto = async (photoBase64: string, shapes: any[]): Promise<string> => {
        return new Promise((resolve) => {
            const img = new window.Image();
            img.onload = () => {
                const canvas = document.createElement("canvas");
                canvas.width = img.naturalWidth || img.width;
                canvas.height = img.naturalHeight || img.height;
                const ctx = canvas.getContext("2d");
                if (!ctx) {
                    resolve(photoBase64);
                    return;
                }

                ctx.drawImage(img, 0, 0);

                shapes.forEach((shape) => {
                    const color = shape.color || "#ef4444";
                    const strokeWidth = Number(shape.strokeWidth) || 2;
                    ctx.save();

                    if (shape.type === "pen" || shape.type === "line") {
                        const pts = shape.points || [];
                        if (pts.length >= 4) {
                            ctx.beginPath();
                            ctx.moveTo(pts[0], pts[1]);
                            for (let i = 2; i < pts.length; i += 2) {
                                ctx.lineTo(pts[i], pts[i + 1]);
                            }
                            ctx.strokeStyle = color;
                            ctx.lineWidth = strokeWidth;
                            ctx.lineCap = "round";
                            ctx.lineJoin = "round";
                            ctx.stroke();
                        }
                    } else if (shape.type === "arrow") {
                        const pts = shape.points || [];
                        if (pts.length >= 4) {
                            const fromX = pts[0];
                            const fromY = pts[1];
                            const toX = pts[2];
                            const toY = pts[3];
                            
                            ctx.beginPath();
                            ctx.moveTo(fromX, fromY);
                            ctx.lineTo(toX, toY);
                            ctx.strokeStyle = color;
                            ctx.lineWidth = strokeWidth;
                            ctx.lineCap = "round";
                            ctx.lineJoin = "round";
                            ctx.stroke();

                            const angle = Math.atan2(toY - fromY, toX - fromX);
                            const headLength = 15;
                            ctx.beginPath();
                            ctx.moveTo(toX, toY);
                            ctx.lineTo(toX - headLength * Math.cos(angle - Math.PI / 6), toY - headLength * Math.sin(angle - Math.PI / 6));
                            ctx.lineTo(toX - headLength * Math.cos(angle + Math.PI / 6), toY - headLength * Math.sin(angle + Math.PI / 6));
                            ctx.closePath();
                            ctx.fillStyle = color;
                            ctx.fill();
                        }
                    } else if (shape.type === "double-arrow") {
                        const pts = shape.points || [];
                        if (pts.length >= 4) {
                            const fromX = pts[0];
                            const fromY = pts[1];
                            const toX = pts[2];
                            const toY = pts[3];
                            
                            ctx.beginPath();
                            ctx.moveTo(fromX, fromY);
                            ctx.lineTo(toX, toY);
                            ctx.strokeStyle = color;
                            ctx.lineWidth = strokeWidth;
                            ctx.lineCap = "round";
                            ctx.lineJoin = "round";
                            ctx.stroke();

                            const angleEnd = Math.atan2(toY - fromY, toX - fromX);
                            const headLength = 15;
                            ctx.beginPath();
                            ctx.moveTo(toX, toY);
                            ctx.lineTo(toX - headLength * Math.cos(angleEnd - Math.PI / 6), toY - headLength * Math.sin(angleEnd - Math.PI / 6));
                            ctx.lineTo(toX - headLength * Math.cos(angleEnd + Math.PI / 6), toY - headLength * Math.sin(angleEnd + Math.PI / 6));
                            ctx.closePath();
                            ctx.fillStyle = color;
                            ctx.fill();

                            const angleStart = Math.atan2(fromY - toY, fromX - toX);
                            ctx.beginPath();
                            ctx.moveTo(fromX, fromY);
                            ctx.lineTo(fromX - headLength * Math.cos(angleStart - Math.PI / 6), fromY - headLength * Math.sin(angleStart - Math.PI / 6));
                            ctx.lineTo(fromX - headLength * Math.cos(angleStart + Math.PI / 6), fromY - headLength * Math.sin(angleStart + Math.PI / 6));
                            ctx.closePath();
                            ctx.fillStyle = color;
                            ctx.fill();

                            if (shape.text) {
                                const midX = (fromX + toX) / 2;
                                const midY = (fromY + toY) / 2;
                                ctx.font = "20px Inter, sans-serif";
                                ctx.fillStyle = "#ffffff";
                                ctx.textAlign = "center";
                                ctx.textBaseline = "bottom";
                                ctx.fillText(shape.text, midX, midY - 10);
                            }
                        }
                    } else if (shape.type === "rect") {
                        const x = shape.x ?? 0;
                        const y = shape.y ?? 0;
                        const w = shape.width ?? 0;
                        const h = shape.height ?? 0;
                        ctx.beginPath();
                        ctx.rect(x, y, w, h);
                        ctx.strokeStyle = color;
                        ctx.lineWidth = strokeWidth;
                        ctx.stroke();
                    } else if (shape.type === "circle") {
                        const x = shape.x ?? 0;
                        const y = shape.y ?? 0;
                        const r = shape.radius ?? 0;
                        ctx.beginPath();
                        ctx.arc(x, y, r, 0, 2 * Math.PI);
                        ctx.strokeStyle = color;
                        ctx.lineWidth = strokeWidth;
                        ctx.stroke();
                    } else if (shape.type === "text") {
                        const x = shape.x ?? 0;
                        const y = shape.y ?? 0;
                        ctx.font = "20px Inter, sans-serif";
                        ctx.fillStyle = color;
                        ctx.fillText(shape.text || "", x, y + 16);
                    } else if (shape.type === "marker") {
                        const x = shape.x ?? 0;
                        const y = shape.y ?? 0;
                        ctx.shadowColor = "rgba(0,0,0,0.5)";
                        ctx.shadowBlur = 5;
                        ctx.beginPath();
                        ctx.arc(x, y, 15, 0, 2 * Math.PI);
                        ctx.fillStyle = color;
                        ctx.fill();

                        ctx.shadowBlur = 0;
                        ctx.strokeStyle = "white";
                        ctx.lineWidth = 2;
                        ctx.stroke();

                        ctx.font = "bold 14px Inter, sans-serif";
                        ctx.fillStyle = "white";
                        ctx.textAlign = "center";
                        ctx.textBaseline = "middle";
                        ctx.fillText(shape.text || "!", x, y);
                    } else if (shape.type === "measurement") {
                        const pts = shape.points || [0, 0, 0, 0];
                        ctx.beginPath();
                        ctx.moveTo(pts[0], pts[1]);
                        ctx.lineTo(pts[2], pts[3]);
                        ctx.strokeStyle = color;
                        ctx.lineWidth = strokeWidth;
                        ctx.setLineDash([5, 5]);
                        ctx.stroke();
                        ctx.setLineDash([]);

                        const dx = pts[2] - pts[0];
                        const dy = pts[3] - pts[1];
                        const dist = Math.sqrt(dx * dx + dy * dy).toFixed(1);
                        ctx.font = "14px Inter, sans-serif";
                        ctx.fillStyle = color;
                        ctx.textAlign = "center";
                        ctx.fillText(`${dist} px`, (pts[0] + pts[2]) / 2, (pts[1] + pts[3]) / 2 - 5);
                    }
                    ctx.restore();
                });

                resolve(canvas.toDataURL("image/jpeg", 0.75));
            };
            img.onerror = () => {
                resolve(photoBase64);
            };
            img.src = photoBase64;
        });
    };

    const generateAndDownloadPlanElementsReport = async (mode: 'all' | 'plan_only' | 'kabelzugliste_only' = 'all') => {
        if (!selectedProjectId || selectedPlanIds.size === 0) {
            alert(t("reports", "noElementsSelected", "Wybierz przynajmniej jeden plan."));
            return;
        }
        if (!peOptMeasurements && !peOptKlappen && !peOptAbdeckung && !peOptAnderungen && !peOptBma && !peOptNotlicht && !peOptLighting && !peOptHeating && !peOptKabelbahn && !peOptKabelauslass && !peOptCables && !peOptPhotoPins && !peOptMontageDoku && !peOptDamage) {
            alert(t("reports", "noElementsSelected", "Wybierz przynajmniej jeden element do eksportu."));
            return;
        }

        setIsGenerating(true);
        setStatusMessage(t("reports", "loadingData", "Pobieranie danych..."));

        try {
            const token = await import("@/lib/apiClient").then(m => m.getToken());
            const planIdsArr = Array.from(selectedPlanIds);

            // Enrich ONLY selected plans with base64 images
            const targetPlans = plans.filter(p => selectedPlanIds.has(p.id));
            const enrichedPlans = await enrichPlansWithImages(targetPlans, selectedPlanIds, token);

            const buildingsMap = buildings.reduce((acc, b) => ({ ...acc, [b.id]: b }), {} as Record<string, Building>);
            const floorsMap = floors.reduce((acc, f) => ({ ...acc, [f.id]: f }), {} as Record<string, Floor>);

            setStatusMessage(t("reports", "fetchingPhotos", "Pobieranie danych..."));

            // Build ExportPlanData for each plan
            const plansData: ExportPlanData[] = await Promise.all(
                enrichedPlans.map(async (plan) => {
                    const floor = plan.floor_id ? floorsMap[plan.floor_id] : undefined;
                    const building = floor ? buildingsMap[floor.building_id] : undefined;

                    // Fetch scale & measurements
                    let measurements: ExportPlanData["measurements"] = [];
                    if (peOptMeasurements) {
                        try {
                            let pixelsPerMeter: number | null = null;
                            try {
                                const scaleRes = await fetch(`/api/plans/${plan.id}/scale`, {
                                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                                });
                                if (scaleRes.ok) {
                                    const sJson = await scaleRes.json();
                                    const ppm = sJson.scale?.pixels_per_meter ?? sJson.scale?.pixelsPerMeter;
                                    if (ppm) {
                                        pixelsPerMeter = Number(ppm);
                                    }
                                }
                            } catch (e) {}

                            // Fetch exact tile grid dimensions at maxZoom (where Leaflet CRS.latLngToPoint points were saved)
                            let maxZoomPxW = (plan as any).worldPxW || plan.image_width || 3000;
                            let maxZoomPxH = (plan as any).worldPxH || plan.image_height || 2000;
                            try {
                                const metaRes = await fetch(getApiUrl(`/api/tiles/${plan.id}/meta`), {
                                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                                });
                                if (metaRes.ok) {
                                    const mData = await metaRes.json();
                                    const tSize = mData.tileSize || 256;
                                    maxZoomPxW = (mData.gridW || 1) * tSize;
                                    maxZoomPxH = (mData.gridH || 1) * tSize;
                                }
                            } catch (e) {}

                            const res = await fetch(`/api/plans/${plan.id}/measurements`, {
                                headers: token ? { Authorization: `Bearer ${token}` } : {},
                            });
                            if (res.ok) {
                                const json = await res.json();
                                measurements = (json.measurements || []).map((m: any) => {
                                    const pts = m.points || [];
                                    const segments: Array<{ distMeters?: number | null; distPx?: number }> = [];
                                    let totalPx = 0;
                                    for (let i = 1; i < pts.length; i++) {
                                        const x1 = Number(pts[i - 1].x ?? (pts[i - 1].x_norm != null ? pts[i - 1].x_norm * maxZoomPxW : 0));
                                        const y1 = Number(pts[i - 1].y ?? (pts[i - 1].y_norm != null ? pts[i - 1].y_norm * maxZoomPxH : 0));
                                        const x2 = Number(pts[i].x ?? (pts[i].x_norm != null ? pts[i].x_norm * maxZoomPxW : 0));
                                        const y2 = Number(pts[i].y ?? (pts[i].y_norm != null ? pts[i].y_norm * maxZoomPxH : 0));
                                        const dx = x2 - x1;
                                        const dy = y2 - y1;
                                        const segPx = Math.sqrt(dx * dx + dy * dy);
                                        totalPx += segPx;
                                        const segM = pixelsPerMeter && pixelsPerMeter > 0 && segPx > 0 ? segPx / pixelsPerMeter : null;
                                        segments.push({ distMeters: segM, distPx: segPx });
                                    }
                                    const distM = pixelsPerMeter && pixelsPerMeter > 0 && totalPx > 0
                                        ? totalPx / pixelsPerMeter
                                        : (m.total_distance_meters || m.distance_meters || null);

                                    const normPts = pts.map((p: any) => {
                                        let xn = p.x_norm != null ? Number(p.x_norm) : (p.x != null && maxZoomPxW > 0 ? Number(p.x) / maxZoomPxW : 0);
                                        let yn = p.y_norm != null ? Number(p.y_norm) : (p.y != null && maxZoomPxH > 0 ? Number(p.y) / maxZoomPxH : 0);
                                        return {
                                            x_norm: Math.max(0, Math.min(1, isNaN(xn) ? 0 : xn)),
                                            y_norm: Math.max(0, Math.min(1, isNaN(yn) ? 0 : yn)),
                                        };
                                    });

                                    return {
                                        id: m.id,
                                        points: normPts,
                                        distanceMeters: distM,
                                        totalDistanceMeters: distM,
                                        segments,
                                        label: m.label,
                                    };
                                });
                            }
                        } catch (e) { /* ignore */ }
                    }

                    // Fetch revisionsklappen
                    let klappen: ExportPlanData["klappen"] = [];
                    if (peOptKlappen) {
                        try {
                            const res = await fetch(`/api/plans/${plan.id}/revisionsklappen`, {
                                headers: token ? { Authorization: `Bearer ${token}` } : {},
                            });
                            if (res.ok) {
                                const json = await res.json();
                                klappen = json.klappen || [];
                            }
                        } catch (e) { /* ignore */ }
                    }

                    // Fetch BMA & Lighting & Emergency & Heating & Kabelbahn & Kabelauslass & Abdeckung & Änderungs-Wolke symbols
                    let bmaSymbols: ExportPlanData["bmaSymbols"] = [];
                    if (peOptBma || peOptNotlicht || peOptLighting || peOptHeating || peOptKabelbahn || peOptKabelauslass || peOptAbdeckung || peOptAnderungen) {
                        try {
                            const res = await fetch(`/api/plans/${plan.id}/bma-symbols`, {
                                headers: token ? { Authorization: `Bearer ${token}` } : {},
                            });
                            if (res.ok) {
                                const json = await res.json();
                                bmaSymbols = json.symbols || [];
                            }
                        } catch (e) { /* ignore */ }
                    }

                    // Fetch photo pins, montage pins & damage pins
                    let photoPins: ExportPlanData["photoPins"] = [];
                    let montagePins: ExportPlanData["montagePins"] = [];
                    let damagePins: ExportPlanData["damagePins"] = [];
                    if (peOptPhotoPins || peOptMontageDoku || peOptDamage) {
                        try {
                            const res = await fetch(`/api/plans/${plan.id}/photos`, {
                                headers: token ? { Authorization: `Bearer ${token}` } : {},
                            });
                            if (res.ok) {
                                const json = await res.json();
                                const pins = Array.isArray(json.data) ? json.data : Array.isArray(json.pins) ? json.pins : [];
                                const enrichedAll = await Promise.all(pins.map(async (p: any) => {
                                    const photoUrl = p.image_url || p.photo_url || null;
                                    let photoBase64: string | null = null;
                                    if (photoUrl) {
                                        photoBase64 = await urlToBase64(photoUrl, token);
                                    }
                                    return {
                                        id: p.id,
                                        x_norm: p.x_norm,
                                        y_norm: p.y_norm,
                                        description: p.description,
                                        photo_url: photoUrl,
                                        photoBase64,
                                        created_at: p.created_at,
                                        user_name: p.author_name || p.profiles?.full_name || undefined,
                                        pin_type: p.pin_type || "photo",
                                    };
                                }));

                                if (peOptPhotoPins) {
                                    photoPins = enrichedAll.filter(p => (p.pin_type || "photo") === "photo");
                                }
                                if (peOptMontageDoku) {
                                    montagePins = enrichedAll.filter(p => p.pin_type === "montage");
                                }
                                if (peOptDamage) {
                                    damagePins = enrichedAll.filter(p => p.pin_type === "damage");
                                }
                            }
                        } catch (e) { /* ignore */ }
                    }

                    // Fetch lamp types & photos
                    let lampTypes: ExportPlanData["lampTypes"] = undefined;
                    if (peOptLampTypes || peOptNotlicht || peOptHeating) {
                        try {
                            const res = await fetch(`/api/plans/${plan.id}/lamp-types`, {
                                headers: token ? { Authorization: `Bearer ${token}` } : {},
                            });
                            if (res.ok) {
                                const json = await res.json();
                                lampTypes = json.lampTypes || undefined;
                            }
                        } catch (e) { /* ignore */ }
                    }

                    // Fetch cable connections & free lines
                    let cableConnections: any[] = [];
                    if (true) {
                        try {
                            const res = await fetch(`/api/plans/${plan.id}/cable-connections?projectId=${selectedProjectId || ''}`, {
                                headers: token ? { Authorization: `Bearer ${token}` } : {},
                            });
                            if (res.ok) {
                                const json = await res.json();
                                cableConnections = json.connections || [];
                            }
                        } catch (e) { /* ignore */ }
                    }

                    return {
                        planId: plan.id,
                        planName: (plan as any).name || (plan as any).plan_name || `Plan v${plan.version}`,
                        buildingName: building?.name,
                        floorName: floor?.name,
                        imageBase64: (plan as any).imageBase64 || null,
                        imageWidth: plan.image_width,
                        imageHeight: plan.image_height,
                        gridWidth: (plan as any).grid_width,
                        gridHeight: (plan as any).grid_height,
                        measurements,
                        klappen,
                        bmaSymbols,
                        photoPins,
                        montagePins,
                        damagePins,
                        lampTypes,
                        cableConnections,
                    };
                })
            );

            setStatusMessage(t("reports", "generating", "Generowanie PDF..."));

            const blob = await pdf(
                <PlanElementsPdf
                    projectName={projectNameWithCompany}
                    plansData={plansData}
                    options={{
                        includeMeasurements: mode === 'kabelzugliste_only' ? false : peOptMeasurements,
                        includeKlappen: mode === 'kabelzugliste_only' ? false : peOptKlappen,
                        includeAbdeckung: mode === 'kabelzugliste_only' ? false : peOptAbdeckung,
                        includeAnderungen: mode === 'kabelzugliste_only' ? false : peOptAnderungen,
                        includeNotlicht: peOptNotlicht,
                        includeBma: peOptBma,
                        includeLighting: peOptLighting,
                        includeHeating: peOptHeating,
                        includeKabelbahn: peOptKabelbahn,
                        includeKabelauslass: peOptKabelauslass,
                        includeCables: peOptCables,
                        includeFreeLines: peOptFreeLines,
                        includeKabelzugliste: mode === 'plan_only' ? false : peOptKabelzugliste,
                        schemaBackground: peSchemaBackground,
                        includePhotoPins: mode === 'kabelzugliste_only' ? false : peOptPhotoPins,
                        includeMontageDoku: mode === 'kabelzugliste_only' ? false : peOptMontageDoku,
                        includeDamage: mode === 'kabelzugliste_only' ? false : peOptDamage,
                        includePlanOverview: mode === 'kabelzugliste_only' ? false : peOptPlanOverview,
                        reservePerKreis: peReservePerKreis,
                        includeLampTypes: mode === 'kabelzugliste_only' ? false : peOptLampTypes,
                        kabelhinweisText: peKabelhinweisText,
                        onlyKabelzugliste: mode === 'kabelzugliste_only',
                    }}
                    translations={{
                        title: t("reports", "exportPlanElementsTitle", "Plan-Elemente"),
                        project: t("reports", "project", "Projekt"),
                        plan: t("reports", "plan", "Plan"),
                        generatedOn: t("reports", "generatedOn", "Erstellt am"),
                        page: t("reports", "page", "Seite"),
                        of: t("reports", "of", "von"),
                        measurementsTitle: t("reports", "optMeasurements", "Messungen"),
                        klappenTitle: t("reports", "optKlappen", "Revisionsklappen"),
                        bmaTitle: t("reports", "optBma", "BMA-Symbole"),
                        dMelder: t("planBma", "dMelder", "D-Melder"),
                        zwdMelder: t("planBma", "zwdMelder", "ZWD-Melder"),
                        disSignalgeber: t("planBma", "disSignalgeber", "D-Melder mit Sirene"),
                        sirene: t("planBma", "sirene", "Sirene (Signalgeber)"),
                        notlichtLampe: t("planBma", "notlichtLampe", "Notbeleuchtung Lampe"),
                        notlichtPikto: t("planBma", "notlichtPikto", "Notbeleuchtung Pikto"),
                        photoPinsTitle: t("reports", "optPhotoPins", "Foto-Pins"),
                        montageDokuTitle: t("reports", "optMontageDoku", "Montage-Doku"),
                        totalLength: t("bmaAutomation", "totalLength", "Gesamtlänge"),
                        dimensions: t("planKlappen", "dimensions", "Maße"),
                        loopAddress: t("planBma", "loop", "Loop / Adresse"),
                        label: t("planBma", "label", "Bezeichnung"),
                        description: t("planKlappen", "description", "Beschreibung"),
                        date: t("common", "date", "Datum"),
                        author: t("reports", "generatedOn", "Erstellt von"),
                        noData: "—",
                        planOverview: t("reports", "optPlanOverview", "Planübersicht"),
                    }}
                />
            ).toBlob();

            const safeCustomName = customFileName.trim().replace(/[^a-zA-Z0-9\s._-]+/g, "").replace(/\s+/g, "_");
            const defaultPrefix = mode === 'kabelzugliste_only' ? 'kabelzugliste' : mode === 'plan_only' ? 'grafischer_plan' : 'plan-elemente';
            const prefix = safeCustomName || defaultPrefix;
            const filename = `${prefix}_${new Date().toISOString().slice(0, 10)}_${Date.now()}.pdf`;
            downloadBlob(blob, filename);

        } catch (e) {
            console.error("Error generating plan elements report", e);
            alert(t("common", "error", "Fehler") + ": " + (e as Error).message);
        } finally {
            setIsGenerating(false);
            setStatusMessage("");
        }
    };

    const generateAndDownloadAufkleberCsv = async () => {
        if (!selectedProjectId || selectedPlanIds.size === 0) {
            alert(t("reports", "noElementsSelected", "Wybierz przynajmniej jeden plan."));
            return;
        }

        setIsGenerating(true);
        setStatusMessage(t("reports", "loadingData", "Pobieranie danych..."));
        try {
            const token = await import("@/lib/apiClient").then(m => m.getToken());
            const targetPlans = plans.filter(p => selectedPlanIds.has(p.id));

            const buildingsMap = buildings.reduce((acc, b) => ({ ...acc, [b.id]: b }), {} as Record<string, Building>);
            const floorsMap = floors.reduce((acc, f) => ({ ...acc, [f.id]: f }), {} as Record<string, Floor>);

            const plansData: ExportPlanData[] = await Promise.all(
                targetPlans.map(async (plan) => {
                    const floor = plan.floor_id ? floorsMap[plan.floor_id] : undefined;
                    const building = floor ? buildingsMap[floor.building_id] : undefined;
                    let bmaSymbols: any[] = [];
                    try {
                        const res = await fetch(`/api/plans/${plan.id}/bma-symbols`, {
                            headers: token ? { Authorization: `Bearer ${token}` } : {},
                        });
                        if (res.ok) {
                            const json = await res.json();
                            bmaSymbols = json.symbols || [];
                        }
                    } catch (e) {}

                    let lampTypes: ExportPlanData["lampTypes"] = undefined;
                    try {
                        const res = await fetch(`/api/plans/${plan.id}/lamp-types`, {
                            headers: token ? { Authorization: `Bearer ${token}` } : {},
                        });
                        if (res.ok) {
                            const json = await res.json();
                            lampTypes = json.lampTypes || undefined;
                        }
                    } catch (e) {}

                    return {
                        planId: plan.id,
                        planName: (plan as any).name || (plan as any).plan_name || `Plan v${plan.version}`,
                        buildingName: building?.name,
                        floorName: floor?.name,
                        measurements: [],
                        klappen: [],
                        bmaSymbols,
                        photoPins: [],
                        lampTypes,
                    };
                })
            );

            const aufkleberItems = extractAndSortAufkleberItems(plansData, peReservePerKreis).filter(r => {
                const st = r.symbol_type;
                const isHeating = st === 'warmepumpe_aussen' || st === 'warmepumpe_innen' || st === 'infrarotheizung' || st === 'geraet_box' || st === 'temperaturfuehler';
                return !isHeating;
            });

            if (aufkleberItems.length === 0) {
                alert("Nie znaleziono żadnych symboli oświetlenia awaryjnego (Notlicht / Pikto) na wybranych planach.");
                return;
            }

            // Build CSV with UTF-8 BOM
            const headers = ["Aufkleber-Text (Nr)", "Stromkreis (Kreis)", "Leuchten-Nr", "Typ / Wariant", "Model oprawy", "Pfeilrichtung", "Plan", "Gebäude", "Geschoss"];
            const csvRows = aufkleberItems.map(r => [
                r.label,
                r.rawLoop,
                r.rawAddress,
                r.variantName ? `${r.variantName} (${r.typeName})` : r.typeName,
                r.variantModel || "",
                r.direction || "",
                r.planName,
                r.buildingName || "",
                r.floorName || ""
            ]);

            const csvContent = "\uFEFF" + [
                headers.join(";"),
                ...csvRows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(";"))
            ].join("\n");

            const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            const safeCustomName = customFileName.trim().replace(/[^a-zA-Z0-9\s._-]+/g, "").replace(/\s+/g, "_");
            const prefix = safeCustomName || "aufkleber_notlicht";
            link.setAttribute("href", url);
            link.setAttribute("download", `${prefix}_${new Date().toISOString().slice(0, 10)}_${Date.now()}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch (err) {
            console.error("Error generating Aufkleber CSV", err);
            alert("Błąd generowania pliku listy naklejek: " + (err as Error).message);
        } finally {
            setIsGenerating(false);
            setStatusMessage("");
        }
    };

    const generateAndDownloadFragenReport = async () => {
        setIsGenerating(true);
        setStatusMessage(t("reports", "loadingData", "Pobieranie danych..."));
        try {
            const filtered = questionsList.filter(q =>
                selectedQuestionIds.has(q.id) &&
                (selectedPlanIds.size === 0 || selectedPlanIds.has(q.plan_id || ""))
            );

            if (filtered.length === 0) {
                alert(t("reports", "noQuestionsFound", "Nie znaleziono pytań."));
                return;
            }

            setStatusMessage(t("reports", "fetchingPhotos", "Pobieranie zdjęć..."));
            const token = await import("@/lib/apiClient").then(m => m.getToken());

            // Retrieve photos in batch
            const taskIds = filtered.map(q => q.id);
            let allPhotos: any[] = [];
            if (taskIds.length > 0) {
                const chunkSize = 50;
                for (let i = 0; i < taskIds.length; i += chunkSize) {
                    const chunk = taskIds.slice(i, i + chunkSize);
                    const params = chunk.map(id => `taskIds=${encodeURIComponent(id)}`).join("&") + "&limit=10";
                    const res = await apiGet<any>(`/api/task-photos/batch?${params}`);
                    const data = Array.isArray(res) ? res : (res?.data || []);
                    allPhotos = [...allPhotos, ...data];
                }
            }

            // Fetch aufmass sessions & shapes versions
            const shapesMap: Record<string, any[]> = {};
            try {
                const sessions = await apiGet<any[]>(`/api/aufmass/sessions?projectId=${selectedProjectId}`);
                if (sessions && Array.isArray(sessions)) {
                    const relevantSessions = sessions.filter(s => s.photo_id && taskIds.includes(s.task_id));
                    await Promise.all(relevantSessions.map(async (sess) => {
                        try {
                            const res = await apiGet<any>(`/api/aufmass/versions?sessionId=${sess.id}&photoId=${sess.photo_id}`);
                            const versions = res.data || res;
                            if (versions && versions.length > 0) {
                                shapesMap[sess.photo_id] = versions[0].data || [];
                            }
                        } catch (e) {
                            console.error("Failed to load aufmass shapes for session", sess.id, e);
                        }
                    }));
                }
            } catch (e) {
                console.error("Failed to load aufmass sessions for questions PDF:", e);
            }

            const enrichedQuestions = await Promise.all(filtered.map(async (q) => {
                const qPhotos = allPhotos.filter(p => p.task_id === q.id);
                const photosWithB64 = await Promise.all(qPhotos.map(async (p) => {
                    let b64 = await urlToBase64(p.url, token);
                    if (b64 && shapesMap[p.id]) {
                        try {
                            b64 = await stitchShapesOnPhoto(b64, shapesMap[p.id]);
                        } catch (e) {
                            console.error("Failed to stitch shapes for photo", p.id, e);
                        }
                    }
                    return { ...p, b64 };
                }));
                return { ...q, task_photos: photosWithB64 };
            }));

            // Enrich Plans
            const enrichedPlans = await enrichPlansWithImages(plans, selectedPlanIds, token);

            const plansMap = enrichedPlans.reduce((acc, p) => ({ ...acc, [p.id]: p }), {} as Record<string, Plan>);
            const buildingsMap = buildings.reduce((acc, b) => ({ ...acc, [b.id]: b }), {} as Record<string, Building>);
            const floorsMap = floors.reduce((acc, f) => ({ ...acc, [f.id]: f }), {} as Record<string, Floor>);

            setStatusMessage(t("reports", "generating", "Generowanie PDF..."));
            const blob = await pdf(
                <FragenPdf
                    projectName={projectNameWithCompany}
                    questions={enrichedQuestions}
                    plansMap={plansMap}
                    buildingsMap={buildingsMap}
                    floorsMap={floorsMap}
                    translations={{
                        title: t("reports", "questionsTab", "Pytania"),
                        project: t("reports", "project", "Projekt"),
                        generatedOn: t("reports", "generatedOn", "Wygenerowano"),
                        page: t("reports", "page", "Strona"),
                        of: t("reports", "of", "z"),
                        priority: t("fehler", "labelPriority", "Priorytet"),
                        assignee: t("fehler", "labelAssignee", "Przypisany"),
                    }}
                />
            ).toBlob();

            const safeCustomName = customFileName.trim().replace(/[^a-zA-Z0-9\s._-]+/g, "").replace(/\s+/g, "_");
            const prefix = safeCustomName || "fragen";
            const filename = `${prefix}_${new Date().toISOString().slice(0, 10)}_${Date.now()}.pdf`;
            downloadBlob(blob, filename);

        } catch (e) {
            console.error("Error generating questions report", e);
            alert(t("common", "error", "Błąd") + ": " + (e as Error).message);
        } finally {
            setIsGenerating(false);
            setStatusMessage("");
        }
    };

    const generateAndDownloadRevisionReport = async () => {
        setIsGenerating(true);
        setStatusMessage(t("reports", "loadingData", "Pobieranie danych..."));
        try {
            const filtered = revisions.filter(r =>
                (selectedPlanIds.size === 0 || selectedPlanIds.has(r.plan_id || ""))
            );

            if (filtered.length === 0) {
                alert(t("reports", "noRevisionsFound", "Nie znaleziono rewizji."));
                return;
            }

            setStatusMessage(t("reports", "fetchingPhotos", "Pobieranie zdjęć..."));
            const token = await import("@/lib/apiClient").then(m => m.getToken());

            const enrichedRevisions = await Promise.all(filtered.map(async (rev) => {
                const photosWithB64 = await Promise.all((rev.revision_photos || []).slice(0, 10).map(async (p) => {
                    const b64 = await urlToBase64(p.url, token);
                    return { ...p, b64 };
                }));
                return { ...rev, revision_photos: photosWithB64 };
            }));

            // Enrich Plans
            const enrichedPlans = await enrichPlansWithImages(plans, selectedPlanIds, token);

            const plansMap = enrichedPlans.reduce((acc, p) => ({ ...acc, [p.id]: p }), {} as Record<string, Plan>);
            const buildingsMap = buildings.reduce((acc, b) => ({ ...acc, [b.id]: b }), {} as Record<string, Building>);
            const floorsMap = floors.reduce((acc, f) => ({ ...acc, [f.id]: f }), {} as Record<string, Floor>);

            setStatusMessage(t("reports", "generating", "Generowanie PDF..."));
            const blob = await pdf(
                <RevisionPdf
                    projectName={projectNameWithCompany}
                    revisions={enrichedRevisions}
                    plansMap={plansMap}
                    buildingsMap={buildingsMap}
                    floorsMap={floorsMap}
                    translations={{
                        title: t("revision", "adminTitle", "Rewizje"),
                        project: t("reports", "project", "Projekt"),
                        generatedOn: t("reports", "generatedOn", "Wygenerowano"),
                        page: t("reports", "page", "Strona"),
                        of: t("reports", "of", "z"),
                    }}
                />
            ).toBlob();

            const safeCustomName = customFileName.trim().replace(/[^a-zA-Z0-9\s._-]+/g, "").replace(/\s+/g, "_");
            const prefix = safeCustomName || "revision";
            const filename = `${prefix}_${new Date().toISOString().slice(0, 10)}_${Date.now()}.pdf`;
            downloadBlob(blob, filename);

        } catch (e) {
            console.error("Error generating revision report", e);
            alert(t("common", "error", "Błąd") + ": " + (e as Error).message);
        } finally {
            setIsGenerating(false);
            setStatusMessage("");
        }
    };

    const generateAndDownloadFehlerReport = async () => {
        setIsGenerating(true);
        setStatusMessage(t("reports", "loadingData", "Pobieranie danych..."));
        try {
            const filtered = fehlerList.filter(f =>
                (selectedPlanIds.size === 0 || selectedPlanIds.has(f.plan_id || "")) &&
                (selectedUserIds.size === 0 || selectedUserIds.has(f.assigned_user_id || ""))
            );

            if (filtered.length === 0) {
                alert(t("reports", "noFehlerFound", "Nie znaleziono błędów."));
                return;
            }

            setStatusMessage(t("reports", "fetchingPhotos", "Pobieranie zdjęć..."));
            const token = await import("@/lib/apiClient").then(m => m.getToken());

            const enrichedFehler = await Promise.all(filtered.map(async (f) => {
                const before = f.fehler_photos?.find(p => p.photo_type === "BEFORE");
                const after = f.fehler_photos?.find(p => p.photo_type === "AFTER");

                const beforePhoto = before ? await urlToBase64(before.url, token) : null;
                const afterPhoto = after ? await urlToBase64(after.url, token) : null;

                return { ...f, beforePhoto, afterPhoto };
            }));

            // Enrich Plans
            const enrichedPlans = await enrichPlansWithImages(plans, selectedPlanIds, token);

            const plansMap = enrichedPlans.reduce((acc, p) => ({ ...acc, [p.id]: p }), {} as Record<string, Plan>);
            const buildingsMap = buildings.reduce((acc, b) => ({ ...acc, [b.id]: b }), {} as Record<string, Building>);
            const floorsMap = floors.reduce((acc, f) => ({ ...acc, [f.id]: f }), {} as Record<string, Floor>);

            setStatusMessage(t("reports", "generating", "Generowanie PDF..."));
            const blob = await pdf(
                <FehlerPdf
                    projectName={projectNameWithCompany}
                    fehlerItems={enrichedFehler}
                    plansMap={plansMap}
                    buildingsMap={buildingsMap}
                    floorsMap={floorsMap}
                    translations={{
                        title: t("fehler", "adminTitle", "Błędy (Fehler)"),
                        project: t("reports", "project", "Projekt"),
                        generatedOn: t("reports", "generatedOn", "Wygenerowano"),
                        page: t("reports", "page", "Strona"),
                        of: t("reports", "of", "z"),
                        priority: t("fehler", "labelPriority", "Priorytet"),
                        assignee: t("fehler", "labelAssignee", "Przypisany"),
                        before: t("reports", "before", "Przed"),
                        after: t("reports", "after", "Po"),
                    }}
                />
            ).toBlob();

            const safeCustomName = customFileName.trim().replace(/[^a-zA-Z0-9\s._-]+/g, "").replace(/\s+/g, "_");
            const prefix = safeCustomName || "fehler";
            const filename = `${prefix}_${new Date().toISOString().slice(0, 10)}_${Date.now()}.pdf`;
            downloadBlob(blob, filename);

        } catch (e) {
            console.error("Error generating fehler report", e);
            alert(t("common", "error", "Błąd") + ": " + (e as Error).message);
        } finally {
            setIsGenerating(false);
            setStatusMessage("");
        }
    };

    const generateAndDownloadCablesReport = async () => {
        setIsGenerating(true);
        setStatusMessage(t("reports", "loadingData", "Pobieranie danych..."));
        try {
            // Fetch token first — must be before any urlToBase64 calls
            const token = await import("@/lib/apiClient").then(m => m.getToken());

            const [cables, trommels, categories] = await Promise.all([
                apiGet<any[]>(`/api/cables?projectId=${selectedProjectId}&limit=1000`),
                apiGet<any[]>(`/api/trommels?projectId=${selectedProjectId}&limit=1000`),
                apiGet<any[]>(`/api/cable-categories?projectId=${selectedProjectId}`).catch(() => [] as any[])
            ]);

            if (!cables || cables.length === 0) {
                alert("Nie znaleziono kabli w tym projekcie.");
                return;
            }

            setStatusMessage("Generowanie kodów QR...");
            const cablesWithQr = await Promise.all(cables.map(async (c) => {
                const qrText = `${window.location.origin}/cables?scan_type=cable&scan_id=${c.id}&name=${encodeURIComponent(c.name)}`;
                const qrBase64 = await generateDataMatrixBase64(qrText);
                return { ...c, qrBase64 };
            }));


            const trommelsWithQr = await Promise.all(trommels.map(async (tr) => {
                const qrText = `${window.location.origin}/cables?scan_type=trommel&scan_id=${tr.id}&name=${encodeURIComponent(tr.name)}`;
                const qrBase64 = await generateQrBase64(qrText);
                let photoBase64: string | null = null;
                if (cableExportType === "standard" && cableIncludePhotos && tr.photo_url) {
                    photoBase64 = await urlToBase64(tr.photo_url, token);
                }
                return {
                    ...tr,
                    qrBase64,
                    photoBase64,
                    // Clear company/serial if user opted out
                    company_name: cableIncludeCompanyInfo ? tr.company_name : null,
                    serial_number: cableIncludeCompanyInfo ? tr.serial_number : null,
                };
            }));

            let enrichedPlans: Plan[] = [];
            if (cableExportType === "standard") {
                setStatusMessage(t("reports", "fetchingPlans", "Pobieranie planów..."));
                enrichedPlans = await enrichPlansWithImages(plans, selectedPlanIds, token);
            }

            const plansMap = enrichedPlans.reduce((acc, p) => ({ ...acc, [p.id]: p }), {} as Record<string, Plan>);
            const buildingsMap = buildings.reduce((acc, b) => ({ ...acc, [b.id]: b }), {} as Record<string, Building>);
            const floorsMap = floors.reduce((acc, f) => ({ ...acc, [f.id]: f }), {} as Record<string, Floor>);

            setStatusMessage(t("reports", "generating", "Generowanie PDF..."));
            const blob = await pdf(
                <CablesPdf
                    projectName={projectNameWithCompany}
                    cables={cablesWithQr}
                    trommels={trommelsWithQr}
                    plansMap={plansMap}
                    buildingsMap={buildingsMap}
                    floorsMap={floorsMap}
                    exportType={cableExportType}
                    categories={categories}
                    translations={{
                        project: t("reports", "project", "Projekt"),
                        generatedOn: t("reports", "generatedOn", "Wygenerowano"),
                        title: t("cables_pdf", "title", "Raport Kablowy"),
                        summary: t("cables_pdf", "summary", "Podsumowanie"),
                        totalCables: t("cables_pdf", "totalCables", "Łączna liczba kabli"),
                        totalTrommels: t("cables_pdf", "totalTrommels", "Łączna liczba bębnów"),
                        cableRoutes: t("cables_pdf", "cableRoutes", "Trasy Kablowe"),
                        cableList: t("cables_pdf", "cableList", "Lista Kabli"),
                        nameType: t("cables_pdf", "nameType", "Nazwa / Typ kabla"),
                        status: t("cables_pdf", "status", "Status"),
                        trommelLen: t("cables_pdf", "trommelLen", "Bęben / Dł."),
                        route: t("cables_pdf", "route", "Trasa"),
                        qrCode: t("cables_pdf", "qrCode", "Kod QR"),
                        trommelList: t("cables_pdf", "trommelList", "Lista Bębnów"),
                        photo: t("cables_pdf", "photo", "Foto"),
                        name: t("cables_pdf", "name", "Nazwa"),
                        companyNr: t("cables_pdf", "companyNr", "Firma / Nr"),
                        cableType: t("cables_pdf", "cableType", "Typ kabla"),
                        lengthTotal: t("cables_pdf", "lengthTotal", "Długość (całk./zużyta)"),
                        usedLabel: t("cables_pdf", "usedLabel", "Zużyto"),
                        plan: t("cables_pdf", "plan", "Plan"),
                        type: t("cables_pdf", "type", "Typ"),
                        status_pending: t("cables_pdf", "status_pending", "Oczekuje"),
                        status_in_progress: t("cables_pdf", "status_in_progress", "W trakcie"),
                        status_done: t("cables_pdf", "status_done", "Wykonany"),
                        status_pending_approval: t("cables_pdf", "status_pending_approval", "Do zatwierdzenia"),
                        byCategory: t("cables_pdf", "byCategory", "Podział na kategorie"),
                        category: t("cables_pdf", "category", "Kategoria"),
                        noCategory: t("cables_pdf", "noCategory", "Bez kategorii"),
                        unknownCategory: t("cables_pdf", "unknownCategory", "Nieznana kategoria"),
                    }}
                />
            ).toBlob();

            const safeCustomName = customFileName.trim().replace(/[^a-zA-Z0-9\s._-]+/g, "").replace(/\s+/g, "_");
            const defaultPrefix = cableExportType === "by_category" ? "kable_kategorie" : "kable";
            const prefix = safeCustomName || defaultPrefix;
            const filename = `${prefix}_${new Date().toISOString().slice(0, 10)}_${Date.now()}.pdf`;
            downloadBlob(blob, filename);

        } catch (e) {
            console.error("Error generating cables report", e);
            alert(t("common", "error", "Błąd") + ": " + (e as Error).message);
        } finally {
            setIsGenerating(false);
            setStatusMessage("");
        }
    };

    const generateAndDownloadTrommelsReport = async () => {
        setIsGenerating(true);
        setStatusMessage(t("reports", "loadingData", "Pobieranie danych..."));
        try {
            const token = await import("@/lib/apiClient").then(m => m.getToken());

            const trommels = await apiGet<any[]>(`/api/trommels?projectId=${selectedProjectId}&limit=1000`);
            if (!trommels || trommels.length === 0) {
                alert("Nie znaleziono bębnów w tym projekcie.");
                return;
            }

            setStatusMessage("Generowanie kodów QR...");
            const trommelsWithQr = await Promise.all(trommels.map(async (tr) => {
                const qrText = `${window.location.origin}/cables?scan_type=trommel&scan_id=${tr.id}&name=${encodeURIComponent(tr.name)}`;
                const qrBase64 = await generateQrBase64(qrText);
                let photoBase64: string | null = null;
                if (cableIncludePhotos && tr.photo_url) {
                    photoBase64 = await urlToBase64(tr.photo_url, token);
                }
                return {
                    ...tr,
                    qrBase64,
                    photoBase64,
                    company_name: cableIncludeCompanyInfo ? tr.company_name : null,
                    serial_number: cableIncludeCompanyInfo ? tr.serial_number : null,
                };
            }));

            setStatusMessage(t("reports", "generating", "Generowanie PDF..."));
            const blob = await pdf(
                <TrommelsPdf
                    projectName={projectNameWithCompany}
                    trommels={trommelsWithQr}
                    includePhotos={cableIncludePhotos}
                    includeCompanyInfo={cableIncludeCompanyInfo}
                    translations={{
                        project: t("reports", "project", "Projekt"),
                        generatedOn: t("reports", "generatedOn", "Wygenerowano"),
                        trommelReportTitle: t("cables_pdf", "trommelList", "Raport Bębnów"),
                        totalTrommels: t("cables_pdf", "totalTrommels", "Łączna liczba bębnów"),
                        usedLabel: t("cables_pdf", "usedLabel", "Zużyto"),
                        owner: t("footer", "owner", "Owner: Marcin Slapinski"),
                    }}
                />
            ).toBlob();

            const safeCustomName = customFileName.trim().replace(/[^a-zA-Z0-9\s._-]+/g, "").replace(/\s+/g, "_");
            const prefix = safeCustomName || "trommels";
            const filename = `${prefix}_${new Date().toISOString().slice(0, 10)}_${Date.now()}.pdf`;
            downloadBlob(blob, filename);

        } catch (e) {
            console.error("Error generating trommels report", e);
            alert(t("common", "error", "Błąd") + ": " + (e as Error).message);
        } finally {
            setIsGenerating(false);
            setStatusMessage("");
        }
    };

    const generateAndDownloadChargersReport = async () => {
        setIsGenerating(true);
        setStatusMessage(t("reports", "loadingData", "Pobieranie danych..."));
        try {
            const token = await import("@/lib/apiClient").then(m => m.getToken());
            const selectedChargers = chargersList.filter(c => selectedChargerIds.has(c.id));
            
            if (selectedChargers.length === 0) {
                alert("Nie wybrano żadnej ładowarki.");
                return;
            }

            setStatusMessage("Generowanie kodów QR i ładowanie planów...");
            
            const chargersWithBase64 = await Promise.all(selectedChargers.map(async (c) => {
                let photoBase64: string | null = null;
                if (c.photo_url) {
                    photoBase64 = await urlToBase64(c.photo_url, token);
                }
                let qrText = c.qr_text;
                if (!qrText || qrText === "MANUAL" || !qrText.startsWith("http")) {
                    if (c.mac && c.pin) {
                        qrText = `https://o.chargepoint.com/i/${c.mac}/${c.pin}`;
                    } else {
                        qrText = c.qr_text || c.mac;
                    }
                }
                const qrBase64 = await generateQrBase64(qrText);
                
                return {
                    ...c,
                    photoBase64,
                    qrBase64,
                    planName: plans.find(p => p.id === c.plan_id)?.floor_id 
                        ? floors.find(f => f.id === plans.find(p => p.id === c.plan_id)?.floor_id)?.name 
                        : "Plan"
                };
            }));

            // Collect necessary plans
            const requiredPlanIds = new Set(chargersWithBase64.map(c => c.plan_id).filter(Boolean) as string[]);
            const enrichedPlans = await enrichPlansWithImages(plans, requiredPlanIds, token);
            const plansMap = enrichedPlans.reduce((acc, p) => ({ ...acc, [p.id]: p }), {} as Record<string, Plan>);

            setStatusMessage(t("reports", "generating", "Generowanie PDF..."));
            const blob = await pdf(
                <ChargersPdf
                    chargers={chargersWithBase64}
                    plansMap={plansMap}
                    projectName={projectNameWithCompany}
                    includePin={chargerIncludePin}
                    translations={{
                        project: t("reports", "project", "Projekt"),
                        generatedOn: t("reports", "generatedOn", "Wygenerowano"),
                        missingMap: t("reports", "missingMap", "Brak podglądu mapy"),
                        missingPhoto: t("reports", "missingPhoto", "Brak zdjęcia"),
                        owner: t("footer", "owner", "Owner: Marcin Slapinski"),
                    }}
                />
            ).toBlob();

            const safeCustomName = customFileName.trim().replace(/[^a-zA-Z0-9\s._-]+/g, "").replace(/\s+/g, "_");
            const prefix = safeCustomName || "ladegerate";
            const filename = `${prefix}_${new Date().toISOString().slice(0, 10)}_${Date.now()}.pdf`;
            downloadBlob(blob, filename);

        } catch (e) {
            console.error("Error generating chargers report", e);
            alert(t("common", "error", "Błąd") + ": " + (e as Error).message);
        } finally {
            setIsGenerating(false);
            setStatusMessage("");
        }
    };

    const generateAndDownloadChargersExcel = async () => {
        setIsGenerating(true);
        setStatusMessage(t("reports", "loadingData", "Pobieranie danych..."));
        try {
            const selectedChargers = chargersList.filter(c => selectedChargerIds.has(c.id));
            if (selectedChargers.length === 0) {
                alert("Nie wybrano żadnej ładowarki.");
                return;
            }

            // Group chargers by plan_id, sort each group chronologically, and assign numbers
            const chargersByPlan = new Map<string, any[]>();
            chargersList.forEach(c => {
                if (!c.plan_id) return;
                if (!chargersByPlan.has(c.plan_id)) {
                    chargersByPlan.set(c.plan_id, []);
                }
                chargersByPlan.get(c.plan_id)!.push(c);
            });

            const chargerNumbers = new Map<string, number>();
            chargersByPlan.forEach((list, planId) => {
                const sorted = [...list].sort(
                    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                );
                sorted.forEach((c, idx) => {
                    chargerNumbers.set(c.id, idx + 1);
                });
            });

            // Create CSV content with UTF-8 BOM
            const headers = ["Marker", "MAC"];
            if (chargerIncludePin) {
                headers.push("PIN");
            }

            const rows = selectedChargers.map(c => {
                const row = [
                    chargerNumbers.get(c.id) || "",
                    c.mac || ""
                ];
                if (chargerIncludePin) {
                    row.push(c.pin || "");
                }
                return row;
            });

            const csvContent = "\uFEFF" + [
                headers.join(";"),
                ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(";"))
            ].join("\n");

            const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            const safeCustomName = customFileName.trim().replace(/[^a-zA-Z0-9\s._-]+/g, "").replace(/\s+/g, "_");
            const prefix = safeCustomName || "ladegerate";
            link.setAttribute("href", url);
            link.setAttribute("download", `${prefix}_${new Date().toISOString().slice(0, 10)}_${Date.now()}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (err) {
            console.error(err);
            alert("Błąd generowania pliku Excel");
        } finally {
            setIsGenerating(false);
            setStatusMessage("");
        }
    };

    // Load cables + trommels when QRCODE tab is selected
    useEffect(() => {
        if (activeTab !== "QRCODE" || !selectedProjectId) return;
        Promise.all([
            apiGet<any[]>(`/api/cables?projectId=${selectedProjectId}&limit=1000`),
            apiGet<any[]>(`/api/trommels?projectId=${selectedProjectId}&limit=1000`),
        ]).then(([c, tr]) => {
            setQrCablesList(c || []);
            setQrTrommelsList(tr || []);
            // Pre-select all
            setQrSelectedCables(new Set((c || []).map((x: any) => x.id)));
            setQrSelectedTrommels(new Set((tr || []).map((x: any) => x.id)));
        }).catch(() => {});
    }, [activeTab, selectedProjectId]);

    useEffect(() => {
        if (activeTab !== "LADEGERÄTE" || !selectedProjectId) return;
        apiGet<any[]>(`/api/chargers?projectId=${selectedProjectId}&limit=1000`)
            .then((res) => {
                const data = Array.isArray(res) ? res : ((res as any).data || []);
                setChargersList(data);
                setSelectedChargerIds(new Set(data.map((c: any) => c.id)));
                setSelectedPlanIds(new Set(data.map((c: any) => c.plan_id).filter(Boolean)));
            })
            .catch(() => {});
    }, [activeTab, selectedProjectId]);

    useEffect(() => {
        if (activeTab !== "FRAGEN" || !selectedProjectId) return;
        apiGet<any[]>(`/api/tasks?projectId=${selectedProjectId}&is_question=true&limit=1000`)
            .then((res) => {
                const data = Array.isArray(res) ? res : ((res as any).data || []);
                setQuestionsList(data);
                setSelectedQuestionIds(new Set(data.map((q: any) => q.id)));
                setSelectedPlanIds(new Set(data.map((q: any) => q.plan_id).filter(Boolean)));
            })
            .catch((err) => console.error("Failed to load questions for reports", err));
    }, [activeTab, selectedProjectId]);

    const generateAndDownloadQrLabelsReport = async () => {
        const total = qrSelectedCables.size + qrSelectedTrommels.size;
        if (total === 0) { alert("Zaznacz co najmniej jeden kabel lub bęben."); return; }
        setIsGenerating(true);
        setStatusMessage(qrPrinterType === "brother_csv" ? "Generowanie pliku CSV..." : "Generowanie kodów QR...");
        try {
            const origin = window.location.origin;
            const items: any[] = [];

            if (qrPrinterType === "brother_csv") {
                // Generate CSV for Brother P-touch Editor
                let csvContent = "ID,Type,Number,Name,Info,Project,QR_URL\n";
                const projectName = projectNameWithCompany;

                for (const cable of qrCablesList.filter((c: any) => qrSelectedCables.has(c.id))) {
                    const qrText = `${origin}/cables?scan_type=cable&scan_id=${cable.id}&name=${encodeURIComponent(cable.name)}`;
                    const info = [cable.cable_type, cable.length != null ? `${cable.length}m` : null].filter(Boolean).join(" · ") || "";
                    csvContent += `"${cable.id}","KABEL","${cable.index_number || ""}","${cable.name}","${info}","${projectName}","${qrText}"\n`;
                }

                for (const tr of qrTrommelsList.filter((t: any) => qrSelectedTrommels.has(t.id))) {
                    const qrText = `${origin}/cables?scan_type=trommel&scan_id=${tr.id}&name=${encodeURIComponent(tr.name)}`;
                    const info = tr.remaining_length != null ? `${t("cables_pdf", "remaining", "Pozostało")}: ${tr.remaining_length}m` : "";
                    csvContent += `"${tr.id}","TROMMEL","${tr.index_number || ""}","${tr.name}","${info}","${projectName}","${qrText}"\n`;
                }

                const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
                const safeCustomName = customFileName.trim().replace(/[^a-zA-Z0-9\s._-]+/g, "").replace(/\s+/g, "_");
                const filename = `${safeCustomName || "brother_labels"}_${new Date().toISOString().slice(0, 10)}.csv`;
                
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.setAttribute("href", url);
                link.setAttribute("download", filename);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                setIsGenerating(false);
                setStatusMessage("");
                return;
            }

            for (const cable of qrCablesList.filter((c: any) => qrSelectedCables.has(c.id))) {
                const qrText = `${origin}/cables?scan_type=cable&scan_id=${cable.id}&name=${encodeURIComponent(cable.name)}`;
                const qrBase64 = await generateDataMatrixBase64(qrText);
                items.push({

                    id: cable.id,
                    type: "cable",
                    index_number: cable.index_number,
                    name: cable.name,
                    info: [cable.cable_type, cable.length != null ? `${cable.length}m` : null].filter(Boolean).join(" · ") || undefined,
                    qrBase64,
                });
            }

            for (const tr of qrTrommelsList.filter((t: any) => qrSelectedTrommels.has(t.id))) {
                const qrText = `${origin}/cables?scan_type=trommel&scan_id=${tr.id}&name=${encodeURIComponent(tr.name)}`;
                const qrBase64 = await generateQrBase64(qrText);
                items.push({
                    id: tr.id,
                    type: "trommel",
                    index_number: tr.index_number,
                    name: tr.name,
                    info: tr.remaining_length != null ? `${t("cables_pdf", "remaining", "Pozostało")}: ${tr.remaining_length}m` : undefined,
                    qrBase64,
                });
            }

            if (qrPrinterType.startsWith('brother')) {
                setStatusMessage("Generowanie obrazów dla Brother...");
                const tapeWidth = qrPrinterType === "brother_40x18" ? 18 : 24;
                const brotherItems = items.map(it => ({
                    id: it.id,
                    type: it.type,
                    index_number: it.index_number,
                    name: it.name,
                    info: it.info,
                    origin: origin
                }));
                await BrotherProvider.printLabels(brotherItems, tapeWidth as 18 | 24);
                setIsGenerating(false);
                setStatusMessage("");
                return;
            }

            setStatusMessage(t("reports", "generating", "Generowanie PDF..."));
            const projectName = projectNameWithCompany;
            const blob = await pdf(
                <QrLabelsPdfZebra items={items} projectName={projectName} />
            ).toBlob();

            const safeCustomName = customFileName.trim().replace(/[^a-zA-Z0-9\s._-]+/g, "").replace(/\s+/g, "_");
            const prefix = safeCustomName || "qr_etykiety";
            const filename = `${prefix}_${new Date().toISOString().slice(0, 10)}_${Date.now()}.pdf`;
            downloadBlob(blob, filename);
        } catch (e) {
            console.error("Error generating QR labels", e);
            alert(t("common", "error", "Błąd") + ": " + (e as Error).message);
        } finally {
            setIsGenerating(false);
            setStatusMessage("");
        }
    };

    const downloadBlob = async (blob: Blob, filename: string) => {
        // Archiwizacja (FormData)
        setStatusMessage("Archiwizacja raportu...");
        const formData = new FormData();
        formData.append('file', blob, filename);
        formData.append('filename', filename);

        try {
            const tok = await import("@/lib/apiClient").then(m => m.getToken());
            await fetch(getApiUrl("/api/reports"), {
                method: "POST",
                body: formData,
                headers: tok ? { Authorization: `Bearer ${tok}` } : {}
            });
            fetchSavedReports();
        } catch (archiveErr) {
            console.error("[Reports] Archive failed", archiveErr);
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    };

    const generateAndDownloadReport = async () => {
        setIsGenerating(true);
        setStatusMessage(t("reports", "loadingData", "Pobieranie danych..."));
        try {
            // 1. Fetch data
            const query = new URLSearchParams({
                projectId: selectedProjectId,
                limit: "1000",
            });
            if (dateFrom) query.append("due_from", dateFrom);
            if (dateTo) query.append("due_to", dateTo);

            const allTasks = await apiGet<any[]>(`/api/tasks?${query.toString()}`);
            if (!allTasks) throw new Error("Could not fetch tasks");

            // Filter tasks
            let filtered = allTasks.filter(t =>
                (selectedPlanIds.size === 0 || selectedPlanIds.has(t.plan_id)) &&
                (selectedStatuses.size === 0 || selectedStatuses.has(t.status)) &&
                (selectedUserIds.size === 0 || selectedUserIds.has(t.assigned_user_id))
            );

            // If tasks are manually selected, use only those
            if (selectedTaskIds.size > 0) {
                filtered = allTasks.filter(t => selectedTaskIds.has(t.id));
            }

            if (filtered.length === 0) {
                alert(t("reports", "noTasksFound", "Nie znaleziono zadań dla wybranych filtrów."));
                return;
            }

            setStatusMessage(t("reports", "fetchingPhotos", "Pobieranie zdjęć..."));
            const token = await import("@/lib/apiClient").then(m => m.getToken());

            // 2. Enrich with photo data, User Names, and Company Names
            let profileMap: Record<string, string> = {};
            let companyMap: Record<string, string> = {};
            try {
                const [profiles, companies] = await Promise.all([
                    apiGet<any[]>(`/api/profiles?limit=1000`).catch(() => []),
                    apiGet<any[]>(`/api/companies`).catch(() => []),
                ]);
                if (Array.isArray(profiles)) {
                    profiles.forEach((p: any) => { profileMap[p.id] = p.full_name || p.email || p.id; });
                }
                if (Array.isArray(companies)) {
                    companies.forEach((c: any) => { companyMap[c.id] = c.name; });
                }
            } catch { /* fallback */ }

            // Batch fetch photos
            const phases = [];
            if (photoMode === "BEFORE" || photoMode === "BOTH") phases.push("BEFORE");
            if (photoMode === "AFTER" || photoMode === "BOTH") phases.push("AFTER");

            const params = qs.stringify({
                taskIds: filtered.map((t) => t.id),
                phases,
                limit: 1,
            }, { arrayFormat: "repeat" });

            const allPhotos = await apiGet<any[]>(`/api/task-photos/batch?${params}`);
            const photoMap: Record<string, Record<string, any>> = {};
            if (Array.isArray(allPhotos)) {
                for (const p of allPhotos) {
                    if (!photoMap[p.task_id]) photoMap[p.task_id] = {};
                    photoMap[p.task_id][p.photo_type || "BEFORE"] = p;
                }
            }

            const enrichedTasks = await Promise.all(filtered.map(async (task) => {
                try {
                    let beforePhoto = null;
                    let afterPhoto = null;
                    if (photoMode === "BEFORE" || photoMode === "BOTH") {
                        const before = photoMap[task.id]?.BEFORE;
                        if (before && before.url) beforePhoto = await urlToBase64(before.url, token);
                    }
                    if (photoMode === "AFTER" || photoMode === "BOTH") {
                        const after = photoMap[task.id]?.AFTER;
                        if (after && after.url) afterPhoto = await urlToBase64(after.url, token);
                    }
                    return {
                        ...task,
                        beforePhoto,
                        afterPhoto,
                        assigneeName: task.assigned_user_id ? (profileMap[task.assigned_user_id] || task.assigneeName || task.assigned_user_name || "Unknown") : "-",
                        companyName: task.assigned_company_id ? (companyMap[task.assigned_company_id] || "Unknown") : "-",
                        numericLabel: getTaskNumericLabel(task.id),
                        x_norm: Number(task.x_norm),
                        y_norm: Number(task.y_norm)
                    };
                } catch (err) {
                    console.warn(`Failed to process task ${task.id}`, err);
                    return task;
                }
            }));

            // 3. Translation logic (optional but kept if active)
            let finalTasks = enrichedTasks;
            if (language) {
                try {
                    setStatusMessage(`Tłumaczenie na ${language}...`);
                    const textsToTranslate = new Set<string>();
                    enrichedTasks.forEach(t => {
                        if (t.title) textsToTranslate.add(t.title);
                        if (t.description) textsToTranslate.add(t.description);
                    });
                    if (textsToTranslate.size > 0) {
                        const textsArray = Array.from(textsToTranslate);
                        const res = await apiPost<{ translations: string[] }>("/api/translate", {
                            targetLang: language,
                            texts: textsArray
                        });
                        if (res && res.translations) {
                            const translationMap = new Map();
                            textsArray.forEach((orig, idx) => translationMap.set(orig, res.translations[idx]));
                            finalTasks = enrichedTasks.map(t => ({
                                ...t,
                                title: translationMap.get(t.title) || t.title,
                                description: t.description ? (translationMap.get(t.description) || t.description) : t.description
                            }));
                        }
                    }
                } catch (e) {
                    console.error("[Reports] Translation failed:", e);
                }
            }

            // 4. Enrich Plans (with Stitching)
            const enrichedPlans = await enrichPlansWithImages(plans, selectedPlanIds, token);

            const plansMap = enrichedPlans.reduce((acc, p) => ({ ...acc, [p.id]: p }), {} as Record<string, Plan>);
            const buildingsMap = buildings.reduce((acc, b) => ({ ...acc, [b.id]: b }), {} as Record<string, Building>);
            const floorsMap = floors.reduce((acc, f) => ({ ...acc, [f.id]: f }), {} as Record<string, Floor>);

            const summaryData = {
                total: finalTasks.length,
                byStatus: ALL_STATUSES.reduce((acc, s) => ({
                    ...acc,
                    [s]: finalTasks.filter(t => t.status === s).length
                }), {} as Record<string, number>)
            };

            setStatusMessage(t("reports", "generating", "Generowanie PDF..."));

            const pdfTranslations = {
                title: t("reports", "title", "Raporty"),
                project: t("reports", "project", "Projekt"),
                generatedOn: t("reports", "generatedOn", "Wygenerowano"),
                statuses: t("reports", "statuses", "Statusy"),
                from: t("home", "dueFrom", "Od"),
                to: t("home", "dueTo", "Do"),
                summary: t("reports", "summary", "Podsumowanie"),
                totalTasks: t("reports", "totalTasks", "Liczba zadań łącznie"),
                taskList: t("reports", "taskList", "Lista zadań"),
                number: t("reports", "number", "Nr"),
                name: t("reports", "taskName", "Nazwa zadania"),
                assigned: t("reports", "assigned", "Przypisany"),
                dateCreated: t("reports", "dateCreated", "Data utw."),
                photos: t("reports", "photos", "Zdjęcia"),
                none: t("reports", "none", "Brak"),
                page: t("reports", "page", "Strona"),
                of: t("reports", "of", "z"),
                statusOpen: t("taskStatus", "OPEN", "Otwarte"),
                statusInProgress: t("taskStatus", "IN_PROGRESS", "W trakcie"),
                statusDoneWaiting: t("taskStatus", "DONE_WAITING_APPROVAL", "Czeka na akcept."),
                statusApproved: t("taskStatus", "APPROVED", "Zatwierdzone"),
                statusRejected: t("taskStatus", "REJECTED", "Odrzucone"),
                statusCancelled: "Anulowane",
                before: t("reports", "before", "Przed"),
                after: t("reports", "after", "Po"),
                status: t("reports", "status", "Status"),
                company: t("reports", "company", "Firma"),
            };

            // 5. Generate PDF
            const blob = await pdf(
                <ReportPdf
                    projectId={selectedProjectId}
                    projectName={projectNameWithCompany}
                    projectCompanyName={selectedProject?.companies?.name || ""}
                    planIds={Array.from(selectedPlanIds)}
                    statuses={Array.from(selectedStatuses)}
                    dateFrom={dateFrom}
                    dateTo={dateTo}
                    plansMap={plansMap}
                    buildingsMap={buildingsMap}
                    floorsMap={floorsMap}
                    tasks={finalTasks}
                    summary={summaryData}
                    photoMode={photoMode}
                    translations={pdfTranslations}
                />
            ).toBlob();

            const safeCustomName = customFileName.trim().replace(/[^a-zA-Z0-9\s._-]+/g, "").replace(/\s+/g, "_");
            const prefix = safeCustomName || "raport";
            const filename = `${prefix}_${new Date().toISOString().slice(0, 10)}_${Date.now()}.pdf`;

            downloadBlob(blob, filename);

        } catch (e) {
            console.error("Error generating report", e);
            alert(t("common", "error", "Błąd") + ": " + (e as Error).message);
        } finally {
            setIsGenerating(false);
            if (statusMessage && !statusMessage.includes('<a ')) {
                setStatusMessage("");
            }
        }
    };


    return (
        <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            className="min-h-screen bg-transparent text-ui-text selection:bg-ui-accent/30 overflow-x-hidden pb-20"
        >
            {/* Ambient Background Glows */}
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-ui-accent/5 blur-[120px] rounded-full"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-ui-accent/5 blur-[120px] rounded-full"></div>
                <div className="absolute inset-0 opacity-[0.02]" style={{ backgroundImage: "radial-gradient(var(--ui-text) 1px, transparent 0)", backgroundSize: "40px 40px" }}></div>
            </div>

            <div className="relative z-10 container mx-auto px-6 py-12 max-w-[1600px]">
                {/* Header Card */}
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-12 gap-8 bg-ui-card backdrop-blur-3xl border border-ui-border p-10 lg:p-14 rounded-xl shadow-2xl shadow-black/50">
                    <div>
                        <h1 className="text-4xl lg:text-5xl font-black tracking-tighter text-ui-text uppercase leading-none">
                            {t("nav", "berichte", "BERICHTE")}
                        </h1>
                        <p className="text-ui-muted text-xs mt-4 uppercase font-bold tracking-[0.3em]">
                            {t("reports", "subtitle", "System generowania raportów i dokumentacji")}
                        </p>
                    </div>

                    <div className="flex bg-black/40 p-2 rounded-xl border border-ui-border backdrop-blur-xl gap-2 overflow-x-auto max-w-full no-scrollbar">
                        {[
                            { id: "BERICHTE", label: t("reports", "reportsTab", "Raporty"), icon: "📄" },
                            { id: "REVISION", label: t("reports", "revisionsTab", "Rewizje"), icon: "🔄" },
                            { id: "FEHLER", label: t("reports", "fehlersTab", "Błędy"), icon: "⚠️" },
                            { id: "KABLE", label: t("reports", "cablesTab", "Kable"), icon: "🔌" },
                            { id: "TROMMLE", label: t("reports", "trommelsTab", "Trommle"), icon: "📦" },
                            { id: "QRCODE", label: t("reports", "qrTab", "QR-Codes"), icon: "📱" },
                            { id: "LADEGERÄTE", label: "Ładowarki", icon: "🔌" },
                            { id: "FRAGEN", label: t("reports", "questionsTab", "Pytania"), icon: "❓" },
                            { id: "PLAN_ELEMENTS", label: t("reports", "planElementsTab", "Plan-Elemente"), icon: "🗺️" },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`px-6 py-3 rounded-lg text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-300 flex items-center gap-2 whitespace-nowrap ${
                                    activeTab === tab.id 
                                    ? "bg-ui-accent text-slate-950 shadow-[0_0_20px_var(--ui-glow)]" 
                                    : "text-ui-muted hover:text-ui-text hover:bg-white/5"
                                }`}
                            >
                                <span className="text-sm">{tab.icon}</span>
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
                    {/* Sidebar / Filters */}
                    <div className="xl:col-span-4 space-y-8">
                        <motion.div 
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="bg-ui-card backdrop-blur-3xl border border-ui-border rounded-xl p-10 space-y-8 shadow-2xl"
                        >
                            <div className="space-y-6">
                                <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-ui-accent/80 mb-2">{t("reports", "filters", "FILTRY")}</h2>
                                
                                {/* Project Selector */}
                                <div className="space-y-3">
                                    <label className="text-[9px] font-black text-ui-muted uppercase tracking-widest ml-1">{t("reports", "project", "PROJEKT")}</label>
                                    <div className="relative">
                                        <select
                                            value={selectedProjectId}
                                            onChange={(e) => setSelectedProjectId(e.target.value)}
                                            className="w-full bg-black/40 border border-ui-border rounded-xl px-6 py-4 text-xs font-bold text-ui-text outline-none appearance-none cursor-pointer focus:border-ui-accent/50 transition-all"
                                        >
                                            {projects.map((p) => (
                                                <option key={p.id} value={p.id} className="bg-slate-900">{p.companies?.name ? `[${p.companies.name.toUpperCase()}] ` : ""}{p.name}</option>
                                            ))}
                                        </select>
                                        <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-ui-muted">▼</div>
                                    </div>
                                </div>

                                {/* Custom Filename */}
                                <div className="space-y-3">
                                    <label className="text-[9px] font-black text-ui-muted uppercase tracking-widest ml-1">{t("reports", "reportNameLabel", "NAZWA PLIKU")}</label>
                                    <input
                                        type="text"
                                        placeholder="raport"
                                        value={customFileName}
                                        onChange={(e) => setCustomFileName(e.target.value)}
                                        className="w-full bg-black/40 border border-ui-border rounded-xl px-6 py-4 text-xs font-bold text-ui-text outline-none focus:border-ui-accent/50 transition-all"
                                    />
                                </div>

                                {/* Date Range */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-3">
                                        <label className="text-[9px] font-black text-ui-muted uppercase tracking-widest ml-1">{t("reports", "from", "OD")}</label>
                                        <input
                                            type="date"
                                            value={dateFrom}
                                            onChange={(e) => setDateFrom(e.target.value)}
                                            className="w-full bg-black/40 border border-ui-border rounded-xl px-6 py-4 text-xs font-bold text-ui-text outline-none focus:border-ui-accent/50 transition-all"
                                        />
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[9px] font-black text-ui-muted uppercase tracking-widest ml-1">{t("reports", "to", "DO")}</label>
                                        <input
                                            type="date"
                                            value={dateTo}
                                            onChange={(e) => setDateTo(e.target.value)}
                                            className="w-full bg-black/40 border border-ui-border rounded-xl px-6 py-4 text-xs font-bold text-ui-text outline-none focus:border-ui-accent/50 transition-all"
                                        />
                                    </div>
                                </div>

                                {activeTab === "BERICHTE" && (
                                    <>
                                        {/* Status Multi-select */}
                                        <div className="space-y-4">
                                            <label className="text-[9px] font-black text-ui-muted uppercase tracking-widest ml-1">{t("reports", "statuses", "STATUSY")}</label>
                                            <div className="flex flex-wrap gap-2">
                                                {ALL_STATUSES.map((s) => (
                                                    <button
                                                        key={s}
                                                        onClick={() => handleStatusToggle(s)}
                                                        className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                                                            selectedStatuses.has(s)
                                                                ? "bg-ui-accent/20 text-ui-accent border border-ui-accent/30 shadow-[0_0_15px_var(--ui-glow)]"
                                                                : "bg-ui-card text-ui-muted border border-ui-border hover:border-ui-muted"
                                                        }`}
                                                    >
                                                        {t("taskStatus", s, s)}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Photo Mode */}
                                        <div className="space-y-4">
                                            <label className="text-[9px] font-black text-ui-muted uppercase tracking-widest ml-1">{t("reports", "photosInReport", "ZDJĘCIA")}</label>
                                            <div className="grid grid-cols-3 gap-2">
                                                {[
                                                    { id: "BOTH", label: t("reports", "bothPhotos", "Oba") },
                                                    { id: "BEFORE", label: t("reports", "beforeOnly", "Przed") },
                                                    { id: "AFTER", label: t("reports", "afterOnly", "Po") },
                                                ].map((mode) => (
                                                    <button
                                                        key={mode.id}
                                                        onClick={() => setPhotoMode(mode.id as any)}
                                                        className={`px-2 py-3 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${
                                                            photoMode === mode.id
                                                                ? "bg-amber-500 text-amber-950 shadow-[0_0_15px_rgba(245,158,11,0.3)]"
                                                                : "bg-ui-card text-ui-muted border border-ui-border hover:border-ui-muted"
                                                        }`}
                                                    >
                                                        {mode.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* User Multi-select */}
                                        <div className="space-y-4">
                                            <label className="text-[9px] font-black text-ui-muted uppercase tracking-widest ml-1">{t("reports", "assignees", "WYKONAWCY")}</label>
                                            <div className="max-h-[200px] overflow-y-auto pr-2 custom-scrollbar space-y-2">
                                                {assignedUsers.map((u) => (
                                                    <button
                                                        key={u.id}
                                                        onClick={() => handleUserToggle(u.id)}
                                                        className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
                                                            selectedUserIds.has(u.id)
                                                                ? "bg-ui-accent/10 border-ui-accent/30 text-ui-text"
                                                                : "bg-black/20 border-ui-border text-ui-muted hover:border-ui-muted"
                                                        }`}
                                                    >
                                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black ${selectedUserIds.has(u.id) ? "bg-ui-accent text-slate-900" : "bg-ui-card text-ui-muted"}`}>
                                                            {u.name?.[0] || "?"}
                                                        </div>
                                                        <span className="text-[11px] font-bold uppercase tracking-tight truncate">{u.name}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </>
                                )}

                                {activeTab === "KABLE" && (
                                    <div className="space-y-4 p-6 bg-blue-500/5 rounded-xl border border-blue-500/20">
                                        <h3 className="text-[10px] font-black text-blue-500 uppercase tracking-widest flex items-center gap-2">⚙️ {t("reports", "cableReportOptions", "OPCJE RAPORTU KABLI")}</h3>
                                        <div className="space-y-3">
                                            <label className="flex items-center gap-3 cursor-pointer group">
                                                <input 
                                                    type="radio" 
                                                    name="cableExportType" 
                                                    checked={cableExportType === "standard"} 
                                                    onChange={() => setCableExportType("standard")} 
                                                    className="w-5 h-5 text-blue-500 accent-blue-500 cursor-pointer" 
                                                />
                                                <span className="text-[10px] font-bold text-slate-400 group-hover:text-white transition-colors uppercase">{t("reports", "cableExportStandard", "Plany i kable (Standard)")}</span>
                                            </label>
                                            <label className="flex items-center gap-3 cursor-pointer group">
                                                <input 
                                                    type="radio" 
                                                    name="cableExportType" 
                                                    checked={cableExportType === "by_category"} 
                                                    onChange={() => setCableExportType("by_category")} 
                                                    className="w-5 h-5 text-blue-500 accent-blue-500 cursor-pointer" 
                                                />
                                                <span className="text-[10px] font-bold text-slate-400 group-hover:text-white transition-colors uppercase">{t("reports", "cableExportByCategory", "Lista według kategorii (bez planów)")}</span>
                                            </label>
                                        </div>
                                    </div>
                                )}

                                {activeTab === "TROMMLE" && (
                                    <div className="space-y-4 p-6 bg-amber-500/5 rounded-xl border border-amber-500/20">
                                        <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-widest flex items-center gap-2">⚙️ {t("reports", "trommelReportOptions", "OPCJE BĘBNÓW")}</h3>
                                        <div className="space-y-3">
                                            <label className="flex items-center gap-3 cursor-pointer group">
                                                <input type="checkbox" checked={cableIncludePhotos} onChange={e => setCableIncludePhotos(e.target.checked)} className="w-5 h-5 rounded-lg border-2 border-slate-700 bg-black/40 checked:bg-amber-500 checked:border-amber-400 transition-all appearance-none" />
                                                <span className="text-[10px] font-bold text-slate-400 group-hover:text-white transition-colors uppercase">{t("reports", "includeTrommelPhotos", "DOŁĄCZ ZDJĘCIA")}</span>
                                            </label>
                                            <label className="flex items-center gap-3 cursor-pointer group">
                                                <input type="checkbox" checked={cableIncludeCompanyInfo} onChange={e => setCableIncludeCompanyInfo(e.target.checked)} className="w-5 h-5 rounded-lg border-2 border-slate-700 bg-black/40 checked:bg-amber-500 checked:border-amber-400 transition-all appearance-none" />
                                                <span className="text-[10px] font-bold text-slate-400 group-hover:text-white transition-colors uppercase">{t("reports", "includeTrommelCompany", "DANE FIRMY")}</span>
                                            </label>
                                        </div>
                                    </div>
                                )}
                                {activeTab === "LADEGERÄTE" && (
                                    <div className="space-y-4 p-6 bg-blue-500/5 rounded-xl border border-blue-500/20">
                                        <h3 className="text-[10px] font-black text-blue-500 uppercase tracking-widest flex items-center gap-2">⚙️ {t("reports", "chargerReportOptions", "OPCJE ŁADOWAREK")}</h3>
                                        <div className="space-y-3">
                                            <label className="flex items-center gap-3 cursor-pointer group">
                                                <input type="checkbox" checked={chargerIncludePin} onChange={e => setChargerIncludePin(e.target.checked)} className="w-5 h-5 rounded-lg border-2 border-slate-700 bg-black/40 checked:bg-blue-500 checked:border-blue-400 transition-all appearance-none" />
                                                <span className="text-[10px] font-bold text-slate-400 group-hover:text-white transition-colors uppercase">{t("reports", "includeChargerPin", "DOŁĄCZ PIN DO RAPORTU")}</span>
                                            </label>
                                        </div>
                                    </div>
                                )}
                                {activeTab === "PLAN_ELEMENTS" && (
                                    <div className="space-y-5 p-6 bg-sky-500/5 rounded-xl border border-sky-500/20">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-[10px] font-black text-sky-400 uppercase tracking-widest flex items-center gap-2">⚙️ {t("reports", "selectExportComponents", "ELEMENTY DO EKSPORTU")}</h3>
                                        </div>

                                          {/* Quick Preset Buttons */}
                                        <div className="grid grid-cols-4 gap-1.5 pb-2 border-b border-ui-border/40">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setPeOptNotlicht(true);
                                                    setPeOptBma(false);
                                                    setPeOptLighting(false);
                                                    setPeOptHeating(false);
                                                    setPeOptKabelbahn(false);
                                                    setPeOptKabelauslass(false);
                                                    setPeOptKlappen(false);
                                                    setPeOptMeasurements(false);
                                                    setPeOptPhotoPins(false);
                                                    setPeOptMontageDoku(false);
                                                    setPeOptCables(false);
                                                    setPeOptPlanOverview(true);
                                                    setPeOptLampTypes(true);
                                                }}
                                                className="px-2 py-2 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 rounded-lg text-[9px] font-black uppercase tracking-wider text-emerald-400 transition-all text-center"
                                            >
                                                🚨 Notlicht
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setPeOptHeating(true);
                                                    setPeOptNotlicht(false);
                                                    setPeOptBma(false);
                                                    setPeOptLighting(false);
                                                    setPeOptKabelbahn(false);
                                                    setPeOptKabelauslass(false);
                                                    setPeOptKlappen(false);
                                                    setPeOptMeasurements(false);
                                                    setPeOptPhotoPins(false);
                                                    setPeOptMontageDoku(false);
                                                    setPeOptCables(false);
                                                    setPeOptPlanOverview(true);
                                                    setPeOptLampTypes(true);
                                                }}
                                                className="px-2 py-2 bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 rounded-lg text-[9px] font-black uppercase tracking-wider text-sky-400 transition-all text-center"
                                            >
                                                ❄️ Heizung
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setPeOptNotlicht(true);
                                                    setPeOptBma(true);
                                                    setPeOptLighting(true);
                                                    setPeOptHeating(true);
                                                    setPeOptKabelbahn(true);
                                                    setPeOptKabelauslass(true);
                                                    setPeOptCables(true);
                                                    setPeOptKlappen(true);
                                                    setPeOptMeasurements(true);
                                                    setPeOptPhotoPins(true);
                                                    setPeOptMontageDoku(true);
                                                    setPeOptPlanOverview(true);
                                                    setPeOptLampTypes(true);
                                                    setPeOptKabelzugliste(true);
                                                }}
                                                className="px-2 py-2 bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/40 rounded-lg text-[9px] font-black uppercase tracking-wider text-blue-400 transition-all text-center"
                                            >
                                                ✨ {t("reports", "presetAll", "Wszystko")}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setPeOptNotlicht(false);
                                                    setPeOptBma(false);
                                                    setPeOptLighting(false);
                                                    setPeOptHeating(false);
                                                    setPeOptKabelbahn(false);
                                                    setPeOptKabelauslass(false);
                                                    setPeOptCables(false);
                                                    setPeOptKlappen(false);
                                                    setPeOptMeasurements(false);
                                                    setPeOptPhotoPins(false);
                                                    setPeOptMontageDoku(false);
                                                    setPeOptPlanOverview(true);
                                                    setPeOptLampTypes(false);
                                                    setPeOptKabelzugliste(false);
                                                }}
                                                className="px-2 py-2 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 rounded-lg text-[9px] font-black uppercase tracking-wider text-rose-400 transition-all text-center"
                                            >
                                                🧹 {t("reports", "presetNone", "Żadne")}
                                            </button>
                                        </div>

                                        <div className="space-y-2.5">
                                            {([
                                                { key: "bma", label: t("reports", "optBmaOnly", "Brandmeldeanlage (BMA / DIS)"), val: peOptBma, set: setPeOptBma, color: "red", icon: "🔴" },
                                                { key: "notlicht", label: t("reports", "optNotlicht", "Notbeleuchtung & Pikto"), val: peOptNotlicht, set: setPeOptNotlicht, color: "emerald", icon: "🟢" },
                                                { key: "lighting", label: t("reports", "optLighting", "Allgemeinbeleuchtung (Lampen & LED)"), val: peOptLighting, set: setPeOptLighting, color: "amber", icon: "💡" },
                                                { key: "heating", label: t("reports", "optHeating", "Heizung & Wärmepumpen / Geräte"), val: peOptHeating, set: setPeOptHeating, color: "sky", icon: "❄️" },
                                                { key: "cables", label: t("reports", "optCables", "Kabel & Verbindungen / Schemas (Kabelzugliste)"), val: peOptCables, set: setPeOptCables, color: "blue", icon: "🔌" },
                                                { key: "kabelbahn", label: t("reports", "optKabelbahn", "Kabelbahn (Trasy kablowe / Drabinki)"), val: peOptKabelbahn, set: setPeOptKabelbahn, color: "emerald", icon: "🪜" },
                                                { key: "kabelauslass", label: t("reports", "optKabelauslass", "Kabelauslass (Wypusty kablowe)"), val: peOptKabelauslass, set: setPeOptKabelauslass, color: "slate", icon: "⚡" },
                                                { key: "abdeckung", label: t("planBma", "abdeckungBox", "Abdeckung"), val: peOptAbdeckung, set: setPeOptAbdeckung, color: "slate", icon: "⬜" },
                                                { key: "anderungen", label: t("planBma", "revisionCloud", "Änderungs-Wolke"), val: peOptAnderungen, set: setPeOptAnderungen, color: "amber", icon: "☁️" },
                                                { key: "klappen", label: t("reports", "optKlappen", "Revisionsklappen"), val: peOptKlappen, set: setPeOptKlappen, color: "amber", icon: "🔲" },
                                                { key: "measurements", label: t("reports", "optMeasurements", "Messungen (Pomiary)"), val: peOptMeasurements, set: setPeOptMeasurements, color: "blue", icon: "📏" },
                                                { key: "photos", label: t("reports", "optPhotoPins", "Foto-Pins (Zdjęcia / Lampy)"), val: peOptPhotoPins, set: setPeOptPhotoPins, color: "blue", icon: "📷" },
                                                { key: "montageDoku", label: t("reports", "optMontageDoku", "Montage-Doku (Montagedokumentation & Fotos)"), val: peOptMontageDoku, set: setPeOptMontageDoku, color: "purple", icon: "🛠️" },
                                                { key: "damage", label: t("reports", "optDamage", "Beschädigung (Schadensdokumentation & Fotos)"), val: peOptDamage, set: setPeOptDamage, color: "red", icon: "⚠️" },
                                                { key: "lampTypes", label: t("reports", "optLampTypes", "Leuchtentypen & Fotos (Typy opraw)"), val: peOptLampTypes, set: setPeOptLampTypes, color: "emerald", icon: "📷" },
                                                { key: "overview", label: t("reports", "optPlanOverview", "Planübersicht (Przegląd planu)"), val: peOptPlanOverview, set: setPeOptPlanOverview, color: "purple", icon: "🗺️" },
                                            ] as const).map((opt) => (
                                                <label key={opt.key} className="flex items-center gap-3 cursor-pointer group hover:bg-white/5 p-1.5 rounded-lg transition-colors">
                                                    <input
                                                        type="checkbox"
                                                        checked={opt.val}
                                                        onChange={e => {
                                                            opt.set(e.target.checked);
                                                            if (opt.key === "cables") setPeOptKabelzugliste(e.target.checked);
                                                        }}
                                                        className="w-5 h-5 rounded-lg border-2 border-slate-700 bg-black/40 checked:bg-sky-500 checked:border-sky-400 transition-all appearance-none cursor-pointer"
                                                    />
                                                    <span className="text-[10px] font-bold text-slate-300 group-hover:text-white transition-colors uppercase flex items-center gap-1.5">
                                                        <span>{opt.icon}</span>
                                                        <span>{opt.label}</span>
                                                    </span>
                                                </label>
                                            ))}
                                        </div>

                                        {peOptNotlicht && (
                                            <div className="mt-5 pt-4 border-t border-ui-border/60">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                                                        <span>🏷️</span>
                                                        <span>{t("reports", "reservePerKreisTitle", "Rezerwa naklejek na obwód")}</span>
                                                    </span>
                                                    <span className="text-[10px] font-black text-amber-300 bg-amber-950/70 border border-amber-500/40 px-2 py-0.5 rounded">
                                                        +{peReservePerKreis} / Kreis
                                                    </span>
                                                </div>
                                                <p className="text-[9px] text-ui-muted mb-3 leading-relaxed">
                                                    {t("reports", "reservePerKreisDesc", "Dodaje dodatkowe wolne numery na końcu każdego obwodu (np. 6/9, 6/10) jako zapas na wypadek montażu dodatkowych opraw.")}
                                                </p>
                                                <div className="grid grid-cols-5 gap-1.5">
                                                    {[0, 1, 2, 3, 5].map((amt) => (
                                                        <button
                                                            key={amt}
                                                            type="button"
                                                            onClick={() => setPeReservePerKreis(amt)}
                                                            className={`py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${
                                                                peReservePerKreis === amt
                                                                    ? "bg-amber-500 text-slate-950 shadow-[0_0_15px_rgba(245,158,11,0.4)] scale-105"
                                                                    : "bg-ui-card hover:bg-white/10 text-ui-muted hover:text-ui-text border border-ui-border"
                                                            }`}
                                                        >
                                                            {amt === 0 ? "0 (Brak)" : `+${amt}`}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        <div className="mt-5 pt-4 border-t border-ui-border/60">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-[10px] font-black uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                                                    <span>💡</span>
                                                    <span>{t("reports", "kabelhinweisTitle", "Hinweise (Kabelzugliste)")}</span>
                                                </span>
                                                {peKabelhinweisText.trim() && !savedHinweisTemplates.includes(peKabelhinweisText.trim()) && (
                                                    <button
                                                        type="button"
                                                        onClick={handleSaveHinweisTemplate}
                                                        className="text-[9px] font-black uppercase text-emerald-400 bg-emerald-950/60 border border-emerald-500/40 px-2 py-0.5 rounded hover:bg-emerald-900/80 transition-all flex items-center gap-1 cursor-pointer"
                                                    >
                                                        <span>💾</span>
                                                        <span>Zapisz szablon</span>
                                                    </button>
                                                )}
                                            </div>
                                            <p className="text-[9px] text-ui-muted mb-2 leading-relaxed">
                                                {t("reports", "kabelhinweisDesc", "Wpisany tekst zapisuje się automatycznie. Wybierz z szablonów poniżej lub wpisz własny.")}
                                            </p>
                                            <textarea
                                                value={peKabelhinweisText}
                                                onChange={(e) => handleHinweisTextChange(e.target.value)}
                                                placeholder="np. Bitte nur zertifizierte E30/E90 Funktionserhalt-Kabel verwenden..."
                                                rows={2}
                                                className="w-full bg-black/40 border border-ui-border rounded-xl p-3 text-xs font-bold text-ui-text outline-none focus:border-sky-500/50 transition-all resize-none mb-2"
                                            />

                                            {/* Saved Hinweis Templates */}
                                            {savedHinweisTemplates.length > 0 && (
                                                <div className="flex flex-col gap-1.5 mt-2">
                                                    <span className="text-[8px] font-black text-ui-muted uppercase tracking-wider">Zapisane szablony:</span>
                                                    <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1 custom-scrollbar">
                                                        {savedHinweisTemplates.map((tmpl, idx) => (
                                                            <div
                                                                key={idx}
                                                                className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[9px] font-bold cursor-pointer transition-all ${
                                                                    peKabelhinweisText.trim() === tmpl.trim()
                                                                        ? "bg-sky-500/20 border-sky-400 text-sky-200 shadow-[0_0_10px_rgba(56,189,248,0.2)]"
                                                                        : "bg-black/30 border-ui-border text-ui-muted hover:border-ui-muted hover:text-ui-text"
                                                                }`}
                                                                onClick={() => handleHinweisTextChange(tmpl)}
                                                            >
                                                                <span className="truncate max-w-[220px]">{tmpl}</span>
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleDeleteHinweisTemplate(tmpl);
                                                                    }}
                                                                    className="text-red-400 opacity-60 hover:opacity-100 hover:text-red-300 ml-1 font-black"
                                                                    title="Usuń szablon"
                                                                >
                                                                    ✕
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="pt-8 border-t border-ui-border/50 flex flex-col gap-4">
                                {activeTab === "PLAN_ELEMENTS" ? (
                                    <div className="flex flex-col gap-3">
                                        <button
                                            type="button"
                                            onClick={() => generateAndDownloadPlanElementsReport('plan_only')}
                                            disabled={isGenerating || selectedPlanIds.size === 0}
                                            className={`w-full py-4 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] shadow-xl transition-all duration-300 flex items-center justify-center gap-2 ${
                                                isGenerating || selectedPlanIds.size === 0
                                                ? "bg-ui-card text-ui-muted cursor-not-allowed" 
                                                : "bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-[0_0_25px_rgba(56,189,248,0.3)] hover:scale-[1.01]"
                                            }`}
                                        >
                                            <span>🗺️</span>
                                            <span>POBIERZ TYLKO GRAFICZNY PLAN PDF</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => generateAndDownloadPlanElementsReport('kabelzugliste_only')}
                                            disabled={isGenerating || selectedPlanIds.size === 0}
                                            className={`w-full py-4 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] shadow-xl transition-all duration-300 flex items-center justify-center gap-2 ${
                                                isGenerating || selectedPlanIds.size === 0
                                                ? "bg-ui-card text-ui-muted cursor-not-allowed" 
                                                : "bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-[0_0_25px_rgba(245,158,11,0.3)] hover:scale-[1.01]"
                                            }`}
                                        >
                                            <span>📋</span>
                                            <span>POBIERZ KABELZÜGLISTE & LEITUNGSVERZEICHNIS (PDF)</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => generateAndDownloadPlanElementsReport('all')}
                                            disabled={isGenerating || selectedPlanIds.size === 0}
                                            className={`w-full py-3 rounded-xl text-[9px] font-black uppercase tracking-[0.15em] transition-all flex items-center justify-center gap-2 ${
                                                isGenerating || selectedPlanIds.size === 0
                                                ? "bg-ui-card text-ui-muted cursor-not-allowed" 
                                                : "bg-ui-card hover:bg-white/10 text-ui-text border border-ui-border"
                                            }`}
                                        >
                                            <span>📄</span>
                                            <span>POBIERZ PEŁNY RAPORT (PLAN + KABELZÜGLISTE)</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={generateAndDownloadAufkleberCsv}
                                            disabled={isGenerating || selectedPlanIds.size === 0}
                                            className={`w-full py-3 rounded-xl text-[9px] font-black uppercase tracking-[0.15em] transition-all flex items-center justify-center gap-2 ${
                                                isGenerating || selectedPlanIds.size === 0
                                                ? "bg-ui-card/50 text-ui-muted cursor-not-allowed border border-ui-border/50" 
                                                : "bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400/40 cursor-pointer"
                                            }`}
                                        >
                                            <span>🏷️</span>
                                            <span>POBIERZ LISTĘ NAKLEJEK (CSV / EXCEL)</span>
                                        </button>
                                    </div>
                                ) : activeTab === "LADEGERÄTE" ? (
                                    <div className="flex flex-col sm:flex-row gap-4">
                                        <button
                                            onClick={generateAndDownloadChargersReport}
                                            disabled={isGenerating}
                                            className={`flex-1 py-6 rounded-xl text-[11px] font-black uppercase tracking-[0.2em] shadow-2xl transition-all duration-500 flex items-center justify-center gap-3 ${
                                                isGenerating 
                                                ? "bg-ui-card text-ui-muted cursor-not-allowed" 
                                                : "bg-gradient-to-br from-[var(--ui-accent)] to-blue-600 text-slate-950 shadow-[0_0_40px_var(--ui-glow)] hover:scale-[1.02]"
                                            }`}
                                        >
                                            {isGenerating ? (
                                                <>
                                                    <div className="w-4 h-4 border-2 border-ui-muted border-t-ui-text rounded-full animate-spin"></div>
                                                    {statusMessage || t("reports", "generating", "GENEROWANIE PDF...")}
                                                </>
                                            ) : (
                                                <>
                                                    <span>📥</span>
                                                    {t("reports", "downloadPdf", "POBIERZ PDF")}
                                                </>
                                            )}
                                        </button>
                                        <button
                                            onClick={generateAndDownloadChargersExcel}
                                            disabled={isGenerating}
                                            className={`flex-1 py-6 rounded-xl text-[11px] font-black uppercase tracking-[0.2em] shadow-2xl transition-all duration-500 flex items-center justify-center gap-3 ${
                                                isGenerating 
                                                ? "bg-ui-card text-ui-muted cursor-not-allowed" 
                                                : "bg-emerald-600 text-white shadow-[0_0_40px_rgba(16,185,129,0.2)] hover:scale-[1.02] border-none cursor-pointer"
                                            }`}
                                        >
                                            {isGenerating ? (
                                                <>
                                                    <div className="w-4 h-4 border-2 border-ui-muted border-t-ui-text rounded-full animate-spin"></div>
                                                    {statusMessage || "GENEROWANIE EXCEL..."}
                                                </>
                                            ) : (
                                                <>
                                                    <span>📥</span>
                                                    {t("reports", "downloadExcel", "POBIERZ EXCEL")}
                                                </>
                                            )}
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => {
                                            if (activeTab === "BERICHTE") generateAndDownloadReport();
                                            else if (activeTab === "REVISION") generateAndDownloadRevisionReport();
                                            else if (activeTab === "FEHLER") generateAndDownloadFehlerReport();
                                            else if (activeTab === "KABLE") generateAndDownloadCablesReport();
                                            else if (activeTab === "TROMMLE") generateAndDownloadTrommelsReport();
                                            else if (activeTab === "QRCODE") generateAndDownloadQrLabelsReport();
                                            else if (activeTab === "FRAGEN") generateAndDownloadFragenReport();
                                            else if (activeTab === "PLAN_ELEMENTS") generateAndDownloadPlanElementsReport();
                                        }}
                                        disabled={
                                            isGenerating || 
                                            (((activeTab as any) !== "TROMMLE" && (activeTab as any) !== "QRCODE" && (activeTab as any) !== "FRAGEN" && (activeTab as any) !== "PLAN_ELEMENTS") && selectedPlanIds.size === 0) ||
                                            (activeTab === "FRAGEN" && selectedQuestionIds.size === 0) ||
                                            ((activeTab as any) === "PLAN_ELEMENTS" && selectedPlanIds.size === 0)
                                        }
                                        className={`w-full py-6 rounded-xl text-[11px] font-black uppercase tracking-[0.2em] shadow-2xl transition-all duration-500 flex items-center justify-center gap-3 ${
                                            isGenerating 
                                            ? "bg-ui-card text-ui-muted cursor-not-allowed" 
                                            : "bg-gradient-to-br from-[var(--ui-accent)] to-blue-600 text-slate-950 shadow-[0_0_40px_var(--ui-glow)] hover:scale-[1.02]"
                                        }`}
                                    >
                                        {isGenerating ? (
                                            <>
                                                <div className="w-4 h-4 border-2 border-ui-muted border-t-ui-text rounded-full animate-spin"></div>
                                                {t("reports", "generating", "GENEROWANIE...") || statusMessage}
                                            </>
                                        ) : (
                                            <>
                                                <span>📥</span>
                                                {qrPrinterType === "brother_csv" ? "POBIERZ CSV" : (t("reports", "downloadPdf", "POBIERZ RAPORT PDF"))}
                                            </>
                                        )}
                                    </button>
                                )}
                                {statusMessage && !statusMessage.includes("<a ") && (
                                    <p className="text-ui-accent text-[10px] font-bold uppercase mt-4 text-center animate-pulse">{statusMessage}</p>
                                )}
                            </div>
                        </motion.div>

                        {/* Plan Selection Card */}
                        <motion.div 
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-ui-card backdrop-blur-3xl border border-ui-border rounded-xl p-10 shadow-2xl"
                        >
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-amber-500/80">{t("reports", "plans", "PLANY")}</h2>
                                <div className="flex gap-4">
                                    <button onClick={() => setSelectedPlanIds(new Set(plans.map(p => p.id)))} className="text-[9px] font-black uppercase text-ui-muted hover:text-ui-text transition-all">{t("common", "selectAll", "ALL")}</button>
                                    <button onClick={() => setSelectedPlanIds(new Set())} className="text-[9px] font-black uppercase text-ui-muted hover:text-ui-text transition-all">{t("common", "clear", "CLEAR")}</button>
                                </div>
                            </div>
                            <div className="max-h-[300px] overflow-y-auto pr-2 custom-scrollbar space-y-2">
                                {plans.map((p) => {
                                    const floor = floors.find(f => f.id === p.floor_id);
                                    const building = buildings.find(b => b.id === floor?.building_id);
                                    const label = `${building?.name || "?"} - ${floor?.name || "?"} (v${p.version})`;
                                    return (
                                        <label key={p.id} className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all ${selectedPlanIds.has(p.id) ? "bg-amber-500/10 border-amber-500/30 text-ui-text" : "bg-black/20 border-ui-border text-ui-muted hover:border-ui-muted"}`}>
                                            <input
                                                type="checkbox"
                                                className="hidden"
                                                checked={selectedPlanIds.has(p.id)}
                                                onChange={() => handlePlanToggle(p.id)}
                                            />
                                            <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all ${selectedPlanIds.has(p.id) ? "bg-amber-500 border-amber-400" : "border-ui-border"}`}>
                                                {selectedPlanIds.has(p.id) && <span className="text-amber-950 text-[10px] font-black">✓</span>}
                                            </div>
                                            <span className="text-[11px] font-bold uppercase tracking-tight truncate">{label}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </motion.div>
                    </div>

                    {/* Main Content Area */}
                    <div className="xl:col-span-8 space-y-8">
                        <AnimatePresence mode="wait">
                            <motion.div 
                                key={activeTab}
                                initial={{ opacity: 0, scale: 0.98 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.98 }}
                                className="bg-ui-card backdrop-blur-3xl border border-ui-border rounded-xl p-12 lg:p-16 shadow-2xl min-h-[700px]"
                            >
                                {activeTab === "BERICHTE" ? (
                                    <div className="space-y-10">
                                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 border-b border-ui-border/50 pb-10">
                                            <div>
                                                <h3 className="text-2xl font-black uppercase tracking-tight text-ui-text">{t("reports", "tasksList", "LISTA ZADAŃ")}</h3>
                                                <p className="text-ui-muted text-[10px] font-bold uppercase tracking-[0.2em] mt-2">
                                                    {selectedTaskIds.size > 0 
                                                        ? t("reports", "tasksSelected", "{n} Selected").replace("{n}", selectedTaskIds.size.toString())
                                                        : t("reports", "autoMode", "Auto Mode")}
                                                </p>
                                            </div>
                                            <div className="flex gap-4 w-full md:w-auto">
                                                <div className="relative flex-1 md:w-80">
                                                    <input
                                                        type="text"
                                                        placeholder={t("common", "search", "Search...")}
                                                        value={taskSearchQuery}
                                                        onChange={(e) => setTaskSearchQuery(e.target.value)}
                                                        className="w-full bg-black/40 border border-ui-border rounded-xl px-6 py-4 text-xs font-bold text-ui-text outline-none focus:border-ui-accent/50 transition-all"
                                                    />
                                                    <span className="absolute right-6 top-1/2 -translate-y-1/2 text-ui-muted">🔍</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex gap-4">
                                            <button 
                                                onClick={() => setSelectedTaskIds(new Set(filteredTasksForList.map(t => t.id)))}
                                                className="px-6 py-2 bg-ui-card border border-ui-border rounded-lg text-[10px] font-black uppercase tracking-widest text-ui-muted hover:bg-white/5 transition-all"
                                            >
                                                {t("reports", "selectAll", "Zaznacz wszystkie")}
                                            </button>
                                            <button 
                                                onClick={() => setSelectedTaskIds(new Set())}
                                                className="px-6 py-2 bg-ui-card border border-ui-border rounded-lg text-[10px] font-black uppercase tracking-widest text-ui-muted hover:bg-white/5 transition-all"
                                            >
                                                {t("reports", "deselectAll", "Deselect All")}
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-h-[800px] overflow-y-auto pr-4 custom-scrollbar">
                                            {isLoadingTasks ? (
                                                <div className="col-span-full py-20 text-center">
                                                    <div className="w-12 h-12 border-4 border-ui-border border-t-ui-accent rounded-full animate-spin mx-auto mb-6"></div>
                                                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-ui-muted">{t("common", "loading", "Loading...")}</p>
                                                </div>
                                            ) : filteredTasksForList.length === 0 ? (
                                                <div className="col-span-full py-20 text-center bg-ui-card/40 rounded-xl border border-ui-border border-dashed">
                                                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-ui-muted">{t("common", "noData", "No tasks found")}</p>
                                                </div>
                                            ) : (
                                                filteredTasksForList.map((task) => (
                                                    <motion.div
                                                        key={task.id}
                                                        layout
                                                        onClick={() => handleTaskToggle(task.id)}
                                                        className={`group relative p-6 rounded-xl border transition-all duration-300 cursor-pointer ${
                                                            selectedTaskIds.has(task.id)
                                                                ? "bg-ui-accent/10 border-ui-accent/40 shadow-[0_0_30px_var(--ui-glow)]"
                                                                : "bg-black/20 border-ui-border hover:border-ui-muted"
                                                        }`}
                                                    >
                                                        <div className="flex gap-5 items-start">
                                                            <div className={`mt-1 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                                                                selectedTaskIds.has(task.id) ? "bg-ui-accent border-ui-accent/50" : "border-ui-border"
                                                            }`}>
                                                                {selectedTaskIds.has(task.id) && <span className="text-slate-950 text-[10px] font-black">✓</span>}
                                                            </div>
                                                            <div className="flex-1">
                                                                <div className="flex justify-between items-start mb-2">
                                                                    <span className="text-[9px] font-black text-ui-accent uppercase tracking-widest bg-ui-accent/10 px-2 py-0.5 rounded-md">
                                                                        #{getTaskNumericLabel(task.id)}
                                                                    </span>
                                                                    <span className={`text-[8px] font-black px-2 py-0.5 rounded-md uppercase ${
                                                                        task.status === "APPROVED" ? "bg-green-500/20 text-green-400" :
                                                                        task.status === "DONE_WAITING_APPROVAL" ? "bg-amber-500/20 text-amber-500" :
                                                                        task.status === "REJECTED" ? "bg-red-500/20 text-red-400" : "bg-ui-card text-ui-muted"
                                                                    }`}>
                                                                        {t("taskStatus", task.status, task.status)}
                                                                    </span>
                                                                </div>
                                                                <h4 className="text-sm font-black text-ui-text uppercase tracking-tight group-hover:text-ui-accent transition-colors leading-snug">{task.title}</h4>
                                                                <p className="text-[10px] text-ui-muted font-bold mt-2 truncate">{task.description || t("common", "noDescription", "No description")}</p>
                                                                <div className="flex items-center gap-4 mt-4 pt-4 border-t border-ui-border/50">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-xs">👤</span>
                                                                        <span className="text-[9px] font-black text-ui-muted uppercase">{assignedUsers.find(u => u.id === task.assigned_user_id)?.name || "Unassigned"}</span>
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-xs">📍</span>
                                                                        <span className="text-[9px] font-black text-ui-muted uppercase truncate max-w-[100px]">{floors.find(f => f.id === plans.find(p => p.id === task.plan_id)?.floor_id)?.name || "N/A"}</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                ) : activeTab === "LADEGERÄTE" ? (
                                    <div className="space-y-10">
                                        <div className="border-b border-ui-border/50 pb-10">
                                            <div className="flex items-center justify-between mb-8">
                                                <h3 className="text-2xl font-black uppercase tracking-tight text-ui-text">WYBIERZ ŁADOWARKI DO RAPORTU</h3>
                                                <button
                                                    onClick={() => {
                                                        if (selectedChargerIds.size === chargersList.length) setSelectedChargerIds(new Set());
                                                        else setSelectedChargerIds(new Set(chargersList.map(c => c.id)));
                                                    }}
                                                    className="text-[10px] font-black tracking-widest uppercase bg-ui-bg px-4 py-2 rounded-lg border border-ui-border hover:bg-ui-border/50 transition-colors"
                                                >
                                                    {selectedChargerIds.size === chargersList.length ? t("common", "deselectAll", "Odznacz wszystkie") : t("common", "selectAll", "Zaznacz wszystkie")}
                                                </button>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                {chargersList.map(c => (
                                                    <motion.div key={c.id} whileHover={{ scale: 1.02 }} className="bg-ui-bg border border-ui-border rounded-xl p-4 flex gap-4 cursor-pointer hover:border-ui-accent transition-colors" onClick={() => {
                                                        const next = new Set(selectedChargerIds);
                                                        if (next.has(c.id)) next.delete(c.id);
                                                        else next.add(c.id);
                                                        setSelectedChargerIds(next);
                                                    }}>
                                                        <div className="flex items-center justify-center">
                                                            <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${selectedChargerIds.has(c.id) ? "bg-ui-accent border-ui-accent" : "border-ui-muted"}`}>
                                                                {selectedChargerIds.has(c.id) && <span className="text-white text-xs font-black">✓</span>}
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="font-bold text-sm text-ui-text">{c.mac}</span>
                                                            <span className="text-xs text-ui-accent tracking-widest">{c.pin}</span>
                                                        </div>
                                                    </motion.div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ) : activeTab === "QRCODE" ? (
                                    <div className="space-y-10">
                                        <div className="border-b border-ui-border/50 pb-10">
                                            <h3 className="text-2xl font-black uppercase tracking-tight text-ui-text">{t("reports", "qrSelectTitle", "DRUK ETYKIET QR")}</h3>
                                            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                                {[
                                                    { id: "brother_40x18", label: "Brother 40x18mm", icon: "📟" },
                                                    { id: "brother_50x24", label: "Brother 50x24mm", icon: "📟" },
                                                    { id: "brother_csv", label: "CSV Export", icon: "📊" },
                                                    { id: "zebra", label: "Zebra ZM400", icon: "🖨️" },
                                                ].map((p) => (
                                                    <button
                                                        key={p.id}
                                                        onClick={() => setQrPrinterType(p.id as any)}
                                                        className={`p-4 rounded-xl border transition-all flex items-center gap-3 ${
                                                            qrPrinterType === p.id 
                                                            ? "bg-ui-accent/10 border-ui-accent/40 text-ui-text shadow-[0_0_15px_var(--ui-glow)]" 
                                                            : "bg-black/20 border-ui-border text-ui-muted hover:border-ui-muted"
                                                        }`}
                                                    >
                                                        <span className="text-xl">{p.icon}</span>
                                                        <span className="text-[10px] font-black uppercase tracking-widest">{p.label}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                                            {/* Cables selection */}
                                            <div className="space-y-6">
                                                <div className="flex justify-between items-center">
                                                    <h4 className="text-[10px] font-black text-ui-muted uppercase tracking-widest">KABLE ({qrSelectedCables.size})</h4>
                                                    <div className="flex gap-4">
                                                        <button onClick={() => setQrSelectedCables(new Set(qrCablesList.map(c => c.id)))} className="text-[9px] font-black uppercase text-ui-accent">Wszystkie</button>
                                                        <button onClick={() => setQrSelectedCables(new Set())} className="text-[9px] font-black uppercase text-ui-muted">Wyczyść</button>
                                                    </div>
                                                </div>
                                                <div className="bg-black/20 rounded-xl border border-ui-border p-2 max-h-[500px] overflow-y-auto custom-scrollbar">
                                                    {qrCablesList.map(cable => (
                                                        <label key={cable.id} className={`flex items-center gap-4 p-4 rounded-xl cursor-pointer transition-all ${qrSelectedCables.has(cable.id) ? "bg-ui-accent/10 text-ui-text" : "text-ui-muted hover:bg-white/5"}`}>
                                                            <input type="checkbox" className="hidden" checked={qrSelectedCables.has(cable.id)} onChange={() => {
                                                                const next = new Set(qrSelectedCables);
                                                                next.has(cable.id) ? next.delete(cable.id) : next.add(cable.id);
                                                                setQrSelectedCables(next);
                                                            }} />
                                                            <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all ${qrSelectedCables.has(cable.id) ? "bg-ui-accent border-ui-accent/50" : "border-ui-border"}`}>
                                                                {qrSelectedCables.has(cable.id) && <span className="text-slate-950 text-[10px] font-black">✓</span>}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-[11px] font-bold uppercase truncate">#{cable.index_number} {cable.name}</p>
                                                                <p className="text-[9px] font-medium text-ui-muted uppercase">{cable.cable_type}</p>
                                                            </div>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Trommels selection */}
                                            <div className="space-y-6">
                                                <div className="flex justify-between items-center">
                                                    <h4 className="text-[10px] font-black text-ui-muted uppercase tracking-widest">BĘBNY ({qrSelectedTrommels.size})</h4>
                                                    <div className="flex gap-4">
                                                        <button onClick={() => setQrSelectedTrommels(new Set(qrTrommelsList.map(t => t.id)))} className="text-[9px] font-black uppercase text-amber-500">Wszystkie</button>
                                                        <button onClick={() => setQrSelectedTrommels(new Set())} className="text-[9px] font-black uppercase text-ui-muted">Wyczyść</button>
                                                    </div>
                                                </div>
                                                <div className="bg-black/20 rounded-xl border border-ui-border p-2 max-h-[500px] overflow-y-auto custom-scrollbar">
                                                    {qrTrommelsList.map(tr => (
                                                        <label key={tr.id} className={`flex items-center gap-4 p-4 rounded-xl cursor-pointer transition-all ${qrSelectedTrommels.has(tr.id) ? "bg-amber-500/10 text-ui-text" : "text-ui-muted hover:bg-white/5"}`}>
                                                            <input type="checkbox" className="hidden" checked={qrSelectedTrommels.has(tr.id)} onChange={() => {
                                                                const next = new Set(qrSelectedTrommels);
                                                                next.has(tr.id) ? next.delete(tr.id) : next.add(tr.id);
                                                                setQrSelectedTrommels(next);
                                                            }} />
                                                            <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all ${qrSelectedTrommels.has(tr.id) ? "bg-amber-500 border-amber-400" : "border-ui-border"}`}>
                                                                {qrSelectedTrommels.has(tr.id) && <span className="text-amber-950 text-[10px] font-black">✓</span>}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-[11px] font-bold uppercase truncate">#{tr.index_number} {tr.name}</p>
                                                                <p className="text-[9px] font-medium text-ui-muted uppercase">{tr.serial_number || "Bez SN"}</p>
                                                            </div>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : activeTab === "FRAGEN" ? (
                                    <div className="space-y-10">
                                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 border-b border-ui-border/50 pb-10">
                                            <div>
                                                <h3 className="text-2xl font-black uppercase tracking-tight text-ui-text">{t("reports", "questionsTab", "Pytania")}</h3>
                                                <p className="text-ui-muted text-[10px] font-bold uppercase tracking-[0.2em] mt-2">
                                                    {selectedQuestionIds.size > 0 
                                                        ? `${selectedQuestionIds.size} ${t("reports", "questionsSelected", "wybranych")}`
                                                        : t("reports", "noneSelected", "Brak wybranych")}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex gap-4">
                                            <button 
                                                onClick={() => setSelectedQuestionIds(new Set(questionsList.map(q => q.id)))}
                                                className="px-6 py-2 bg-ui-card border border-ui-border rounded-lg text-[10px] font-black uppercase tracking-widest text-ui-muted hover:bg-white/5 transition-all"
                                            >
                                                {t("reports", "selectAll", "Zaznacz wszystkie")}
                                            </button>
                                            <button 
                                                onClick={() => setSelectedQuestionIds(new Set())}
                                                className="px-6 py-2 bg-ui-card border border-ui-border rounded-lg text-[10px] font-black uppercase tracking-widest text-ui-muted hover:bg-white/5 transition-all"
                                            >
                                                {t("reports", "deselectAll", "Odznacz wszystkie")}
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-h-[800px] overflow-y-auto pr-4 custom-scrollbar">
                                            {questionsList.length === 0 ? (
                                                <div className="col-span-full py-20 text-center bg-ui-card/40 rounded-xl border border-ui-border border-dashed">
                                                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-ui-muted">{t("reports", "noQuestionsFound", "Nie znaleziono pytań")}</p>
                                                </div>
                                            ) : (
                                                questionsList.map((q) => (
                                                    <motion.div
                                                        key={q.id}
                                                        layout
                                                        onClick={() => {
                                                            const next = new Set(selectedQuestionIds);
                                                            if (next.has(q.id)) next.delete(q.id);
                                                            else next.add(q.id);
                                                            setSelectedQuestionIds(next);
                                                        }}
                                                        className={`group relative p-6 rounded-xl border transition-all duration-300 cursor-pointer ${
                                                            selectedQuestionIds.has(q.id)
                                                                ? "bg-ui-accent/10 border-ui-accent/40 shadow-[0_0_30px_var(--ui-glow)]"
                                                                : "bg-black/20 border-ui-border hover:border-ui-muted"
                                                        }`}
                                                    >
                                                        <div className="flex gap-5 items-start">
                                                            <div className={`mt-1 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                                                                selectedQuestionIds.has(q.id) ? "bg-ui-accent border-ui-accent/50" : "border-ui-border"
                                                            }`}>
                                                                {selectedQuestionIds.has(q.id) && <span className="text-slate-950 text-[10px] font-black">✓</span>}
                                                            </div>
                                                            <div className="flex-1">
                                                                <div className="flex justify-between items-start mb-2">
                                                                    <span className="text-[9px] font-black text-ui-accent uppercase tracking-widest bg-ui-accent/10 px-2 py-0.5 rounded-md">
                                                                        #{getTaskNumericLabel(q.id)}
                                                                    </span>
                                                                    <span className={`text-[8px] font-black px-2 py-0.5 rounded-md uppercase ${
                                                                        q.priority === "CRITICAL" || q.priority === "HIGH" ? "bg-red-500/20 text-red-400" : "bg-ui-card text-ui-muted"
                                                                    }`}>
                                                                        {q.priority}
                                                                    </span>
                                                                </div>
                                                                <h4 className="text-sm font-black text-ui-text uppercase tracking-tight group-hover:text-ui-accent transition-colors leading-snug">{q.title}</h4>
                                                                <p className="text-[10px] text-ui-muted font-bold mt-2 truncate">{q.description || t("common", "noDescription", "No description")}</p>
                                                                <div className="flex items-center gap-4 mt-4 pt-4 border-t border-ui-border/50">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-xs">👤</span>
                                                                        <span className="text-[9px] font-black text-ui-muted uppercase">{q.assigneeName || "Unassigned"}</span>
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-xs">📍</span>
                                                                        <span className="text-[9px] font-black text-ui-muted uppercase truncate max-w-[100px]">{floors.find(f => f.id === plans.find(p => p.id === q.plan_id)?.floor_id)?.name || "N/A"}</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-40">
                                        <div className="w-20 h-20 bg-ui-card/50 rounded-full flex items-center justify-center text-4xl mb-8">
                                            {activeTab === "REVISION" ? "🔄" : activeTab === "FEHLER" ? "⚠️" : activeTab === "KABLE" ? "🔌" : activeTab === "TROMMLE" ? "📦" : "🚧"}
                                        </div>
                                        <h3 className="text-xl font-black uppercase tracking-widest text-ui-muted text-center px-10">
                                            {activeTab === "REVISION" ? t("reports", "revisionsTab", "Rewizje") : 
                                             activeTab === "FEHLER" ? t("reports", "fehlersTab", "Błędy") :
                                             activeTab === "KABLE" ? t("reports", "cablesTab", "Kable") :
                                             activeTab === "TROMMLE" ? t("reports", "trommelsTab", "Trommle") :
                                             t("common", "comingSoon", "MODUŁ W TRAKCIE STYLIZACJI")}
                                        </h3>
                                        <p className="text-ui-muted/60 text-[10px] font-bold uppercase mt-4 text-center max-w-md">
                                            Filtry po lewej stronie są aktywne. Możesz wygenerować ten raport klikając przycisk poniżej sidebar'u.
                                        </p>
                                    </div>
                                )}
                            </motion.div>
                        </AnimatePresence>

                        {/* SAVED REPORTS SECTION */}
                        <motion.div 
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-ui-card backdrop-blur-3xl border border-ui-border rounded-xl p-12 lg:p-16 shadow-2xl"
                        >
                            <div className="flex justify-between items-center mb-10">
                                <h3 className="text-xl font-black uppercase tracking-tight text-ui-text">{t("reports", "savedReports", "ARCHIWUM RAPORTÓW")}</h3>
                                <button onClick={fetchSavedReports} className="text-[10px] font-black uppercase text-ui-accent hover:text-ui-accent/80 transition-colors">Odśwież listę</button>
                            </div>

                            {savedReports.length === 0 ? (
                                <div className="py-20 text-center border border-dashed border-ui-border rounded-xl">
                                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-ui-muted">Brak zapisanych raportów</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {savedReports.map((report) => (
                                        <div key={report.filename} className="group flex items-center justify-between p-6 bg-black/20 border border-ui-border rounded-xl hover:border-ui-muted transition-all">
                                            <div className="flex items-center gap-5 overflow-hidden">
                                                <div className="w-10 h-10 bg-ui-card rounded-lg flex items-center justify-center text-lg">📄</div>
                                                <div className="overflow-hidden">
                                                    <p className="text-[11px] font-black text-ui-text uppercase truncate pr-4" title={report.filename}>{report.filename}</p>
                                                    <p className="text-[9px] font-bold text-ui-muted uppercase mt-1">
                                                        {new Date(report.createdAt).toLocaleString()} • {(report.size / 1024).toFixed(1)} KB
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => handleDownloadReport(report.filename)}
                                                    className="w-10 h-10 bg-ui-accent/10 text-ui-accent rounded-lg flex items-center justify-center hover:bg-ui-accent hover:text-slate-950 transition-all shadow-lg shadow-ui-accent/5"
                                                >
                                                    📥
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteReport(report.filename)}
                                                    className="w-10 h-10 bg-red-500/10 text-red-500 rounded-lg flex items-center justify-center hover:bg-red-500 hover:text-white transition-all shadow-lg shadow-red-500/5"
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </motion.div>
                    </div>
                </div>
            </div>

            {/* Custom Scrollbar Styling */}
            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.1); border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.2); border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(148, 163, 184, 0.3); }
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
        </motion.div>
    );
}
