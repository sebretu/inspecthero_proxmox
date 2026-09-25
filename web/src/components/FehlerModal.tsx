"use client";
import { useState, useRef, useEffect, useCallback, RefObject } from "react";
import { apiGet, getToken } from "@/lib/apiClient";
import dynamic from "next/dynamic";
const MapPinPicker = dynamic(() => import("@/components/MapPinPicker").then((mod) => mod.MapPinPicker), { ssr: false });
import { useLanguage } from "@/contexts/LanguageContext";
import PhotoLightbox from "@/components/PhotoLightbox";
import { downloadLocalPhoto } from "@/lib/file_utils";
import { applyWatermark } from "@/lib/watermark";
import { GeolocationService } from "@/lib/native";

type Project = { id: string; name: string; companies?: { name: string } | null };
type Plan = { id: string; floor_id: string; status: string; version: number };
type Profile = { id: string; full_name: string };

type FehlerPhoto = { id: string; url: string; photo_type: "BEFORE" | "AFTER"; created_at: string };
type HistoryRow = {
    id: string;
    action: string;
    summary: string | null;
    meta: any;
    created_at: string;
    changer?: { id: string; full_name: string } | null;
};

interface FehlerModalProps {
    open: boolean;
    onClose: () => void;
    onSaved?: () => void;
    editItem?: any;
    currentUserId?: string | null;
    currentUserRole?: string | null;
}

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const PRIORITY_COLORS: Record<string, string> = {
    LOW: "#22c55e", MEDIUM: "#f59e0b", HIGH: "#ef4444", CRITICAL: "#7c3aed",
};
const STATUS_COLORS: Record<string, string> = {
    OPEN: "#6b7280", IN_PROGRESS: "#3b82f6", DONE_WAITING_APPROVAL: "#f59e0b", APPROVED: "#22c55e", REJECTED: "#ef4444",
};
const STATUS_LABELS: Record<string, string> = {
    OPEN: "Offen", IN_PROGRESS: "In Bearbeitung", DONE_WAITING_APPROVAL: "Zur Genehmigung", APPROVED: "Genehmigt", REJECTED: "Abgelehnt",
};

