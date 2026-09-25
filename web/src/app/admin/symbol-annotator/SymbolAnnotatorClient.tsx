"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Save, Trash2, HelpCircle, ChevronRight, ChevronLeft, CheckCircle2, AlertCircle, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";

interface ImageItem {
  id: string;
  filename: string;
  split: "train" | "val" | "expanded_100";
  hasLabel: boolean;
  boxCount: number;
  status: "brak" | "w trakcie" | "gotowe";
}

interface YoloBox {
  class_id: number;
  x_center: number;
  y_center: number;
  width: number;
  height: number;
}

interface CanvasBox {
  id: string;
  class_id: number;
  x_min: number;
  y_min: number;
  x_max: number;
  y_max: number;
}

const CLASSES = [
  { id: 0, name: "steckdose_230v", label: "0: Gniazdo 230V", color: "#3b82f6", bg: "bg-blue-600/20", border: "border-blue-500", text: "text-blue-400" },
  { id: 1, name: "steckdose_400v", label: "1: Gniazdo 400V / CEE", color: "#ef4444", bg: "bg-red-600/20", border: "border-red-500", text: "text-red-400" },
  { id: 2, name: "schalter", label: "2: Włącznik / Schalter", color: "#10b981", bg: "bg-emerald-600/20", border: "border-emerald-500", text: "text-emerald-400" },
  { id: 3, name: "leuchte", label: "3: Oprawa / Oświetlenie", color: "#f59e0b", bg: "bg-amber-600/20", border: "border-amber-500", text: "text-amber-400" },
  { id: 4, name: "verteilung", label: "4: Rozdzielnica (UV/SV)", color: "#8b5cf6", bg: "bg-purple-600/20", border: "border-purple-500", text: "text-purple-400" },
  { id: 5, name: "sonstiges_elektro", label: "5: Inne elektro / Puszka", color: "#06b6d4", bg: "bg-cyan-600/20", border: "border-cyan-500", text: "text-cyan-400" },
  { id: 6, name: "steckdose_edv", label: "6: Gniazdo EDV / LAN", color: "#ec4899", bg: "bg-pink-600/20", border: "border-pink-500", text: "text-pink-400" },
];

const PILOT_SAMPLES = [
  "sample_0484685f_x0_y0",
  "sample_0484685f_x3_y3",
  "sample_10a04057_x6_y3",
  "sample_10a04057_x6_y9",
  "sample_10a04057_x9_y0",
];

