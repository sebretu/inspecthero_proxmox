"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/apiClient";
import { useLanguage } from "@/contexts/LanguageContext";
import PhotoLightbox from "@/components/PhotoLightbox";
import { pdf } from "@react-pdf/renderer";
import DocumentationPdf from "@/app/reports/DocumentationPdf";
import {
  Camera,
  Plus,
  Trash2,
  Edit3,
  Download,
  ArrowLeft,
  Upload,
  AlertCircle,
  Maximize2,
  Folder,
  Move,
} from "lucide-react";
import { PhotoDocumentation, PhotoDocPoint, DocSubPhoto } from "@/types/documentation";

type Project = {
  id: string;
  name: string;
  companies?: { name: string } | null;
};

const COLOR_PRESETS = [
  { id: "cyan", hex: "#00C8FF", name: "Cyan / Blau" },
  { id: "amber", hex: "#F59E0B", name: "Amber / Gelb" },
  { id: "emerald", hex: "#10B981", name: "Grün" },
  { id: "rose", hex: "#F43F5E", name: "Rot / Rose" },
  { id: "purple", hex: "#A855F7", name: "Lila" },
];

export default function DocumentationClient() {
  const router = useRouter();
  const { t, language } = useLanguage();

  // Auth & Admin check
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  // Data lists
  const [projects, setProjects] = useState<Project[]>([]);
  const [documentations, setDocumentations] = useState<PhotoDocumentation[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingList, setLoadingList] = useState(false);

  // Active documentation in editor
  const [activeDoc, setActiveDoc] = useState<PhotoDocumentation | null>(null);
  const [points, setPoints] = useState<PhotoDocPoint[]>([]);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Modals & UI States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isPointModalOpen, setIsPointModalOpen] = useState(false);
  const [lightboxData, setLightboxData] = useState<{
    url: string;
    title?: string;
    description?: string;
  } | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [pdfStatusMessage, setPdfStatusMessage] = useState("");

  // Create Modal Form
  const [newTitle, setNewTitle] = useState("");
  const [newProjectId, setNewProjectId] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newAuthor, setNewAuthor] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newMainImageBase64, setNewMainImageBase64] = useState<string | null>(null);
  const [newMainImageName, setNewMainImageName] = useState("");
  const [creatingDoc, setCreatingDoc] = useState(false);

  // Point Form in Drawer / Modal
  const [editingPoint, setEditingPoint] = useState<PhotoDocPoint | null>(null);
  const [pointTitle, setPointTitle] = useState("");
  const [pointDesc, setPointDesc] = useState("");
  const [pointColor, setPointColor] = useState("#00C8FF");
  const [pointPhotos, setPointPhotos] = useState<DocSubPhoto[]>([]);
  const [uploadingPointPhoto, setUploadingPointPhoto] = useState(false);
  const [savingPoint, setSavingPoint] = useState(false);

  // Main Image Container Ref for calculating click and drag coordinates
  const mainImageContainerRef = useRef<HTMLDivElement>(null);
  const mainImageRef = useRef<HTMLImageElement>(null);

  // Drag & Drop State for Pin & Callout
  const [draggingInfo, setDraggingInfo] = useState<{
    id: string;
    type: "PIN" | "CALLOUT";
  } | null>(null);
  const dragMovedRef = useRef<boolean>(false);
  const dragStartPosRef = useRef<{ clientX: number; clientY: number }>({ clientX: 0, clientY: 0 });
  const [isAddPointMode, setIsAddPointMode] = useState(false);

  // Initial Auth Verification & Query URL restoring
  useEffect(() => {
    async function checkAuth() {
      try {
        const me = await apiGet<any>("/api/me");
        if (!me?.profile) {
          router.push("/auth/login");
          return;
        }
        setCurrentUser(me.profile);
        const adminFlag = (me.profile.role || "").toUpperCase() === "ADMIN";
        setIsAdmin(adminFlag);
        if (adminFlag) {
          loadProjects();
          await loadDocumentations();
          // Check if doc ID exists in URL query on reload
          if (typeof window !== "undefined") {
            const urlParams = new URLSearchParams(window.location.search);
            const docId = urlParams.get("id");
            if (docId) {
              openDocumentation(docId);
            }
          }
        }
      } catch (err) {
        console.error("Auth check failed", err);
        setIsAdmin(false);
      } finally {
        setLoadingAuth(false);
      }
    }
    checkAuth();
  }, [router]);

  async function loadProjects() {
    try {
      const data = await apiGet<Project[]>("/api/projects");
      setProjects(data || []);
    } catch (err) {
      console.error("Failed to load projects", err);
    }
  }

  async function loadDocumentations() {
    setLoadingList(true);
    try {
      const url =
        selectedProjectId && selectedProjectId !== "ALL"
          ? `/api/documentation?projectId=${encodeURIComponent(selectedProjectId)}`
          : "/api/documentation";
      const data = await apiGet<PhotoDocumentation[]>(url);
      setDocumentations(data || []);
    } catch (err) {
      console.error("Failed to load documentations", err);
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    if (isAdmin) {
      loadDocumentations();
    }
  }, [selectedProjectId, isAdmin]);

  async function openDocumentation(docId: string) {
    setLoadingDoc(true);
    try {
      const res = await apiGet<any>(`/api/documentation/${docId}`);
      if (res) {
        const docObj = res.documentation || res;
        const rawPts = (res.points || docObj.photo_doc_points || docObj.points || []).slice();
        rawPts.sort((a: any, b: any) => (a.point_number || 0) - (b.point_number || 0));
        const normalizedPts = rawPts.map((p: any, idx: number) => ({
          ...p,
          point_number: idx + 1,
        }));
        setActiveDoc(docObj);
        setPoints(normalizedPts);
        setSelectedPointId(null);
        if (typeof window !== "undefined") {
          window.history.replaceState({}, "", `/documentation?id=${docId}`);
        }
      }
    } catch (err: any) {
      alert(t("doc", "loadError", "Błąd wczytywania dokumentacji") + ": " + (err?.message || String(err)));
    } finally {
      setLoadingDoc(false);
    }
  }

  function handleBackToList() {
    setActiveDoc(null);
    setPoints([]);
    setSelectedPointId(null);
    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", "/documentation");
    }
    loadDocumentations();
  }

  const filteredDocs = useMemo(() => {
    return documentations.filter((doc) => {
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      return (
        doc.title.toLowerCase().includes(q) ||
        (doc.location && doc.location.toLowerCase().includes(q)) ||
        (doc.description && doc.description.toLowerCase().includes(q))
      );
    });
  }, [documentations, searchQuery]);

  // Drag interaction effect (window mousemove/mouseup & touchmove/touchend)
  useEffect(() => {
    if (!draggingInfo || !mainImageRef.current || !activeDoc) return;

    function handleMove(e: MouseEvent | TouchEvent) {
      if (!mainImageRef.current || !draggingInfo) return;
      const clientX = "touches" in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : (e as MouseEvent).clientY;

      const dx = Math.abs(clientX - dragStartPosRef.current.clientX);
      const dy = Math.abs(clientY - dragStartPosRef.current.clientY);
      if (dx > 4 || dy > 4) {
        dragMovedRef.current = true;
      }

      const rect = mainImageRef.current.getBoundingClientRect();
      const x_norm = Math.max(0.02, Math.min(0.98, (clientX - rect.left) / rect.width));
      const y_norm = Math.max(0.02, Math.min(0.98, (clientY - rect.top) / rect.height));

      const dragTargetId = draggingInfo.id;
      const dragTargetType = draggingInfo.type;

      setPoints((prev) =>
        prev.map((p) => {
          if (p.id !== dragTargetId) return p;
          if (dragTargetType === "PIN") {
            return {
              ...p,
              x_norm: Number(x_norm.toFixed(4)),
              y_norm: Number(y_norm.toFixed(4)),
            };
          } else {
            return {
              ...p,
              callout_x_norm: Number(x_norm.toFixed(4)),
              callout_y_norm: Number(y_norm.toFixed(4)),
            };
          }
        })
      );
    }

    async function handleEnd() {
      const activeDragging = draggingInfo;
      setDraggingInfo(null);
      if (!activeDragging || !activeDoc) return;

      if (dragMovedRef.current && !activeDragging.id.startsWith("temp-")) {
        const currentPt = points.find((p) => p.id === activeDragging.id);
        if (currentPt) {
          try {
            setSaveStatus("Saving position...");
            if (activeDragging.type === "PIN") {
              await apiPatch(`/api/documentation/${activeDoc.id}/points`, {
                pointId: currentPt.id,
                x_norm: currentPt.x_norm,
                y_norm: currentPt.y_norm,
              });
            } else {
              await apiPatch(`/api/documentation/${activeDoc.id}/points`, {
                pointId: currentPt.id,
                callout_x_norm: currentPt.callout_x_norm,
                callout_y_norm: currentPt.callout_y_norm,
              });
            }
            setSaveStatus("Position saved ✓");
            setTimeout(() => setSaveStatus(null), 1800);
          } catch (err) {
            console.error("Failed to save dragged position:", err);
            setSaveStatus(null);
          }
        }
      }
    }

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleEnd);
    window.addEventListener("touchmove", handleMove, { passive: false });
    window.addEventListener("touchend", handleEnd);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleEnd);
    };
  }, [draggingInfo, points, activeDoc]);

  function handleStartDragPin(e: React.MouseEvent | React.TouchEvent, pt: PhotoDocPoint) {
    e.stopPropagation();
    const clientX = "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    dragMovedRef.current = false;
    dragStartPosRef.current = { clientX, clientY };
    setDraggingInfo({ id: pt.id, type: "PIN" });
    setSelectedPointId(pt.id);
  }

  function handleStartDragCallout(e: React.MouseEvent | React.TouchEvent, pt: PhotoDocPoint) {
    e.stopPropagation();
    const clientX = "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    dragMovedRef.current = false;
    dragStartPosRef.current = { clientX, clientY };
    setDraggingInfo({ id: pt.id, type: "CALLOUT" });
    setSelectedPointId(pt.id);
  }

  // Click on Main Image: only add point when isAddPointMode is active
  async function handleMainImageClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!activeDoc || !mainImageRef.current || draggingInfo || dragMovedRef.current) return;

    const rect = mainImageRef.current.getBoundingClientRect();
    const clientX = e.clientX;
    const clientY = e.clientY;

    if (
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    ) {
      return;
    }

    const x_norm = Math.max(0.02, Math.min(0.98, (clientX - rect.left) / rect.width));
    const y_norm = Math.max(0.02, Math.min(0.98, (clientY - rect.top) / rect.height));

    // Check if clicked close to an existing point (within ~3% distance) to edit it
    const existing = points.find((pt) => {
      const dx = pt.x_norm - x_norm;
      const dy = pt.y_norm - y_norm;
      return Math.sqrt(dx * dx + dy * dy) < 0.04;
    });

    if (existing) {
      openPointEditor(existing);
      setIsAddPointMode(false);
      return;
    }

    // Only allow placing a new point if "Punkt hinzufügen" mode is activated!
    if (!isAddPointMode) return;

    // Save point to database with next sequential number
    const nextNum = (points.reduce((max, p) => Math.max(max, p.point_number), 0) || 0) + 1;
    const defaultCalloutX = x_norm > 0.5 ? x_norm - 0.16 : x_norm + 0.16;
    const defaultCalloutY = y_norm > 0.5 ? y_norm - 0.12 : y_norm + 0.12;
    const defaultColor = COLOR_PRESETS[(nextNum - 1) % COLOR_PRESETS.length].hex;

    try {
      setSaveStatus(t("doc", "savingPoint", "Zapisywanie punktu..."));
      const newPointPayload = {
        point_number: nextNum,
        title: `${t("doc", "pointTitleLabel", "Punkt")} #${nextNum}`,
        description: null,
        x_norm: Number(x_norm.toFixed(4)),
        y_norm: Number(y_norm.toFixed(4)),
        callout_x_norm: Number(defaultCalloutX.toFixed(4)),
        callout_y_norm: Number(defaultCalloutY.toFixed(4)),
        color: defaultColor,
        photos: [],
      };

      const savedPt = await apiPost<PhotoDocPoint>(`/api/documentation/${activeDoc.id}/points`, newPointPayload);
      setPoints((prev) => [...prev.filter((p) => p.id !== savedPt.id), savedPt].sort((a, b) => a.point_number - b.point_number));
      setSaveStatus(t("doc", "saveSuccess", "Zapisano ✓"));
      setTimeout(() => setSaveStatus(null), 1800);
      setIsAddPointMode(false);
      openPointEditor(savedPt);
    } catch (err: any) {
      console.error("Failed to create point:", err);
      alert(t("doc", "saveError", "Błąd tworzenia punktu: ") + (err?.message || String(err)));
      setSaveStatus(null);
    }
  }

  // Create point from "+ Add" button (activates placement mode)
  function handleCreateNewPointFromButton() {
    setIsAddPointMode((prev) => {
      const next = !prev;
      if (next && mainImageContainerRef.current) {
        mainImageContainerRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return next;
    });
  }

  function openPointEditor(pt: PhotoDocPoint) {
    setEditingPoint(pt);
    setPointTitle(pt.title);
    setPointDesc(pt.description || "");
    setPointColor(pt.color || "#00C8FF");
    setPointPhotos(pt.photos || []);
    setIsPointModalOpen(true);
    setSelectedPointId(pt.id);
  }

  // Save Point changes
  async function handleSavePoint() {
    if (!activeDoc || !editingPoint) return;
    if (!pointTitle.trim()) {
      alert(t("doc", "fillRequired", "Tytuł punktu jest wymagany."));
      return;
    }

    setSavingPoint(true);
    try {
      const payload = {
        pointId: editingPoint.id,
        title: pointTitle.trim(),
        description: pointDesc.trim() || null,
        color: pointColor,
        photos: pointPhotos,
      };
      const saved = await apiPatch<PhotoDocPoint>(`/api/documentation/${activeDoc.id}/points`, payload);

      setPoints((prev) => {
        const filtered = prev.filter((p) => p.id !== saved.id);
        const updated = [...filtered, saved].sort((a, b) => a.point_number - b.point_number);
        return updated;
      });

      setIsPointModalOpen(false);
      setEditingPoint(null);
    } catch (e: any) {
      alert(`${t("doc", "saveError", "Błąd podczas zapisywania punktu")}: ` + (e?.message || String(e)));
    } finally {
      setSavingPoint(false);
    }
  }

  // Delete Point
  async function handleDeletePoint(ptId: string) {
    if (!confirm(t("doc", "confirmDeletePoint", "Czy na pewno chcesz usunąć ten punkt wraz ze wszystkimi zdjęciami?"))) return;
    if (!activeDoc) return;

    try {
      if (!ptId.startsWith("temp-")) {
        await apiDelete(`/api/documentation/${activeDoc.id}/points?pointId=${encodeURIComponent(ptId)}`);
      }
      setPoints((prev) => {
        const remaining = prev.filter((p) => p.id !== ptId).sort((a, b) => a.point_number - b.point_number);
        return remaining.map((p, idx) => {
          const newNum = idx + 1;
          let newTitle = p.title;
          if (/^Punkt\s*#?\d+$/i.test(p.title) || /^Point\s*#?\d+$/i.test(p.title)) {
            newTitle = p.title.replace(/\d+$/, String(newNum));
          }
          return {
            ...p,
            point_number: newNum,
            title: newTitle,
          };
        });
      });
      setIsPointModalOpen(false);
      setEditingPoint(null);
      setSelectedPointId(null);
    } catch (e: any) {
      alert(`${t("doc", "deleteError", "Błąd podczas usuwania")}: ` + (e?.message || String(e)));
    }
  }

  // Upload Sub-Photo to point (persisted immediately)
  async function handleUploadSubPhoto(file: File) {
    if (!file) return;
    setUploadingPointPhoto(true);
    try {
      const base64 = await fileToBase64(file);
      const res = await apiPost<{ url: string; storage_path: string }>("/api/documentation/upload", {
        base64,
        fileName: file.name,
        type: "detail",
      });

      const newPhoto: DocSubPhoto = {
        id: "photo-" + Date.now(),
        url: res.url,
        storage_path: res.storage_path,
        caption: file.name.replace(/\.[^/.]+$/, ""),
        created_at: new Date().toISOString(),
      };

      const updatedPhotos = [...pointPhotos, newPhoto];
      setPointPhotos(updatedPhotos);

      // Auto-save photos immediately so refreshing preserves them
      if (editingPoint && !editingPoint.id.startsWith("temp-") && activeDoc) {
        await apiPatch(`/api/documentation/${activeDoc.id}/points`, {
          pointId: editingPoint.id,
          photos: updatedPhotos,
        });
        setPoints((prev) =>
          prev.map((p) => (p.id === editingPoint.id ? { ...p, photos: updatedPhotos } : p))
        );
      }
    } catch (e: any) {
      alert(`${t("doc", "saveError", "Błąd uploadu zdjęcia")}: ` + (e?.message || String(e)));
    } finally {
      setUploadingPointPhoto(false);
    }
  }

  // Remove Photo from point
  async function handleRemovePhoto(idx: number) {
    const updatedPhotos = pointPhotos.filter((_, i) => i !== idx);
    setPointPhotos(updatedPhotos);
    if (editingPoint && !editingPoint.id.startsWith("temp-") && activeDoc) {
      try {
        await apiPatch(`/api/documentation/${activeDoc.id}/points`, {
          pointId: editingPoint.id,
          photos: updatedPhotos,
        });
        setPoints((prev) =>
          prev.map((p) => (p.id === editingPoint.id ? { ...p, photos: updatedPhotos } : p))
        );
      } catch (err) {
        console.error("Failed to update photos:", err);
      }
    }
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Create New Documentation
  async function handleCreateDocumentation() {
    if (!newTitle.trim() || !newMainImageBase64) {
      alert(t("doc", "fillRequired", "Proszę podać tytuł i wybrać zdjęcie główne."));
      return;
    }

    setCreatingDoc(true);
    try {
      const uploadRes = await apiPost<{ url: string; storage_path: string }>("/api/documentation/upload", {
        base64: newMainImageBase64,
        fileName: newMainImageName || "main-overview.jpg",
        type: "main",
      });

      const payload = {
        title: newTitle.trim(),
        description: newDescription.trim() || null,
        location: newLocation.trim() || null,
        project_id: newProjectId || null,
        author_name: newAuthor.trim() || currentUser?.full_name || "Admin",
        main_image_url: uploadRes.url,
        main_image_path: uploadRes.storage_path,
      };

      const created = await apiPost<PhotoDocumentation>("/api/documentation", payload);
      setIsCreateModalOpen(false);
      resetCreateForm();
      await loadDocumentations();
      openDocumentation(created.id);
    } catch (e: any) {
      alert(`${t("doc", "saveError", "Błąd podczas tworzenia dokumentacji")}: ` + (e?.message || String(e)));
    } finally {
      setCreatingDoc(false);
    }
  }

  function resetCreateForm() {
    setNewTitle("");
    setNewProjectId("");
    setNewLocation("");
    setNewAuthor("");
    setNewDescription("");
    setNewMainImageBase64(null);
    setNewMainImageName("");
  }

  // Delete Document
  async function handleDeleteDocumentation(docId: string, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    if (!confirm(t("doc", "confirmDeleteDoc", "Czy na pewno chcesz bezpowrotnie usunąć tę dokumentację i wszystkie jej punkty?"))) return;

    try {
      await apiDelete(`/api/documentation/${docId}`);
      if (activeDoc?.id === docId) {
        handleBackToList();
      } else {
        await loadDocumentations();
      }
    } catch (err: any) {
      alert(`${t("doc", "deleteError", "Błąd usuwania")}: ` + (err?.message || String(err)));
    }
  }

  // Generate & Download PDF Report
  async function handleGeneratePdf(docToExport: PhotoDocumentation, docPoints: PhotoDocPoint[]) {
    setIsExportingPdf(true);
    setPdfStatusMessage(t("doc", "generatingPdf", "Przygotowywanie raportu PDF..."));

    try {
      setPdfStatusMessage("Przetwarzanie zdjęcia głównego...");
      let mainImgB64: string | null = null;
      let mainImgRatio = 16 / 10;
      try {
        const meta = await getImageMeta(docToExport.main_image_url);
        mainImgRatio = meta.aspectRatio;
        mainImgB64 = await urlToBase64Jpeg(docToExport.main_image_url);
      } catch {
        mainImgB64 = docToExport.main_image_url;
      }

      const detailMap: Record<string, string> = {};
      const allPhotos: DocSubPhoto[] = [];
      docPoints.forEach((p) => {
        if (Array.isArray(p.photos)) allPhotos.push(...p.photos);
      });

      for (let i = 0; i < allPhotos.length; i++) {
        const ph = allPhotos[i];
        setPdfStatusMessage(`Przetwarzanie zdjęcia ${i + 1} z ${allPhotos.length}...`);
        try {
          const b64 = await urlToBase64Jpeg(ph.url);
          if (b64) detailMap[ph.id] = b64;
        } catch {
          detailMap[ph.id] = ph.url;
        }
      }

      setPdfStatusMessage("Kompilowanie raportu PDF...");
      const blob = await pdf(
        <DocumentationPdf
          documentation={docToExport}
          points={docPoints}
          mainImageBase64={mainImgB64}
          detailPhotosBase64={detailMap}
          language={language}
          imageAspectRatio={mainImgRatio}
          baseUrl={typeof window !== "undefined" ? window.location.origin : ""}
        />
      ).toBlob();

      const safeTitle = (docToExport.title || "Dokumentation").replace(/[/\\?%*:|"<>]/g, "_").replace(/\s+/g, "_");
      const filename = `Foto_Dokumentation_${safeTitle}_${new Date().toISOString().slice(0, 10)}.pdf`;

      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    } catch (err: any) {
      console.error("PDF generation failed:", err);
      alert("Błąd generowania PDF: " + (err?.message || String(err)));
    } finally {
      setIsExportingPdf(false);
      setPdfStatusMessage("");
    }
  }

  async function getImageMeta(url: string): Promise<{ width: number; height: number; aspectRatio: number }> {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const w = img.naturalWidth || img.width || 1920;
        const h = img.naturalHeight || img.height || 1080;
        resolve({
          width: w,
          height: h,
          aspectRatio: w / (h || 1),
        });
      };
      img.onerror = () => {
        resolve({ width: 1920, height: 1080, aspectRatio: 16 / 10 });
      };
      img.src = url;
    });
  }

  async function urlToBase64Jpeg(url: string, maxDim = 1200, quality = 0.85): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas context failed"));
          return;
        }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = (e) => reject(e);
      img.src = url;
    });
  }

  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-ui-bg flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-ui-border border-t-ui-accent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-ui-bg flex items-center justify-center p-6 text-center">
        <div className="max-w-md bg-ui-card border border-ui-border rounded-2xl p-8 shadow-2xl">
          <AlertCircle className="w-12 h-12 text-ui-danger mx-auto mb-4" />
          <h2 className="text-xl font-bold text-ui-text uppercase mb-2">
            {t("doc", "adminOnly", "Dostęp tylko dla Administratora")}
          </h2>
          <p className="text-sm text-ui-muted mb-6">
            {t("doc", "adminOnlyDesc", "Ta funkcja jest zarezerwowana wyłącznie dla użytkowników z uprawnieniami administratora.")}
          </p>
          <button
            onClick={() => router.push("/")}
            className="px-6 py-2.5 bg-ui-accent text-slate-950 font-bold rounded-xl text-xs uppercase tracking-wider"
          >
            {t("doc", "backToList", "Powrót")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ui-bg text-ui-text pb-20">
      {/* ── TOP HEADER / SUBNAV ── */}
      <header className="border-b border-ui-border bg-ui-nav-bg/90 backdrop-blur-xl sticky top-0 z-40 px-4 sm:px-8 py-4">
        <div className="w-full max-w-[1920px] mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {activeDoc ? (
              <button
                onClick={handleBackToList}
                className="p-2 bg-ui-card border border-ui-border hover:border-ui-accent rounded-xl text-ui-muted hover:text-ui-text transition-all flex items-center gap-2 text-xs font-bold uppercase"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">{t("doc", "backToList", "Lista dokumentów")}</span>
              </button>
            ) : null}
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-black uppercase tracking-tight text-ui-text flex items-center gap-2">
                  <span>📸</span>
                  <span>{activeDoc ? activeDoc.title : t("doc", "title", "Foto-Dokumentation")}</span>
                </h1>
                <span className="text-[10px] font-black uppercase tracking-widest bg-ui-accent/15 text-ui-accent border border-ui-accent/30 px-2 py-0.5 rounded-md">
                  {t("doc", "adminOnly", "Admin Only")}
                </span>
              </div>
              <p className="text-xs text-ui-muted font-bold mt-0.5">
                {activeDoc
                  ? `${activeDoc.projects?.name || t("doc", "noProject", "Allgemein")} • ${points.length} ${t("doc", "pointsCount", "Punktów")}`
                  : t("doc", "subtitle", "Twórz interaktywne schematy ze zdjęć głównych, punktami callout i raportami PDF")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            {activeDoc ? (
              <>
                {saveStatus && (
                  <span className="text-[11px] font-bold text-ui-accent bg-ui-accent/10 border border-ui-accent/20 px-3 py-1.5 rounded-xl animate-fade-in">
                    {saveStatus}
                  </span>
                )}
                <button
                  onClick={() => handleGeneratePdf(activeDoc, points)}
                  disabled={isExportingPdf}
                  className="flex-1 sm:flex-initial px-4 py-2.5 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                >
                  {isExportingPdf ? (
                    <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  <span>{isExportingPdf ? t("doc", "generatingPdf", "Generowanie...") : t("doc", "downloadPdf", "Pobierz PDF")}</span>
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="flex-1 sm:flex-initial px-5 py-2.5 bg-ui-accent hover:bg-ui-accent/90 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>{t("doc", "newDoc", "Nowy dokument")}</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* PDF Generation Overlay Status */}
      {isExportingPdf && (
        <div className="fixed inset-0 z-[300000] bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center">
          <div className="w-14 h-14 border-4 border-ui-border border-t-ui-accent rounded-full animate-spin mb-4"></div>
          <h3 className="text-lg font-black uppercase tracking-wider text-ui-text mb-2">{t("doc", "generatingPdf", "Generowanie Raportu PDF")}</h3>
          <p className="text-sm font-bold text-ui-accent animate-pulse">{pdfStatusMessage}</p>
        </div>
      )}

      {/* ── MAIN CONTENT CONTAINER (FULL-WIDTH CENTERED) ── */}
      <main className="w-full max-w-[1920px] mx-auto px-4 sm:px-8 py-4 sm:py-6 flex flex-col items-center justify-center">
        {activeDoc ? (
          /* ══════════════════════════════════════════════════════════
             EDITOR VIEW: Interactive Main Image + Callouts Canvas
             ══════════════════════════════════════════════════════════ */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
            {/* Left: Interactive Canvas (8 cols) */}
            <div className="lg:col-span-8 flex flex-col gap-4">
              <div className="bg-ui-card border border-ui-border rounded-2xl p-4 shadow-xl flex flex-col items-center">
                <div className="w-full flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-ui-accent animate-pulse"></span>
                    <span className="text-xs font-black uppercase tracking-wider text-ui-accent">
                      {t("doc", "mainPhotoLabel", "HAUPTFOTO (GESAMTANSICHT / ÜBERSICHT)")}
                    </span>
                  </div>
                  {isAddPointMode ? (
                    <div className="flex items-center gap-2 bg-amber-400/20 border border-amber-400/50 px-3 py-1 rounded-xl text-amber-300 text-xs font-bold animate-pulse">
                      <span>🎯 {t("doc", "clickPlanToPlace", `Klicke auf den Plan, um Punkt #${(points.length || 0) + 1} zu platzieren`)}</span>
                      <button
                        type="button"
                        onClick={() => setIsAddPointMode(false)}
                        className="ml-2 text-white bg-black/40 px-2 py-0.5 rounded text-[11px] hover:bg-black/60"
                      >
                        ✕ {t("doc", "cancel", "Abbrechen")}
                      </button>
                    </div>
                  ) : (
                    <span className="text-[11px] font-bold text-ui-muted hidden sm:inline">
                      💡 {t("doc", "dragHint", "Miniaturansichten & Beschriftungen können frei verschoben werden")}
                    </span>
                  )}
                </div>

                {/* The Main Image Viewport with interactive click and SVG callouts */}
                <div
                  className="relative w-full rounded-xl overflow-hidden bg-slate-950/90 border border-ui-border/60 select-none flex items-center justify-center min-h-[420px] mx-auto p-2"
                >
                  <div
                    ref={mainImageContainerRef}
                    onClick={handleMainImageClick}
                    className={`relative inline-block max-w-full ${isAddPointMode ? "cursor-crosshair" : "cursor-default"} select-none`}
                    style={{ touchAction: draggingInfo ? "none" : "auto" }}
                  >
                    <img
                      ref={mainImageRef}
                      src={activeDoc.main_image_url}
                      alt={activeDoc.title}
                      className="max-h-[750px] w-auto max-w-full object-contain block pointer-events-auto mx-auto select-none rounded-lg"
                      draggable={false}
                    />

                  {/* SVG Overlay for Leader Lines & Directional Arrows */}
                  <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
                    <defs>
                      <marker
                        id="arrowhead-cyan"
                        markerWidth="6"
                        markerHeight="6"
                        refX="4"
                        refY="3"
                        orient="auto"
                      >
                        <polygon points="0 0, 6 3, 0 6" fill="#00C8FF" />
                      </marker>
                      <marker
                        id="arrowhead-amber"
                        markerWidth="6"
                        markerHeight="6"
                        refX="4"
                        refY="3"
                        orient="auto"
                      >
                        <polygon points="0 0, 6 3, 0 6" fill="#F59E0B" />
                      </marker>
                      <marker
                        id="arrowhead-emerald"
                        markerWidth="6"
                        markerHeight="6"
                        refX="4"
                        refY="3"
                        orient="auto"
                      >
                        <polygon points="0 0, 6 3, 0 6" fill="#10B981" />
                      </marker>
                      <marker
                        id="arrowhead-rose"
                        markerWidth="6"
                        markerHeight="6"
                        refX="4"
                        refY="3"
                        orient="auto"
                      >
                        <polygon points="0 0, 6 3, 0 6" fill="#F43F5E" />
                      </marker>
                      <marker
                        id="arrowhead-purple"
                        markerWidth="6"
                        markerHeight="6"
                        refX="4"
                        refY="3"
                        orient="auto"
                      >
                        <polygon points="0 0, 6 3, 0 6" fill="#A855F7" />
                      </marker>
                    </defs>

                    {/* Render Lines from Callout position to Point Pin position */}
                    {points.map((pt) => {
                      const xPin = pt.x_norm * 100;
                      const yPin = pt.y_norm * 100;
                      
                      const defaultCalloutX = pt.x_norm > 0.5 ? pt.x_norm - 0.16 : pt.x_norm + 0.16;
                      const defaultCalloutY = pt.y_norm > 0.5 ? pt.y_norm - 0.12 : pt.y_norm + 0.12;
                      const cX = (typeof pt.callout_x_norm === "number" ? pt.callout_x_norm : defaultCalloutX) * 100;
                      const cY = (typeof pt.callout_y_norm === "number" ? pt.callout_y_norm : defaultCalloutY) * 100;
                      
                      const colorHex = pt.color || "#00C8FF";
                      const markerId =
                        colorHex === "#F59E0B"
                          ? "arrowhead-amber"
                          : colorHex === "#10B981"
                          ? "arrowhead-emerald"
                          : colorHex === "#F43F5E"
                          ? "arrowhead-rose"
                          : colorHex === "#A855F7"
                          ? "arrowhead-purple"
                          : "arrowhead-cyan";

                      const hasPhoto = Array.isArray(pt.photos) && pt.photos.length > 0;

                      return (
                        <g key={`line-${pt.id}`}>
                          {hasPhoto && (
                            <line
                              x1={`${cX}%`}
                              y1={`${cY}%`}
                              x2={`${xPin}%`}
                              y2={`${yPin}%`}
                              stroke={colorHex}
                              strokeWidth="2.5"
                              strokeDasharray="4 2"
                              markerEnd={`url(#${markerId})`}
                              opacity="0.9"
                            />
                          )}
                          <circle
                            cx={`${xPin}%`}
                            cy={`${yPin}%`}
                            r="4.5"
                            fill={colorHex}
                            stroke="#ffffff"
                            strokeWidth="1.5"
                          />
                        </g>
                      );
                    })}
                  </svg>

                  {/* Render Badges and Callout Cards on Main Image */}
                  {points.map((pt) => {
                    const leftPct = pt.x_norm * 100;
                    const topPct = pt.y_norm * 100;
                    const isSelected = selectedPointId === pt.id;
                    const isDraggingThisPin = draggingInfo?.id === pt.id && draggingInfo?.type === "PIN";
                    const isDraggingThisCallout = draggingInfo?.id === pt.id && draggingInfo?.type === "CALLOUT";
                    
                    const firstPhoto = pt.photos?.[0];

                    const defaultCalloutX = pt.x_norm > 0.5 ? pt.x_norm - 0.16 : pt.x_norm + 0.16;
                    const defaultCalloutY = pt.y_norm > 0.5 ? pt.y_norm - 0.12 : pt.y_norm + 0.12;
                    const calloutLeftPct = (typeof pt.callout_x_norm === "number" ? pt.callout_x_norm : defaultCalloutX) * 100;
                    const calloutTopPct = (typeof pt.callout_y_norm === "number" ? pt.callout_y_norm : defaultCalloutY) * 100;

                    return (
                      <React.Fragment key={pt.id}>
                        {/* Target Point Pin (Draggable) */}
                        <div
                          style={{
                            left: `${leftPct}%`,
                            top: `${topPct}%`,
                            transform: "translate(-50%, -50%)",
                            backgroundColor: pt.color || "#00C8FF",
                          }}
                          onMouseDown={(e) => handleStartDragPin(e, pt)}
                          onTouchStart={(e) => handleStartDragPin(e, pt)}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!dragMovedRef.current) {
                              openPointEditor(pt);
                            }
                          }}
                          title={t("doc", "dragPinHint", "Przeciągnij punkt lub kliknij, aby edytować")}
                          className={`absolute z-20 w-8 h-8 rounded-full text-slate-950 font-black text-xs flex items-center justify-center shadow-2xl border-2 border-white select-none transition-transform active:scale-110 ${
                            isDraggingThisPin
                              ? "scale-125 ring-4 ring-white cursor-grabbing z-30"
                              : "cursor-grab hover:scale-115"
                          } ${isSelected ? "ring-4 ring-white/80" : ""}`}
                        >
                          {pt.point_number}
                        </div>

                        {/* Floating Callout Card with Thumbnail (Draggable & Clickable) */}
                        {firstPhoto && (
                          <div
                            style={{
                              left: `${calloutLeftPct}%`,
                              top: `${calloutTopPct}%`,
                              transform: "translate(-50%, -50%)",
                            }}
                            onMouseDown={(e) => handleStartDragCallout(e, pt)}
                            onTouchStart={(e) => handleStartDragCallout(e, pt)}
                            className={`absolute z-20 bg-slate-900/95 border border-white/20 p-2 rounded-xl shadow-2xl backdrop-blur-md flex items-start gap-2.5 group transition-all select-none min-w-[220px] max-w-[360px] ${
                              isDraggingThisCallout
                                ? "scale-105 ring-2 ring-ui-accent cursor-grabbing z-30"
                                : "cursor-grab hover:border-ui-accent hover:shadow-cyan-500/20"
                            }`}
                            title={t("doc", "dragCalloutHint", "Przeciągnij miniaturkę w dowolne miejsce na planie")}
                          >
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!dragMovedRef.current) {
                                  const cleanTitle = (pt.title || "").replace(/^#?\d+\s*[-:]?\s*/, "").trim() || pt.title;
                                  setLightboxData({
                                    url: firstPhoto.url,
                                    title: `Punkt #${pt.point_number}: ${cleanTitle}`,
                                    description: pt.description || undefined,
                                  });
                                }
                              }}
                              className="relative w-12 h-12 shrink-0 rounded-lg overflow-hidden border border-white/10 cursor-pointer group/thumb mt-0.5"
                            >
                              <img
                                src={firstPhoto.url}
                                alt={pt.title}
                                className="w-full h-full object-cover group-hover/thumb:scale-110 transition-transform"
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center">
                                <Maximize2 className="w-3.5 h-3.5 text-white" />
                              </div>
                            </div>

                            <div className="min-w-0 pr-1 flex-1">
                              <div className="flex items-start justify-between gap-1">
                                <p className="text-[11px] font-bold text-white leading-tight break-words">
                                  #{pt.point_number} {(pt.title || "").replace(/^#?\d+\s*[-:]?\s*/, "").trim() || pt.title}
                                </p>
                                <Move className="w-3 h-3 text-ui-muted opacity-60 group-hover:opacity-100 shrink-0 mt-0.5" />
                              </div>
                              {pt.description && (
                                <p className="text-[10px] text-slate-300 font-medium leading-snug mt-1 break-words">
                                  {pt.description}
                                </p>
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const cleanTitle = (pt.title || "").replace(/^#?\d+\s*[-:]?\s*/, "").trim() || pt.title;
                                  setLightboxData({
                                    url: firstPhoto.url,
                                    title: `Punkt #${pt.point_number}: ${cleanTitle}`,
                                    description: pt.description || undefined,
                                  });
                                }}
                                className="text-[9px] text-ui-accent hover:text-white uppercase font-black tracking-wider flex items-center gap-0.5 mt-1.5 transition-colors"
                              >
                                <Maximize2 className="w-2.5 h-2.5" /> {t("doc", "viewFullRes", "Powiększ")}
                              </button>
                            </div>
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Points List & Details (4 cols) */}
            <div className="lg:col-span-4 flex flex-col gap-4">
              <div className="bg-ui-card border border-ui-border rounded-2xl p-5 shadow-xl flex flex-col h-full">
                <div className="flex items-center justify-between pb-3 border-b border-ui-border mb-4">
                  <h3 className="text-sm font-black uppercase tracking-wider text-ui-text flex items-center gap-2">
                    <span>📑</span>
                    <span>{t("doc", "pointsCount", "Punkty")} ({points.length})</span>
                  </h3>
                  <button
                    onClick={handleCreateNewPointFromButton}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${
                      isAddPointMode
                        ? "bg-amber-400 text-slate-950 font-black ring-2 ring-amber-400/50 animate-pulse"
                        : "bg-ui-accent/20 hover:bg-ui-accent/30 text-ui-accent"
                    }`}
                  >
                    {isAddPointMode ? <span>✕</span> : <Plus className="w-3.5 h-3.5" />}
                    <span>{isAddPointMode ? t("doc", "cancel", "Abbrechen") : t("doc", "addPoint", "+ Punkt")}</span>
                  </button>
                </div>

                {points.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center border border-dashed border-ui-border/60 rounded-xl">
                    <Camera className="w-8 h-8 text-ui-muted mb-2 opacity-50" />
                    <p className="text-xs font-bold text-ui-muted uppercase tracking-wider">{t("doc", "emptyTitle", "Brak punktów")}</p>
                    <p className="text-[11px] text-ui-muted mt-1">
                      {t("doc", "clickToAddHint", "Klicke oben auf '+ Punkt hinzufügen' und wähle die Position auf dem Plan.")}
                    </p>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto space-y-3 pr-1 max-h-[640px] custom-scrollbar">
                    {points.map((pt) => (
                      <div
                        key={pt.id}
                        onClick={() => openPointEditor(pt)}
                        className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-3 ${
                          selectedPointId === pt.id
                            ? "bg-ui-accent/15 border-ui-accent/50 shadow-md"
                            : "bg-black/20 border-ui-border hover:border-ui-muted"
                        }`}
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <div
                            style={{ backgroundColor: pt.color || "#00C8FF" }}
                            className="w-7 h-7 rounded-lg text-slate-950 font-black text-xs flex items-center justify-center shrink-0 border border-white/20 mt-0.5"
                          >
                            {pt.point_number}
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-xs font-black uppercase text-ui-text break-words leading-tight">{pt.title}</h4>
                            <p className="text-[11px] text-ui-muted mt-1 break-words whitespace-pre-wrap leading-relaxed">
                              {pt.description || "—"}
                            </p>
                            <span className="text-[10px] font-bold text-ui-accent mt-1.5 inline-block">
                              📸 {pt.photos?.length || 0} {t("doc", "photosCount", "zdjęć")}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openPointEditor(pt);
                            }}
                            className="p-1.5 text-ui-muted hover:text-ui-accent rounded-lg transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeletePoint(pt.id);
                            }}
                            className="p-1.5 text-ui-muted hover:text-ui-danger rounded-lg transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* ══════════════════════════════════════════════════════════
             DASHBOARD VIEW: Grid of Documentation Projects (CENTERED)
             ══════════════════════════════════════════════════════════ */
          <div className="w-full max-w-6xl mx-auto space-y-6 flex flex-col items-center">
            {/* Filters bar */}
            <div className="w-full bg-ui-card border border-ui-border rounded-2xl p-4 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <Folder className="w-4 h-4 text-ui-muted" />
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="bg-black/40 border border-ui-border rounded-xl px-4 py-2.5 text-xs font-bold text-ui-text outline-none cursor-pointer focus:border-ui-accent"
                >
                  <option value="ALL">{t("doc", "allDocs", "Wszystkie projekty")}</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id} className="bg-slate-900">
                      {p.companies?.name ? `[${p.companies.name}] ` : ""}
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="w-full sm:w-72">
                <input
                  type="text"
                  placeholder={t("doc", "docTitlePlaceholder", "Szukaj dokumentacji...")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-black/40 border border-ui-border rounded-xl px-4 py-2.5 text-xs font-bold text-ui-text outline-none focus:border-ui-accent"
                />
              </div>
            </div>

            {/* List / Grid of Documentations */}
            {loadingList ? (
              <div className="py-24 text-center w-full">
                <div className="w-10 h-10 border-4 border-ui-border border-t-ui-accent rounded-full animate-spin mx-auto mb-3"></div>
                <p className="text-xs font-bold uppercase tracking-wider text-ui-muted">{t("doc", "saving", "Ładowanie...")}</p>
              </div>
            ) : filteredDocs.length === 0 ? (
              <div className="py-24 text-center bg-ui-card/50 border border-dashed border-ui-border rounded-2xl p-8 max-w-2xl w-full mx-auto">
                <Camera className="w-12 h-12 text-ui-muted mx-auto mb-3 opacity-40" />
                <h3 className="text-base font-black uppercase text-ui-text mb-1">{t("doc", "emptyTitle", "Brak dokumentacji")}</h3>
                <p className="text-xs text-ui-muted mb-6">
                  {t("doc", "emptySubtitle", "Nie utworzono jeszcze żadnej foto-dokumentacji. Utwórz nowy dokument, aby dodać zdjęcie główne i punkty.")}
                </p>
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="px-6 py-2.5 bg-ui-accent text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider mx-auto"
                >
                  + {t("doc", "newDoc", "Nowy dokument")}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
                {filteredDocs.map((doc) => (
                  <div
                    key={doc.id}
                    onClick={() => openDocumentation(doc.id)}
                    className="bg-ui-card border border-ui-border hover:border-ui-accent/60 rounded-2xl overflow-hidden shadow-xl hover:shadow-2xl transition-all cursor-pointer group flex flex-col"
                  >
                    {/* Main Image Thumbnail */}
                    <div className="relative w-full h-48 bg-slate-950 overflow-hidden">
                      <img
                        src={doc.main_image_url}
                        alt={doc.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>

                      {/* Badges on preview */}
                      <div className="absolute top-3 left-3 flex items-center gap-2">
                        <span className="bg-ui-accent text-slate-950 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg shadow-lg">
                          {(doc as any).points_count || 0} {t("doc", "pointsCount", "Punktów")}
                        </span>
                        <span className="bg-black/60 backdrop-blur-md text-white border border-white/10 text-[10px] font-bold px-2 py-1 rounded-lg">
                          {(doc as any).total_photos_count || 0} {t("doc", "photosCount", "Zdjęć")}
                        </span>
                      </div>

                      <div className="absolute bottom-3 left-3 right-3">
                        <h3 className="text-base font-black text-white uppercase tracking-tight truncate drop-shadow-md">
                          {doc.title}
                        </h3>
                        <p className="text-[11px] font-bold text-slate-300 truncate">
                          {doc.projects?.name || t("doc", "noProject", "Allgemein")}{doc.location ? ` • ${doc.location}` : ""}
                        </p>
                      </div>
                    </div>

                    {/* Card Body */}
                    <div className="p-4 flex-1 flex flex-col justify-between gap-4">
                      {doc.description ? (
                        <p className="text-xs text-ui-muted line-clamp-2">{doc.description}</p>
                      ) : (
                        <p className="text-xs text-ui-muted italic">{t("doc", "descriptionPlaceholder", "—")}</p>
                      )}

                      <div className="flex items-center justify-between pt-3 border-t border-ui-border text-[11px] text-ui-muted font-bold">
                        <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                const fullDoc = await apiGet<any>(`/api/documentation/${doc.id}`);
                                if (fullDoc) {
                                  const docObj = fullDoc.documentation || fullDoc;
                                  const pts = fullDoc.points || docObj.photo_doc_points || docObj.points || [];
                                  handleGeneratePdf(docObj, pts);
                                }
                              } catch (err: any) {
                                alert("Błąd: " + (err?.message || String(err)));
                              }
                            }}
                            className="p-1.5 bg-sky-500/20 text-sky-400 hover:bg-sky-500 hover:text-slate-950 rounded-lg transition-colors"
                            title={t("doc", "downloadPdf", "Pobierz PDF")}
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => handleDeleteDocumentation(doc.id, e)}
                            className="p-1.5 bg-danger/10 text-danger hover:bg-danger hover:text-white rounded-lg transition-colors"
                            title={t("doc", "deleteDoc", "Usuń dokument")}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ══════════════════════════════════════════════════════════
         MODAL 1: CREATE NEW DOCUMENTATION
         ══════════════════════════════════════════════════════════ */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-[100000] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-ui-card border border-ui-border rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto">
            <div className="p-5 border-b border-ui-border flex items-center justify-between bg-white/[0.02]">
              <h2 className="text-lg font-black uppercase text-ui-text flex items-center gap-2">
                <span>📸</span>
                <span>{t("doc", "newDoc", "Nowa Foto-Dokumentacja")}</span>
              </h2>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-2 text-ui-muted hover:text-ui-text rounded-xl"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              {/* Title */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-ui-muted">
                  {t("doc", "docTitleLabel", "Tytuł dokumentacji")} *
                </label>
                <input
                  type="text"
                  placeholder={t("doc", "docTitlePlaceholder", "np. Rozdzielnica Główna RG-1 - Widok zewnętrzny i aparatura")}
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-black/40 border border-ui-border rounded-xl px-4 py-3 text-xs font-bold text-ui-text outline-none focus:border-ui-accent"
                />
              </div>

              {/* Project & Location */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-ui-muted">{t("doc", "project", "Projekt")}</label>
                  <select
                    value={newProjectId}
                    onChange={(e) => setNewProjectId(e.target.value)}
                    className="w-full bg-black/40 border border-ui-border rounded-xl px-4 py-3 text-xs font-bold text-ui-text outline-none focus:border-ui-accent"
                  >
                    <option value="">-- {t("doc", "noProject", "Bez projektu")} --</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id} className="bg-slate-900">
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-ui-muted">{t("doc", "location", "Lokalizacja")}</label>
                  <input
                    type="text"
                    placeholder={t("doc", "locationPlaceholder", "np. Poziom 0, Rozdzielnia Główna")}
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value)}
                    className="w-full bg-black/40 border border-ui-border rounded-xl px-4 py-3 text-xs font-bold text-ui-text outline-none focus:border-ui-accent"
                  />
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-ui-muted">{t("doc", "descriptionLabel", "Opis / Notatki")}</label>
                <textarea
                  rows={2}
                  placeholder={t("doc", "descriptionPlaceholder", "Dodatkowe informacje techniczne lub zakres prac...")}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full bg-black/40 border border-ui-border rounded-xl p-3 text-xs font-bold text-ui-text outline-none focus:border-ui-accent resize-none"
                />
              </div>

              {/* Main Image Upload Dropzone */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-ui-muted">
                  {t("doc", "mainPhotoLabel", "Zdjęcie Główne (Overview)")} *
                </label>
                {newMainImageBase64 ? (
                  <div className="relative rounded-xl overflow-hidden border border-ui-accent max-h-64 bg-slate-950 flex items-center justify-center">
                    <img src={newMainImageBase64} alt="Preview" className="max-h-64 w-auto object-contain" />
                    <button
                      onClick={() => setNewMainImageBase64(null)}
                      className="absolute top-2 right-2 p-2 bg-black/70 rounded-full text-white hover:bg-danger"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <label className="border-2 border-dashed border-ui-border hover:border-ui-accent rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-colors bg-black/20">
                    <Upload className="w-8 h-8 text-ui-accent mb-2" />
                    <span className="text-xs font-black uppercase text-ui-text">{t("doc", "chooseMainPhoto", "Kliknij lub przeciągnij zdjęcie główne")}</span>
                    <span className="text-[10px] text-ui-muted mt-1">JPG, PNG, WEBP (max 25MB)</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setNewMainImageName(file.name);
                          const b64 = await fileToBase64(file);
                          setNewMainImageBase64(b64);
                        }
                      }}
                    />
                  </label>
                )}
              </div>
            </div>

            <div className="p-5 border-t border-ui-border flex items-center justify-end gap-3 bg-white/[0.02]">
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="px-5 py-2.5 bg-ui-card border border-ui-border rounded-xl text-xs font-bold uppercase text-ui-muted hover:text-ui-text"
              >
                {t("doc", "cancel", "Anuluj")}
              </button>
              <button
                onClick={handleCreateDocumentation}
                disabled={creatingDoc || !newTitle.trim() || !newMainImageBase64}
                className="px-6 py-2.5 bg-ui-accent text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider disabled:opacity-50 flex items-center gap-2"
              >
                {creatingDoc ? <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div> : null}
                <span>{creatingDoc ? t("doc", "saving", "Tworzenie...") : t("doc", "save", "Utwórz dokumentację")}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
         MODAL 2: EDIT POINT & SUB-PHOTOS
         ══════════════════════════════════════════════════════════ */}
      {isPointModalOpen && editingPoint && (
        <div className="fixed inset-0 z-[100000] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-ui-card border border-ui-border rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto">
            <div className="p-5 border-b border-ui-border flex items-center justify-between bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div
                  style={{ backgroundColor: pointColor }}
                  className="w-7 h-7 rounded-lg text-slate-950 font-black text-xs flex items-center justify-center"
                >
                  #{editingPoint.point_number}
                </div>
                <h2 className="text-base font-black uppercase text-ui-text">
                  {t("doc", "pointTitleLabel", "Szczegóły Punktu")} #{editingPoint.point_number}
                </h2>
              </div>
              <button
                onClick={() => setIsPointModalOpen(false)}
                className="p-2 text-ui-muted hover:text-ui-text rounded-xl"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5">
              {/* Title & Color */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-ui-muted">
                    {t("doc", "pointTitleLabel", "Tytuł punktu")} *
                  </label>
                  <input
                    type="text"
                    placeholder={t("doc", "pointTitlePlaceholder", "np. Wyłącznik główny Q1")}
                    value={pointTitle}
                    onChange={(e) => setPointTitle(e.target.value)}
                    className="w-full bg-black/40 border border-ui-border rounded-xl px-4 py-3 text-xs font-bold text-ui-text outline-none focus:border-ui-accent"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-ui-muted">{t("doc", "colorLabel", "Kolor znacznika")}</label>
                  <div className="flex items-center gap-2 pt-1.5">
                    {COLOR_PRESETS.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setPointColor(c.hex)}
                        style={{ backgroundColor: c.hex }}
                        className={`w-6 h-6 rounded-full border-2 transition-transform ${
                          pointColor === c.hex ? "border-white scale-125" : "border-transparent"
                        }`}
                        title={c.name}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-ui-muted">
                  {t("doc", "pointDescLabel", "Opis / Notatki techniczne")}
                </label>
                <textarea
                  rows={3}
                  placeholder={t("doc", "pointDescPlaceholder", "np. Zabezpieczenie 63A, stan poprawny, wykonano pomiar termowizyjny...")}
                  value={pointDesc}
                  onChange={(e) => setPointDesc(e.target.value)}
                  className="w-full bg-black/40 border border-ui-border rounded-xl p-3 text-xs font-bold text-ui-text outline-none focus:border-ui-accent resize-none"
                />
              </div>

              {/* Sub-Photos Gallery */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black uppercase tracking-wider text-ui-muted">
                    {t("doc", "subPhotosLabel", "Zdjęcia szczegółowe")} ({pointPhotos.length})
                  </label>
                  <label className="px-3 py-1.5 bg-ui-accent text-slate-950 font-black rounded-lg text-[10px] uppercase cursor-pointer flex items-center gap-1 hover:bg-ui-accent/90">
                    <Camera className="w-3.5 h-3.5" />
                    <span>+ {t("doc", "addSubPhotos", "Dodaj zdjęcie")}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleUploadSubPhoto(f);
                      }}
                    />
                  </label>
                </div>

                {uploadingPointPhoto && (
                  <div className="p-4 bg-ui-accent/10 border border-ui-accent/30 rounded-xl flex items-center gap-2 text-xs text-ui-accent font-bold">
                    <div className="w-4 h-4 border-2 border-ui-accent border-t-transparent rounded-full animate-spin"></div>
                    <span>{t("doc", "saving", "Wysyłanie zdjęcia...")}</span>
                  </div>
                )}

                {pointPhotos.length === 0 && !uploadingPointPhoto ? (
                  <div className="p-6 border border-dashed border-ui-border rounded-xl text-center text-ui-muted text-xs">
                    {t("doc", "emptySubtitle", "Brak zdjęć dla tego punktu. Kliknij '+ Dodaj zdjęcie', aby wstawić zbliżenie lub detal.")}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {pointPhotos.map((ph, idx) => (
                      <div
                        key={ph.id || idx}
                        className="group relative rounded-xl overflow-hidden border border-ui-border bg-slate-950 aspect-video flex items-center justify-center cursor-pointer"
                        onClick={() => {
                          const cleanTitle = (editingPoint.title || "").replace(/^#?\d+\s*[-:]?\s*/, "").trim() || editingPoint.title;
                          setLightboxData({
                            url: ph.url,
                            title: `Punkt #${editingPoint.point_number}: ${cleanTitle}`,
                            description: editingPoint.description || ph.caption || undefined,
                          });
                        }}
                      >
                        <img src={ph.url} alt="Sub-Photo" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <span className="text-[10px] text-white font-bold uppercase flex items-center gap-1">
                            <Maximize2 className="w-3 h-3" /> {t("doc", "viewFullRes", "Pełny ekran")}
                          </span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemovePhoto(idx);
                          }}
                          className="absolute top-1 right-1 p-1 bg-black/70 hover:bg-danger text-white rounded-md transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-5 border-t border-ui-border flex items-center justify-between gap-3 bg-white/[0.02]">
              {!editingPoint.id.startsWith("temp-") ? (
                <button
                  onClick={() => handleDeletePoint(editingPoint.id)}
                  className="px-4 py-2.5 bg-danger/10 text-danger hover:bg-danger hover:text-white rounded-xl text-xs font-bold uppercase transition-colors flex items-center gap-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{t("doc", "deletePoint", "Usuń punkt")}</span>
                </button>
              ) : <div></div>}

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsPointModalOpen(false)}
                  className="px-4 py-2.5 bg-ui-card border border-ui-border rounded-xl text-xs font-bold uppercase text-ui-muted hover:text-ui-text"
                >
                  {t("doc", "cancel", "Anuluj")}
                </button>
                <button
                  onClick={handleSavePoint}
                  disabled={savingPoint || !pointTitle.trim()}
                  className="px-6 py-2.5 bg-ui-accent text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider disabled:opacity-50 flex items-center gap-2"
                >
                  {savingPoint ? <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div> : null}
                  <span>{savingPoint ? t("doc", "savingPoint", "Zapisywanie...") : t("doc", "savePoint", "Zapisz punkt")}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
         PHOTO LIGHTBOX FOR FULL ORIGINAL RESOLUTION VIEW
         ══════════════════════════════════════════════════════════ */}
      {lightboxData && (
        <PhotoLightbox
          url={lightboxData.url}
          title={lightboxData.title}
          description={lightboxData.description}
          onClose={() => setLightboxData(null)}
        />
      )}
    </div>
  );
}
