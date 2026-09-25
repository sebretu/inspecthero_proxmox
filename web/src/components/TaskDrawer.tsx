"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { apiGet, apiPost, apiPatch, apiDelete, getApiUrl, getToken } from "@/lib/apiClient";
import { useLanguage } from "@/contexts/LanguageContext";
import type { Language } from "@/lib/translations";
import { applyWatermark } from "@/lib/watermark";
import { GeolocationService } from "@/lib/native";
import PhotoLightbox from "@/components/PhotoLightbox";
import dynamic from 'next/dynamic';

const AufmassEditor = dynamic(() => import('@/components/aufmass/AufmassEditor'), {
  ssr: false,
});

const AufmassCanvas = dynamic(() => import('@/components/aufmass/AufmassCanvas'), {
  ssr: false,
});



import { useNotification } from "@/contexts/NotificationContext";

type PhotoType = "BEFORE" | "AFTER";

type ApiOk<T> = { ok: true; data: T };
type ApiErr = { ok: false; error: { code: string; message: string; meta?: any } };

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: "OPEN" | "IN_PROGRESS" | "DONE_WAITING_APPROVAL" | "APPROVED" | "REJECTED";
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  due_date: string | null;
  assigned_user_id: string | null;
  project_id: string;
  plan_id?: string;
  x_norm?: number | null;
  y_norm?: number | null;
  is_question?: boolean;
};

type TaskPhoto = {
  id: string;
  task_id: string;
  url: string;
  caption: string | null;
  created_at: string;
  photo_type?: PhotoType | null;
};

type ProfileRow = {
  id: string;
  full_name: string;
  email?: string;
};

type TaskComment = {
  id: string;
  task_id: string;
  user_id: string;
  comment: string;
  created_at: string;
};

type TaskHistoryRow = {
  id: string;
  task_id: string;
  changed_by: string | null;
  action?: string | null;
  summary?: string | null;
  meta?: any;
  created_at: string;
};

type PlanRow = {
  id: string;
  project_id: string;
  name: string;
  floor: string;
  version: number;
  pdf_url: string | null;
  created_at: string;
};

type PendingPhoto = {
  id: string;
  file: File;
  previewUrl: string;
  caption: string | null;
  photoType: PhotoType;
};

type Material = {
  id: string;
  name: string;
  display_name?: string | null;
  unit: string;
  category?: string;
  article_number?: string | null;
};

type SelectedMaterial = {
  id: string; // temp id for key
  materialId?: string;
  name: string;
  unit: string;
  quantity: number | "";
  article_number?: string | null;
  category?: string;
};

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}



function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const b64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(b64);
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

