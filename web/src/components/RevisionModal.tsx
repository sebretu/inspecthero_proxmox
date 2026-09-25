"use client";
import { useState, useRef, useEffect } from "react";
import { apiGet, apiPost, getToken } from "@/lib/apiClient";
import dynamic from "next/dynamic";
const MapPinPicker = dynamic(() => import("@/components/MapPinPicker").then((mod) => mod.MapPinPicker), { ssr: false });
import { useLanguage } from "@/contexts/LanguageContext";
import { downloadLocalPhoto } from "@/lib/file_utils";
import { applyWatermark } from "@/lib/watermark";
import { GeolocationService } from "@/lib/native";

type Project = { id: string; name: string; companies?: { name: string } | null };

interface RevisionModalProps {
    open: boolean;
    onClose: () => void;
    onSaved?: () => void;
    editItem?: any;
}

export function RevisionModal({ open, onClose, onSaved, editItem }: RevisionModalProps) {
    const { t, language } = useLanguage();
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [projectId, setProjectId] = useState("");
    const [planId, setPlanId] = useState("");
    const [assignedUserId, setAssignedUserId] = useState("");
    const [projects, setProjects] = useState<Project[]>([]);
    const [plans, setPlans] = useState<any[]>([]);
    const [profiles, setProfiles] = useState<any[]>([]);
    const [photos, setPhotos] = useState<File[]>([]);
    const [existingPhotos, setExistingPhotos] = useState<any[]>([]);
    const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [token, setToken] = useState<string | null>(null);
    const [pinned, setPinned] = useState<{ x: number; y: number } | null>(null);
    const [xNorm, setXNorm] = useState<number | null>(null);
    const [yNorm, setYNorm] = useState<number | null>(null);
    const [gpsCoords, setGpsCoords] = useState<any>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!open) {
            setGpsCoords(null);
            return;
        }
        GeolocationService.getCurrentPosition({ timeout: 4000 })
            .then((coords) => {
                setGpsCoords(coords);
            })
            .catch((err) => {
                console.warn("Pre-fetching GPS coords failed/timed out:", err);
            });
    }, [open]);

    useEffect(() => {
        if (!open) return;
        if (editItem) {
            setTitle(editItem.title || "");
            setExistingPhotos(editItem.revision_photos || []);
            setDescription(editItem.description || "");
            setProjectId(editItem.project_id || "");
            setPlanId(editItem.plan_id || "");
            setAssignedUserId(editItem.assigned_user_id || "");
            if (editItem.x_norm != null && editItem.y_norm != null) {
                setPinned({ x: editItem.x_norm, y: editItem.y_norm });
                setXNorm(editItem.x_norm);
                setYNorm(editItem.y_norm);
            } else {
                setPinned(null); setXNorm(null); setYNorm(null);
            }
            setPhotos([]); setPhotoPreviews([]);
            setError(null); setSuccess(false);
        } else {
            setTitle("");
            setDescription("");
            setExistingPhotos([]);
            setPhotos([]);
            setPhotoPreviews([]);
            setError(null);
            setSuccess(false);
            setPinned(null);
            setXNorm(null);
            setYNorm(null);
            setPlanId("");
            setAssignedUserId("");
        }

        getToken().then(setToken).catch(() => { });

        apiGet<Project[]>("/api/projects")
            .then((ps) => {
                setProjects(ps || []);
                if (!editItem && ps && ps.length > 0) setProjectId(ps[0].id);
            })
            .catch(() => { });

        apiGet<any[]>("/api/profiles?limit=500")
            .then((rows) => setProfiles(rows || []))
            .catch(() => { });

        if (editItem) {
            // Force plan loading for the specific project if editItem exists
            apiGet<any[]>(`/api/plans?projectId=${editItem.project_id}&current=true`)
                .then((ps) => {
                    setPlans(ps || []);
                })
                .catch(() => { });
        }
    }, [open, editItem]);

    // Load plans when project changes
    useEffect(() => {
        if (!projectId) { setPlans([]); setPlanId(""); return; }
        // Only load and reset if we're not currently initializing with an editItem
        if (editItem && projectId === editItem.project_id) {
            // Already handled by the initial open effect to preserve planId
            return;
        }
        apiGet<any[]>(`/api/plans?projectId=${projectId}&current=true`)
            .then((ps) => { setPlans(ps || []); setPlanId(""); })
            .catch(() => { });
    }, [projectId, editItem]);

    async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const rawFiles = Array.from(e.target.files || []);
        if (fileInputRef.current) fileInputRef.current.value = "";
        
        const remaining = 10 - photos.length;
        const validFiles = rawFiles.slice(0, remaining);
        
        let coords = gpsCoords;
        if (!coords) {
            try {
                coords = await GeolocationService.getCurrentPosition();
            } catch (err) {
                console.warn("Could not get GPS coords:", err);
            }
        }

        const processed: File[] = [];
        for (const f of validFiles) {
            let finalFile = f;
            if (f.type.startsWith("image/")) {
                try {
                    finalFile = await applyWatermark(f, coords, language || "pl");
                } catch (err) {}
            }
            processed.push(finalFile);
        }

        setPhotos((prev) => [...prev, ...processed]);
        const previews = processed.map((f) => URL.createObjectURL(f));
        setPhotoPreviews((prev) => [...prev, ...previews]);
    }

    function removePhoto(idx: number) {
        setPhotos((prev) => prev.filter((_, i) => i !== idx));
        setPhotoPreviews((prev) => {
            URL.revokeObjectURL(prev[idx]);
            return prev.filter((_, i) => i !== idx);
        });
    }

    async function fileToBase64(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    function handlePin(x: number, y: number) {
        setPinned({ x, y });
        setXNorm(x);
        setYNorm(y);
    }

    async function handleSave() {
        if (!title.trim()) {
            setError(t("revision", "errorTitleRequired", "Title is required"));
            return;
        }
        if (!projectId) {
            setError(t("revision", "errorProjectRequired", "Project is required"));
            return;
        }

        setSaving(true);
        setError(null);

        try {
            const token = await getToken();
            const headers: any = { "Content-Type": "application/json" };
            if (token) headers["Authorization"] = `Bearer ${token}`;

            const url = editItem ? `/api/revisions?id=${editItem.id}` : "/api/revisions";
            const method = editItem ? "PATCH" : "POST";

            const payload = {
                title: title.trim(),
                description: description.trim() || null,
                project_id: projectId,
                plan_id: planId || null,
                x_norm: xNorm,
                y_norm: yNorm,
                assigned_user_id: assignedUserId || null,
            };

            // Update/Create revision
            const revResp = await fetch(url, {
                method,
                headers,
                body: JSON.stringify(payload),
            });
            const revJson = await revResp.json();
            if (!revJson.ok) throw new Error(revJson.error?.message || `Failed to ${editItem ? 'update' : 'create'} revision`);

            const revisionId = editItem ? editItem.id : revJson.data.id;

            // Upload photos
            for (const photo of photos) {
                const base64 = await fileToBase64(photo);
                const uploadResp = await fetch("/api/revision-photos", {
                    method: "POST",
                    headers,
                    body: JSON.stringify({ revision_id: revisionId, file_name: photo.name, base64 }),
                });
                const uploadJson = await uploadResp.json();
                if (!uploadJson.ok) {
                    console.warn("Photo upload failed:", uploadJson.error?.message);
                }
            }

            setSuccess(true);
            window.dispatchEvent(new CustomEvent("revision-created"));
            setTimeout(() => {
                onSaved?.();
                onClose();
            }, 1500);
        } catch (e: any) {
            setError(e.message || "An error occurred");
        } finally {
            setSaving(false);
        }
    }

    if (!open) return null;

    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 10001,
                background: "rgba(0,0,0,0.7)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backdropFilter: "blur(8px)",
                padding: "16px",
            }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                style={{
                    background: "var(--ui-card, #1a1a2e)",
                    borderRadius: 24,
                    padding: 32,
                    width: "min(520px, 96vw)",
                    maxHeight: "90vh",
                    overflowY: "auto",
                    display: "grid",
                    gap: 20,
                    boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
                    border: "1px solid var(--ui-border, rgba(255,255,255,0.1))",
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{
                            width: 40, height: 40, borderRadius: 12,
                            background: "linear-gradient(135deg, #06b6d4, #8b5cf6)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 20,
                        }}>
                            📋
                        </div>
                        <h3 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: "var(--ui-text, #fff)" }}>
                            {editItem ? t("revision", "editTitle", "Edit Revision") : t("revision", "title", "New Revision")}
                        </h3>
                    </div>
                    <button
                        onClick={onClose}
                        style={{ background: "none", border: "none", color: "var(--ui-muted, #888)", fontSize: 22, cursor: "pointer", padding: 4 }}
                    >
                        ✕
                    </button>
                </div>

                {/* Project Select */}
                <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--ui-muted, #888)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    {t("home", "selectProject", "Project")}
                    <select
                        value={projectId}
                        onChange={(e) => setProjectId(e.target.value)}
                        style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid var(--ui-border, rgba(255,255,255,0.1))", background: "var(--ui-bg, #0a0a0f)", color: "var(--ui-text, #fff)", fontSize: 14, fontWeight: 600 }}
                    >
                        {projects.map((p) => <option key={p.id} value={p.id}>{p.companies?.name ? `[${p.companies.name.toUpperCase()}] ` : ""}{p.name}</option>)}
                    </select>
                </label>

                {/* Assignee */}
                <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--ui-muted, #888)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    {t("fehler", "labelAssignee", "Assignee")}
                    <select
                        value={assignedUserId}
                        onChange={(e) => setAssignedUserId(e.target.value)}
                        style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid var(--ui-border, rgba(255,255,255,0.1))", background: "var(--ui-bg, #0a0a0f)", color: "var(--ui-text, #fff)", fontSize: 14, fontWeight: 600 }}
                    >
                        <option value="">{t("fehler", "noAssignee", "— No assignee —")}</option>
                        {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                    </select>
                </label>

                {/* Title */}
                <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--ui-muted, #888)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    {t("revision", "labelTitle", "Title")} *
                    <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder={t("revision", "titlePlaceholder", "Revision title...")}
                        maxLength={200}
                        style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid var(--ui-border, rgba(255,255,255,0.1))", background: "var(--ui-bg, #0a0a0f)", color: "var(--ui-text, #fff)", fontSize: 14, fontWeight: 600 }}
                    />
                </label>

                {/* Description */}
                <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--ui-muted, #888)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    {t("revision", "labelDescription", "Description")}
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder={t("revision", "descriptionPlaceholder", "Enter a detailed description...")}
                        rows={3}
                        style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid var(--ui-border, rgba(255,255,255,0.1))", background: "var(--ui-bg, #0a0a0f)", color: "var(--ui-text, #fff)", fontSize: 14, fontWeight: 600, resize: "vertical" }}
                    />
                </label>

                {/* Plan + Location */}
                <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--ui-muted, #888)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    {t("fehler", "labelPlan", "Floor Plan (optional)")}
                    <select
                        value={planId}
                        onChange={(e) => { setPlanId(e.target.value); setPinned(null); setXNorm(null); setYNorm(null); }}
                        style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid var(--ui-border, rgba(255,255,255,0.1))", background: "var(--ui-bg, #0a0a0f)", color: "var(--ui-text, #fff)", fontSize: 14, fontWeight: 600 }}
                    >
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

                {planId && (
                    <div style={{ display: "grid", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ui-muted, #888)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                            📍 {t("fehler", "labelLocation", "Location on Map")}
                        </span>
                        <MapPinPicker
                            planId={planId}
                            token={token}
                            onPin={handlePin}
                            pinned={pinned}
                            accentColor="#06b6d4"
                            label={t("fehler", "mapHint", "Click on the plan to pin location")}
                        />
                    </div>
                )}

                {/* Existing Photos */}
                {existingPhotos.length > 0 && (
                    <div style={{ display: "grid", gap: 10 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ui-accent, #06b6d4)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                            {t("revision", "existingPhotos", "Existing Photos")}
                        </span>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                            {existingPhotos.map((p: any) => (
                                <div key={p.id} style={{ position: "relative", aspectRatio: "1", borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)" }}>
                                    <img src={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                    <button
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            if (!window.confirm(t("common", "confirmDelete", "Delete photo?"))) return;
                                            try {
                                                const tok = await getToken();
                                                await fetch(`/api/revision-photos?id=${p.id}`, { method: "DELETE", headers: { "Authorization": `Bearer ${tok}` } });
                                                setExistingPhotos(prev => prev.filter(x => x.id !== p.id));
                                            } catch (err) { console.error(err); }
                                        }}
                                        style={{
                                            position: "absolute", top: 3, right: 3, width: 22, height: 22, borderRadius: "50%",
                                            background: "rgba(0,0,0,0.8)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", fontSize: 12,
                                            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100
                                        }}
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* New Photos */}
                <div style={{ display: "grid", gap: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ui-muted, #888)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                            {t("revision", "labelPhotos", "Add New Photos")} ({photos.length}/10)
                        </span>
                        {photos.length < 10 && (
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                style={{
                                    padding: "6px 14px", borderRadius: 10, border: "1px solid rgba(6,182,212,0.4)",
                                    background: "rgba(6,182,212,0.1)", color: "#06b6d4", fontSize: 12, fontWeight: 700, cursor: "pointer",
                                }}
                            >
                                + {t("revision", "addPhoto", "Add Photo")}
                            </button>
                        )}
                    </div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleFileChange}
                        style={{ display: "none" }}
                    />

                    {photoPreviews.length > 0 && (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                            {photoPreviews.map((src, idx) => (
                                <div key={idx} style={{ position: "relative", aspectRatio: "1", borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)" }}>
                                    <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                    <button
                                        onClick={() => removePhoto(idx)}
                                        style={{
                                            position: "absolute", top: 3, right: 3, width: 20, height: 20, borderRadius: "50%",
                                            background: "rgba(0,0,0,0.7)", border: "none", color: "#fff", fontSize: 11,
                                            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                                        }}
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {photoPreviews.length === 0 && (
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                                padding: "24px 16px", borderRadius: 14,
                                border: "2px dashed rgba(255,255,255,0.1)",
                                background: "rgba(255,255,255,0.02)",
                                color: "var(--ui-muted, #888)",
                                cursor: "pointer", fontSize: 13, fontWeight: 600,
                                display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                            }}
                        >
                            <span style={{ fontSize: 28 }}>📸</span>
                            {t("revision", "dropPhotosHint", "Click to add photos (max 10)")}
                        </button>
                    )}
                </div>

                {/* Error / Success */}
                {error && (
                    <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171", fontSize: 13, fontWeight: 600 }}>
                        {error}
                    </div>
                )}
                {success && (
                    <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)", color: "#4ade80", fontSize: 13, fontWeight: 600, textAlign: "center" }}>
                        ✅ {t("revision", "savedSuccess", "Revision saved successfully!")}
                    </div>
                )}

                {/* Actions */}
                {!success && (
                    <div style={{ display: "flex", gap: 12 }}>
                        <button
                            onClick={onClose}
                            style={{ flex: 1, padding: "12px", borderRadius: 12, border: "1px solid var(--ui-border, rgba(255,255,255,0.1))", background: "transparent", color: "var(--ui-text, #fff)", fontWeight: 800, cursor: "pointer" }}
                        >
                            {t("common", "cancel", "Cancel")}
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving || !title.trim() || !projectId}
                            style={{
                                flex: 2, padding: "12px", borderRadius: 12, border: "none",
                                background: saving ? "rgba(6,182,212,0.4)" : "linear-gradient(135deg, #06b6d4, #8b5cf6)",
                                color: "#fff", fontWeight: 800, cursor: saving || !title.trim() ? "not-allowed" : "pointer",
                                opacity: !title.trim() || !projectId ? 0.5 : 1,
                            }}
                        >
                            {saving ? `⏳ ${t("common", "savingChanges", "Saving...")}` : (editItem ? `✓ ${t("common", "saveChanges", "Save Changes")}` : `✓ ${t("revision", "save", "Save Revision")}`)}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
