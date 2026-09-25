"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  FileText,
  Upload,
  Sparkles,
  Download,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Camera,
  Layers,
  Search,
  Building2,
  MapPin,
  MoreVertical,
  Check,
  X,
  XCircle,
  Eye,
  EyeOff,
  LayoutGrid,
  Table as TableIcon,
  ChevronRight,
  ShieldCheck,
  UserCheck,
  SlidersHorizontal,
  HelpCircle,
  Edit3,
  FilePlus,
  Plus,
} from "lucide-react";
import { apiGet, getToken } from "@/lib/apiClient";
import {
  MaengelanzeigeDocument,
  MaengelanzeigeItem,
  MangelStatus,
  ReportConfig,
  DEFAULT_REPORT_CONFIG,
} from "@/types/maengelanzeige";
import { MangelEditModal } from "@/components/maengelanzeige/MangelEditModal";
import { ReportConfigModal } from "@/components/maengelanzeige/ReportConfigModal";
import { ReportPreviewModal } from "@/components/maengelanzeige/ReportPreviewModal";
import { CreateManualDocumentModal } from "@/components/maengelanzeige/CreateManualDocumentModal";
import { AddMangelModal } from "@/components/maengelanzeige/AddMangelModal";
import PhotoLightbox from "@/components/PhotoLightbox";
import { pdf } from "@react-pdf/renderer";
import MaengelanzeigePdf from "@/app/reports/MaengelanzeigePdf";

interface Project {
  id: string;
  name: string;
  address?: string | null;
  companies?: { name: string } | null;
}

const REPORT_CONFIG_STORAGE_KEY = "inspecthero_maengelanzeige_report_config";