export default function SymbolAnnotatorClient() {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [activeImage, setActiveImage] = useState<ImageItem | null>(null);
  const [activeClassId, setActiveClassId] = useState<number>(0);
  const [boxes, setBoxes] = useState<CanvasBox[]>([]);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<"expanded_100" | "train" | "val" | "pilot" | "all">("expanded_100");
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);
  
  // Review modal state
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewNote, setReviewNote] = useState("");

  // Canvas interactions
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [currentMouse, setCurrentMouse] = useState<{ x: number; y: number } | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);

  // Load image list
  const loadImages = async () => {
    try {
      const res = await fetch("/api/admin/symbol-annotator?action=list");
      const data = await res.json();
      if (data.images) {
        setImages(data.images);
        if (!activeImage && data.images.length > 0) {
          const firstExpanded = data.images.find((i: ImageItem) => i.split === "expanded_100");
          const first = firstExpanded || data.images.find((i: ImageItem) => PILOT_SAMPLES.includes(i.id)) || data.images[0];
          selectImage(first);
        }
      }
    } catch (err: any) {
      console.error("Failed to load images:", err);
      setStatusMsg({ text: "Błąd ładowania listy obrazów", type: "error" });
    }
  };

  useEffect(() => {
    loadImages();
  }, []);

  // Select image and load its labels
  const selectImage = async (imgItem: ImageItem) => {
    setActiveImage(imgItem);
    setSelectedBoxId(null);
    setStatusMsg(null);

    // Load existing labels
    try {
      const res = await fetch(`/api/admin/symbol-annotator?action=labels&split=${imgItem.split}&id=${imgItem.id}`);
      const data = await res.json();
      if (data.boxes) {
        const loadedBoxes: CanvasBox[] = data.boxes.map((b: YoloBox, index: number) => ({
          id: `box_${Date.now()}_${index}`,
          class_id: b.class_id,
          x_min: (b.x_center - b.width / 2) * 1024,
          y_min: (b.y_center - b.height / 2) * 1024,
          x_max: (b.x_center + b.width / 2) * 1024,
          y_max: (b.y_center + b.height / 2) * 1024,
        }));
        setBoxes(loadedBoxes);
      } else {
        setBoxes([]);
      }
    } catch (err) {
      console.error("Failed to load labels:", err);
      setBoxes([]);
    }

    // Load image object
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      renderCanvas();
    };
    img.src = `/api/admin/symbol-annotator?action=image&split=${imgItem.split}&id=${imgItem.id}`;
  };

  // Render Canvas
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, 1024, 1024);

    // Draw background image
    if (imgRef.current) {
      ctx.drawImage(imgRef.current, 0, 0, 1024, 1024);
    }

    // Draw existing boxes
    boxes.forEach((box) => {
      const cls = CLASSES[box.class_id] || CLASSES[0];
      const isSelected = box.id === selectedBoxId;

      ctx.strokeStyle = cls.color;
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.fillStyle = cls.color + (isSelected ? "44" : "22");

      const w = box.x_max - box.x_min;
      const h = box.y_max - box.y_min;

      ctx.fillRect(box.x_min, box.y_min, w, h);
      ctx.strokeRect(box.x_min, box.y_min, w, h);

      // Label badge
      ctx.fillStyle = cls.color;
      ctx.font = "bold 12px sans-serif";
      const tagText = `${cls.id}: ${cls.name}`;
      const textWidth = ctx.measureText(tagText).width;
      const tagY = Math.max(0, box.y_min - 18);
      ctx.fillRect(box.x_min, tagY, textWidth + 8, 18);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(tagText, box.x_min + 4, tagY + 13);

      // Resize handles if selected
      if (isSelected) {
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 1;
        const handleSize = 6;
        const corners = [
          [box.x_min, box.y_min],
          [box.x_max, box.y_min],
          [box.x_min, box.y_max],
          [box.x_max, box.y_max],
        ];
        corners.forEach(([cx, cy]) => {
          ctx.fillRect(cx - handleSize / 2, cy - handleSize / 2, handleSize, handleSize);
          ctx.strokeRect(cx - handleSize / 2, cy - handleSize / 2, handleSize, handleSize);
        });
      }
    });

    // Draw active drawing box
    if (isDrawing && drawStart && currentMouse) {
      const cls = CLASSES[activeClassId];
      ctx.strokeStyle = cls.color;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);

      const x = Math.min(drawStart.x, currentMouse.x);
      const y = Math.min(drawStart.y, currentMouse.y);
      const w = Math.abs(currentMouse.x - drawStart.x);
      const h = Math.abs(currentMouse.y - drawStart.y);

      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = cls.color + "22";
      ctx.fillRect(x, y, w, h);
      ctx.setLineDash([]);
    }
  }, [boxes, selectedBoxId, isDrawing, drawStart, currentMouse, activeClassId]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // Canvas Mouse events
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = 1024 / rect.width;
    const scaleY = 1024 / rect.height;
    return {
      x: Math.max(0, Math.min(1024, (e.clientX - rect.left) * scaleX)),
      y: Math.max(0, Math.min(1024, (e.clientY - rect.top) * scaleY)),
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasCoords(e);

    // Check if clicked inside an existing box to select it
    let clickedBoxId: string | null = null;
    for (let i = boxes.length - 1; i >= 0; i--) {
      const b = boxes[i];
      if (x >= b.x_min && x <= b.x_max && y >= b.y_min && y <= b.y_max) {
        clickedBoxId = b.id;
        break;
      }
    }

    if (clickedBoxId && (e.shiftKey || e.altKey)) {
      setSelectedBoxId(clickedBoxId);
      return;
    }

    if (!clickedBoxId) {
      setSelectedBoxId(null);
    } else {
      setSelectedBoxId(clickedBoxId);
    }

    // Start drawing new box
    setIsDrawing(true);
    setDrawStart({ x, y });
    setCurrentMouse({ x, y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const { x, y } = getCanvasCoords(e);
    setCurrentMouse({ x, y });
  };

  const handleMouseUp = () => {
    if (!isDrawing || !drawStart || !currentMouse) {
      setIsDrawing(false);
      return;
    }
    setIsDrawing(false);

    const x_min = Math.min(drawStart.x, currentMouse.x);
    const x_max = Math.max(drawStart.x, currentMouse.x);
    const y_min = Math.min(drawStart.y, currentMouse.y);
    const y_max = Math.max(drawStart.y, currentMouse.y);

    // Filter out accidental clicks (< 6px)
    if (x_max - x_min >= 6 && y_max - y_min >= 6) {
      const newBox: CanvasBox = {
        id: `box_${Date.now()}`,
        class_id: activeClassId,
        x_min,
        y_min,
        x_max,
        y_max,
      };
      setBoxes((prev) => [...prev, newBox]);
      setSelectedBoxId(newBox.id);
    }
    setDrawStart(null);
    setCurrentMouse(null);
  };

  // Delete box
  const deleteBox = (id: string) => {
    setBoxes((prev) => prev.filter((b) => b.id !== id));
    if (selectedBoxId === id) setSelectedBoxId(null);
  };

  const deleteSelected = () => {
    if (selectedBoxId) {
      deleteBox(selectedBoxId);
    }
  };

  // Save Annotations (YOLO format)
  const saveAnnotations = async () => {
    if (!activeImage) return;
    setSaving(true);
    setStatusMsg(null);

    // Convert Canvas boxes to normalized YOLO format (0..1)
    const yoloBoxes: YoloBox[] = boxes.map((b) => {
      const x_center = ((b.x_min + b.x_max) / 2) / 1024;
      const y_center = ((b.y_min + b.y_max) / 2) / 1024;
      const width = (b.x_max - b.x_min) / 1024;
      const height = (b.y_max - b.y_min) / 1024;
      return {
        class_id: b.class_id,
        x_center: parseFloat(x_center.toFixed(6)),
        y_center: parseFloat(y_center.toFixed(6)),
        width: parseFloat(width.toFixed(6)),
        height: parseFloat(height.toFixed(6)),
      };
    });

    try {
      const res = await fetch("/api/admin/symbol-annotator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          split: activeImage.split,
          id: activeImage.id,
          boxes: yoloBoxes,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStatusMsg({ text: `✓ Zapisano ${yoloBoxes.length} boxów do ${activeImage.split}!`, type: "success" });
        // Update item in image list
        setImages((prev) =>
          prev.map((img) =>
            img.id === activeImage.id
              ? { ...img, hasLabel: yoloBoxes.length > 0, boxCount: yoloBoxes.length, status: yoloBoxes.length > 0 ? "gotowe" : "brak" }
              : img
          )
        );
      } else {
        setStatusMsg({ text: `Błąd zapisu: ${data.error}`, type: "error" });
      }
    } catch (err: any) {
      setStatusMsg({ text: `Błąd sieci: ${err.message}`, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  // Save Review item
  const submitReview = async () => {
    if (!activeImage || !reviewNote.trim()) return;
    try {
      const res = await fetch("/api/admin/symbol-annotator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "review",
          split: activeImage.split,
          id: activeImage.id,
          note: reviewNote.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStatusMsg({ text: `Zgłoszono wątpliwość do annotation_review.json`, type: "info" });
        setShowReviewModal(false);
        setReviewNote("");
      }
    } catch (err: any) {
      setStatusMsg({ text: `Błąd zapisu wątpliwości: ${err.message}`, type: "error" });
    }
  };

  // Keyboard navigation & Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Numbers 0..6 for class selection
      if (e.key >= "0" && e.key <= "6" && !showReviewModal) {
        setActiveClassId(parseInt(e.key, 10));
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedBoxId && !showReviewModal) {
          deleteSelected();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        saveAnnotations();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedBoxId, showReviewModal, boxes, activeImage]);

  // Filter images
  const filteredImages = images.filter((img) => {
    if (filterTab === "expanded_100") return img.split === "expanded_100";
    if (filterTab === "pilot") return PILOT_SAMPLES.includes(img.id);
    if (filterTab === "train") return img.split === "train";
    if (filterTab === "val") return img.split === "val";
    return true;
  });

  const currentIdxInFiltered = filteredImages.findIndex((img) => img.id === activeImage?.id);

  const navImage = (direction: number) => {
    const nextIdx = currentIdxInFiltered + direction;
    if (nextIdx >= 0 && nextIdx < filteredImages.length) {
      selectImage(filteredImages[nextIdx]);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden">
      {/* Top Navbar */}
      <header className="h-14 border-b border-slate-800 bg-slate-900/90 backdrop-blur px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/symbol-detection"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            title="Powrót do Symbol Detection"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="font-bold text-sm sm:text-base text-sky-400 flex items-center gap-2">
              <span>YOLO Symbol Annotator</span>
              <span className="text-xs px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono">1024×1024</span>
            </h1>
            <p className="text-[11px] text-slate-400">Ręczna anotacja próbek datasetu (7 klas standardu YOLO)</p>
          </div>
        </div>

        {/* Status indicator */}
        {statusMsg && (
          <div
            className={`px-3 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 animate-fade-in ${
              statusMsg.type === "success"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                : statusMsg.type === "error"
                ? "bg-red-500/20 text-red-300 border border-red-500/30"
                : "bg-sky-500/20 text-sky-300 border border-sky-500/30"
            }`}
          >
            {statusMsg.type === "success" && <CheckCircle2 className="w-3.5 h-3.5" />}
            {statusMsg.type === "error" && <AlertCircle className="w-3.5 h-3.5" />}
            <span>{statusMsg.text}</span>
          </div>
        )}

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowReviewModal(true)}
            className="px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30 text-xs font-medium flex items-center gap-1.5 transition-colors"
          >
            <HelpCircle className="w-4 h-4" />
            <span>Niepewne / Przegląd</span>
          </button>
          <button
            onClick={saveAnnotations}
            disabled={saving}
            className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-blue-600/20 transition-all disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? "Zapisywanie..." : "Zapisz (Ctrl+S)"}</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar: Image Selector */}
        <aside className="w-80 border-r border-slate-800 bg-slate-900/60 flex flex-col shrink-0">
          {/* Filter Tabs */}
          <div className="p-2 border-b border-slate-800 grid grid-cols-3 gap-1 text-[11px] font-medium">
            <button
              onClick={() => setFilterTab("expanded_100")}
              className={`py-1.5 px-1 rounded text-center transition-all ${
                filterTab === "expanded_100" ? "bg-emerald-600/25 text-emerald-300 font-bold border border-emerald-500/40 shadow-sm" : "text-slate-400 hover:bg-slate-800"
              }`}
            >
              ✨ Nowe 100 ({images.filter((i) => i.split === "expanded_100").length})
            </button>
            <button
              onClick={() => setFilterTab("train")}
              className={`py-1.5 px-1 rounded text-center transition-all ${
                filterTab === "train" ? "bg-blue-600/20 text-blue-300 font-bold border border-blue-500/40" : "text-slate-400 hover:bg-slate-800"
              }`}
            >
              Train ({images.filter((i) => i.split === "train").length})
            </button>
            <button
              onClick={() => setFilterTab("val")}
              className={`py-1.5 px-1 rounded text-center transition-all ${
                filterTab === "val" ? "bg-purple-600/20 text-purple-300 font-bold border border-purple-500/40" : "text-slate-400 hover:bg-slate-800"
              }`}
            >
              Val ({images.filter((i) => i.split === "val").length})
            </button>
            <button
              onClick={() => setFilterTab("pilot")}
              className={`py-1.5 px-1 rounded text-center transition-all ${
                filterTab === "pilot" ? "bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40" : "text-slate-400 hover:bg-slate-800"
              }`}
            >
              ⭐ Pilot (5)
            </button>
            <button
              onClick={() => setFilterTab("all")}
              className={`py-1.5 px-1 col-span-2 rounded text-center transition-all ${
                filterTab === "all" ? "bg-slate-700 text-white font-bold border border-slate-600" : "text-slate-400 hover:bg-slate-800"
              }`}
            >
              Wszystkie ({images.length})
            </button>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filteredImages.map((img) => {
              const isActive = img.id === activeImage?.id;
              const isPilot = PILOT_SAMPLES.includes(img.id);

              return (
                <div
                  key={img.id}
                  onClick={() => selectImage(img)}
                  className={`p-2.5 rounded-lg text-xs cursor-pointer border transition-all flex items-center justify-between ${
                    isActive
                      ? "bg-sky-600/20 border-sky-500 text-sky-200 font-semibold shadow-sm"
                      : "bg-slate-900/40 border-slate-800/80 hover:bg-slate-800/60 text-slate-300"
                  }`}
                >
                  <div className="flex flex-col gap-0.5 truncate pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate">{img.id}</span>
                      {isPilot && <span className="text-[9px] px-1 rounded bg-amber-500/30 text-amber-300 font-bold">PILOT</span>}
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">
                      Pula:{" "}
                      <strong
                        className={
                          img.split === "expanded_100"
                            ? "text-emerald-400"
                            : img.split === "train"
                            ? "text-blue-400"
                            : "text-purple-400"
                        }
                      >
                        {img.split === "expanded_100" ? "expanded_100" : img.split}
                      </strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {img.hasLabel ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/30 flex items-center gap-1">
                        <span>{img.boxCount} box</span>
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-slate-600 text-[10px] border border-slate-800">brak</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Center: Canvas Workspace */}
        <main className="flex-1 flex flex-col bg-slate-950/80 overflow-hidden relative">
          {/* Sub Toolbar */}
          <div className="h-10 border-b border-slate-800/80 bg-slate-900/40 px-4 flex items-center justify-between text-xs text-slate-400 shrink-0">
            <div className="flex items-center gap-3 font-mono text-[11px]">
              <span>
                Obraz: <strong className="text-slate-200">{activeImage?.id}</strong>
              </span>
              <span>
                Pula:{" "}
                <strong
                  className={
                    activeImage?.split === "expanded_100"
                      ? "text-emerald-400"
                      : activeImage?.split === "train"
                      ? "text-blue-400"
                      : "text-purple-400"
                  }
                >
                  {activeImage?.split}
                </strong>
              </span>
              <span>
                Boxy: <strong className="text-sky-400">{boxes.length}</strong>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => navImage(-1)}
                disabled={currentIdxInFiltered <= 0}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30"
                title="Poprzedni obraz (ArrowLeft)"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-[11px]">
                {currentIdxInFiltered + 1} / {filteredImages.length}
              </span>
              <button
                onClick={() => navImage(1)}
                disabled={currentIdxInFiltered >= filteredImages.length - 1}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30"
                title="Następny obraz (ArrowRight / Enter)"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Canvas Viewport */}
          <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-dot-grid">
            <div className="relative border border-slate-800 rounded-lg overflow-hidden shadow-2xl bg-black">
              <canvas
                ref={canvasRef}
                width={1024}
                height={1024}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                className="cursor-crosshair block select-none"
                style={{ width: `${1024 * zoomLevel}px`, height: `${1024 * zoomLevel}px` }}
              />
            </div>
          </div>
        </main>

        {/* Right Sidebar: Class Picker & Box List */}
        <aside className="w-80 border-l border-slate-800 bg-slate-900/60 flex flex-col shrink-0">
          <div className="p-3 border-b border-slate-800">
            <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">Klasy YOLO (Klawisze 0-5)</h2>
            <div className="space-y-1.5">
              {CLASSES.map((cls) => {
                const isSelected = cls.id === activeClassId;
                return (
                  <button
                    key={cls.id}
                    onClick={() => setActiveClassId(cls.id)}
                    className={`w-full p-2 rounded-lg text-xs font-medium flex items-center justify-between border transition-all ${
                      isSelected
                        ? `${cls.bg} ${cls.border} ${cls.text} font-bold shadow-sm`
                        : "bg-slate-800/40 border-slate-700/50 hover:bg-slate-800 text-slate-300"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cls.color }} />
                      <span>{cls.label}</span>
                    </div>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/40 text-slate-400">{cls.id}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Box List for Active Image */}
          <div className="flex-1 overflow-y-auto p-3 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Oznaczone boxy ({boxes.length})</h3>
              {selectedBoxId && (
                <button
                  onClick={deleteSelected}
                  className="text-[11px] text-red-400 hover:text-red-300 flex items-center gap-1 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Usuń (Del)</span>
                </button>
              )}
            </div>

            <div className="space-y-1.5 flex-1 overflow-y-auto">
              {boxes.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500 italic">Brak oznaczonych boxów. Przeciągnij myszką na obrazie.</div>
              ) : (
                boxes.map((b, idx) => {
                  const cls = CLASSES[b.class_id] || CLASSES[0];
                  const isSelected = b.id === selectedBoxId;

                  // Normalize display values
                  const xc = ((b.x_min + b.x_max) / 2 / 1024).toFixed(4);
                  const yc = ((b.y_min + b.y_max) / 2 / 1024).toFixed(4);
                  const bw = ((b.x_max - b.x_min) / 1024).toFixed(4);
                  const bh = ((b.y_max - b.y_min) / 1024).toFixed(4);

                  return (
                    <div
                      key={b.id}
                      onClick={() => setSelectedBoxId(b.id)}
                      className={`p-2 rounded-lg text-xs border transition-all cursor-pointer ${
                        isSelected ? "bg-slate-800 border-white text-white shadow-md" : "bg-slate-900/60 border-slate-800 text-slate-300"
                      }`}
                      style={{ borderLeftWidth: "4px", borderLeftColor: cls.color }}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-[11px]">
                          #{idx + 1} [{cls.id}] {cls.name}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteBox(b.id);
                          }}
                          className="text-slate-500 hover:text-red-400 p-0.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        YOLO: {cls.id} {xc} {yc} {bw} {bh}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Review Modal */}
      {showReviewModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-5 shadow-2xl">
            <h3 className="font-bold text-sm text-amber-300 flex items-center gap-2 mb-2">
              <HelpCircle className="w-4 h-4" />
              <span>Zgłoś niepewny symbol / wątpliwość</span>
            </h3>
            <p className="text-xs text-slate-400 mb-3">
              Informacja zostanie zapisana do pliku <code className="text-sky-300">annotation_review.json</code> bez tworzenia błędnego boxa.
            </p>
            <textarea
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              placeholder="Opisz wątpliwość (np. Nietypowy symbol przy wejściu, możliwa czujka PIR lub domofon)..."
              rows={4}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-slate-200 focus:outline-none focus:border-amber-500 mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowReviewModal(false);
                  setReviewNote("");
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-medium"
              >
                Anuluj
              </button>
              <button
                onClick={submitReview}
                disabled={!reviewNote.trim()}
                className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-bold"
              >
                Zapisz do przeglądu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