export default function TaskDrawer({
  open,
  taskId,
  onClose,
  uploadedBy,
  createDraft,
  currentUserId,
  currentUserRole,
  showOverlay = true,
}: {
  open: boolean;
  taskId: string | null;
  onClose: () => void;
  uploadedBy: string;
  // createDraft = tryb CREATE (klik w mapę)
  createDraft?: {
    project_id: string;
    plan_id: string;
    x_norm: number;
    y_norm: number;
    created_by?: string;
    is_question?: boolean;
  } | null;
  currentUserId?: string | null;
  currentUserRole?: string | null;
  showOverlay?: boolean;
}) {
  const isCreate = !!createDraft && !taskId;
  const { t, language } = useLanguage();
  const { showNotification } = useNotification();

  const [task, setTask] = useState<TaskRow | null>(null);
  const [plan, setPlan] = useState<PlanRow | null>(null);
  const [photos, setPhotos] = useState<TaskPhoto[]>([]);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [history, setHistory] = useState<TaskHistoryRow[]>([]);
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [photosLoaded, setPhotosLoaded] = useState<boolean>(isCreate);
  const [err, setErr] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [titleDirty, setTitleDirty] = useState(false);
  const [descriptionDirty, setDescriptionDirty] = useState(false);
  const [status, setStatus] = useState<TaskRow["status"]>("OPEN");
  const [priority, setPriority] = useState<TaskRow["priority"]>("MEDIUM");
  const [dueDate, setDueDate] = useState("");
  const [assignedUserId, setAssignedUserId] = useState("");

  const isQuestionMode = createDraft?.is_question || task?.is_question || false;

  const [caption, setCaption] = useState(""); // caption dla kolejnego dodawanego pliku
  const [nextPhotoType, setNextPhotoType] = useState<PhotoType>("BEFORE");
  const [isWorking, setIsWorking] = useState(false);
  const [newComment, setNewComment] = useState(""); // nowy komentarz
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<any>(null);
  const [translationMap, setTranslationMap] = useState<Record<string, string>>({});
  const [translationLang, setTranslationLang] = useState<Language | null>(null);
  const [translatingContent, setTranslatingContent] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);

  // --- MATERIAŁY (Anforderungen) ---
  const [selectedMaterials, setSelectedMaterials] = useState<SelectedMaterial[]>([]);
  const [materialSearchQuery, setMaterialSearchQuery] = useState("");
  const [materialSearchResults, setMaterialSearchResults] = useState<Material[]>([]);
  const [isSearchingMaterials, setIsSearchingMaterials] = useState(false);
  const [showMaterialSearch, setShowMaterialSearch] = useState(false);
  const [lastOrder, setLastOrder] = useState<any | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [aufmassPhoto, setAufmassPhoto] = useState<{ url: string; id: string; sessionId?: string } | null>(null);
  const [shapesByPhoto, setShapesByPhoto] = useState<Record<string, any[]>>({});
  const [previewPhotoShapes, setPreviewPhotoShapes] = useState<any[] | null>(null);

  // ⭐ lista profili do dropdown
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [profilesLoaded, setProfilesLoaded] = useState(false);
  const [tileStatus, setTileStatus] = useState<"unknown" | "ok" | "error">("unknown");
  const localeByLang: Record<string, string> = {
    en: "en-US",
    pl: "pl-PL",
    de: "de-DE",
    sk: "sk-SK",
  };

  const normalizedRole = (currentUserRole || "").toUpperCase();
  const isAdmin = normalizedRole === "ADMIN";
  const isAssignedToCurrentUser = !!currentUserId && !!task && task.assigned_user_id === currentUserId;
  const isCreator = !!currentUserId && !!task && (task as any).created_by === currentUserId;
  const isUnassigned = !!task && !task.assigned_user_id;

  const canUpdateStatus = isAdmin || isAssignedToCurrentUser;
  const canEditFields = isAdmin || isCreate || isAssignedToCurrentUser;
  const canEditPriority = isAdmin || isCreate || isAssignedToCurrentUser;
  const canEditDueDate = canEditPriority;
  const canManagePhotos = isAdmin || isAssignedToCurrentUser || isCreate || isCreator || isUnassigned;
  const canSubmit = isCreate ? !!currentUserId : canUpdateStatus;

  const canShow = open && (!!taskId || !!createDraft);

  const hasAfterPhoto = useMemo(() => {
    const uploadedAfter = photos.some((p) => (p.photo_type || "BEFORE") === "AFTER");
    const pendingAfter = pendingPhotos.some((p) => p.photoType === "AFTER");
    return uploadedAfter || pendingAfter;
  }, [photos, pendingPhotos]);

  const hasBeforePhoto = useMemo(() => {
    const uploadedBefore = photos.some((p) => (p.photo_type || "BEFORE") === "BEFORE");
    const pendingBefore = pendingPhotos.some((p) => p.photoType === "BEFORE");
    return uploadedBefore || pendingBefore;
  }, [photos, pendingPhotos]);


  const headerTitle = useMemo(() => {
    if (isCreate) return isQuestionMode ? t("home", "newQuestion", "New Question") : t("taskDrawer", "newTask");
    if (!taskId) return t("home", "title");
    const baseTitle = isQuestionMode ? t("home", "newQuestion", "Question") : t("home", "title");
    return task?.title ? `${baseTitle}: ${task.title}` : `${baseTitle}: ${taskId}`;
  }, [isCreate, taskId, task?.title, t, isQuestionMode]);

  async function loadProfilesOnce() {
    if (profilesLoaded) return;
    try {
      const data = await apiGet<ProfileRow[]>("/api/profiles?limit=1000");
      setProfiles(data || []);
    } finally {
      setProfilesLoaded(true);
    }
  }

  async function loadAll(id: string) {
    setErr(null);
    setPhotosLoaded(false);
    try {
      const taskData = await apiGet<TaskRow>(`/api/task?id=${encodeURIComponent(id)}`);
      setTask(taskData);

      // ustaw formularz z taska
      setTitle(taskData.title || "");
      setTitleDirty(false);
      setDescription(taskData.description || "");
      setDescriptionDirty(false);
      setStatus((taskData.status as any) || "OPEN");
      setPriority((taskData.priority as any) || "MEDIUM");
      setDueDate(taskData.due_date || "");
      setAssignedUserId(taskData.assigned_user_id || "");

      // Load plan if we have plan_id
      if (taskData.plan_id) {
        try {
          const planData = await apiGet<PlanRow>(`/api/plan?id=${encodeURIComponent(taskData.plan_id)}`);
          setPlan(planData);
        } catch (e) {
          console.log("Could not load plan:", e);
        }
      }

      const photoData = await apiGet<TaskPhoto[]>(`/api/task-photos?taskId=${encodeURIComponent(id)}&t=${Date.now()}`);
      setPhotos(photoData || []);

      // Fetch shapes/versions for question photos edited in Aufmaß
      try {
        const sessions = await apiGet<any[]>(`/api/aufmass/sessions?taskId=${encodeURIComponent(id)}`);
        const shapesMap: Record<string, any[]> = {};
        if (sessions && Array.isArray(sessions)) {
          await Promise.all(
            sessions.map(async (sess) => {
              if (sess.photo_id) {
                try {
                  const res = await apiGet<any>(`/api/aufmass/versions?sessionId=${sess.id}&photoId=${sess.photo_id}`);
                  const versions = res.data || res;
                  if (versions && versions.length > 0) {
                    shapesMap[sess.photo_id] = versions[0].data || [];
                  }
                } catch (e) {
                  console.error("Failed to load version for session", sess.id, e);
                }
              }
            })
          );
        }
        setShapesByPhoto(shapesMap);
      } catch (e) {
        console.error("Failed to load aufmass sessions for task", e);
      }

      const commentData = await apiGet<TaskComment[]>(`/api/task-comments?taskId=${encodeURIComponent(id)}`);
      setComments(commentData || []);

      const historyData = await apiGet<TaskHistoryRow[]>(`/api/task-history?taskId=${encodeURIComponent(id)}`);
      setHistory(historyData || []);

      // Load materials (orders)
      try {
        if (taskData.project_id) {
          const orders = await apiGet<any[]>(`/api/orders?projectId=${encodeURIComponent(taskData.project_id)}&status=CART`);
          if (orders && orders.length > 0 && orders[0].items) {
            const taskItems = orders[0].items.filter((it: any) => it.task_id === id);
            if (taskItems.length > 0) {
              setLastOrder(orders[0]);
              const mapped = taskItems.map((it: any) => ({
                id: it.id,
                materialId: it.material_id,
                name: it.custom_name || it.material?.display_name || it.material?.name || "",
                unit: it.custom_unit || it.material?.unit || "",
                quantity: it.quantity,
                article_number: it.material?.article_number,
                category: it.material?.category
              }));
              setSelectedMaterials(mapped);
            } else {
              setSelectedMaterials([]);
              setLastOrder(null);
            }
          } else {
            setSelectedMaterials([]);
            setLastOrder(null);
          }
        } else {
          setSelectedMaterials([]);
          setLastOrder(null);
        }
      } catch (e) {
        console.error("Failed to load materials for task:", e);
      }
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setPhotosLoaded(true);
    }
  }

  // open => doładuj profile
  useEffect(() => {
    if (!canShow) return;
    loadProfilesOnce().catch(() => { });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canShow]);

  const hasAutoAssignedAdminRef = useRef(false);
  useEffect(() => {
    if (!canShow) {
      hasAutoAssignedAdminRef.current = false;
    }
  }, [canShow]);

  // open => edit mode: load task / create mode: reset
  useEffect(() => {
    if (!canShow) return;
    loadProfilesOnce().catch(() => { });

    if (taskId) {
      loadAll(taskId).catch(() => { });
    } else {
      // create mode
      setTask(null);
      setPhotos([]);
      setComments([]);
      setHistory([]);
      setNewComment("");
      setErr(null);

      const defaultTitle = isQuestionMode ? t("home", "newQuestion", "New Question") : "";
      setTitle(defaultTitle);
      setTitleDirty(false);
      setDescription("");
      setDescriptionDirty(false);
      setStatus("OPEN");
      setPriority("MEDIUM");
      setDueDate("");

      const draftCreator = createDraft?.created_by;
      if (draftCreator && isUuid(draftCreator)) {
        setAssignedUserId(draftCreator);
      } else if (currentUserId && isUuid(currentUserId) && !isQuestionMode) {
        setAssignedUserId(currentUserId);
      } else {
        setAssignedUserId("");
      }
      setCaption("");
      setSelectedMaterials([]);
      setLastOrder(null);
      setShapesByPhoto({});
      setPreviewPhotoShapes(null);
      setPhotosLoaded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canShow, taskId, isCreate]);

  // Material search debounce
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      if (materialSearchQuery.trim().length < 2) {
        setMaterialSearchResults([]);
        return;
      }
      setIsSearchingMaterials(true);
      try {
        const res = await apiGet<any>(`/api/materials?search=${encodeURIComponent(materialSearchQuery)}&limit=10&favoritesOnly=true`);
        if (!active) return;
        // The API returns { ok: true, data: { items: [...], total: ... } } or just the array depending on version
        const items = res.data?.items || res.items || res;
        setMaterialSearchResults(Array.isArray(items) ? items : []);
      } catch (err) {
        console.error("Material search error:", err);
      } finally {
        if (active) setIsSearchingMaterials(false);
      }
    }, 400);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [materialSearchQuery]);

  // Auto-assign question to first admin if not assigned yet
  useEffect(() => {
    if (canShow && isCreate && isQuestionMode && profiles.length > 0 && !hasAutoAssignedAdminRef.current) {
      const firstAdmin = profiles.find((p) => String((p as any).role || "").toUpperCase() === "ADMIN");
      if (firstAdmin) {
        setAssignedUserId(firstAdmin.id);
        hasAutoAssignedAdminRef.current = true;
      }
    }
  }, [canShow, isCreate, isQuestionMode, profiles]);

  // cleanup blob urls
  useEffect(() => {
    return () => {
      for (const p of pendingPhotos) {
        try {
          URL.revokeObjectURL(p.previewUrl);
        } catch { }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setTileStatus("unknown");
  }, [plan?.id]);

  useEffect(() => {
    if (!taskId || !task || isCreate) {
      setTranslationMap({});
      setTranslationLang(language);
      setTranslationError(null);
      setTranslatingContent(false);
      return;
    }

    const items: { key: string; text: string }[] = [];
    if (task.title?.trim()) {
      items.push({ key: `task.title:${task.id}`, text: task.title });
    }
    if (task.description?.trim()) {
      items.push({ key: `task.description:${task.id}`, text: task.description });
    }
    comments.forEach((c) => {
      if (c.comment?.trim()) {
        items.push({ key: `comment:${c.id}`, text: c.comment });
      }
    });
    history.forEach((h) => {
      const historyText = (h.action || h.summary)?.trim();
      if (historyText) {
        items.push({ key: `history:${h.id}`, text: historyText });
      }
    });

    if (items.length === 0) {
      setTranslationMap({});
      setTranslationLang(language);
      setTranslationError(null);
      setTranslatingContent(false);
      return;
    }

    let alive = true;
    setTranslatingContent(true);
    setTranslationError(null);

    apiPost<{ translations: string[] }>("/api/translate", {
      targetLang: language,
      texts: items.map((i) => i.text),
    })
      .then((payload) => {
        if (!alive) return;
        const next: Record<string, string> = {};
        (payload.translations || []).forEach((value, idx) => {
          const key = items[idx]?.key;
          if (key && typeof value === "string") {
            next[key] = value;
          }
        });
        setTranslationMap(next);
        setTranslationLang(language);
      })
      .catch((e: any) => {
        if (!alive) return;
        setTranslationError(e?.message || String(e));
        setTranslationMap({});
      })
      .finally(() => {
        if (!alive) return;
        setTranslatingContent(false);
      });

    return () => {
      alive = false;
    };
  }, [language, taskId, task?.id, task?.title, task?.description, comments, history, isCreate]);

  useEffect(() => {
    if (!taskId || isCreate) return;
    if (translationLang !== language) return;

    const titleKey = makeTranslationKey("task.title", task?.id);
    if (titleKey) {
      const translatedTitle = translationMap[titleKey];
      if (translatedTitle && !titleDirty && translatedTitle !== title) {
        setTitle(translatedTitle);
      }
    }

    const descKey = makeTranslationKey("task.description", task?.id);
    if (descKey) {
      const translatedDesc = translationMap[descKey];
      if (translatedDesc && !descriptionDirty && translatedDesc !== description) {
        setDescription(translatedDesc);
      }
    }
  }, [taskId, isCreate, translationLang, language, translationMap, task?.id, titleDirty, descriptionDirty, title, description]);

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(17,24,39,0.15)",
    background: "var(--home-card, #fff)",
    color: "#111827",
    fontSize: 14,
    outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    display: "grid",
    gap: 6,
    fontSize: 12,
    color: "#111827",
  };

  const translationNoteStyle: React.CSSProperties = {
    marginTop: 6,
    fontSize: 12,
    color: "rgba(17,24,39,0.75)",
    fontStyle: "italic",
    lineHeight: 1.5,
  };

  function ensureAfterPhotoPresent() {
    if (!photosLoaded) {
      setErr(t("taskDrawer", "afterPhotoLoading", "Ładuję zdjęcia zadania, spróbuj ponownie za chwilę."));
      return false;
    }
    if (hasAfterPhoto) return true;
    setErr(t("taskDrawer", "afterPhotoRequired", "Brak zdjęcia po wykonaniu prac"));
    return false;
  }

  function ensureBeforePhotoForCreate() {
    if (!isCreate) return true;
    const pendingBefore = pendingPhotos.some((p) => p.photoType === "BEFORE");
    if (pendingBefore) return true;
    setErr(t("taskDrawer", "beforePhotoRequired", "Brak zdjęcia dodaj"));
    return false;
  }

  async function addPending(file: File) {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    let processedFile = file;
    if (file.type.startsWith("image/")) {
      try {
        // GPS coordinate fetching skipped as they are no longer needed for watermark
        processedFile = await applyWatermark(file, null, language);
      } catch (err) {
        console.error("Watermarking failed, using original file:", err);
      }
    }

    const previewUrl = URL.createObjectURL(processedFile);
    const cap = caption.trim() === "" ? null : caption.trim();
    setCaption("");
    setPendingPhotos((prev) => [{ id, file: processedFile, previewUrl, caption: cap, photoType: nextPhotoType }, ...prev]);
  }

  const makeTranslationKey = (scope: string, entityId?: string | null) => {
    if (!entityId) return null;
    return `${scope}:${entityId}`;
  };

  const renderTranslationSegment = (key: string | null, original?: string | null) => {
    if (!key || translationLang !== language) return null;
    const translated = translationMap[key];
    if (!translated) return null;
    const trimmedTranslated = translated.trim();
    if (!trimmedTranslated) return null;
    const trimmedOriginal = (original ?? "").trim();
    if (trimmedOriginal && trimmedOriginal === trimmedTranslated) return null;
    return (
      <div style={translationNoteStyle}>
        <span style={{ fontWeight: 700 }}>{t("taskDrawer", "autoTranslateLabel", "Auto translation")}:</span> {trimmedTranslated}
      </div>
    );
  };

  function removePending(id: string) {
    setPendingPhotos((prev) => {
      const hit = prev.find((p) => p.id === id);
      if (hit) {
        try {
          URL.revokeObjectURL(hit.previewUrl);
        } catch { }
      }
      return prev.filter((p) => p.id !== id);
    });
  }

  async function handleEditPhoto(photo: TaskPhoto) {
    try {
      const sessions = await apiGet<any[]>(`/api/aufmass/sessions?photoId=${photo.id}`);
      const existingSession = sessions?.find((s) => s.photo_id === photo.id);
      setAufmassPhoto({
        url: getApiUrl(photo.url),
        id: photo.id,
        sessionId: existingSession?.id,
      });
    } catch (e) {
      console.error("Failed to check existing session:", e);
      setAufmassPhoto({
        url: getApiUrl(photo.url),
        id: photo.id,
      });
    }
  }

  async function uploadOne(task_id: string, file: File, cap: string | null, photoType: PhotoType, token?: string | null) {
    const base64 = await fileToBase64(file);

    const data = await apiPost<TaskPhoto>("/api/task-photos", {
      task_id,
      file_name: file.name || "photo.jpg",
      caption: cap,
      base64,
      photo_type: photoType,
    }, token);

    const newPhoto: TaskPhoto = data;
    return newPhoto;
  }

  const addMaterial = (m: Material) => {
    setSelectedMaterials((prev) => {
      const existing = prev.find((it) => it.materialId === m.id);
      if (existing) return prev;

      const newListItem = {
        id: Math.random().toString(36).substring(2),
        materialId: m.id,
        name: m.display_name || m.name,
        unit: m.unit,
        quantity: 1,
        article_number: m.article_number,
        category: m.category
      };

      // Also add to global cart for Requisitions (Anforderungen) page
      if (task?.project_id) {
        (async () => {
          try {
            const token = await getToken();
            const projectId = task.project_id;
            const id = task.id;

            // Get current CART order for this project
            const orders = await apiGet<any[]>(`/api/orders?projectId=${projectId}&status=CART`, token);
            let cartOrderId = orders.length > 0 ? orders[0].id : null;

            if (!cartOrderId) {
              // Create a new CART order
              await apiPost("/api/orders", {
                projectId,
                taskId: id, // Pass taskId here for tracking
                status: "CART",
                items: [{ materialId: m.id, quantity: 1, taskId: id }]
              }, token!);
            } else {
              // Add item to existing CART order
              const existingItem = (orders[0].items || []).find((it: any) => it.material_id === m.id && it.task_id === id);
              if (existingItem) {
                await apiPatch("/api/order-items", {
                  itemId: existingItem.id,
                  quantity: (existingItem.quantity || 0) + 1
                }, token!);
              } else {
                await apiPost("/api/order-items", {
                  orderId: cartOrderId,
                  materialId: m.id,
                  quantity: 1,
                  taskId: id // Critical: add taskId so it appears in the TaskDrawer after reload
                }, token!);
              }
            }
          } catch (e) {
            console.error("Failed to sync with server cart:", e);
          }
        })();
      }

      return [...prev, newListItem];
    });
    setMaterialSearchQuery("");
    setMaterialSearchResults([]);
    setShowMaterialSearch(false);
  };

  const removeMaterial = (tempId: string) => {
    setSelectedMaterials((prev) => prev.filter((it) => it.id !== tempId));
  };

  const updateMaterialQty = (tempId: string, qty: number | "") => {
    setSelectedMaterials((prev) =>
      prev.map((it) => (it.id === tempId ? { ...it, quantity: qty } : it))
    );
  };

  async function saveMaterials(taskId: string, projectId: string, token?: string | null) {
    if (selectedMaterials.length === 0) return;

    try {
      const items = selectedMaterials.map(m => ({
        materialId: m.materialId,
        customName: m.materialId ? null : m.name,
        customUnit: m.materialId ? null : m.unit,
        quantity: Number(m.quantity) || 1
      }));

      await apiPost("/api/orders", {
        projectId,
        taskId,
        items,
        status: "CART" // Ensuring it goes to the common cart
      }, token);
    } catch (e) {
      console.error("Failed to save materials:", e);
    }
  }

  async function submitMaterialsForApproval() {
    if (!taskId || selectedMaterials.length === 0) return;

    // First, let's ask for confirmation
    if (!window.confirm(t("materials", "submitConfirm", "Czy na pewno chcesz wysłać to zapotrzebowanie do weryfikacji?"))) return;

    setSaving(true);
    try {
      const items = selectedMaterials.map((m) => {
        let out: any = { quantity: Number(m.quantity) || 1 };
        if (m.materialId) {
          out.materialId = m.materialId;
        } else {
          out.customName = m.name;
          out.customUnit = m.unit;
        }
        return out;
      });

      await apiPost("/api/orders", {
        projectId: task?.project_id || createDraft?.project_id,
        taskId,
        items,
        status: "PENDING",
      });

      setSelectedMaterials([]);
      setMaterialSearchQuery("");
      setMaterialSearchResults([]);

      window.dispatchEvent(new CustomEvent("task-saved"));

      alert(t("materials", "submitSuccess", "Zapotrzebowanie zostało wysłane pomyślnie."));
      onClose();
    } catch (e) {
      console.error("Failed to submit materials:", e);
      alert(t("materials", "submitError", "Wystąpił błąd podczas wysyłania zapotrzebowania."));
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    setErr(null);

    if (!isUuid(uploadedBy)) return setErr(t("taskDrawer", "errorInvalidUploadedBy"));

    const trimmedTitle = title.trim();
    if (!trimmedTitle) return setErr(t("taskDrawer", "errorTitleRequired"));

    let trimmedAssigned = assignedUserId.trim();
    if (!isAdmin && !trimmedAssigned && currentUserId && !isQuestionMode) {
      trimmedAssigned = currentUserId;
    }
    if (trimmedAssigned && !isUuid(trimmedAssigned)) return setErr(t("taskDrawer", "errorAssignedUser"));
    if (isCreate && !isAdmin && !trimmedAssigned && !isQuestionMode) {
      return setErr(t("taskDrawer", "errorAssignedUser"));
    }

    if (!isCreate && !canUpdateStatus) {
      return setErr(t("taskDrawer", "noPermission", "Brak uprawnień"));
    }

    const requestingApproval = status === "DONE_WAITING_APPROVAL" && (isCreate || task?.status !== "DONE_WAITING_APPROVAL");
    if (requestingApproval && !ensureAfterPhotoPresent()) {
      return;
    }

    if (isCreate && !ensureBeforePhotoForCreate()) {
      return;
    }

    setSaving(true);
    try {
      const token = await getToken();

      // CREATE
      if (isCreate) {
        const d = createDraft!;

        console.log("[TaskDrawer] Creating task...", { title: trimmedTitle });
        const newData = await apiPost<TaskRow>("/api/tasks", {
          project_id: d.project_id,
          plan_id: d.plan_id,
          x_norm: d.x_norm,
          y_norm: d.y_norm,
          title: trimmedTitle,
          description: description.trim() === "" ? null : description.trim(),
          status,
          priority,
          due_date: dueDate.trim() === "" ? null : dueDate.trim(),
          assigned_user_id: trimmedAssigned ? trimmedAssigned : null,
          is_question: isQuestionMode,
        }, token);
        console.log("[TaskDrawer] Task created:", newData?.id);

        const newId = newData?.id as string | undefined;
        if (!newId) throw new Error(t("taskDrawer", "errorCreateMissingId"));

        await saveMaterials(newId, d.project_id, token);

        // 🚀 upload pending zdjęć po utworzeniu taska (równolegle dla wydajności)
        if (pendingPhotos.length) {
          console.log("[TaskDrawer] Uploading", pendingPhotos.length, "photos...");
          setUploading(true);
          try {
            // Safety timeout for the whole batch of photos
            const uploadPromise = Promise.allSettled(
              pendingPhotos.map((p) => uploadOne(newId, p.file, p.caption, p.photoType, token))
            );

            const uploadResults = await Promise.race([
              uploadPromise,
              new Promise<any>((_, reject) => setTimeout(() => reject(new Error("Photos upload timed out")), 60000))
            ]);
            
            const succeeded = uploadResults.filter((r: any) => r.status === 'fulfilled').map((r: any) => r.value);
            const failedCount = uploadResults.filter((r: any) => r.status === 'rejected').length;

            console.log("[TaskDrawer] Upload finished. Succeeded:", succeeded.length, "Failed:", failedCount);

            if (succeeded.length) {
              setPhotos((prev) => [...succeeded, ...prev]);
            }

            if (failedCount > 0) {
              showNotification(`${failedCount} photos failed to upload`, "error");
            }

            setPendingPhotos((prev) => {
              for (const p of prev) {
                try {
                  URL.revokeObjectURL(p.previewUrl);
                } catch { }
              }
              return [];
            });

            window.dispatchEvent(new CustomEvent("task-photo-added", { detail: { taskId: newId } }));
          } catch (uploadErr) {
            console.error("[TaskDrawer] Photos upload error:", uploadErr);
            showNotification("Photo upload failed or timed out", "error");
          } finally {
            setUploading(false);
          }
        }

        window.dispatchEvent(new CustomEvent("task-created", { detail: { taskId: newId } }));
        showNotification(t("taskDrawer", "successCreate", "Task created successfully"), "success");

        // ✅ FIX #2: po ZAPISZ w create — zamknij drawer
        onClose();
        return;
      }


      // EDIT
      if (!taskId) throw new Error(t("taskDrawer", "errorMissingTaskId"));
      if (!isUuid(taskId)) throw new Error(t("taskDrawer", "errorInvalidTaskId"));

      // Use original values if fields haven't been edited (prevents saving translations)
      const finalTitle = titleDirty ? trimmedTitle : (task?.title || trimmedTitle);
      const finalDescription = descriptionDirty ? (description.trim() === "" ? null : description.trim()) : (task?.description || null);

      const nextDueDate = dueDate.trim() === "" ? null : dueDate.trim();
      const nextAssigned = trimmedAssigned ? trimmedAssigned : null;

      const patchBody: Record<string, any> = { id: taskId };

      if (isAdmin) {
        patchBody.title = finalTitle;
        patchBody.description = finalDescription;
        patchBody.status = status;
        patchBody.priority = priority;
        patchBody.due_date = nextDueDate;
        patchBody.assigned_user_id = nextAssigned;
      } else {
        patchBody.status = status;
        if (canEditFields) {
          patchBody.title = finalTitle;
          patchBody.description = finalDescription;
        }
        if (canEditPriority) {
          patchBody.priority = priority;
        }
        if (canEditDueDate) {
          patchBody.due_date = nextDueDate;
        }
      }

      await apiPatch<TaskRow>("/api/tasks", patchBody, token);

      if (task?.project_id) {
        await saveMaterials(taskId, task.project_id, token);
      }

      window.dispatchEvent(new CustomEvent("task-saved"));
      showNotification(t("taskDrawer", "successUpdate", "Task updated successfully"), "success");

      // ✅ FIX #2: po ZAPISZ w edit — zamknij drawer
      onClose();
    } catch (err: any) {
      console.error("Task save error:", err);

      // Offline handling
      const isOffline = !navigator.onLine || err.message === "Failed to fetch" || err.message?.includes("Network request failed");

      if (isOffline) {
        // Obliczenie danych do zapisu
        const finalTitle = titleDirty ? trimmedTitle : (task?.title || trimmedTitle);
        const finalDescription = descriptionDirty ? (description.trim() === "" ? null : description.trim()) : (task?.description || null);
        const nextDueDate = dueDate.trim() === "" ? null : dueDate.trim();
        const nextAssigned = trimmedAssigned ? trimmedAssigned : null;

        const { MutationQueue } = await import("@/lib/offline/queue");

        if (isCreate) {
          const d = createDraft!;
          const pendingForQueue: { fileName: string; caption: string | null; base64: string; photoType: string }[] = [];

          for (const p of pendingPhotos) {
            const b64 = await fileToBase64(p.file);
            pendingForQueue.push({
              fileName: p.file.name || "photo.jpg",
              caption: p.caption,
              base64: b64,
              photoType: p.photoType
            });
          }

          const taskData = {
            project_id: d.project_id,
            plan_id: d.plan_id,
            x_norm: d.x_norm,
            y_norm: d.y_norm,
            title: finalTitle,
            description: finalDescription,
            status,
            priority,
            due_date: nextDueDate,
            assigned_user_id: nextAssigned,
            is_question: isQuestionMode,
          };

          await MutationQueue.enqueue('CREATE_COMPOSITE_TASK', 'tasks', {
            taskData,
            photos: pendingForQueue
          });
        } else {
          // UPDATE (Existing Task)
          if (taskId) {
            // 1. Queue Task Update
            const patchBody: Record<string, any> = { id: taskId };
            if (isAdmin) {
              patchBody.title = finalTitle;
              patchBody.description = finalDescription;
              patchBody.status = status;
              patchBody.priority = priority;
              patchBody.due_date = nextDueDate;
              patchBody.assigned_user_id = nextAssigned;
            } else {
              patchBody.status = status;
              if (canEditFields) {
                patchBody.title = finalTitle;
                patchBody.description = finalDescription;
              }
              if (canEditPriority) patchBody.priority = priority;
              if (canEditDueDate) patchBody.due_date = nextDueDate;
            }

            await MutationQueue.enqueue('UPDATE', 'tasks', patchBody);

            // 2. Queue Pending Photos
            if (pendingPhotos.length) {
              for (const p of pendingPhotos) {
                const b64 = await fileToBase64(p.file);
                await MutationQueue.enqueue('CREATE', 'task_photos', {
                  task_id: taskId,
                  file_name: p.file.name || "photo.jpg",
                  caption: p.caption,
                  base64: b64,
                  photo_type: p.photoType,
                });
              }
            }
          }
        }

        alert(t("taskDrawer", "savedOffline", "Brak internetu. Zmiany zostały zapisane lokalnie i zostaną wysłane po odzyskaniu połączenia."));
        setPendingPhotos([]);
        onClose();
        return;
      }

      setErr(err?.message || String(err));
    } finally {
      setSaving(false);
    }
  }

  async function removeTask() {
    if (!taskId) return;
    setErr(null);
    if (!isUuid(taskId)) return setErr(t("taskDrawer", "errorInvalidTaskId"));

    if (!confirm(t("taskDrawer", "confirmDelete"))) return;

    try {
      await apiDelete(`/api/task?id=${taskId}`);

      window.dispatchEvent(new CustomEvent("task-deleted"));
      onClose();
    } catch (e: any) {
      setErr(e?.message || String(e));
    }
  }

  async function addComment() {
    if (!taskId) return;
    if (!newComment.trim()) return;

    setErr(null);
    try {
      const data = await apiPost<TaskComment>("/api/task-comments", {
        task_id: taskId,
        comment: newComment.trim(),
      });

      setComments((prev) => [...prev, data]);
      setNewComment("");
    } catch (e: any) {
      setErr(e?.message || String(e));
    }
  }

  // Drawer slide state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const prevCanShowRef = useRef<boolean>(canShow);

  useEffect(() => {
    if (canShow && !prevCanShowRef.current) {
      setDrawerOpen(true);
    }
    if (!canShow) {
      setDrawerOpen(false);
    }
    prevCanShowRef.current = canShow;
  }, [canShow]);

  useEffect(() => {
    if (taskId || createDraft) {
      setDrawerOpen(true);
    }
  }, [taskId, createDraft]);

  // Always render the handle, it toggles the panel
  return (
    <>


      {/* overlay */}
      {
        showOverlay && drawerOpen && (
          <div
            onClick={() => setDrawerOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.45)",
              zIndex: 9998,
            }}
          />
        )
      }

      {/* CARD */}
      <div
        className={`fixed inset-y-0 right-0 w-full md:top-12 md:bottom-12 md:right-12 md:w-[calc(100%-6rem)] lg:w-[750px] p-4 md:p-8 bg-ui-card/95 backdrop-blur-[80px] border-l md:border border-ui-border/50 rounded-none md:rounded-xl shadow-[-120px_0_300px_rgba(0,0,0,0.95)] z-[9999] flex flex-col transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] ${drawerOpen ? "translate-x-0 opacity-100 scale-100" : "translate-x-[120%] opacity-0 scale-95"
          }`}
      >
        <div className="w-full h-full flex flex-col overflow-hidden rounded-none md:rounded-xl relative">
          {/* HEADER */}
          <header className="relative flex flex-col justify-center px-4 md:px-8 pt-6 md:pt-8 pb-6 md:pb-8 border-b border-ui-border/20 bg-transparent shrink-0">
            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-ui-accent to-transparent opacity-50" />

            <div className="flex items-center justify-between mb-4">
              <div className="flex flex-col gap-1">
                <h2 className="text-3xl font-black tracking-tighter text-ui-text uppercase leading-none">{headerTitle}</h2>
                {taskId && <span className="text-[12px] font-black text-ui-accent tracking-[0.3em] uppercase opacity-60">REF: {taskId.slice(0, 8)}</span>}
              </div>

              <div className="flex items-center gap-4">
                {isAdmin && !isCreate && !!taskId && (
                  <button
                    onClick={removeTask}
                    className="w-12 h-12 flex items-center justify-center rounded-xl border border-danger/30 bg-danger/5 text-danger hover:bg-danger hover:text-white transition-all active:scale-90"
                    title={t("common", "delete")}
                  >
                    <span className="text-lg">🗑️</span>
                  </button>
                )}

                <button
                  onClick={onClose}
                  className="w-12 h-12 flex items-center justify-center rounded-xl border border-ui-border bg-white/5 text-ui-text hover:bg-white/10 transition-all active:scale-90"
                  aria-label="Close"
                >
                  <span className="text-2xl leading-none">✕</span>
                </button>
              </div>
            </div>
          </header>

          {/* BODY */}
          <div className="flex-grow overflow-y-auto custom-scrollbar p-5 md:p-8 space-y-12 md:space-y-16">
            {err && (
              <div className="p-4 bg-danger/10 border border-danger/20 rounded-xl text-danger text-xs font-black uppercase tracking-widest animate-in fade-in slide-in-from-top-2">
                {err}
              </div>
            )}

            {!isCreate && translatingContent && (
              <div className="p-3 bg-ui-accent/10 border border-ui-accent/20 rounded-lg text-ui-accent text-[10px] font-black uppercase tracking-widest animate-pulse">
                {t("taskDrawer", "autoTranslateLoading")} ({language.toUpperCase()})
              </div>
            )}

            <div className="space-y-8">
              <div className="space-y-2 group">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-ui-muted/60 pl-1 group-focus-within:text-ui-accent transition-colors">
                  {t("taskDrawer", "title")}
                </label>
                <input
                  value={title}
                  onChange={(e) => {
                    setTitleDirty(true);
                    setTitle(e.target.value);
                  }}
                  className="w-full bg-white/5 border border-ui-border rounded-xl px-5 py-4 text-sm font-bold text-ui-text placeholder:text-ui-muted/20 focus:outline-none focus:border-ui-accent transition-all hover:bg-white/10"
                  disabled={!canEditFields}
                />
                {!isCreate && renderTranslationSegment(makeTranslationKey("task.title", task?.id), task?.title || title)}
              </div>

              <div className="space-y-2 group">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-ui-muted/60 pl-1 group-focus-within:text-ui-accent transition-colors">
                  {t("taskDrawer", "description")}
                </label>
                <textarea
                  value={description}
                  onChange={(e) => {
                    setDescriptionDirty(true);
                    setDescription(e.target.value);
                  }}
                  className="w-full bg-white/5 border border-ui-border rounded-xl px-5 py-4 text-sm font-medium text-ui-text leading-relaxed min-h-[140px] focus:outline-none focus:border-ui-accent transition-all hover:bg-white/10 resize-none"
                  disabled={!canEditFields}
                />
                {!isCreate && renderTranslationSegment(makeTranslationKey("task.description", task?.id), task?.description || description)}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                <div className="space-y-3 group">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-ui-muted/60 pl-1 group-focus-within:text-ui-accent transition-colors">
                    {t("taskDrawer", "status")}
                  </label>
                  <div className="relative">
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as any)}
                      className="w-full bg-black/40 border border-ui-border rounded-xl px-5 py-4 text-xs font-black uppercase tracking-tight text-ui-text appearance-none hover:bg-white/5 focus:outline-none focus:border-ui-accent transition-all disabled:opacity-50"
                      disabled={!canUpdateStatus}
                    >
                      {!isQuestionMode ? (
                        <>
                          <option value="OPEN" className="bg-ui-bg">{t("taskStatus", "OPEN")}</option>
                          <option value="IN_PROGRESS" className="bg-ui-bg">{t("taskStatus", "IN_PROGRESS")}</option>
                          <option value="DONE_WAITING_APPROVAL" className="bg-ui-bg">{t("taskStatus", "DONE_WAITING_APPROVAL")}</option>
                          <option value="APPROVED" className="bg-ui-bg">{t("taskStatus", "APPROVED")}</option>
                          <option value="REJECTED" className="bg-ui-bg">{t("taskStatus", "REJECTED")}</option>
                        </>
                      ) : (
                        <>
                          <option value="OPEN" className="bg-ui-bg">{t("taskStatus", "OPEN", "Zadane")}</option>
                          <option value="APPROVED" className="bg-ui-bg">{t("taskStatus", "APPROVED", "Odpowiedź")}</option>
                        </>
                      )}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-ui-muted/40 text-[8px]">▼</div>
                  </div>
                </div>

                <div className="space-y-3 group">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-ui-muted/60 pl-1 group-focus-within:text-ui-accent transition-colors">
                    {t("taskDrawer", "assignedUser")}
                  </label>
                  <div className="relative">
                    <select
                      value={assignedUserId}
                      onChange={(e) => setAssignedUserId(e.target.value)}
                      className="w-full bg-black/40 border border-ui-border rounded-xl px-5 py-4 text-xs font-bold text-ui-text appearance-none hover:bg-white/5 focus:outline-none focus:border-ui-accent transition-all disabled:opacity-50"
                      disabled={!isAdmin}
                    >
                      <option value="" className="bg-ui-bg">—</option>
                      {profiles
                        .filter((p) => !isQuestionMode || String((p as any).role || "").toUpperCase() === "ADMIN")
                        .map((p) => (
                          <option key={p.id} value={p.id} className="bg-ui-bg">
                            {p.full_name}
                          </option>
                        ))}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-ui-muted/40 text-[8px]">▼</div>
                  </div>
                </div>
              </div>

              {!isQuestionMode && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                  <div className="space-y-3 group">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-ui-muted/60 pl-1 group-focus-within:text-ui-accent transition-colors">
                      {t("taskDrawer", "priority")}
                    </label>
                    <div className="relative">
                      <select
                        value={priority}
                        onChange={(e) => setPriority(e.target.value as any)}
                        className="w-full bg-black/40 border border-ui-border rounded-xl px-5 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-ui-text appearance-none hover:bg-white/5 focus:outline-none focus:border-ui-accent transition-all disabled:opacity-50"
                        disabled={!canEditPriority}
                      >
                        <option value="LOW" className="bg-ui-bg">{t("taskPriority", "LOW")}</option>
                        <option value="MEDIUM" className="bg-ui-bg">{t("taskPriority", "MEDIUM")}</option>
                        <option value="HIGH" className="bg-ui-bg">{t("taskPriority", "HIGH")}</option>
                        <option value="CRITICAL" className="bg-ui-bg">{t("taskPriority", "CRITICAL")}</option>
                      </select>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-ui-muted/40 text-[8px]">▼</div>
                    </div>
                  </div>

                  <div className="space-y-3 group">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-ui-muted/60 pl-1 group-focus-within:text-ui-accent transition-colors">
                      {t("taskDrawer", "dueDate")}
                    </label>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full bg-black/40 border border-ui-border rounded-xl px-5 py-4 text-xs font-bold text-ui-text focus:outline-none focus:border-ui-accent transition-all hover:bg-white/5 disabled:opacity-50 no-calendar-icon"
                      disabled={!canEditDueDate}
                    />
                  </div>
                </div>
              )}
            </div>


            {/* PLAN MAP PREVIEW */}
            {/* Usunięto podgląd mapy z pinem i link do pełnej mapy na prośbę użytkownika */}
            {/* WORKFLOW BUTTONS */}
            {/* WORKFLOW BUTTONS */}
            {!isCreate && canUpdateStatus && !isQuestionMode && (
              <div className="space-y-5 pt-8 border-t border-ui-border/30">
                <div className="text-[10px] font-bold text-ui-accent uppercase tracking-[0.2em] pl-1">{t("taskDrawer", "workflowActions")}</div>
                <div className="flex flex-wrap gap-4">
                  {status === "OPEN" && !isWorking && !hasAfterPhoto && (
                    <>
                      <button
                        onClick={() => {
                          if (!hasBeforePhoto) {
                            window.alert(t("taskDrawer", "startWorkHint", "Aby rozpocząć pracę, musisz dodać zdjęcie PRZED pracą. Użyj przycisku 'Dodaj zdjęcie'."));
                            return;
                          }
                          setIsWorking(true);
                          setNextPhotoType("AFTER");
                        }}
                        className="px-6 py-3.5 rounded-xl border border-ui-accent bg-ui-accent/10 text-ui-accent text-[10px] font-black uppercase tracking-[0.2em] hover:bg-ui-accent hover:text-ui-bg transition-all active:scale-95 shadow-lg"
                      >
                        ▶ {t("taskDrawer", "startWork")}
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => setStatus("APPROVED")}
                          className="px-6 py-3.5 rounded-xl border border-success bg-success/10 text-success text-[10px] font-black uppercase tracking-[0.2em] hover:bg-success hover:text-black transition-all active:scale-95 shadow-lg"
                        >
                          ✓ {t("taskDrawer", "approve")}
                        </button>
                      )}
                    </>
                  )}

                  {status === "IN_PROGRESS" && (
                    <button
                      onClick={() => {
                        if (!ensureAfterPhotoPresent()) return;
                        setStatus("DONE_WAITING_APPROVAL");
                        setTimeout(() => {
                          window.dispatchEvent(
                            new CustomEvent("task-submitted-for-approval", {
                              detail: { title: title || (task && task.title) || "" },
                            })
                          );
                        }, 0);
                      }}
                      className="px-6 py-3.5 rounded-xl border border-warning bg-warning/10 text-warning text-[10px] font-black uppercase tracking-[0.2em] hover:bg-warning hover:text-black transition-all active:scale-95 shadow-lg"
                    >
                      ⏹ {t("taskDrawer", "markDone")}
                    </button>
                  )}

                  {status === "DONE_WAITING_APPROVAL" && isAdmin && (
                    <>
                      <button
                        onClick={() => setStatus("APPROVED")}
                        className="px-6 py-3.5 rounded-xl border border-success bg-success/10 text-success text-[10px] font-black uppercase tracking-[0.2em] hover:bg-success hover:text-black transition-all active:scale-95 shadow-lg"
                      >
                        ✓ {t("taskDrawer", "approve")}
                      </button>
                      <button
                        onClick={() => setStatus("REJECTED")}
                        className="px-6 py-3.5 rounded-xl border border-danger bg-danger/10 text-danger text-[10px] font-black uppercase tracking-[0.2em] hover:bg-danger hover:text-white transition-all active:scale-95 shadow-lg"
                      >
                        ✕ {t("taskDrawer", "reject")}
                      </button>
                    </>
                  )}

                  {(status === "APPROVED" || status === "REJECTED") && (
                    <div className="text-[10px] font-black text-ui-muted uppercase tracking-[0.1em] flex items-center gap-3 bg-white/5 px-4 py-3 rounded-lg border border-white/5">
                      <span className={`w-2 h-2 rounded-full ${status === 'APPROVED' ? 'bg-success shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-danger shadow-[0_0_10px_rgba(239,68,68,0.5)]'}`} />
                      {t("taskDrawer", "finalStatus")}: {status === "APPROVED" ? t("taskDrawer", "approvedStatus") : t("taskDrawer", "rejectedStatus")}
                    </div>
                  )}
                </div>
                {!hasAfterPhoto && status === "IN_PROGRESS" && (
                  <div className="p-5 bg-warning/10 border border-warning/20 rounded-xl text-[10px] font-bold text-warning uppercase tracking-[0.1em] leading-relaxed">
                    💡 {t("taskDrawer", "afterPhotoHint", "Dodaj zdjęcie po wykonaniu prac, aby zgłosić zadanie do akceptacji.")}
                  </div>
                )}
              </div>
            )}

            {/* QUESTIONS: Simple Reply/Close workflow */}
            {!isCreate && isQuestionMode && isAdmin && status === "OPEN" && (
              <div className="space-y-4 pt-4 border-t border-ui-border/30">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-ui-muted/50 pl-1">{t("taskDrawer", "workflowActions")}</div>
                <button
                  onClick={() => setStatus("APPROVED")}
                  className="w-full px-5 py-4 rounded-lg border border-ui-accent/30 bg-ui-accent/5 text-ui-accent text-xs font-black uppercase tracking-widest hover:bg-ui-accent hover:text-ui-bg transition-all active:scale-95 shadow-[0_0_15px_rgba(56,189,248,0.1)]"
                >
                  {t("taskDrawer", "markAnswered", "Oznacz jako odpowiedziane")}
                </button>
              </div>
            )}

            {/* ACTIONS */}
            <div className="flex items-center gap-6 pt-10 border-t border-ui-border/30">
              <button
                onClick={save}
                disabled={saving || uploading || !canSubmit}
                className="flex-1 py-4 rounded-xl bg-ui-accent text-ui-bg text-xs font-black uppercase tracking-[0.2em] shadow-[0_0_30px_rgba(56,189,248,0.3)] transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
              >
                {saving ? t("taskDrawer", "saving") : t("common", "save")}
              </button>

              <button
                onClick={onClose}
                disabled={saving || uploading}
                className="flex-1 py-4 rounded-xl border border-ui-border bg-white/5 text-ui-text text-xs font-black uppercase tracking-[0.2em] transition-all hover:bg-white/10 active:scale-[0.98] disabled:opacity-50"
              >
                {t("taskDrawer", "close")}
              </button>
            </div>

            {/* MATERIALS AND PHOTOS */}
            <div className="space-y-12 pt-8 border-t border-ui-border/30">
              {/* ANFORDERUNGEN (MATERIALS) */}
              <div className="space-y-6">
                <div className="flex items-center justify-between px-1">
                  <div className="flex flex-col gap-0.5">
                    <h3 className="text-sm font-black uppercase tracking-widest text-ui-text">{t("common", "materials", "Anforderungen")}</h3>
                    <div className="text-[10px] font-bold text-ui-muted/50 uppercase tracking-tight">{t("home", "settingsSubtitle", "Manage supplies")}</div>
                  </div>
                  <button
                    onClick={() => setShowMaterialSearch(!showMaterialSearch)}
                    className={`px-4 py-2 rounded-lg border text-[10px] font-black uppercase tracking-widest transition-all active:scale-90 ${showMaterialSearch ? "border-danger/30 text-danger bg-danger/5" : "border-ui-accent/30 text-ui-accent bg-ui-accent/5 hover:bg-ui-accent hover:text-ui-bg"
                      }`}
                  >
                    {showMaterialSearch ? t("common", "cancel") : t("materials", "addMaterial")}
                  </button>
                </div>

                {showMaterialSearch && (
                  <div className="relative animate-in slide-in-from-top-4 duration-300">
                    <input
                      autoFocus
                      placeholder={t("materials", "searchPlaceholder", "Szukaj materiału...")}
                      value={materialSearchQuery}
                      onChange={(e) => setMaterialSearchQuery(e.target.value)}
                      className="w-full bg-black/40 border border-ui-border rounded-xl px-5 py-4 text-sm font-medium text-ui-text focus:outline-none focus:border-ui-accent transition-all ring-ui-accent/10 focus:ring-4"
                    />
                    {isSearchingMaterials && <div className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-ui-accent border-t-transparent rounded-full animate-spin" />}

                    {materialSearchResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-ui-card border border-ui-border rounded-xl shadow-2xl z-[100] overflow-hidden animate-in zoom-in-95">
                        {materialSearchResults.map((m) => (
                          <button
                            key={m.id}
                            onClick={() => addMaterial(m)}
                            className="w-full text-left px-5 py-4 border-b border-ui-border/50 hover:bg-white/5 transition-colors group/item"
                          >
                            <div className="font-bold text-sm text-ui-text group-hover/item:text-ui-accent transition-colors">{m.display_name || m.name}</div>
                            <div className="text-[10px] font-medium text-ui-muted/60 mt-0.5">
                              {m.article_number && <span className="text-ui-accent/60 mr-2">[{m.article_number}]</span>}
                              {m.category} · {m.unit}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {selectedMaterials.length > 0 ? (
                  <div className="grid grid-cols-1 gap-3">
                    {selectedMaterials.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center gap-4 bg-white/5 border border-ui-border/50 p-4 rounded-xl transition-all hover:bg-white/10 group/mat"
                      >
                        <div className="flex-grow">
                          <div className="text-sm font-bold text-ui-text leading-tight">{m.name}</div>
                          {m.article_number && <div className="text-[10px] font-bold text-ui-accent/40 uppercase mt-0.5 tracking-wider">{m.article_number}</div>}
                        </div>
                        <div className="flex items-center gap-3 bg-black/20 px-3 py-1.5 rounded-lg border border-white/5">
                          <input
                            type="number"
                            min="1"
                            value={m.quantity}
                            onChange={(e) => updateMaterialQty(m.id, e.target.value === "" ? "" : Number(e.target.value))}
                            className="w-12 bg-transparent text-sm font-black text-ui-accent text-center focus:outline-none"
                          />
                          <span className="text-[10px] font-black uppercase text-ui-muted/60">{m.unit}</span>
                        </div>
                        <button
                          onClick={() => removeMaterial(m.id)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-danger/30 hover:text-danger hover:bg-danger/10 transition-all opacity-0 group-hover/mat:opacity-100"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  !showMaterialSearch && (
                    <div className="p-8 text-center border border-dashed border-ui-border/30 rounded-xl text-[10px] font-black uppercase tracking-widest text-ui-muted/30">
                      {t("materials", "noMaterials") || "Brak wybranych materiałów"}
                    </div>
                  )
                )}
              </div>

              {/* PHOTOS */}
              <div className="space-y-6 pt-12 border-t border-ui-border/30">
                <div className="flex flex-col gap-0.5 px-1">
                  <h3 className="text-sm font-black uppercase tracking-widest text-ui-text">{t("taskDrawer", "photos")}</h3>
                  <div className="text-[10px] font-bold text-ui-muted/50 uppercase tracking-tight">{t("home", "settingsSubtitle", "Evidence and documentation")}</div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end bg-black/20 p-4 rounded-xl border border-white/5 shadow-inner">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-ui-muted/60 pl-1">{t("taskDrawer", "captionLabel")}</label>
                    <input
                      value={caption}
                      onChange={(e) => setCaption(e.target.value)}
                      className="w-full bg-white/5 border border-ui-border rounded-lg px-4 py-2.5 text-xs font-bold text-ui-text focus:outline-none focus:border-ui-accent transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-ui-muted/60 pl-1">{t("taskDrawer", "photoPhase")}</label>
                    <div className="relative">
                      <select
                        value={nextPhotoType}
                        onChange={(e) => setNextPhotoType(e.target.value as PhotoType)}
                        className="w-full bg-white/5 border border-ui-border rounded-lg px-4 py-2.5 text-xs font-black uppercase tracking-tight text-ui-text appearance-none focus:outline-none focus:border-ui-accent transition-all"
                      >
                        <option value="BEFORE" className="bg-ui-bg">{t("taskDrawer", "photoPhaseBefore", "Przed pracą")}</option>
                        {(status !== "OPEN" || isWorking || hasAfterPhoto) && (
                          <option value="AFTER" className="bg-ui-bg">{t("taskDrawer", "photoPhaseAfter", "Po pracy")}</option>
                        )}
                      </select>
                    </div>
                  </div>

                  {(() => {
                    let uiBlocked = false;
                    let blockMsg = "";
                    if (!isQuestionMode) {
                      if (nextPhotoType === "BEFORE" && hasBeforePhoto) {
                        uiBlocked = true;
                        blockMsg = t("taskDrawer", "beforePhotoExists");
                      } else if (nextPhotoType === "AFTER" && hasAfterPhoto) {
                        uiBlocked = true;
                        blockMsg = t("taskDrawer", "afterPhotoExists");
                      } else if (nextPhotoType === "AFTER" && !hasBeforePhoto) {
                        uiBlocked = true;
                        blockMsg = t("taskDrawer", "beforePhotoMissing");
                      }
                    }
                    const isInputDisabled = uploading || !canManagePhotos || uiBlocked;

                    return (
                      <div className="space-y-2">
                        <label className={`relative flex items-center justify-center w-full px-4 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-[0.2em] transition-all active:scale-95 cursor-pointer shadow-lg overflow-hidden group ${isInputDisabled ? "bg-ui-muted/10 border border-ui-border text-ui-muted/30 cursor-not-allowed" : "bg-ui-accent border border-ui-accent text-ui-bg hover:brightness-110 shadow-[0_0_20px_rgba(56,189,248,0.2)]"
                          }`}>
                          {!isInputDisabled && <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />}
                          <span className="relative z-10">{t("taskDrawer", "addPhotoBtn")}</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={isInputDisabled}
                            onChange={(e) => {
                              if (!canManagePhotos) return;
                              const f = e.target.files?.[0];
                              if (!f) return;
                              e.currentTarget.value = "";
                              if (isCreate) {
                                setUploading(true);
                                addPending(f).finally(() => setUploading(false));
                                return;
                              }
                              if (!taskId) return;
                              setUploading(true);
                              (async () => {
                                try {
                                  let fileToUpload = f;
                                  if (f.type.startsWith("image/")) {
                                    try {
                                      const coords = await GeolocationService.getCurrentPosition();
                                      fileToUpload = await applyWatermark(f, coords, language);
                                    } catch (err) {
                                      console.error("Watermarking failed:", err);
                                    }
                                  }
                                  const actualPhotoType = (status === "OPEN" && !isWorking) ? "BEFORE" : nextPhotoType;
                                  const ph = await uploadOne(taskId, fileToUpload, caption.trim() === "" ? null : caption.trim(), actualPhotoType);
                                  setCaption("");
                                  setPhotos((prev) => [ph, ...prev]);
                                  if (actualPhotoType === "AFTER" && status !== "DONE_WAITING_APPROVAL") {
                                    setStatus("DONE_WAITING_APPROVAL");
                                    apiPatch("/api/tasks", { id: taskId, status: "DONE_WAITING_APPROVAL" }).catch(e => console.error(e));
                                    window.dispatchEvent(new CustomEvent("task-saved"));
                                    setTimeout(() => {
                                      window.dispatchEvent(new CustomEvent("task-submitted-for-approval", { detail: { title: title || (task && task.title) || "" } }));
                                    }, 0);
                                  }
                                  apiGet<TaskHistoryRow[]>(`/api/task-history?taskId=${encodeURIComponent(taskId!)}`).then(h => setHistory(h || [])).catch(() => { });
                                  window.dispatchEvent(new CustomEvent("task-photo-added", { detail: { taskId } }));
                                } catch (e2: any) {
                                  setErr(e2?.message || String(e2));
                                } finally {
                                  setUploading(false);
                                }
                              })();
                            }}
                          />
                        </label>
                        {blockMsg && <div className="text-[9px] font-black uppercase text-danger/60 px-1 tracking-tighter leading-none">{blockMsg}</div>}
                      </div>
                    );
                  })()}
                </div>

                {/* PHOTO GALLERY */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {/* PENDING PHOTOS */}
                  {pendingPhotos.map((p) => (
                    <div
                      key={p.id}
                      className="relative aspect-[4/3] rounded-xl overflow-hidden group/img border border-ui-border shadow-2xl cursor-zoom-in"
                      onClick={() => setPreviewUrl(p.previewUrl)}
                    >
                      <div className={`absolute top-2 left-2 z-10 px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest text-white backdrop-blur-md border border-white/20 shadow-lg ${p.photoType === "AFTER" ? "bg-success/60" : "bg-ui-accent/60"
                        }`}>
                        {p.photoType === "AFTER" ? t("taskDrawer", "photoPhaseAfter") : t("taskDrawer", "photoPhaseBefore")}
                      </div>
                      <img src={p.previewUrl} alt="" className="w-full h-full object-cover grayscale-[0.2] group-hover/img:grayscale-0 group-hover/img:scale-110 transition-all duration-700" />
                      <button onClick={(e) => { e.stopPropagation(); removePending(p.id); }} className="absolute top-2 right-2 z-20 w-8 h-8 rounded-full bg-black/60 backdrop-blur-xl text-white flex items-center justify-center transition-all hover:bg-danger border border-white/10 active:scale-90">✕</button>
                      <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
                        <div className="text-[9px] text-white font-bold line-clamp-2 leading-tight">{p.caption || "Pending upload..."}</div>
                      </div>
                    </div>
                  ))}

                  {/* EXISTING PHOTOS */}
                  {photos.map((p) => (
                    <div key={p.id} className="relative aspect-[4/3] rounded-xl overflow-hidden group/img border border-ui-border shadow-2xl cursor-zoom-in">
                      <div className={`absolute top-2 left-2 z-10 px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest text-white backdrop-blur-md border border-white/20 shadow-lg ${(p.photo_type || "BEFORE") === "AFTER" ? "bg-success/60" : "bg-ui-accent/60"
                        }`}>
                        {(p.photo_type || "BEFORE") === "AFTER" ? t("taskDrawer", "photoPhaseAfter") : t("taskDrawer", "photoPhaseBefore")}
                      </div>
                      <div
                        onClick={() => {
                          setPreviewUrl(getApiUrl(p.url));
                          setPreviewPhotoShapes(shapesByPhoto[p.id] || null);
                        }}
                        className="w-full h-full block"
                      >
                        {shapesByPhoto[p.id] && shapesByPhoto[p.id].length > 0 ? (
                          <div className="w-full h-full pointer-events-none">
                            <AufmassCanvas
                              imageUrl={getApiUrl(p.url)}
                              shapes={shapesByPhoto[p.id]}
                              readOnly={true}
                            />
                          </div>
                        ) : (
                          <img src={getApiUrl(p.url)} alt={p.caption || ""} className="w-full h-full object-cover grayscale-[0.2] group-hover/img:grayscale-0 group-hover/img:scale-110 transition-all duration-700" loading="lazy" />
                        )}
                      </div>
                      
                      {isAdmin && (
                        <button
                          onClick={async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!confirm(t("common", "confirmDelete"))) return;
                            try {
                              setUploading(true);
                              await apiDelete(`/api/task-photos?id=${p.id}`);
                              setPhotos((prev) => prev.filter((x) => x.id !== p.id));
                              apiGet<TaskHistoryRow[]>(`/api/task-history?taskId=${encodeURIComponent(taskId!)}`).then(h => setHistory(h || [])).catch(() => { });
                              window.dispatchEvent(new CustomEvent("task-photo-deleted", { detail: { photoId: p.id, taskId } }));
                            } catch (err: any) { setErr(err.message || String(err)); } finally { setUploading(false); }
                          }}
                          className="absolute top-2 right-2 z-20 w-8 h-8 rounded-full bg-black/60 backdrop-blur-xl text-white flex items-center justify-center transition-all hover:bg-danger border border-white/10 active:scale-90"
                        >✕</button>
                      )}

                      {isQuestionMode && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditPhoto(p).catch(() => {});
                          }}
                          className="absolute bottom-2 left-2 right-2 px-2 py-2 bg-indigo-600/90 text-white text-[10px] font-black uppercase tracking-widest rounded-xl opacity-0 group-hover/img:opacity-100 transition-all hover:bg-indigo-500 shadow-xl z-20"
                        >
                          {t("aufmass", "editInAufmassBtn", "Edit in Aufmaß")}
                        </button>
                      )}

                      <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
                        <div className="text-[9px] text-white font-bold line-clamp-2 leading-tight">{p.caption || t("common", "noPhoto")}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {photos.length === 0 && pendingPhotos.length === 0 && (
                  <div className="p-8 text-center border border-dashed border-ui-border/30 rounded-xl text-[10px] font-black uppercase tracking-widest text-ui-muted/30">{t("taskDrawer", "photos")}: 0</div>
                )}

                {isCreate && pendingPhotos.length === 0 && (
                  <div className="p-4 bg-warning/5 border border-warning/20 rounded-xl text-[10px] font-bold text-warning uppercase tracking-widest text-center animate-pulse">
                    {t("taskDrawer", "beforePhotoMissing")}
                  </div>
                )}

                {!isCreate && !hasAfterPhoto && status === "IN_PROGRESS" && (
                  <div className="p-4 bg-warning/5 border border-warning/20 rounded-xl text-[10px] font-bold text-warning uppercase tracking-widest text-center italic">
                    {t("taskDrawer", "afterPhotoMissing")}
                  </div>
                )}
              </div>
            </div>

            {/* COMMENTS & HISTORY */}
            {!isCreate && (
              <div className="p-4 md:p-8 space-y-8 md:space-y-12 bg-black/10 border-t border-ui-border/30">
                {/* COMMENTS */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between px-1">
                    <div className="flex flex-col gap-0.5">
                      <h3 className="text-sm font-black uppercase tracking-widest text-ui-text">{t("taskDrawer", "comments")} ({comments.length})</h3>
                      <div className="text-[10px] font-bold text-ui-muted/50 uppercase tracking-tight">{t("home", "settingsSubtitle", "Team communication")}</div>
                    </div>
                  </div>

                  {/* Add comment input */}
                  <div className="relative group/comm">
                    <textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder={t("taskDrawer", "addComment")}
                      className="w-full bg-white/5 border border-ui-border rounded-xl px-5 py-4 pr-16 text-sm font-medium text-ui-text leading-relaxed min-h-[100px] focus:outline-none focus:border-ui-accent transition-all hover:bg-white/10 resize-none shadow-inner"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          addComment();
                        }
                      }}
                    />
                    <button
                      onClick={addComment}
                      disabled={!newComment.trim()}
                      className="absolute bottom-4 right-4 w-10 h-10 rounded-lg bg-ui-accent text-ui-bg flex items-center justify-center shadow-lg transition-all active:scale-90 disabled:opacity-50 disabled:grayscale"
                    >
                      <span className="text-lg">↵</span>
                    </button>
                  </div>

                  {/* Comments list */}
                  {comments.length > 0 ? (
                    <div className="space-y-4 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                      {comments.map((c) => {
                        const profile = profiles.find((p) => p.id === c.user_id);
                        const userName = profile?.full_name || c.user_id.slice(0, 8);
                        const timestamp = new Date(c.created_at).toLocaleString(localeByLang[language] || "en-US", {
                          year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
                        });
                        const isMe = c.user_id === currentUserId;

                        return (
                          <div key={c.id} className={`flex flex-col gap-1 ${isMe ? "items-end" : "items-start"}`}>
                            <div className="flex items-center gap-2 px-1">
                              <span className="text-[9px] font-black uppercase text-ui-muted/60 tracking-widest">{userName}</span>
                              <span className="text-[9px] font-medium text-ui-muted/30 tracking-tight">{timestamp}</span>
                            </div>
                            <div className={`max-w-[90%] px-5 py-4 rounded-xl text-xs font-medium leading-relaxed border transition-all ${isMe
                              ? "bg-ui-accent/10 border-ui-accent/20 rounded-tr-none text-ui-text"
                              : "bg-white/5 border-ui-border rounded-tl-none text-ui-muted"
                              }`}>
                              {c.comment}
                              {renderTranslationSegment(makeTranslationKey("comment", c.id), c.comment)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-8 text-center border border-dashed border-ui-border/30 rounded-xl text-[10px] font-black uppercase tracking-widest text-ui-muted/30 italic">
                      {t("taskDrawer", "noComments")}
                    </div>
                  )}
                </div>

                {/* HISTORY */}
                <div className="space-y-6 pt-12 border-t border-ui-border/10">
                  <div className="flex flex-col gap-0.5 px-1">
                    <h3 className="text-sm font-black uppercase tracking-widest text-ui-text">{t("taskDrawer", "history")}</h3>
                    <div className="text-[10px] font-bold text-ui-muted/50 uppercase tracking-tight">{t("home", "settingsSubtitle", "Audit trail")}</div>
                  </div>

                  {history.length > 0 ? (
                    <div className="space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                      {history.map((h) => {
                        const actor = profiles.find((p) => p.id === h.changed_by);
                        const actorName = actor?.full_name || (h.changed_by ? h.changed_by.slice(0, 8) : "—");
                        const timestamp = new Date(h.created_at).toLocaleString(localeByLang[language] || "en-US", {
                          year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
                        });
                        const action = h.action || h.summary || t("taskDrawer", "historyUpdate");

                        return (
                          <div key={h.id} className="p-4 bg-white/5 border border-ui-border/30 rounded-xl hover:bg-white/10 transition-colors group/hist">
                            <div className="flex items-start justify-between gap-4">
                              <div className="text-xs font-bold text-ui-text/80 leading-snug">{action}</div>
                              <div className="text-[9px] font-black text-ui-accent uppercase tracking-tighter shrink-0 pt-1">
                                {actorName.split(" ")[0]}
                              </div>
                            </div>
                            <div className="mt-2 text-[9px] font-medium text-ui-muted/40 uppercase tracking-widest">{timestamp}</div>
                            {renderTranslationSegment(makeTranslationKey("history", h.id), action)}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-8 text-center border border-dashed border-ui-border/30 rounded-xl text-[10px] font-black uppercase tracking-widest text-ui-muted/30">
                      {t("taskDrawer", "noHistory", "No history yet")}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        <PhotoLightbox
          url={previewUrl}
          shapes={previewPhotoShapes}
          onClose={() => {
            setPreviewUrl(null);
            setPreviewPhotoShapes(null);
          }}
        />
        
        {aufmassPhoto && (
          <AufmassEditor
            photoUrl={aufmassPhoto.url}
            photoId={aufmassPhoto.id}
            taskId={task?.id || taskId || undefined}
            projectId={task?.project_id || createDraft?.project_id || ""}
            existingSessionId={aufmassPhoto.sessionId}
            sessionType="aufmass"
            onClose={() => {
              setAufmassPhoto(null);
              if (taskId) {
                loadAll(taskId).catch(() => {});
              }
            }}
          />
        )}
      </div>
    </>
  );
}