export default function MaengelanzeigePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [documents, setDocuments] = useState<MaengelanzeigeDocument[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [items, setItems] = useState<MaengelanzeigeItem[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);

  // Document rename state
  const [showRenameDocModal, setShowRenameDocModal] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState("");
  const [renamingDoc, setRenamingDoc] = useState(false);

  // Status Filter: ALL | OPEN | IN_PROGRESS | ZU_KLAEREN | DONE | NOT_RELEVANT | WITH_USER_DOC | WITH_AFTER_PHOTOS
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "OPEN" | "IN_PROGRESS" | "ZU_KLAEREN" | "DONE" | "NOT_RELEVANT" | "WITH_USER_DOC" | "WITH_AFTER_PHOTOS"
  >("ALL");

  // View mode: CARDS (default) vs TABLE
  const [viewMode, setViewMode] = useState<"CARDS" | "TABLE">("CARDS");

  // Search query
  const [searchQuery, setSearchQuery] = useState("");

  // Global Report Configuration (Defaults for all Mängel)
  const [globalReportConfig, setGlobalReportConfig] = useState<ReportConfig>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(REPORT_CONFIG_STORAGE_KEY);
        if (saved) return JSON.parse(saved);
      } catch (e) {
        console.warn("Could not load report config from localStorage", e);
      }
    }
    return DEFAULT_REPORT_CONFIG;
  });

  // Modal states
  const [showGlobalConfigModal, setShowGlobalConfigModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [individualConfigItem, setIndividualConfigItem] = useState<MaengelanzeigeItem | null>(null);

  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState("");
  const [scanProgress, setScanProgress] = useState<{ current: number; total: number; itemsFound: number } | null>(null);

  // Manual Document & Add Mangel modals
  const [showCreateManualDocModal, setShowCreateManualDocModal] = useState(false);
  const [showAddMangelModal, setShowAddMangelModal] = useState(false);

  // Edit Modal
  const [editingItem, setEditingItem] = useState<MaengelanzeigeItem | null>(null);

  // Fullscreen Photo Lightbox state
  const [lightboxPhoto, setLightboxPhoto] = useState<{
    url: string | null;
    description?: string | null;
    author?: string | null;
    createdAt?: string | null;
  } | null>(null);

  // PDF Export state
  const [exportingPdf, setExportingPdf] = useState(false);

  // User profile & role
  const [currentUser, setCurrentUser] = useState<{ id: string; role: string; email?: string } | null>(null);
  const isAdmin = currentUser
    ? currentUser.role?.toUpperCase() === "ADMIN" || currentUser.role?.toUpperCase() === "MODERATOR"
    : false;

  // Context menu state for ⋯ menu
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Persist global report configuration
  const handleSaveGlobalConfig = (newConfig: ReportConfig) => {
    setGlobalReportConfig(newConfig);
    try {
      localStorage.setItem(REPORT_CONFIG_STORAGE_KEY, JSON.stringify(newConfig));
    } catch (e) {
      console.warn("Could not save report config to localStorage", e);
    }
  };

  // Close context menu on outside click
  useEffect(() => {
    const handleClickOutside = () => setActiveMenuId(null);
    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, []);

  // 1. Load user profile & projects on mount
  useEffect(() => {
    apiGet<{ profile: { id: string; role: string; email?: string } }>("/api/me")
      .then((res) => {
        if (res?.profile) {
          setCurrentUser(res.profile);
        }
      })
      .catch((err) => console.error("Error loading user profile:", err));

    apiGet<Project[]>("/api/projects")
      .then((data) => {
        setProjects(data || []);
        if (data && data.length > 0) {
          setSelectedProjectId(data[0].id);
        }
      })
      .catch((err) => console.error("Error loading projects:", err));
  }, []);

  // 2. Load documents when project changes
  useEffect(() => {
    if (!selectedProjectId) {
      setDocuments([]);
      setSelectedDocId(null);
      return;
    }

    loadDocuments();
  }, [selectedProjectId]);

  const loadDocuments = async () => {
    setLoadingDocs(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/maengelanzeige/documents?projectId=${encodeURIComponent(selectedProjectId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await res.text();
      let json: any = {};
      try {
        json = JSON.parse(text);
      } catch {
        console.warn("Could not parse documents response:", text);
      }

      if (json.ok && json.data) {
        setDocuments(json.data);
        if (json.data.length > 0) {
          setSelectedDocId((prev) => (prev && json.data.some((d: any) => d.id === prev) ? prev : json.data[0].id));
        } else {
          setSelectedDocId(null);
          setItems([]);
        }
      }
    } catch (err) {
      console.error("Error loading documents:", err);
    } finally {
      setLoadingDocs(false);
    }
  };

  // 3. Load items when selected document changes
  useEffect(() => {
    if (!selectedDocId) {
      setItems([]);
      return;
    }

    loadItems(selectedDocId);
  }, [selectedDocId]);

  const loadItems = async (docId: string) => {
    setLoadingItems(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/maengelanzeige/items?documentId=${encodeURIComponent(docId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await res.text();
      let json: any = {};
      try {
        json = JSON.parse(text);
      } catch {
        console.warn("Could not parse items response:", text);
      }

      if (json.ok && json.data) {
        setItems(json.data);
      }
    } catch (err) {
      console.error("Error loading items:", err);
    } finally {
      setLoadingItems(false);
    }
  };

  // Progressive Upload & Page-by-Page Scan
  const handleUploadAndScan = async () => {
    if (!uploadFile || !selectedProjectId) return;

    setScanning(true);
    setScanStatus("PDF wird hochgeladen & Seiten werden vorbereitet...");
    setScanProgress(null);

    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          const clean = result.replace(/^data:application\/pdf;base64,/, "");
          resolve(clean);
        };
        reader.onerror = reject;
      });

      reader.readAsDataURL(uploadFile);
      const base64Data = await base64Promise;

      const token = await getToken();
      
      // Step 1: Initialize document record & extract text per page (ultra-fast <1s)
      const initRes = await fetch("/api/maengelanzeige/scan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          projectId: selectedProjectId,
          fileData: base64Data,
          fileName: uploadFile.name,
          title: uploadTitle.trim() || uploadFile.name.replace(/\.pdf$/i, ""),
        }),
      });

      const initText = await initRes.text();
      let initJson: any;
      try {
        initJson = JSON.parse(initText);
      } catch {
        throw new Error(`Serverfehler (${initRes.status}): Ungültige Antwort beim Hochladen.`);
      }

      if (!initRes.ok || !initJson.ok || !initJson.data) {
        throw new Error(initJson.error?.message || "Fehler beim Vorbereiten des Dokuments");
      }

      const doc = initJson.data.document;
      const pages: Array<{ page: number; text: string }> = initJson.data.pages || [];
      const totalPages = initJson.data.totalPages || pages.length || 1;

      // Select document immediately in UI
      await loadDocuments();
      setSelectedDocId(doc.id);

      let totalItemsFound = 0;
      setScanProgress({ current: 0, total: totalPages, itemsFound: 0 });

      // Step 2: Progressive page-by-page AI scanning (Incremental Worker)
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        setScanStatus(
          `AI analysiert Seite ${p.page} von ${totalPages}... (Gefundene Punkte: ${totalItemsFound})`
        );
        setScanProgress({ current: p.page, total: totalPages, itemsFound: totalItemsFound });

        try {
          const pageRes = await fetch("/api/maengelanzeige/process-page", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              documentId: doc.id,
              projectId: selectedProjectId,
              pageNumber: p.page,
              pageText: p.text,
              startIndex: totalItemsFound,
              storagePath: doc.storage_path,
            }),
          });

          if (pageRes.ok) {
            const pageData = await pageRes.json();
            if (pageData.ok && Array.isArray(pageData.items)) {
              totalItemsFound += pageData.items.length;
              setScanProgress({ current: p.page, total: totalPages, itemsFound: totalItemsFound });
              // Live update items list
              setItems((prev) => [...prev, ...pageData.items]);
            }
          }
        } catch (pageErr) {
          console.warn(`Error scanning page ${p.page}:`, pageErr);
        }
      }

      // Step 3: Finalize document status to ACTIVE
      try {
        await fetch("/api/maengelanzeige/documents", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            id: doc.id,
            status: "ACTIVE",
          }),
        });
      } catch (patchErr) {
        console.warn("Could not patch document status to ACTIVE:", patchErr);
      }

      setScanStatus(`Fertig! ${totalItemsFound} Punkte erfolgreich erkannt.`);
      await loadDocuments();
      await loadItems(doc.id);

      setShowUploadModal(false);
      setUploadFile(null);
      setUploadTitle("");
    } catch (err: any) {
      alert("Fehler: " + (err.message || String(err)));
    } finally {
      setScanning(false);
      setScanStatus("");
      setScanProgress(null);
    }
  };

  // Change Item Status (Quick action from menu or UI)
  const handleChangeStatus = async (item: MaengelanzeigeItem, newStatus: MangelStatus, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setActiveMenuId(null);

    // Optimistic update
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, status: newStatus } : i))
    );

    try {
      const token = await getToken();
      await fetch("/api/maengelanzeige/items", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: item.id,
          status: newStatus,
        }),
      });
    } catch (err) {
      console.error("Error updating status:", err);
      // Rollback on error
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: item.status } : i))
      );
    }
  };

  // Individual Report Config for an Item
  const handleSaveIndividualConfig = async (item: MaengelanzeigeItem, newConfig: ReportConfig) => {
    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id
          ? {
              ...i,
              custom_report_config: newConfig,
              export_include_before_photos: newConfig.includeBeforePhotos,
              export_include_after_photos: newConfig.includeAfterPhotos,
              export_include_admin_doc: newConfig.includeAdminDoc,
              export_include_user_doc: newConfig.includeUserDoc,
            }
          : i
      )
    );

    try {
      const token = await getToken();
      await fetch("/api/maengelanzeige/items", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: item.id,
          export_include_before_photos: newConfig.includeBeforePhotos,
          export_include_after_photos: newConfig.includeAfterPhotos,
          export_include_admin_doc: newConfig.includeAdminDoc,
          export_include_user_doc: newConfig.includeUserDoc,
        }),
      });
    } catch (err) {
      console.error("Error saving individual report config:", err);
    }
  };

  // Reset Item to Standard (Global) Config
  const handleResetItemToDefaultConfig = async (item: MaengelanzeigeItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setActiveMenuId(null);

    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id
          ? {
              ...i,
              custom_report_config: null,
              export_include_before_photos: undefined,
              export_include_after_photos: undefined,
              export_include_admin_doc: undefined,
              export_include_user_doc: undefined,
            }
          : i
      )
    );
  };

  // Toggle Item is_selected (Im Bericht anzeigen / Nicht im Bericht)
  const handleToggleReportSelection = async (item: MaengelanzeigeItem, showInReport: boolean, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setActiveMenuId(null);

    // Optimistic update
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, is_selected: showInReport } : i))
    );

    try {
      const token = await getToken();
      await fetch("/api/maengelanzeige/items", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: item.id,
          is_selected: showInReport,
        }),
      });
    } catch (err) {
      console.error("Error updating item report selection:", err);
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, is_selected: item.is_selected } : i))
      );
    }
  };

  // Delete Document
  const handleDeleteDocument = async (docId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const docToDelete = documents.find((d) => d.id === docId);
    const title = docToDelete?.title || "dieses Dokument";
    if (!confirm(`Möchten Sie "${title}" und alle zugehörigen Punkte/Fotos wirklich unwiderruflich löschen?`)) {
      return;
    }

    try {
      const token = await getToken();
      const res = await fetch(`/api/maengelanzeige/documents?id=${encodeURIComponent(docId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.ok) {
        const remainingDocs = documents.filter((d) => d.id !== docId);
        setDocuments(remainingDocs);
        if (remainingDocs.length > 0) {
          setSelectedDocId(remainingDocs[0].id);
        } else {
          setSelectedDocId(null);
          setItems([]);
        }
      } else {
        alert(json.error?.message || "Fehler beim Löschen des Dokuments");
      }
    } catch (err: any) {
      console.error("Error deleting document:", err);
      alert("Fehler beim Löschen: " + (err.message || String(err)));
    }
  };

  // Delete Individual Item / Mangel
  const handleDeleteItem = async (item: MaengelanzeigeItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setActiveMenuId(null);

    if (!isAdmin) {
      alert("Nur Admins können Mängel löschen.");
      return;
    }

    if (!confirm(`Möchten Sie Mangel ${item.item_number} wirklich unwiderruflich löschen?`)) {
      return;
    }

    // Optimistic update
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    setDocuments((prev) =>
      prev.map((d) =>
        d.id === selectedDocId
          ? {
              ...d,
              items_count: Math.max(0, (d.items_count || 1) - 1),
              selected_count: item.is_selected !== false ? Math.max(0, (d.selected_count || 1) - 1) : d.selected_count,
            }
          : d
      )
    );

    try {
      const token = await getToken();
      const res = await fetch(`/api/maengelanzeige/items?id=${encodeURIComponent(item.id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!json.ok) {
        throw new Error(json.error?.message || "Fehler beim Löschen");
      }
    } catch (err: any) {
      console.error("Error deleting item:", err);
      alert("Fehler beim Löschen des Mangels: " + (err.message || String(err)));
      if (selectedDocId) loadItems(selectedDocId);
    }
  };

  // Helper to convert photo URL to Base64 JPEG for @react-pdf/renderer (standard optimized preview)
  const convertPhotoUrlToBase64 = async (rawUrl: string): Promise<string | null> => {
    try {
      if (!rawUrl) return null;
      let url = rawUrl;
      if (url.includes("127.0.0.1:54321") || url.includes("localhost:54321")) {
        url = url.replace(/https?:\/\/(127\.0\.0\.1|localhost):54321/, "https://api.et4u.de");
      }

      const res = await fetch(url);
      if (!res.ok) {
        console.warn("Failed to fetch photo for PDF:", url, res.status);
        return null;
      }
      const blob = await res.blob();
      if (blob.size === 0) return null;

      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      return new Promise((resolve) => {
        const img = new window.Image();
        img.onload = () => {
          try {
            const maxDim = 1000;
            const compression = 0.82;
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
              resolve(dataUrl);
              return;
            }
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL("image/jpeg", compression));
          } catch {
            resolve(dataUrl);
          }
        };
        img.onerror = () => resolve(dataUrl);
        img.src = dataUrl;
      });
    } catch (e) {
      console.error("Error converting photo to base64 for PDF:", e);
      return null;
    }
  };

  // Rename Document
  const handleRenameDocument = async () => {
    if (!currentDoc || !newDocTitle.trim()) return;
    setRenamingDoc(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/maengelanzeige/documents", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}`, "X-App-Token": token } : {}),
        },
        body: JSON.stringify({
          id: currentDoc.id,
          title: newDocTitle.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error?.message || "Fehler beim Umbenennen");
      }
      setDocuments((prev) =>
        prev.map((d) => (d.id === currentDoc.id ? { ...d, title: newDocTitle.trim() } : d))
      );
      setShowRenameDocModal(false);
    } catch (err: any) {
      alert("Fehler beim Umbenennen des Dokuments: " + (err.message || "Unbekannter Fehler"));
    } finally {
      setRenamingDoc(false);
    }
  };

  // Generate Report PDF - Exports items where status is in includedStatuses and is_selected !== false
  const handleGenerateReportPdf = async (overrideTitle?: string) => {
    const currentDoc = documents.find((d) => d.id === selectedDocId);
    if (!currentDoc) return;

    // Filter items included in the report matching status configuration
    const includedStatuses = globalReportConfig.includedStatuses || ["OPEN", "IN_PROGRESS", "ZU_KLAEREN", "DONE"];
    const selectedItemsToExport = items.filter(
      (i) =>
        (i.is_selected === true || i.is_selected === undefined) &&
        includedStatuses.includes(i.status as any)
    );

    if (selectedItemsToExport.length === 0) {
      alert("Es gibt keine Mängel mit den gewählten Status-Filtern, die für den Bericht ausgewählt sind.");
      return;
    }

    const titleToUse = (
      (typeof overrideTitle === "string" && overrideTitle.trim()) ||
      globalReportConfig.customReportName?.trim() ||
      currentDoc.title ||
      "Bericht"
    ).trim();

    setExportingPdf(true);
    try {
      const currentProject = projects.find((p) => p.id === selectedProjectId);
      const projectNameFormatted = currentProject
        ? `${currentProject.companies?.name ? `[${currentProject.companies.name.toUpperCase()}] ` : ""}${currentProject.name}`
        : "Projekt";

      // Convert images to base64 for reliable PDF rendering
      const itemsWithBase64Photos = await Promise.all(
        selectedItemsToExport.map(async (item) => {
          if (!item.photos || item.photos.length === 0) return item;

          const photosWithBase64 = await Promise.all(
            item.photos.map(async (photo) => {
              const b64 = await convertPhotoUrlToBase64(photo.url);
              return { ...photo, base64: b64 || photo.url, url: photo.url };
            })
          );

          return { ...item, photosBase64: photosWithBase64 };
        })
      );

      const blob = await pdf(
        <MaengelanzeigePdf
          documentTitle={titleToUse}
          projectName={projectNameFormatted}
          projectAddress={currentProject?.address}
          globalConfig={globalReportConfig}
          items={itemsWithBase64Photos as any}
        />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cleanFileName = `Maengelanzeige_Bericht_${titleToUse.replace(/[/\\?%*:|"<>]/g, "_").replace(/\s+/g, "_")}.pdf`;
      a.download = cleanFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert("Fehler beim Erstellen des PDF-Berichts: " + err.message);
    } finally {
      setExportingPdf(false);
    }
  };

  // KPI Calculations
  const kpiCounts = useMemo(() => {
    let open = 0;
    let inProgress = 0;
    let zuKlaeren = 0;
    let done = 0;
    let notRelevant = 0;
    let withUserDoc = 0;
    let withAfterPhotos = 0;

    items.forEach((item) => {
      if (!isAdmin && item.status === "NOT_RELEVANT") return;

      if (item.status === "DONE") {
        done++;
      } else if (item.status === "IN_PROGRESS") {
        inProgress++;
      } else if (item.status === "ZU_KLAEREN") {
        zuKlaeren++;
      } else if (item.status === "NOT_RELEVANT") {
        notRelevant++;
      } else {
        open++;
      }

      if (item.user_documentation && item.user_documentation.trim()) {
        withUserDoc++;
      }

      const hasAfter = (item.photos || []).some(
        (p) =>
          p.photo_type === "AFTER" ||
          (p.photo_type as any) === "NACHHER" ||
          (!p.photo_type && !(p.caption || "").startsWith("[VORHER]"))
      );
      if (hasAfter) {
        withAfterPhotos++;
      }
    });

    const totalCount = isAdmin ? items.length : items.filter((i) => i.status !== "NOT_RELEVANT").length;

    return {
      all: totalCount,
      open,
      inProgress,
      zuKlaeren,
      done,
      notRelevant,
      withUserDoc,
      withAfterPhotos,
    };
  }, [items, isAdmin]);

  // Filtered items based on statusFilter and searchQuery
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Non-admins never see NOT_RELEVANT items
      if (!isAdmin && item.status === "NOT_RELEVANT") return false;

      // 1. Status Filter
      if (statusFilter === "OPEN") {
        if (item.status !== "OPEN" && item.status) return false;
      } else if (statusFilter === "IN_PROGRESS") {
        if (item.status !== "IN_PROGRESS") return false;
      } else if (statusFilter === "ZU_KLAEREN") {
        if (item.status !== "ZU_KLAEREN") return false;
      } else if (statusFilter === "DONE") {
        if (item.status !== "DONE") return false;
      } else if (statusFilter === "NOT_RELEVANT") {
        if (!isAdmin || item.status !== "NOT_RELEVANT") return false;
      } else if (statusFilter === "WITH_USER_DOC") {
        if (!item.user_documentation || !item.user_documentation.trim()) return false;
      } else if (statusFilter === "WITH_AFTER_PHOTOS") {
        const hasAfter = (item.photos || []).some(
          (p) =>
            p.photo_type === "AFTER" ||
            (p.photo_type as any) === "NACHHER" ||
            (!p.photo_type && !(p.caption || "").startsWith("[VORHER]"))
        );
        if (!hasAfter) return false;
      }

      // 2. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchNum = (item.item_number || "").toLowerCase().includes(q);
        const matchText = (item.original_text || "").toLowerCase().includes(q);
        const matchDoc = (item.our_documentation || "").toLowerCase().includes(q);
        const matchUserDoc = (item.user_documentation || "").toLowerCase().includes(q);
        const matchTrade = (item.trade_or_company || "").toLowerCase().includes(q);
        const matchLoc = (item.location || "").toLowerCase().includes(q);
        if (!matchNum && !matchText && !matchDoc && !matchUserDoc && !matchTrade && !matchLoc) return false;
      }

      return true;
    });
  }, [items, statusFilter, searchQuery, isAdmin]);

  const currentDoc = documents.find((d) => d.id === selectedDocId);
  const currentProject = projects.find((p) => p.id === selectedProjectId);
  const includedReportStatuses = globalReportConfig.includedStatuses || ["OPEN", "IN_PROGRESS", "ZU_KLAEREN", "DONE"];
  const reportCount = items.filter(
    (i) =>
      (i.is_selected === true || i.is_selected === undefined) &&
      includedReportStatuses.includes(i.status as any)
  ).length;

  const nextItemNumber = useMemo(() => {
    if (!items || items.length === 0) return "1";
    const nums = items
      .map((i) => {
        const match = (i.item_number || "").match(/\d+/);
        return match ? parseInt(match[0], 10) : 0;
      })
      .filter((n) => !isNaN(n) && n > 0);
    if (nums.length === 0) return String(items.length + 1);
    return String(Math.max(...nums) + 1);
  }, [items]);

  return (
    <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-8 max-w-7xl">
      {/* ─────────────────────────────────────────────────────────────
          1. HEADER & TOP SELECTION BAR
      ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 sm:mb-8 pb-4 sm:pb-6 border-b border-ui-border">
        {/* Title */}
        <div className="flex items-center gap-3">
          <div className="p-2 sm:p-2.5 rounded-xl bg-ui-accent/20 border border-ui-accent/40 text-ui-accent">
            <FileText className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-ui-text tracking-tight uppercase">
              Mängelanzeige
            </h1>
            <p className="text-[11px] sm:text-xs md:text-sm text-ui-muted font-medium">
              Übersicht, Zuordnung, Dokumentation & Berichtserstellung
            </p>
          </div>
        </div>

        {/* Project & Document Dropdowns + Actions */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Project Selector */}
          <div className="relative min-w-[160px] flex-1 sm:flex-initial">
            <label className="block text-[10px] font-bold text-ui-muted uppercase mb-0.5">
              Projekt
            </label>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-ui-card border border-ui-border text-xs sm:text-sm font-bold text-ui-text focus:outline-none focus:border-ui-accent appearance-none cursor-pointer"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.companies?.name ? `[${p.companies.name.toUpperCase()}] ` : ""}{p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Document Selector */}
          {documents.length > 0 && (
            <div className="flex items-end gap-1.5 min-w-[200px] flex-1 sm:flex-initial">
              <div className="flex-1">
                <label className="block text-[10px] font-bold text-ui-muted uppercase mb-0.5">
                  Dokument
                </label>
                <select
                  value={selectedDocId || ""}
                  onChange={(e) => setSelectedDocId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-ui-card border border-ui-border text-xs sm:text-sm font-bold text-ui-text focus:outline-none focus:border-ui-accent appearance-none cursor-pointer"
                >
                  {documents.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title} ({d.items_count || 0})
                    </option>
                  ))}
                </select>
              </div>

              {/* Rename Document Button */}
              {currentDoc && (
                <button
                  type="button"
                  onClick={() => {
                    setNewDocTitle(currentDoc.title);
                    setShowRenameDocModal(true);
                  }}
                  className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-ui-border text-ui-muted hover:text-ui-accent transition-colors"
                  title="Dokument-Name ändern"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
              )}

              {/* Delete Document Button */}
              {currentDoc && isAdmin && (
                <button
                  type="button"
                  onClick={(e) => handleDeleteDocument(currentDoc.id, e)}
                  className="p-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 hover:text-red-300 transition-colors"
                  title="Mängelliste / Dokument löschen"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {/* Upload Button */}
          <div className="pt-3 sm:pt-4">
            <button
              type="button"
              onClick={() => setShowUploadModal(true)}
              className="flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-ui-border text-ui-text font-bold text-xs sm:text-sm transition-all shadow-sm"
              title="Mängelanzeige PDF hochladen und scannen"
            >
              <Upload className="w-4 h-4 text-ui-accent" />
              <span>+ Dokument hochladen</span>
            </button>
          </div>

          {/* Manuelle Liste Button */}
          <div className="pt-3 sm:pt-4">
            <button
              type="button"
              onClick={() => setShowCreateManualDocModal(true)}
              className="flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-ui-accent/15 hover:bg-ui-accent/25 border border-ui-accent/40 text-ui-accent font-bold text-xs sm:text-sm transition-all shadow-sm active:scale-95"
              title="Neue manuelle Mängelliste für diesen Bauabschnitt / diese Begehung erstellen"
            >
              <FilePlus className="w-4 h-4" />
              <span>+ Manuelle Liste</span>
            </button>
          </div>

          {/* Global Report Config Button */}
          <div className="pt-3 sm:pt-4">
            <button
              type="button"
              onClick={() => setShowGlobalConfigModal(true)}
              className="flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-ui-border text-ui-text font-bold text-xs sm:text-sm transition-all"
              title="Globale Inhalte für den PDF-Bericht einstellen (für alle Mängel)"
            >
              <SlidersHorizontal className="w-4 h-4 text-ui-accent" />
              <span>⚙ Bericht-Inhalt</span>
            </button>
          </div>

          {/* Preview Button */}
          <div className="pt-3 sm:pt-4">
            <button
              type="button"
              onClick={() => setShowPreviewModal(true)}
              disabled={reportCount === 0 || !currentDoc}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-ui-border text-ui-text font-bold text-xs sm:text-sm transition-all disabled:opacity-50"
              title="Bericht-Vorschau anzeigen"
            >
              <Eye className="w-4 h-4 text-blue-400" />
              <span>👁 Vorschau</span>
            </button>
          </div>

          {/* PDF Export Button */}
          <div className="pt-3 sm:pt-4">
            <button
              type="button"
              onClick={() => handleGenerateReportPdf()}
              disabled={exportingPdf || reportCount === 0 || !currentDoc}
              className="flex items-center justify-center gap-2 px-4 sm:px-5 py-2 rounded-xl bg-ui-accent text-black font-black text-xs sm:text-sm tracking-wide transition-all hover:scale-105 active:scale-95 shadow-lg shadow-ui-accent/20 disabled:opacity-50"
              title={`${reportCount} Mängel im Bericht erstellen`}
            >
              <Download className="w-4 h-4" />
              <span>{exportingPdf ? "Erstelle PDF..." : "📄 Bericht PDF"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          2. KPI COUNTERS
      ────────────────────────────────────────────────────────────── */}
      <div className={`grid grid-cols-2 sm:grid-cols-3 ${isAdmin ? "lg:grid-cols-5" : "lg:grid-cols-4"} gap-3 sm:gap-4 mb-6`}>
        {/* 🔴 Offen */}
        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === "OPEN" ? "ALL" : "OPEN")}
          className={`p-4 rounded-2xl border transition-all text-left flex items-center justify-between ${
            statusFilter === "OPEN"
              ? "bg-amber-500/20 border-amber-500 ring-2 ring-amber-500/40 shadow-lg shadow-amber-500/10"
              : "bg-ui-card/80 border-ui-border hover:border-amber-500/40 hover:bg-ui-card"
          }`}
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                Offen
              </span>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-ui-text">
              {kpiCounts.open}
            </p>
          </div>
          <Clock className="w-6 h-6 text-amber-400 opacity-60" />
        </button>

        {/* 🔵 In Bearbeitung */}
        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === "IN_PROGRESS" ? "ALL" : "IN_PROGRESS")}
          className={`p-4 rounded-2xl border transition-all text-left flex items-center justify-between ${
            statusFilter === "IN_PROGRESS"
              ? "bg-blue-500/20 border-blue-500 ring-2 ring-blue-500/40 shadow-lg shadow-blue-500/10"
              : "bg-ui-card/80 border-ui-border hover:border-blue-500/40 hover:bg-ui-card"
          }`}
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-400" />
              <span className="text-xs font-bold text-blue-300 uppercase tracking-wider">
                In Bearbeitung
              </span>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-ui-text">
              {kpiCounts.inProgress}
            </p>
          </div>
          <RefreshCw className="w-6 h-6 text-blue-400 opacity-60" />
        </button>

        {/* 🟣 Zu klären */}
        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === "ZU_KLAEREN" ? "ALL" : "ZU_KLAEREN")}
          className={`p-4 rounded-2xl border transition-all text-left flex items-center justify-between ${
            statusFilter === "ZU_KLAEREN"
              ? "bg-purple-500/20 border-purple-500 ring-2 ring-purple-500/40 shadow-lg shadow-purple-500/10"
              : "bg-ui-card/80 border-ui-border hover:border-purple-500/40 hover:bg-ui-card"
          }`}
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-400" />
              <span className="text-xs font-bold text-purple-300 uppercase tracking-wider">
                Zu klären
              </span>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-ui-text">
              {kpiCounts.zuKlaeren}
            </p>
          </div>
          <HelpCircle className="w-6 h-6 text-purple-400 opacity-60" />
        </button>

        {/* 🟢 Erledigt */}
        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === "DONE" ? "ALL" : "DONE")}
          className={`p-4 rounded-2xl border transition-all text-left flex items-center justify-between ${
            statusFilter === "DONE"
              ? "bg-emerald-500/20 border-emerald-500 ring-2 ring-emerald-500/40 shadow-lg shadow-emerald-500/10"
              : "bg-ui-card/80 border-ui-border hover:border-emerald-500/40 hover:bg-ui-card"
          }`}
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider">
                Erledigt
              </span>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-ui-text">
              {kpiCounts.done}
            </p>
          </div>
          <CheckCircle2 className="w-6 h-6 text-emerald-400 opacity-60" />
        </button>

        {/* ⚪ Nicht relevant */}
        {isAdmin && (
          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === "NOT_RELEVANT" ? "ALL" : "NOT_RELEVANT")}
            className={`p-4 rounded-2xl border transition-all text-left flex items-center justify-between col-span-2 sm:col-span-1 ${
              statusFilter === "NOT_RELEVANT"
                ? "bg-slate-700/40 border-slate-500 ring-2 ring-slate-500/40 shadow-lg"
                : "bg-ui-card/80 border-ui-border hover:border-slate-500/40 hover:bg-ui-card"
            }`}
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Nicht relevant
                </span>
              </div>
              <p className="text-2xl sm:text-3xl font-black text-ui-text">
                {kpiCounts.notRelevant}
              </p>
            </div>
            <AlertCircle className="w-6 h-6 text-slate-400 opacity-60" />
          </button>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          3. FILTER TABS & SEARCH BAR
      ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 mb-6">
        {/* Status Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto p-2 pb-3 sm:pb-2 rounded-2xl border border-ui-border bg-ui-card shadow-sm [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => setStatusFilter("ALL")}
            className={`px-3.5 py-2.5 rounded-xl text-xs font-black transition-all whitespace-nowrap shrink-0 ${
              statusFilter === "ALL"
                ? "bg-ui-accent text-black shadow-md shadow-ui-accent/20"
                : "text-ui-muted hover:text-ui-text hover:bg-white/5"
            }`}
          >
            Alle ({kpiCounts.all})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("OPEN")}
            className={`px-3.5 py-2.5 rounded-xl text-xs font-black transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
              statusFilter === "OPEN"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow"
                : "text-ui-muted hover:text-ui-text hover:bg-white/5"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            Offen ({kpiCounts.open})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("IN_PROGRESS")}
            className={`px-3.5 py-2.5 rounded-xl text-xs font-black transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
              statusFilter === "IN_PROGRESS"
                ? "bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow"
                : "text-ui-muted hover:text-ui-text hover:bg-white/5"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            In Bearbeitung ({kpiCounts.inProgress})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("ZU_KLAEREN")}
            className={`px-3.5 py-2.5 rounded-xl text-xs font-black transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
              statusFilter === "ZU_KLAEREN"
                ? "bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow"
                : "text-ui-muted hover:text-ui-text hover:bg-white/5"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-purple-400" />
            Zu klären ({kpiCounts.zuKlaeren})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("DONE")}
            className={`px-3.5 py-2.5 rounded-xl text-xs font-black transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
              statusFilter === "DONE"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow"
                : "text-ui-muted hover:text-ui-text hover:bg-white/5"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            Erledigt ({kpiCounts.done})
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setStatusFilter("NOT_RELEVANT")}
              className={`px-3.5 py-2.5 rounded-xl text-xs font-black transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                statusFilter === "NOT_RELEVANT"
                  ? "bg-slate-700 text-white shadow"
                  : "text-ui-muted hover:text-ui-text hover:bg-white/5"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-slate-400" />
              Nicht relevant ({kpiCounts.notRelevant})
            </button>
          )}

          {/* Worker Feedback Filter */}
          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === "WITH_USER_DOC" ? "ALL" : "WITH_USER_DOC")}
            className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all whitespace-nowrap flex items-center gap-1.5 ${
              statusFilter === "WITH_USER_DOC"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow"
                : "text-ui-muted hover:text-emerald-300 hover:bg-emerald-500/10"
            }`}
            title="Nur Mängel mit Rückmeldung vom Mitarbeiter anzeigen"
          >
            <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>✍ Rückmeldung ({kpiCounts.withUserDoc})</span>
          </button>

          {/* After Photos Filter */}
          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === "WITH_AFTER_PHOTOS" ? "ALL" : "WITH_AFTER_PHOTOS")}
            className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all whitespace-nowrap flex items-center gap-1.5 ${
              statusFilter === "WITH_AFTER_PHOTOS"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow"
                : "text-ui-muted hover:text-emerald-300 hover:bg-emerald-500/10"
            }`}
            title="Nur Mängel mit Nachher-Fotos anzeigen"
          >
            <Camera className="w-3.5 h-3.5 text-emerald-400" />
            <span>📸 Nachher ({kpiCounts.withAfterPhotos})</span>
          </button>
        </div>

        {/* Search, Action & View Mode Switcher */}
        <div className="flex flex-wrap items-center gap-2">
          {/* + Mangel hinzufügen Button */}
          <button
            type="button"
            onClick={() => setShowAddMangelModal(true)}
            disabled={!currentDoc}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-ui-accent hover:bg-ui-accent/90 text-black font-black text-xs sm:text-sm transition-all shadow-md shadow-ui-accent/20 active:scale-95 disabled:opacity-50 whitespace-nowrap"
            title="Neuen Mangel / Punkt zu diesem Dokument hinzufügen"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>+ Mangel hinzufügen</span>
          </button>

          <div className="relative flex-grow md:w-64">
            <Search className="w-4 h-4 text-ui-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="🔍 Suche nach Punkt, Firma, Ort..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-ui-card border border-ui-border text-xs sm:text-sm text-ui-text placeholder:text-ui-muted focus:outline-none focus:border-ui-accent"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ui-muted hover:text-ui-text"
              >
                ✕
              </button>
            )}
          </div>

          {/* View Toggle */}
          <div className="hidden sm:flex bg-ui-card p-1 rounded-xl border border-ui-border">
            <button
              type="button"
              onClick={() => setViewMode("CARDS")}
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === "CARDS" ? "bg-ui-accent text-black shadow font-black" : "text-ui-muted hover:text-ui-text"
              }`}
              title="Kartenansicht"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("TABLE")}
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === "TABLE" ? "bg-ui-accent text-black shadow font-black" : "text-ui-muted hover:text-ui-text"
              }`}
              title="Tabellenansicht"
            >
              <TableIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          4. MÄNGEL LIST / CARDS
      ────────────────────────────────────────────────────────────── */}
      {loadingItems ? (
        <div className="p-16 text-center bg-ui-card border border-ui-border rounded-2xl">
          <RefreshCw className="w-8 h-8 text-ui-accent animate-spin mx-auto mb-3" />
          <p className="text-sm font-bold text-ui-text">Lade Mängel...</p>
          <p className="text-xs text-ui-muted mt-1">Bitte warten</p>
        </div>
      ) : !currentDoc ? (
        <div className="p-16 text-center bg-ui-card border border-ui-border rounded-2xl">
          <FileText className="w-12 h-12 text-ui-muted mx-auto mb-3 opacity-40" />
          <h3 className="text-base font-bold text-ui-text">Kein Dokument ausgewählt</h3>
          <p className="text-xs text-ui-muted mt-1">
            Wählen Sie ein Dokument aus, laden Sie eine PDF hoch oder erstellen Sie eine manuelle Liste.
          </p>
        </div>
      ) : items.length === 0 ? (
        <div className="p-16 text-center bg-ui-card border border-ui-border rounded-3xl flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-ui-accent/15 border border-ui-accent/30 flex items-center justify-center text-ui-accent">
            <FilePlus className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-black text-ui-text">Diese Liste hat noch keine Mängel</h3>
            <p className="text-xs text-ui-muted max-w-md">
              Fügen Sie den ersten Mangel mit Beschreibung, Gewerk, Ort und Vorher-Fotos hinzu.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddMangelModal(true)}
            className="mt-2 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-ui-accent hover:bg-ui-accent/90 text-black font-black text-xs transition-all shadow-lg shadow-ui-accent/20 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>+ Ersten Mangel hinzufügen</span>
          </button>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="p-16 text-center bg-ui-card border border-ui-border rounded-2xl">
          <p className="text-sm font-bold text-ui-text">Keine Mängel gefunden</p>
          <p className="text-xs text-ui-muted mt-1">
            {searchQuery
              ? `Keine Treffer für "${searchQuery}".`
              : "In dieser Kategorie befinden sich aktuell keine Mängel."}
          </p>
        </div>
      ) : viewMode === "CARDS" ? (
        /* === CLEAN SIMPLIFIED CARDS VIEW (2 COLUMNS) === */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
          {filteredItems.map((item) => {
            const photosCount = item.photos?.length || 0;
            const hasBauleitung = !!item.our_documentation;
            const hasRueckmeldung = !!item.user_documentation;
            const isMenuOpen = activeMenuId === item.id;
            const isSelected = item.is_selected !== false;
            const hasCustomConfig = !!item.custom_report_config;

            // Status Styling
            let statusColor = "bg-amber-500/20 text-amber-300 border-amber-500/40";
            let statusLabel = "Offen";
            let statusDot = "bg-amber-400";
            if (item.status === "IN_PROGRESS") {
              statusColor = "bg-blue-500/20 text-blue-300 border-blue-500/40";
              statusLabel = "In Bearbeitung";
              statusDot = "bg-blue-400";
            } else if (item.status === "ZU_KLAEREN") {
              statusColor = "bg-purple-500/20 text-purple-300 border-purple-500/40";
              statusLabel = "Zu klären";
              statusDot = "bg-purple-400";
            } else if (item.status === "DONE") {
              statusColor = "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
              statusLabel = "Erledigt";
              statusDot = "bg-emerald-400";
            } else if (item.status === "NOT_RELEVANT") {
              statusColor = "bg-slate-700/50 text-slate-300 border-slate-600";
              statusLabel = "Nicht relevant";
              statusDot = "bg-slate-400";
            }

            return (
              <div
                key={item.id}
                onClick={() => setEditingItem(item)}
                className={`group relative p-4 sm:p-5 rounded-2xl border transition-all cursor-pointer bg-ui-card/90 hover:bg-ui-card shadow-sm hover:shadow-xl hover:border-ui-accent/50 flex flex-col justify-between ${
                  !isSelected ? "opacity-60" : "opacity-100"
                }`}
              >
                <div>
                  {/* Card Header: Mangel Nr. + Page + Report Badge + Context Menu */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-3 py-1 rounded-xl bg-ui-accent/20 border border-ui-accent/40 text-ui-accent font-black text-sm tracking-wide">
                        Mangel {item.item_number}
                      </span>
                      <span className="text-xs text-ui-muted font-medium">
                        Seite {item.page_number}
                      </span>
                      {hasCustomConfig ? (
                        <span className="text-[10px] font-bold text-blue-300 bg-blue-500/15 px-2 py-0.5 rounded-md border border-blue-500/30">
                          Bericht: Individuell
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium text-ui-muted bg-white/5 px-2 py-0.5 rounded-md border border-white/10">
                          Bericht: Standard
                        </span>
                      )}
                    </div>

                    {/* ⋯ Context Menu */}
                    <div className="relative" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuId(isMenuOpen ? null : item.id);
                        }}
                        className="p-1.5 rounded-lg text-ui-muted hover:text-ui-text hover:bg-white/10 transition-colors"
                        title="Optionen"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {/* Dropdown Menu */}
                      {isMenuOpen && (
                        <div className="absolute right-0 top-8 z-50 w-64 rounded-2xl bg-ui-card border border-ui-border shadow-2xl p-1.5 space-y-1 animate-in fade-in zoom-in-95 duration-150">
                          {/* Individual Config Option */}
                          <div className="px-3 py-1.5 text-[10px] font-black uppercase text-ui-muted tracking-wider border-b border-ui-border/40">
                            Bericht-Inhalt
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuId(null);
                              setIndividualConfigItem(item);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-ui-text hover:bg-white/10 text-left transition-colors"
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5 text-ui-accent" />
                            <span>Bericht-Inhalt individuell festlegen</span>
                          </button>

                          {hasCustomConfig && (
                            <button
                              type="button"
                              onClick={(e) => handleResetItemToDefaultConfig(item, e)}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-ui-muted hover:text-ui-text hover:bg-white/10 text-left transition-colors"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span>Standard verwenden</span>
                            </button>
                          )}

                          <div className="border-t border-ui-border/40 my-1" />

                          {/* Status changer - ONLY for Admin */}
                          {isAdmin ? (
                            <>
                              <div className="px-3 py-1.5 text-[10px] font-black uppercase text-ui-muted tracking-wider">
                                Status ändern
                              </div>
                              <button
                                type="button"
                                onClick={(e) => handleChangeStatus(item, "OPEN", e)}
                                className="w-full flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold text-amber-300 hover:bg-amber-500/20 text-left transition-colors"
                              >
                                <span className="w-2 h-2 rounded-full bg-amber-400" />
                                🔴 Offen
                              </button>
                              <button
                                type="button"
                                onClick={(e) => handleChangeStatus(item, "IN_PROGRESS", e)}
                                className="w-full flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold text-blue-300 hover:bg-blue-500/20 text-left transition-colors"
                              >
                                <span className="w-2 h-2 rounded-full bg-blue-400" />
                                🔵 In Bearbeitung
                              </button>
                              <button
                                type="button"
                                onClick={(e) => handleChangeStatus(item, "ZU_KLAEREN", e)}
                                className="w-full flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold text-purple-300 hover:bg-purple-500/20 text-left transition-colors"
                              >
                                <span className="w-2 h-2 rounded-full bg-purple-400" />
                                🟣 Zu klären
                              </button>
                              <button
                                type="button"
                                onClick={(e) => handleChangeStatus(item, "DONE", e)}
                                className="w-full flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold text-emerald-300 hover:bg-emerald-500/20 text-left transition-colors"
                              >
                                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                                🟢 Erledigt
                              </button>
                              <button
                                type="button"
                                onClick={(e) => handleChangeStatus(item, "NOT_RELEVANT", e)}
                                className="w-full flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-300 hover:bg-slate-700/50 text-left transition-colors"
                              >
                                <span className="w-2 h-2 rounded-full bg-slate-400" />
                                ⚪ Nicht relevant
                              </button>
                            </>
                          ) : (
                            <div className="px-3 py-2 text-[11px] font-medium text-amber-300/80 bg-amber-500/10 rounded-xl border border-amber-500/20 flex items-center gap-1.5">
                              <ShieldCheck className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                              <span>Statusänderung nur durch Admin</span>
                            </div>
                          )}

                          <div className="border-t border-ui-border/40 my-1" />

                          {/* Report Inclusion */}
                          <div className="px-3 py-1.5 text-[10px] font-black uppercase text-ui-muted tracking-wider">
                            Im Bericht ein-/ausblenden
                          </div>
                          {isSelected ? (
                            <button
                              type="button"
                              onClick={(e) => handleToggleReportSelection(item, false, e)}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-red-300 hover:bg-red-500/20 text-left transition-colors"
                            >
                              <EyeOff className="w-3.5 h-3.5 text-red-400" />
                              Nicht im Bericht
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => handleToggleReportSelection(item, true, e)}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-emerald-300 hover:bg-emerald-500/20 text-left transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5 text-emerald-400" />
                              Im Bericht anzeigen
                            </button>
                          )}

                          {/* Delete Mangel option for Admin */}
                          {isAdmin && (
                            <>
                              <div className="border-t border-ui-border/40 my-1" />
                              <button
                                type="button"
                                onClick={(e) => handleDeleteItem(item, e)}
                                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-red-400 hover:bg-red-500/20 text-left transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                <span>Mangel löschen</span>
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Gewerk / Firma & Ort / Raum */}
                  <div className="space-y-1.5 mb-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-ui-text truncate">
                      <Building2 className="w-4 h-4 text-ui-accent flex-shrink-0" />
                      <span className="truncate">
                        🔧 {item.trade_or_company || "Kein Gewerk angegeben"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-medium text-ui-muted truncate">
                      <MapPin className="w-4 h-4 text-amber-400 flex-shrink-0" />
                      <span className="truncate">
                        📍 {item.location || "Kein Raum angegeben"}
                      </span>
                    </div>
                  </div>

                  {/* Original Text Preview */}
                  <p className="text-xs text-ui-text/90 font-normal leading-relaxed line-clamp-2 mb-3 select-text">
                    {item.original_text}
                  </p>

                  {/* Highlighted Worker Feedback Banner (Admin & User can see it immediately) */}
                  {hasRueckmeldung && (
                    <div className="mb-3 p-3 rounded-xl bg-emerald-500/[0.08] border border-emerald-500/30 text-xs shadow-sm">
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="flex items-center gap-1.5 font-black text-emerald-400 text-[10px] uppercase tracking-wider">
                          <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                          ✍ Mitarbeiter-Rückmeldung
                        </span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                          Vorhanden
                        </span>
                      </div>
                      <p className="text-xs text-ui-text font-medium leading-relaxed italic select-text line-clamp-3">
                        „{item.user_documentation}“
                      </p>
                    </div>
                  )}

                  {/* Photos Preview Strip (clickable into full-screen lightbox) */}
                  {photosCount > 0 && item.photos && (
                    <div className="mb-3">
                      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
                        {item.photos.slice(0, 4).map((photo) => {
                          const isBefore =
                            photo.photo_type === "BEFORE" ||
                            (photo.photo_type as any) === "VORHER" ||
                            photo.caption?.startsWith("[VORHER]");
                          return (
                            <div
                              key={photo.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setLightboxPhoto({
                                  url: photo.url,
                                  description: photo.caption,
                                  author: photo.uploaded_by,
                                  createdAt: photo.created_at,
                                });
                              }}
                              className="relative group/ph flex-shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-xl border border-ui-border overflow-hidden bg-black/60 cursor-pointer hover:border-ui-accent hover:scale-105 transition-all shadow-sm"
                              title="Klicken für Vollbild"
                            >
                              <img
                                src={photo.url}
                                alt={photo.caption || "Mangel Foto"}
                                className="w-full h-full object-cover"
                              />
                              <span
                                className={`absolute top-1 left-1 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                                  isBefore
                                    ? "bg-blue-600/95 text-white shadow"
                                    : "bg-emerald-600/95 text-white shadow"
                                }`}
                              >
                                {isBefore ? "Vorher" : "Nachher"}
                              </span>
                            </div>
                          );
                        })}
                        {item.photos.length > 4 && (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingItem(item);
                            }}
                            className="flex-shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-xl border border-dashed border-ui-border flex flex-col items-center justify-center bg-white/[0.02] text-ui-muted hover:text-ui-text hover:border-ui-accent transition-all cursor-pointer text-xs font-bold"
                          >
                            +{item.photos.length - 4} mehr
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Status Badge */}
                  <div className="mb-3">
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black border ${statusColor}`}
                    >
                      <span className={`w-2 h-2 rounded-full ${statusDot}`} />
                      {statusLabel}
                    </span>
                  </div>

                  {/* Indicators: Fotos (Vorher / Nachher), Bauleitung, Rückmeldung */}
                  {(() => {
                    const vorherPhotos = (item.photos || []).filter(
                      (p) =>
                        p.photo_type === "BEFORE" ||
                        (p.photo_type as any) === "VORHER" ||
                        p.caption?.startsWith("[VORHER]")
                    );
                    const nachherPhotos = (item.photos || []).filter(
                      (p) =>
                        p.photo_type === "AFTER" ||
                        (p.photo_type as any) === "NACHHER" ||
                        (!p.photo_type && !(p.caption || "").startsWith("[VORHER]"))
                    );

                    return (
                      <div className="flex flex-wrap items-center gap-2 mb-4">
                        {/* Vorher Fotos */}
                        {vorherPhotos.length > 0 && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-300 text-xs font-bold">
                            📸 {vorherPhotos.length} Vorher
                          </span>
                        )}

                        {/* Nachher Fotos */}
                        {nachherPhotos.length > 0 && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-bold">
                            📸 {nachherPhotos.length} Nachher
                          </span>
                        )}

                        {photosCount === 0 && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 border border-ui-border text-ui-muted text-xs">
                            Keine Fotos
                          </span>
                        )}

                        {/* Bauleitung indicator */}
                        {hasBauleitung && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold">
                            <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                            📋 Bauleitung
                          </span>
                        )}

                        {/* Rückmeldung indicator */}
                        {hasRueckmeldung && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold">
                            <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                            ✍ Rückmeldung
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Card Bottom: [ Nicht relevant ] & [ Öffnen ] Buttons */}
                <div className="pt-3 border-t border-ui-border/50 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-ui-muted">
                    {isSelected ? "📄 Im Bericht" : "🚫 Aus Bericht ausgeblendet"}
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleChangeStatus(item, item.status === "NOT_RELEVANT" ? "OPEN" : "NOT_RELEVANT", e);
                      }}
                      className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                        item.status === "NOT_RELEVANT"
                          ? "bg-slate-700/90 text-slate-200 border-slate-500 hover:bg-slate-600 shadow-sm"
                          : "bg-white/5 hover:bg-slate-700/40 text-slate-300 hover:text-white border-ui-border"
                      }`}
                      title={item.status === "NOT_RELEVANT" ? "Wieder auf Offen setzen" : "Als Nicht relevant markieren"}
                    >
                      {item.status === "NOT_RELEVANT" ? "↩ Reaktivieren" : "⚪ Nicht relevant"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingItem(item)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-ui-accent hover:bg-ui-accent/90 text-black font-black text-xs transition-all shadow-md shadow-ui-accent/10 active:scale-95"
                    >
                      <span>Öffnen</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* === TABLE VIEW === */
        <div className="overflow-x-auto rounded-2xl border border-ui-border bg-ui-card shadow-2xl">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-ui-border/80 bg-white/[0.04] text-[11px] font-black uppercase tracking-wider text-ui-muted">
                <th className="py-3.5 px-4 w-16">Nr.</th>
                <th className="py-3.5 px-3 w-40">Gewerk / Firma</th>
                <th className="py-3.5 px-3 w-36">Ort / Raum</th>
                <th className="py-3.5 px-4 min-w-[240px]">Mangel</th>
                <th className="py-3.5 px-3 w-32">Status</th>
                <th className="py-3.5 px-3 w-28">Bericht-Status</th>
                <th className="py-3.5 px-3 w-24 text-center">Fotos</th>
                <th className="py-3.5 px-3 w-32 text-center">Doku</th>
                <th className="py-3.5 px-4 min-w-[190px] text-right">Aktion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ui-border/40">
              {filteredItems.map((item) => {
                const photosCount = item.photos?.length || 0;
                const isDone = item.status === "DONE";
                const isSelected = item.is_selected !== false;
                const hasCustomConfig = !!item.custom_report_config;
                const nachherCount = (item.photos || []).filter(
                  (p) =>
                    p.photo_type === "AFTER" ||
                    (p.photo_type as any) === "NACHHER" ||
                    (!p.photo_type && !(p.caption || "").startsWith("[VORHER]"))
                ).length;

                return (
                  <tr
                    key={item.id}
                    onClick={() => setEditingItem(item)}
                    className={`cursor-pointer transition-colors hover:bg-white/[0.03] ${
                      !isSelected ? "opacity-60" : "opacity-100"
                    }`}
                  >
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded bg-ui-accent/20 border border-ui-accent/40 text-ui-accent font-black text-xs">
                        {item.item_number}
                      </span>
                      <span className="block text-[10px] text-ui-muted mt-0.5">
                        S. {item.page_number}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 font-bold text-ui-text">
                      {item.trade_or_company || "–"}
                    </td>
                    <td className="py-3.5 px-3 text-ui-muted font-medium">
                      {item.location || "–"}
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="line-clamp-2 text-ui-text font-normal">
                        {item.original_text}
                      </p>
                    </td>
                    <td className="py-3.5 px-3">
                      <span
                        className={`inline-block text-[10px] font-black uppercase px-2.5 py-1 rounded-lg border ${
                          isDone
                            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                            : item.status === "IN_PROGRESS"
                            ? "bg-blue-500/20 text-blue-400 border-blue-500/40"
                            : item.status === "ZU_KLAEREN"
                            ? "bg-purple-500/20 text-purple-400 border-purple-500/40"
                            : item.status === "NOT_RELEVANT"
                            ? "bg-slate-700 text-slate-300 border-slate-600"
                            : "bg-amber-500/20 text-amber-400 border-amber-500/40"
                        }`}
                      >
                        {item.status === "DONE"
                          ? "Erledigt"
                          : item.status === "IN_PROGRESS"
                          ? "In Bearbeitung"
                          : item.status === "ZU_KLAEREN"
                          ? "Zu klären"
                          : item.status === "NOT_RELEVANT"
                          ? "Nicht relevant"
                          : "Offen"}
                      </span>
                    </td>
                    <td className="py-3.5 px-3">
                      {hasCustomConfig ? (
                        <span className="text-[10px] font-bold text-blue-300 bg-blue-500/15 px-2 py-0.5 rounded-md border border-blue-500/30 whitespace-nowrap">
                          Individuell
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium text-ui-muted bg-white/5 px-2 py-0.5 rounded-md border border-white/10 whitespace-nowrap">
                          Standard
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-3 text-center">
                      {photosCount > 0 ? (
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-ui-accent/10 text-ui-accent font-bold text-xs">
                            <Camera className="w-3 h-3" /> {photosCount}
                          </span>
                          {nachherCount > 0 && (
                            <span className="text-[9px] font-black text-emerald-400">
                              {nachherCount} Nachher
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-ui-muted/40">–</span>
                      )}
                    </td>
                    <td className="py-3.5 px-3 text-center">
                      <div className="flex flex-col items-center justify-center gap-1">
                        {item.user_documentation && (
                          <span
                            title={`Rückmeldung: ${item.user_documentation}`}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold text-emerald-300 bg-emerald-500/20 border border-emerald-500/40"
                          >
                            ✍ Rückmeldung
                          </span>
                        )}
                        {item.our_documentation && (
                          <span
                            title={`Bauleitung: ${item.our_documentation}`}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold text-amber-300 bg-amber-500/20 border border-amber-500/40"
                          >
                            📋 Bauleitung
                          </span>
                        )}
                        {!item.user_documentation && !item.our_documentation && (
                          <span className="text-ui-muted/40">–</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleChangeStatus(item, item.status === "NOT_RELEVANT" ? "OPEN" : "NOT_RELEVANT", e);
                          }}
                          className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all whitespace-nowrap ${
                            item.status === "NOT_RELEVANT"
                              ? "bg-slate-700/90 text-slate-200 border-slate-500 hover:bg-slate-600 shadow-sm"
                              : "bg-white/5 hover:bg-slate-700/40 text-slate-300 hover:text-white border-ui-border"
                          }`}
                          title={item.status === "NOT_RELEVANT" ? "Wieder auf Offen setzen" : "Als Nicht relevant markieren"}
                        >
                          {item.status === "NOT_RELEVANT" ? "↩ Reaktivieren" : "⚪ Nicht relevant"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingItem(item)}
                          className="px-3 py-1.5 rounded-xl bg-ui-accent text-black font-black text-xs hover:scale-105 transition-transform shadow-sm"
                        >
                          Öffnen
                        </button>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={(e) => handleDeleteItem(item, e)}
                            className="p-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 hover:text-red-300 transition-colors"
                            title="Mangel löschen"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          5. GLOBAL REPORT CONFIG MODAL
      ────────────────────────────────────────────────────────────── */}
      <ReportConfigModal
        isOpen={showGlobalConfigModal}
        onClose={() => setShowGlobalConfigModal(false)}
        config={globalReportConfig}
        onSave={handleSaveGlobalConfig}
        isIndividual={false}
      />

      {/* ─────────────────────────────────────────────────────────────
          6. INDIVIDUAL REPORT CONFIG MODAL (FOR 1 SPECIFIC MANGEL)
      ────────────────────────────────────────────────────────────── */}
      {individualConfigItem && (
        <ReportConfigModal
          isOpen={!!individualConfigItem}
          onClose={() => setIndividualConfigItem(null)}
          config={{
            ...globalReportConfig,
            ...(individualConfigItem.custom_report_config || {}),
          }}
          onSave={(newCfg) => {
            handleSaveIndividualConfig(individualConfigItem, newCfg);
            setIndividualConfigItem(null);
          }}
          isIndividual={true}
          itemNumber={individualConfigItem.item_number}
          onResetToDefault={() => {
            handleResetItemToDefaultConfig(individualConfigItem);
            setIndividualConfigItem(null);
          }}
        />
      )}

      {/* ─────────────────────────────────────────────────────────────
          7. REPORT PREVIEW MODAL
      ────────────────────────────────────────────────────────────── */}
      <ReportPreviewModal
        isOpen={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
        document={currentDoc || null}
        projectName={
          currentProject
            ? `${currentProject.companies?.name ? `[${currentProject.companies.name.toUpperCase()}] ` : ""}${currentProject.name}`
            : "Projekt"
        }
        projectAddress={currentProject?.address}
        items={items}
        globalConfig={globalReportConfig}
        onOpenConfig={() => {
          setShowPreviewModal(false);
          setShowGlobalConfigModal(true);
        }}
        onDownloadPdf={handleGenerateReportPdf}
        exportingPdf={exportingPdf}
      />

      {/* ─────────────────────────────────────────────────────────────
          8. UPLOAD MODAL
      ────────────────────────────────────────────────────────────── */}
      {showUploadModal && (
        <div className="fixed inset-0 z-[100010] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-ui-card border border-ui-border rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-ui-text">
                Mängelanzeige PDF hochladen
              </h3>
              <button
                onClick={() => !scanning && setShowUploadModal(false)}
                disabled={scanning}
                className="text-ui-muted hover:text-ui-text"
              >
                ✕
              </button>
            </div>

            {scanning ? (
              <div className="py-8 text-center space-y-5">
                <div className="relative w-14 h-14 mx-auto flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-4 border-ui-accent/20 animate-pulse" />
                  <RefreshCw className="w-8 h-8 text-ui-accent animate-spin" />
                </div>

                <div className="space-y-2">
                  <h4 className="text-base font-black text-ui-text">
                    Lokale KI-Analyse läuft
                  </h4>
                  <p className="text-xs text-ui-accent font-semibold">
                    {scanStatus || "Bitte warten..."}
                  </p>
                </div>

                {scanProgress && scanProgress.total > 0 && (
                  <div className="space-y-2 pt-2 max-w-sm mx-auto">
                    <div className="flex items-center justify-between text-[11px] font-bold text-ui-muted px-1">
                      <span>Seite {scanProgress.current} von {scanProgress.total}</span>
                      <span>{Math.round((scanProgress.current / scanProgress.total) * 100)}%</span>
                    </div>
                    <div className="w-full bg-ui-bg rounded-full h-2.5 overflow-hidden border border-ui-border">
                      <div
                        className="bg-ui-accent h-2.5 rounded-full transition-all duration-300 ease-out shadow-sm shadow-ui-accent/50"
                        style={{
                          width: `${Math.max(5, Math.round((scanProgress.current / scanProgress.total) * 100))}%`,
                        }}
                      />
                    </div>
                    <div className="pt-1">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
                        ✓ {scanProgress.itemsFound} Punkte erkannt
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-ui-muted block mb-1">
                    Titel / Bezeichnung
                  </label>
                  <input
                    type="text"
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    placeholder="z.B. Mängelanzeige Rohbau Halle 3"
                    className="w-full px-4 py-2.5 rounded-xl bg-ui-bg border border-ui-border text-sm text-ui-text focus:outline-none focus:border-ui-accent"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-ui-muted block mb-1">
                    PDF-Datei (Digital oder Scan)
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="p-8 rounded-xl border border-dashed border-ui-border hover:border-ui-accent/80 text-center cursor-pointer bg-white/[0.01] hover:bg-white/[0.03] transition-all"
                  >
                    <Upload className="w-8 h-8 text-ui-accent mx-auto mb-2 opacity-80" />
                    <p className="text-xs font-bold text-ui-text">
                      {uploadFile ? uploadFile.name : "Klicken Sie hier, um eine PDF-Datei auszuwählen"}
                    </p>
                    <p className="text-[11px] text-ui-muted mt-1">
                      Unterstützt mehrseitige PDFs, Tabellen & OCR
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowUploadModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-ui-muted hover:text-ui-text"
                  >
                    Abbrechen
                  </button>
                  <button
                    type="button"
                    onClick={handleUploadAndScan}
                    disabled={!uploadFile}
                    className="px-5 py-2.5 rounded-xl bg-ui-accent text-black font-black text-xs uppercase tracking-wider transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                  >
                    Hochladen & Scannen
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          9. MANGEL EDIT MODAL
      ────────────────────────────────────────────────────────────── */}
      <MangelEditModal
        isOpen={!!editingItem}
        onClose={() => setEditingItem(null)}
        item={editingItem}
        isAdmin={isAdmin}
        currentUserId={currentUser?.id}
        onSave={(updated) => {
          setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
        }}
        onDelete={(deletedId) => {
          setItems((prev) => prev.filter((i) => i.id !== deletedId));
          setDocuments((prev) =>
            prev.map((d) =>
              d.id === selectedDocId
                ? {
                    ...d,
                    items_count: Math.max(0, (d.items_count || 1) - 1),
                    selected_count: Math.max(0, (d.selected_count || 1) - 1),
                  }
                : d
            )
          );
        }}
      />

      {/* ─────────────────────────────────────────────────────────────
          10. FULLSCREEN PHOTO LIGHTBOX
      ────────────────────────────────────────────────────────────── */}
      {lightboxPhoto && (
        <PhotoLightbox
          url={lightboxPhoto.url}
          description={lightboxPhoto.description}
          author={lightboxPhoto.author}
          createdAt={lightboxPhoto.createdAt}
          onClose={() => setLightboxPhoto(null)}
        />
      )}

      {/* ─────────────────────────────────────────────────────────────
          11. RENAME DOCUMENT MODAL
      ────────────────────────────────────────────────────────────── */}
      {showRenameDocModal && currentDoc && (
        <div className="fixed inset-0 z-[100010] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-ui-card border border-ui-border rounded-2xl w-full max-w-md p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-ui-text flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-ui-accent" />
                Dokument umbenennen
              </h3>
              <button
                type="button"
                onClick={() => setShowRenameDocModal(false)}
                className="p-1 rounded-lg text-ui-muted hover:text-ui-text"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-ui-muted">Neuer Name für das Dokument:</label>
              <input
                type="text"
                value={newDocTitle}
                onChange={(e) => setNewDocTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRenameDocument();
                }}
                className="w-full px-3.5 py-2.5 rounded-xl bg-ui-bg border border-ui-border text-xs sm:text-sm font-bold text-ui-text focus:outline-none focus:border-ui-accent"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowRenameDocModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-ui-muted hover:text-ui-text hover:bg-white/5"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={handleRenameDocument}
                disabled={renamingDoc || !newDocTitle.trim()}
                className="px-5 py-2.5 rounded-xl bg-ui-accent hover:bg-ui-accent/90 text-black font-black text-xs transition-all active:scale-95 disabled:opacity-50"
              >
                {renamingDoc ? "Speichere..." : "Speichern"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          12. CREATE MANUAL DOCUMENT MODAL
      ────────────────────────────────────────────────────────────── */}
      <CreateManualDocumentModal
        isOpen={showCreateManualDocModal}
        onClose={() => setShowCreateManualDocModal(false)}
        projects={projects}
        selectedProjectId={selectedProjectId}
        onCreated={(newDoc) => {
          setDocuments((prev) => [newDoc, ...prev]);
          setSelectedDocId(newDoc.id);
          setItems([]);
          setShowAddMangelModal(true); // Automatically offer to add the first item
        }}
      />

      {/* ─────────────────────────────────────────────────────────────
          13. ADD MANGEL MODAL (FOR MANUAL OR PDF LISTS)
      ────────────────────────────────────────────────────────────── */}
      {currentDoc && (
        <AddMangelModal
          isOpen={showAddMangelModal}
          onClose={() => setShowAddMangelModal(false)}
          documentId={currentDoc.id}
          projectId={selectedProjectId}
          nextItemNumber={nextItemNumber}
          isAdmin={isAdmin}
          onCreated={(newItem) => {
            setItems((prev) => [...prev, newItem]);
            setDocuments((prev) =>
              prev.map((d) =>
                d.id === currentDoc.id
                  ? {
                      ...d,
                      items_count: (d.items_count || 0) + 1,
                      selected_count: (d.selected_count || 0) + 1,
                    }
                  : d
              )
            );
          }}
        />
      )}
    </div>
  );
}