function formatDate(ts: string) {
    return new Date(ts).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

type ActiveTab = "form" | "photos" | "history";

export function FehlerModal({ open, onClose, onSaved, editItem, currentUserId, currentUserRole }: FehlerModalProps) {
    const { t, language } = useLanguage();
    const [tab, setTab] = useState<ActiveTab>("form");
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [projectId, setProjectId] = useState("");
    const [planId, setPlanId] = useState("");
    const [assignedUserId, setAssignedUserId] = useState("");
    const [priority, setPriority] = useState<typeof PRIORITIES[number]>("MEDIUM");
    const [projects, setProjects] = useState<Project[]>([]);
    const [plans, setPlans] = useState<Plan[]>([]);
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState("OPEN");
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [token, setToken] = useState<string | null>(null);
    const [pinned, setPinned] = useState<{ x: number; y: number } | null>(null);
    const [xNorm, setXNorm] = useState<number | null>(null);
    const [yNorm, setYNorm] = useState<number | null>(null);

    // existing photos from editItem
    const [existingPhotos, setExistingPhotos] = useState<FehlerPhoto[]>([]);
    // new pending photos
    const [pendingBefore, setPendingBefore] = useState<File[]>([]);
    const [pendingAfter, setPendingAfter] = useState<File[]>([]);
    const [previewsBefore, setPreviewsBefore] = useState<string[]>([]);
    const [previewsAfter, setPreviewsAfter] = useState<string[]>([]);

    const [history, setHistory] = useState<HistoryRow[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    const beforeRef = useRef<HTMLInputElement>(null);
    const afterRef = useRef<HTMLInputElement>(null);

    const isAdmin = currentUserRole === "ADMIN";
    const isAssignee = editItem?.assigned_user_id === currentUserId;
    const canSubmitForApproval = isAdmin || isAssignee;
    const currentStatus = editItem?.status ?? "OPEN";

    // Reset on open/close
    useEffect(() => {
        if (!open) return;
        setTab("form");
        setError(null); setSuccess(false);
        if (editItem) {
            setTitle(editItem.title || "");
            setDescription(editItem.description || "");
            setProjectId(editItem.project_id || "");
            setPlanId(editItem.plan_id || "");
            setPriority(editItem.priority || "MEDIUM");
            setAssignedUserId(editItem.assigned_user_id || "");
            setStatus(editItem.status || "OPEN");
            setExistingPhotos(editItem.fehler_photos || []);
            if (editItem.x_norm != null && editItem.y_norm != null) {
                setPinned({ x: editItem.x_norm, y: editItem.y_norm });
                setXNorm(editItem.x_norm); setYNorm(editItem.y_norm);
            } else { setPinned(null); setXNorm(null); setYNorm(null); }
        } else {
            setTitle(""); setDescription(""); setPriority("MEDIUM"); setAssignedUserId(""); setPlanId("");
            setStatus("OPEN");
            setExistingPhotos([]); setPinned(null); setXNorm(null); setYNorm(null);
        }
        setPendingBefore([]); setPendingAfter([]);
        setPreviewsBefore([]); setPreviewsAfter([]);
        setHistory([]);

        getToken().then(setToken).catch(() => { });
        apiGet<Project[]>("/api/projects").then((ps) => {
            setProjects(ps || []);
            if (!editItem && ps && ps.length > 0) setProjectId(ps[0].id);
        }).catch(() => { });
        apiGet<Profile[]>("/api/profiles?limit=500").then((rows) => setProfiles(rows || [])).catch(() => { });
        if (editItem) {
            apiGet<Plan[]>(`/api/plans?projectId=${editItem.project_id}&current=true`).then((ps) => setPlans(ps || [])).catch(() => { });
        }
    }, [open, editItem]);

    // Load plans when project changes
    useEffect(() => {
        if (!projectId) { setPlans([]); return; } // Removed setPlanId("") which overwrites initial state
        if (editItem && projectId === editItem.project_id) return;
        apiGet<Plan[]>(`/api/plans?projectId=${projectId}&current=true`)
            .then((ps) => { setPlans(ps || []); setPlanId(""); }).catch(() => { });
    }, [projectId, editItem]);

    // Load history when history tab opened
    useEffect(() => {
        if (tab !== "history" || !editItem?.id) return;
        setHistoryLoading(true);
        apiGet<HistoryRow[]>(`/api/fehler-history?fehlerId=${editItem.id}`)
            .then((rows) => setHistory(rows || []))
            .catch(() => { })
            .finally(() => setHistoryLoading(false));
    }, [tab, editItem?.id]);

    function addPendingFiles(files: File[], type: "BEFORE" | "AFTER") {
        if (type === "BEFORE") {
            const toAdd = files.slice(0, 10 - pendingBefore.length);
            setPendingBefore((prev) => [...prev, ...toAdd]);
            setPreviewsBefore((prev) => [...prev, ...toAdd.map((f) => URL.createObjectURL(f))]);
        } else {
            const toAdd = files.slice(0, 10 - pendingAfter.length);
            setPendingAfter((prev) => [...prev, ...toAdd]);
            setPreviewsAfter((prev) => [...prev, ...toAdd.map((f) => URL.createObjectURL(f))]);
        }
    }

    function removePending(idx: number, type: "BEFORE" | "AFTER") {
        if (type === "BEFORE") {
            URL.revokeObjectURL(previewsBefore[idx]);
            setPendingBefore((prev) => prev.filter((_, i) => i !== idx));
            setPreviewsBefore((prev) => prev.filter((_, i) => i !== idx));
        } else {
            URL.revokeObjectURL(previewsAfter[idx]);
            setPendingAfter((prev) => prev.filter((_, i) => i !== idx));
            setPreviewsAfter((prev) => prev.filter((_, i) => i !== idx));
        }
        if (afterRef.current) afterRef.current.value = "";
        if (beforeRef.current) beforeRef.current.value = "";
    }

    async function fileToBase64(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    async function uploadPhotos(fehlerId: string, files: File[], photoType: "BEFORE" | "AFTER", headers: any) {
        for (const photo of files) {
            const base64 = await fileToBase64(photo);
            const uploadResp = await fetch("/api/fehler-photos", {
                method: "POST",
                headers,
                body: JSON.stringify({ fehler_id: fehlerId, file_name: photo.name, base64, photo_type: photoType }),
            });
            const uploadJson = await uploadResp.json();
            if (!uploadJson.ok) console.warn("Photo upload failed:", uploadJson.error?.message);
        }
    }

    async function handleSave() {
        if (!title.trim()) { setError(t("fehler", "errorTitleRequired", "Title is required")); return; }
        if (!projectId) { setError(t("fehler", "errorProjectRequired", "Project is required")); return; }

        setSaving(true); setError(null);
        try {
            const tok = await getToken();
            const headers: any = { "Content-Type": "application/json" };
            if (tok) headers["Authorization"] = `Bearer ${tok}`;

            const url = editItem ? `/api/fehler?id=${editItem.id}` : "/api/fehler";
            const method = editItem ? "PATCH" : "POST";
            const payload: any = { title: title.trim(), description: description.trim() || null, project_id: projectId, plan_id: planId || null, x_norm: xNorm, y_norm: yNorm, assigned_user_id: assignedUserId || null, priority, status };

            // Auto-submit for approval if a regular user adds an AFTER photo
            if (!isAdmin && editItem && pendingAfter.length > 0 && editItem.status !== "APPROVED" && editItem.status !== "DONE_WAITING_APPROVAL") {
                payload.status = "DONE_WAITING_APPROVAL";
            }

            const resp = await fetch(url, { method, headers, body: JSON.stringify(payload) });
            const json = await resp.json();
            if (!json.ok) throw new Error(json.error?.message || "Failed to save Fehler");

            const fehlerId = editItem ? editItem.id : json.data.id;
            await uploadPhotos(fehlerId, pendingBefore, "BEFORE", headers);
            await uploadPhotos(fehlerId, pendingAfter, "AFTER", headers);

            setSuccess(true);
            window.dispatchEvent(new CustomEvent("fehler-created"));
            setTimeout(() => { onSaved?.(); onClose(); }, 1200);
        } catch (e: any) {
            setError(e.message || "An error occurred");
        } finally {
            setSaving(false);
        }
    }

    async function handleStatusChange(newStatus: string, extra: any = {}) {
        if (!editItem?.id) return;
        setSaving(true); setError(null);
        try {
            const tok = await getToken();
            const headers: any = { "Content-Type": "application/json" };
            if (tok) headers["Authorization"] = `Bearer ${tok}`;

            // For submit-for-approval: upload pending after photos first
            if (newStatus === "DONE_WAITING_APPROVAL" && pendingAfter.length > 0) {
                await uploadPhotos(editItem.id, pendingAfter, "AFTER", headers);
                setPendingAfter([]); setPreviewsAfter([]);
            }

            const resp = await fetch(`/api/fehler?id=${editItem.id}`, {
                method: "PATCH",
                headers,
                body: JSON.stringify({ status: newStatus, ...extra }),
            });
            const json = await resp.json();
            if (!json.ok) throw new Error(json.error?.message);

            setSuccess(true);
            window.dispatchEvent(new CustomEvent("fehler-created"));
            setTimeout(() => { onSaved?.(); onClose(); }, 1200);
        } catch (e: any) {
            setError(e.message || "An error occurred");
        } finally {
            setSaving(false);
        }
    }

    if (!open) return null;

    const hasAfterPhotoOrPending =
        existingPhotos.some((p) => p.photo_type === "AFTER") || pendingAfter.length > 0;

    const existingBefore = existingPhotos.filter((p) => p.photo_type === "BEFORE");
    const existingAfter = existingPhotos.filter((p) => p.photo_type === "AFTER");

    return (
        <div
            style={{ position: "fixed", inset: 0, zIndex: 10002, background: "rgba(0,0,0,0.78)", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(8px)", padding: "16px" }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                style={{ background: "var(--ui-card, #1a1a2e)", borderRadius: 24, padding: 0, width: "min(620px, 97vw)", maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 30px 80px rgba(0,0,0,0.6)", border: "1px solid rgba(239,68,68,0.2)", overflow: "hidden" }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{ padding: "24px 28px 0", flexShrink: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{ width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg, #f59e0b, #ef4444)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>⚠️</div>
                            <div>
                                <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: "var(--ui-text, #fff)" }}>
                                    {editItem ? t("fehler", "editTitle", "Edit Fehler") : t("fehler", "title", "New Fehler")}
                                </h3>
                                {editItem && (
                                    <span style={{ fontSize: 12, fontWeight: 700, color: STATUS_COLORS[currentStatus] || "#888", background: `${STATUS_COLORS[currentStatus]}22`, borderRadius: 6, padding: "2px 8px", marginTop: 2, display: "inline-block" }}>
                                        {STATUS_LABELS[currentStatus] || currentStatus}
                                    </span>
                                )}
                            </div>
                        </div>
                        <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--ui-muted, #888)", fontSize: 22, cursor: "pointer" }}>✕</button>
                    </div>

                    {/* Tabs – only for edit mode */}
                    {editItem && (
                        <div style={{ display: "flex", gap: 4, marginBottom: 0 }}>
                            {(["form", "photos", "history"] as ActiveTab[]).map((t_) => (
                                <button key={t_} onClick={() => setTab(t_)} style={{ padding: "8px 16px", borderRadius: "10px 10px 0 0", border: "1px solid rgba(255,255,255,0.1)", borderBottom: tab === t_ ? "1px solid var(--ui-card, #1a1a2e)" : "1px solid rgba(255,255,255,0.1)", background: tab === t_ ? "var(--ui-card, #1a1a2e)" : "rgba(255,255,255,0.04)", color: tab === t_ ? "#fff" : "#888", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                                    {t_ === "form" ? "✏️ Details" : t_ === "photos" ? "📸 Fotos" : "📋 Verlauf"}
                                </button>
                            ))}
                        </div>
                    )}
                    <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", marginLeft: -28, marginRight: -28 }} />
                </div>

                {/* Scrollable body */}
                <div style={{ overflowY: "auto", padding: "20px 28px", flex: 1, display: "grid", gap: 16 }}>

                    {/* ======================== TAB: FORM ======================= */}
                    {(!editItem || tab === "form") && (
                        <>
                            {/* Project */}
                            <label style={labelStyle}>
                                {t("home", "selectProject", "Project")}
                                <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={inputStyle} disabled={!isAdmin}>
                                    {projects.map((p) => <option key={p.id} value={p.id}>{p.companies?.name ? `[${p.companies.name.toUpperCase()}] ` : ""}{p.name}</option>)}
                                </select>
                            </label>

                            {/* Title */}
                            <label style={labelStyle}>
                                {t("fehler", "labelTitle", "Title")} *
                                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("fehler", "titlePlaceholder", "Error title...")} maxLength={200} style={inputStyle} disabled={!isAdmin} />
                            </label>

                            {/* Description */}
                            <label style={labelStyle}>
                                {t("fehler", "labelDescription", "Description")}
                                <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("fehler", "descriptionPlaceholder", "Describe the issue...")} rows={3} style={{ ...inputStyle, resize: "vertical" }} disabled={!isAdmin} />
                            </label>

                            {/* Assignee + Priority + Status */}
                            <div style={{ display: "grid", gridTemplateColumns: isAdmin ? "1fr 1fr 1fr" : "1fr 1fr", gap: 12 }}>
                                <label style={labelStyle}>
                                    {t("fehler", "labelAssignee", "Assignee")}
                                    <select value={assignedUserId} onChange={(e) => setAssignedUserId(e.target.value)} style={inputStyle} disabled={!isAdmin}>
                                        <option value="">{t("fehler", "noAssignee", "— No assignee —")}</option>
                                        {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                                    </select>
                                </label>
                                <label style={labelStyle}>
                                    {t("fehler", "labelPriority", "Priority")}
                                    <select value={priority} onChange={(e) => setPriority(e.target.value as typeof PRIORITIES[number])} style={{ ...inputStyle, color: PRIORITY_COLORS[priority] || "#fff" }} disabled={!isAdmin}>
                                        {PRIORITIES.map((p) => <option key={p} value={p}>{t("taskPriority", p as any, p)}</option>)}
                                    </select>
                                </label>
                                {isAdmin && (
                                    <label style={labelStyle}>
                                        Status
                                        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ ...inputStyle, color: STATUS_COLORS[status] || "#fff" }}>
                                            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                        </select>
                                    </label>
                                )}
                            </div>

                            {/* Plan */}
                            {isAdmin && (
                                <label style={labelStyle}>
                                    {t("fehler", "labelPlan", "Floor Plan (optional)")}
                                    <select value={planId} onChange={(e) => { setPlanId(e.target.value); setPinned(null); setXNorm(null); setYNorm(null); }} style={inputStyle}>
                                        <option value="">{t("fehler", "noPlan", "— Select a plan to pin location —")}</option>
                                        {plans.map((p: any) => (
                                            <option key={p.id} value={p.id}>
                                                {p.floors?.buildings?.name ? `${p.floors.buildings.name} - ` : ""}
                                                {p.floors?.name || `Plan v${p.version}`}
                                                {p.status ? ` (${p.status})` : ""}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            )}

                            {planId && (
                                <div style={{ display: "grid", gap: 6, opacity: isAdmin ? 1 : 0.85 }}>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ui-muted, #888)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                                        📍 {t("fehler", "labelLocation", "Location on Map")}
                                    </span>
                                    <MapPinPicker planId={planId} token={token} onPin={(x, y) => { if (isAdmin) { setPinned({ x, y }); setXNorm(x); setYNorm(y); } }} pinned={pinned} accentColor="#f59e0b" label={isAdmin ? t("fehler", "mapHint", "Click on the plan to pin location") : undefined} />
                                </div>
                            )}

                            {/* --- Before photos (only in form tab when creating) --- */}
                            {!editItem && (
                                <PhotoSection
                                    label="📷 Vorher-Fotos (before)"
                                    photos={[]}
                                    pending={pendingBefore}
                                    previews={previewsBefore}
                                    onAdd={(files) => addPendingFiles(files, "BEFORE")}
                                    onRemove={(idx) => removePending(idx, "BEFORE")}
                                    fileRef={beforeRef}
                                    accent="#3b82f6"
                                    currentUserRole={currentUserRole}
                                    language={language}
                                />
                            )}
                        </>
                    )}

                    {/* ======================== TAB: PHOTOS ===================== */}
                    {editItem && tab === "photos" && (
                        <div style={{ display: "grid", gap: 20 }}>
                            <PhotoSection
                                label="📷 Vorher-Fotos"
                                photos={existingBefore}
                                pending={pendingBefore}
                                previews={previewsBefore}
                                onAdd={(files) => addPendingFiles(files, "BEFORE")}
                                onRemove={(idx) => removePending(idx, "BEFORE")}
                                onRemoveExisting={async (id) => {
                                    if (!confirm(t("common", "confirmDelete"))) return;
                                    try {
                                        const tok = await getToken();
                                        await fetch(`/api/fehler-photos?id=${id}`, { method: "DELETE", headers: { "Authorization": `Bearer ${tok}` } });
                                        setExistingPhotos(prev => prev.filter(p => p.id !== id));
                                    } catch (e) { console.error(e); }
                                }}
                                onPreview={setPreviewUrl}
                                fileRef={beforeRef}
                                accent="#f59e0b"
                                currentUserRole={currentUserRole}
                                language={language}
                            />
                            <PhotoSection
                                label="✅ Nachher-Fotos (nach Behebung)"
                                required={currentStatus === "DONE_WAITING_APPROVAL" || currentStatus === "IN_PROGRESS"}
                                photos={existingAfter}
                                pending={pendingAfter}
                                previews={previewsAfter}
                                onAdd={(files) => addPendingFiles(files, "AFTER")}
                                onRemove={(idx) => removePending(idx, "AFTER")}
                                onRemoveExisting={async (id) => {
                                    if (!confirm(t("common", "confirmDelete"))) return;
                                    try {
                                        const tok = await getToken();
                                        await fetch(`/api/fehler-photos?id=${id}`, { method: "DELETE", headers: { "Authorization": `Bearer ${tok}` } });
                                        setExistingPhotos(prev => prev.filter(p => p.id !== id));
                                    } catch (e) { console.error(e); }
                                }}
                                onPreview={setPreviewUrl}
                                fileRef={afterRef}
                                accent="#22c55e"
                                currentUserRole={currentUserRole}
                                language={language}
                            />
                        </div>
                    )}

                    {/* ======================== TAB: HISTORY =================== */}
                    {editItem && tab === "history" && (
                        <div style={{ display: "grid", gap: 10 }}>
                            {historyLoading && <div style={{ color: "#888", textAlign: "center", padding: 24 }}>⏳ Lade Verlauf...</div>}
                            {!historyLoading && history.length === 0 && (
                                <div style={{ color: "#888", textAlign: "center", padding: 24 }}>Kein Verlauf vorhanden.</div>
                            )}
                            {history.map((h) => (
                                <div key={h.id} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 14px", borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                                    <div style={{ fontSize: 18, flexShrink: 0, marginTop: 2 }}>
                                        {h.action === "CREATED" ? "🆕" : h.action === "STATUS_CHANGED" ? "🔄" : h.action === "ASSIGNEE_CHANGED" ? "👤" : h.action === "PRIORITY_CHANGED" ? "🎯" : "✏️"}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 2 }}>
                                            {h.summary || h.action}
                                        </div>
                                        <div style={{ fontSize: 11, color: "#666" }}>
                                            {h.changer?.full_name || "System"} · {formatDate(h.created_at)}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Error / Success */}
                    {error && <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171", fontSize: 13, fontWeight: 600 }}>{error}</div>}
                    {success && <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)", color: "#4ade80", fontSize: 13, fontWeight: 600, textAlign: "center" }}>✅ {t("fehler", "savedSuccess", "Fehler gespeichert!")}</div>}
                </div>

                {/* Footer Actions */}
                {!success && (tab === "form" || !editItem) && (
                    <div style={{ padding: "16px 28px", borderTop: "1px solid rgba(255,255,255,0.07)", display: "grid", gap: 10, flexShrink: 0 }}>
                        {/* Workflow buttons for existing items */}
                        {editItem && (
                            <>
                                {/* Submit for approval */}
                                {(currentStatus === "OPEN" || currentStatus === "IN_PROGRESS") && canSubmitForApproval && (
                                    <button
                                        onClick={() => {
                                            if (!hasAfterPhotoOrPending) {
                                                setError("⚠️ Bitte zuerst ein 'Nachher'-Foto im Tab 'Fotos' hinzufügen!");
                                                setTab("photos");
                                                return;
                                            }
                                            handleStatusChange("DONE_WAITING_APPROVAL");
                                        }}
                                        disabled={saving}
                                        style={{ padding: "12px", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #f59e0b, #ef4444)", color: "#fff", fontWeight: 800, cursor: "pointer", fontSize: 14 }}
                                    >
                                        🚀 Zur Genehmigung einreichen
                                        {!hasAfterPhotoOrPending && <span style={{ fontSize: 11, opacity: 0.8, display: "block" }}>⚠️ Nachher-Foto erforderlich!</span>}
                                    </button>
                                )}
                                {/* Approve / Reject for admins */}
                                {isAdmin && currentStatus === "DONE_WAITING_APPROVAL" && (
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                                        <button onClick={() => handleStatusChange("APPROVED")} disabled={saving} style={{ padding: "12px", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #16a34a, #22c55e)", color: "#fff", fontWeight: 800, cursor: "pointer" }}>
                                            ✅ Genehmigen
                                        </button>
                                        <button onClick={() => { const reason = prompt("Ablehnungsgrund:"); if (reason) handleStatusChange("REJECTED", { rejection_reason: reason }); }} disabled={saving} style={{ padding: "12px", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #dc2626, #ef4444)", color: "#fff", fontWeight: 800, cursor: "pointer" }}>
                                            ❌ Ablehnen
                                        </button>
                                    </div>
                                )}
                                {/* Reopen if rejected */}
                                {(isAdmin || isAssignee) && currentStatus === "REJECTED" && (
                                    <button onClick={() => handleStatusChange("IN_PROGRESS")} disabled={saving} style={{ padding: "12px", borderRadius: 12, border: "1px solid rgba(59,130,246,0.4)", background: "rgba(59,130,246,0.1)", color: "#3b82f6", fontWeight: 800, cursor: "pointer" }}>
                                        🔄 Erneut bearbeiten
                                    </button>
                                )}
                            </>
                        )}

                        <div style={{ display: "flex", gap: 10 }}>
                            <button onClick={onClose} style={{ flex: 1, padding: "12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
                                {t("common", "cancel", "Abbrechen")}
                            </button>
                            {/* Save changes button enabled for admins OR if there are pending photos */}
                            {(() => {
                                const hasPendingPhotos = pendingBefore.length > 0 || pendingAfter.length > 0;
                                const canSave = isAdmin || hasPendingPhotos;
                                const isFormDisabled = !title.trim() || !projectId;
                                const isDisabled = saving || isFormDisabled || !canSave;

                                return (
                                    <button
                                        onClick={handleSave}
                                        disabled={isDisabled}
                                        style={{
                                            flex: 2, padding: "12px", borderRadius: 12, border: "none",
                                            background: saving ? "rgba(239,68,68,0.4)" : "linear-gradient(135deg, #f59e0b, #ef4444)",
                                            color: "#fff", fontWeight: 800, cursor: "pointer",
                                            opacity: isDisabled ? 0.5 : 1,
                                            display: canSave ? "block" : "none"
                                        }}
                                    >
                                        {saving ? `⏳ ${t("common", "savingChanges", "Speichern...")}` : (!isAdmin && pendingAfter.length > 0 ? `✅ Zapisz i zgłoś do admina` : (editItem ? `✓ ${t("common", "saveChanges", "Speichern")}` : `⚠️ ${t("fehler", "save", "Fehler speichern")}`))}
                                    </button>
                                );
                            })()}
                        </div>
                    </div>
                )}

                {/* Photos tab footer – save photos */}
                {!success && editItem && tab === "photos" && (pendingBefore.length > 0 || pendingAfter.length > 0) && (
                    <div style={{ padding: "16px 28px", borderTop: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            style={{ width: "100%", padding: "12px", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #f59e0b, #ef4444)", color: "#fff", fontWeight: 800, cursor: "pointer" }}
                        >
                            {saving ? "⏳ Fotos hochladen..." : `📸 ${pendingBefore.length + pendingAfter.length} Foto(s) speichern v2.1-FIX`}
                        </button>
                    </div>
                )}
            </div>

            {/* Lightbox moved outside the blurred card container for better stacking context */}
            {previewUrl && (
                <PhotoLightbox
                    url={previewUrl}
                    onClose={() => setPreviewUrl(null)}
                />
            )}
        </div>
    );
}

// ─── PhotoSection sub-component ───────────────────────────────────────────────
function PhotoSection({ label, required, photos, pending, previews, onAdd, onRemove, onRemoveExisting, onPreview, fileRef, accent, currentUserRole, language }: {
    label: string;
    required?: boolean;
    photos: FehlerPhoto[];
    pending: File[];
    previews: string[];
    onAdd: (files: File[]) => void;
    onRemove: (idx: number) => void;
    onRemoveExisting?: (id: string) => void;
    onPreview?: (url: string) => void;
    fileRef: RefObject<HTMLInputElement | null>;
    accent: string;
    currentUserRole?: string | null;
    language?: any;
}) {
    const [gpsCoords, setGpsCoords] = useState<any>(null);

    useEffect(() => {
        GeolocationService.getCurrentPosition({ timeout: 4000 })
            .then((coords) => {
                setGpsCoords(coords);
            })
            .catch((err) => {
                console.warn("Pre-fetching GPS coords failed/timed out:", err);
            });
    }, []);

    return (
        <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    {label} {required && <span style={{ color: "#ef4444" }}>*</span>}
                </span>
                <button
                    onClick={() => fileRef.current?.click()}
                    style={{ padding: "5px 12px", borderRadius: 8, border: `1px solid ${accent}55`, background: `${accent}18`, color: accent, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                >
                    + Hinzufügen
                </button>
            </div>
            <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                onChange={async (e) => {
                    const rawFiles = Array.from(e.target.files || []);
                    if (fileRef.current) fileRef.current.value = "";
                    
                    const processed: File[] = [];
                    for (const f of rawFiles) {
                        let finalFile = f;
                        if (f.type.startsWith("image/")) {
                            try {
                                finalFile = await applyWatermark(f, gpsCoords, language || "pl");
                            } catch (err) { }
                        }
                        processed.push(finalFile);
                    }
                    onAdd(processed);
                }}
                style={{ display: "none" }}
            />
            {photos.length === 0 && previews.length === 0 && (
                <button
                    onClick={() => fileRef.current?.click()}
                    style={{ padding: "20px 16px", borderRadius: 12, border: `2px dashed ${accent}33`, background: "rgba(255,255,255,0.02)", color: "#666", cursor: "pointer", fontSize: 13, fontWeight: 600, textAlign: "center" }}
                >
                    <div style={{ fontSize: 24, marginBottom: 4 }}>📸</div>
                    Foto hinzufügen
                </button>
            )}
            {(photos.length > 0 || previews.length > 0) && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                    {photos.map((p) => (
                        <div
                            key={p.id}
                            style={{ position: "relative", aspectRatio: "1", borderRadius: 8, overflow: "hidden", border: `1px solid ${accent}33`, cursor: "zoom-in" }}
                            onClick={() => onPreview?.(p.url)}
                        >
                            <img src={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            {onRemoveExisting && (() => {
                                const isPhotoByAdmin = (p as any).profiles?.role === "ADMIN";
                                const isSelfAdmin = (currentUserRole || "").toUpperCase() === "ADMIN";
                                if (isPhotoByAdmin && !isSelfAdmin) return null;
                                return (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onRemoveExisting(p.id); }}
                                        style={{ position: "absolute", top: 3, right: 3, width: 22, height: 22, borderRadius: "50%", background: "rgba(0,0,0,0.8)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
                                    >
                                        ✕
                                    </button>
                                );
                            })()}
                        </div>
                    ))}
                    {previews.map((src, idx) => (
                        <div
                            key={idx}
                            style={{ position: "relative", aspectRatio: "1", borderRadius: 8, overflow: "hidden", border: `1px solid ${accent}55`, cursor: "zoom-in" }}
                            onClick={() => onPreview?.(src)}
                        >
                            <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            <button
                                onClick={(e) => { e.stopPropagation(); onRemove(idx); }}
                                style={{ position: "absolute", top: 3, right: 3, width: 22, height: 22, borderRadius: "50%", background: "rgba(0,0,0,0.8)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
                            >
                                ✕
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

const labelStyle: React.CSSProperties = {
    display: "grid", gap: 6, fontSize: 12, fontWeight: 700,
    color: "var(--ui-muted, #888)", textTransform: "uppercase", letterSpacing: "0.1em",
};
const inputStyle: React.CSSProperties = {
    padding: "10px 14px", borderRadius: 12,
    border: "1px solid var(--ui-border, rgba(255,255,255,0.1))",
    background: "var(--ui-bg, #0a0a0f)", color: "var(--ui-text, #fff)",
    fontSize: 14, fontWeight: 600,
};
