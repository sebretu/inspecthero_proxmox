"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import ReactDOM from "react-dom";
import { Polyline, CircleMarker, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L, { type LatLng, type LeafletMouseEvent } from "leaflet";
import { useLanguage } from "@/contexts/LanguageContext";
import { getToken } from "@/lib/apiClient";
import styles from "./PlanMeasurement.module.css";

type Meta = {
  tileSize: number;
  minZoom: number;
  maxZoom: number;
  gridW: number;
  gridH: number;
};

type Point = { x: number; y: number };

type CompletedMeasurement = {
  id: string;
  points: Point[];
};

type ScaleData = {
  pixelsPerMeter: number;
  unit: string;
  updatedAt: string;
};

const CRS = L.CRS.Simple;

function getSegmentPxDistance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function formatDistance(pxDist: number, pixelsPerMeter: number | null, lang: string, preferredUnit?: string): string {
  if (pixelsPerMeter == null || pixelsPerMeter <= 0) {
    return `${Math.round(pxDist)} px`;
  }
  const meters = pxDist / pixelsPerMeter;
  const decimalSep = lang === "de" || lang === "pl" || lang === "sk" ? "," : ".";

  if (preferredUnit === "mm") {
    const mm = meters * 1000;
    return `${mm.toFixed(0)} mm`;
  }
  if (preferredUnit === "cm") {
    const cm = meters * 100;
    return `${cm.toFixed(1).replace(".", decimalSep)} cm`;
  }
  // Auto-select based on value (when preferredUnit is "m" or not set)
  if (meters < 1) {
    const cm = meters * 100;
    if (cm < 1) {
      const mm = meters * 1000;
      return `${mm.toFixed(0)} mm`;
    }
    return `${cm.toFixed(1).replace(".", decimalSep)} cm`;
  }
  return `${meters.toFixed(2).replace(".", decimalSep)} m`;
}

export default function PlanMeasurementModule({
  planId,
  meta,
  isVisible = true,
  onCountChange,
  onEnsureVisible,
}: {
  planId: string;
  meta: Meta;
  isVisible?: boolean;
  onCountChange?: (count: number) => void;
  onEnsureVisible?: () => void;
}) {
  const { t, language } = useLanguage();
  const map = useMap();

  const toolbarRef = React.useRef<HTMLDivElement>(null);
  const modalRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (toolbarRef.current) {
      L.DomEvent.disableClickPropagation(toolbarRef.current);
      L.DomEvent.disableScrollPropagation(toolbarRef.current);
    }
  }, []);

  // Inject CSS for Leaflet tooltip labels directly into <head>
  // (Leaflet renders tooltips outside React DOM tree – CSS Modules don't reach them)
  useEffect(() => {
    const id = "plan-measurement-label-styles";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
      .leaflet-tooltip.measure-label {
        background: rgba(15, 23, 42, 0.92) !important;
        color: #ffffff !important;
        font-size: 12px !important;
        font-weight: 700 !important;
        padding: 3px 8px !important;
        border-radius: 5px !important;
        border: none !important;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4) !important;
        white-space: nowrap !important;
        font-family: inherit !important;
        pointer-events: none !important;
      }
      .leaflet-tooltip.measure-label::before {
        display: none !important;
      }
    `;
    document.head.appendChild(style);
    return () => {
      const el = document.getElementById(id);
      if (el) el.remove();
    };
  }, []);

  // Mode: 'none' | 'measure' | 'calibrate'
  const [activeMode, setActiveMode] = useState<"none" | "measure" | "calibrate">("none");

  // Measurements state
  const [activePoints, setActivePoints] = useState<Point[]>([]);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);
  const [completedMeasurements, setCompletedMeasurements] = useState<CompletedMeasurement[]>([]);

  // Persistence state
  const [savedCount, setSavedCount] = useState<number | null>(null); // null = not yet checked
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "loading" | "saved" | "error">("idle");

  // Scale calibration state
  const [scaleData, setScaleData] = useState<ScaleData | null>(null);
  const [calibrationPoints, setCalibrationPoints] = useState<Point[]>([]);
  const [calibrationModalOpen, setCalibrationModalOpen] = useState(false);
  const [realDistanceInput, setRealDistanceInput] = useState("5");
  const [unitInput, setUnitInput] = useState<"m" | "cm" | "mm">("m");
  const [inputError, setInputError] = useState<string | null>(null);
  const [measVisibilityMode, setMeasVisibilityMode] = useState<"normal" | "dimmed" | "hidden">("normal");

  // Fixed-length / target distance measurement state
  const [targetDistanceInput, setTargetDistanceInput] = useState<string>("");
  const [targetUnit, setTargetUnit] = useState<"m" | "cm" | "mm">("m");
  const [shiftPressed, setShiftPressed] = useState(false);
  const targetInputRef = React.useRef<HTMLInputElement>(null);

  // Track shift key for orthogonal / 45-degree angle snapping
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftPressed(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftPressed(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // Sync targetUnit with scaleData unit when scale is loaded
  useEffect(() => {
    if (scaleData?.unit && (scaleData.unit === "m" || scaleData.unit === "cm" || scaleData.unit === "mm")) {
      setTargetUnit(scaleData.unit as any);
    }
  }, [scaleData?.unit]);

  // Compute fixed distance in maxZoom pixels
  const parsedTargetVal = useMemo(() => {
    const v = parseFloat(targetDistanceInput.replace(",", "."));
    return !isNaN(v) && v > 0 ? v : null;
  }, [targetDistanceInput]);

  const isFixedLength = parsedTargetVal !== null;

  const fixedLengthPx = useMemo(() => {
    if (parsedTargetVal === null || !scaleData || scaleData.pixelsPerMeter <= 0) return null;
    let meters = parsedTargetVal;
    if (targetUnit === "cm") meters = parsedTargetVal / 100;
    if (targetUnit === "mm") meters = parsedTargetVal / 1000;
    return meters * scaleData.pixelsPerMeter;
  }, [parsedTargetVal, targetUnit, scaleData]);

  // Auto-focus the target distance input when starting a measurement
  useEffect(() => {
    if (activeMode === "measure" && activePoints.length === 1 && targetInputRef.current) {
      targetInputRef.current.focus();
    }
  }, [activeMode, activePoints.length]);

  useEffect(() => {
    if (modalRef.current) {
      L.DomEvent.disableClickPropagation(modalRef.current);
      L.DomEvent.disableScrollPropagation(modalRef.current);
    }
  }, [calibrationModalOpen]);



  // Load saved measurements from DB on mount
  useEffect(() => {
    if (!planId) return;
    (async () => {
      const token = await getToken();
      if (!token) return;
      try {
        const res = await fetch(`/api/plans/${planId}/measurements`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const json = await res.json();
        const rows: Array<{ id: string; points: Array<{ x: number; y: number }>; label?: string }> =
          json.measurements ?? [];
        setSavedCount(rows.length);
        if (rows.length > 0) {
          setCompletedMeasurements(
            rows.map((r) => ({ id: r.id, points: r.points }))
          );
        }
      } catch {
        // ignore
      }
    })();
  }, [planId, getToken]);

  const onCountChangeRef = useRef(onCountChange);
  onCountChangeRef.current = onCountChange;

  useEffect(() => {
    onCountChangeRef.current?.(completedMeasurements.length);
  }, [completedMeasurements.length]);

  // Save measurements to DB
  const handleSaveMeasurements = useCallback(async () => {
    if (!planId || completedMeasurements.length === 0) return;
    setSaveStatus("saving");
    const token = await getToken();
    if (!token) { setSaveStatus("error"); return; }
    try {
      const res = await fetch(`/api/plans/${planId}/measurements`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ measurements: completedMeasurements }),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setSavedCount(json.saved ?? completedMeasurements.length);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  }, [planId, completedMeasurements, getToken]);

  // Delete all saved measurements from DB
  const handleDeleteSaved = useCallback(async () => {
    if (!planId) return;
    const token = await getToken();
    if (!token) return;
    try {
      await fetch(`/api/plans/${planId}/measurements`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setSavedCount(0);
    } catch {
      // ignore
    }
  }, [planId, getToken]);

  // Conversion helpers between LatLng and absolute plan pixels at maxZoom
  const latLngToPlanPoint = useCallback(
    (latlng: any): Point => {
      const p = CRS.latLngToPoint(latlng, meta.maxZoom);
      return { x: p.x, y: p.y };
    },
    [meta.maxZoom]
  );

  const planPointToLatLng = useCallback(
    (point: Point): any => {
      return CRS.pointToLatLng(L.point(point.x, point.y), meta.maxZoom);
    },
    [meta.maxZoom]
  );

  // Load saved scale for this planId from API (shared for all users)
  useEffect(() => {
    if (!planId) return;
    let isMounted = true;
    (async () => {
      try {
        const token = await getToken();
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;

        const res = await fetch(`/api/plans/${planId}/scale`, { headers });
        if (!res.ok) return;
        const json = await res.json();
        if (!isMounted) return;

        if (json.scale && typeof json.scale.pixels_per_meter === "number" && json.scale.pixels_per_meter > 0) {
          setScaleData({
            pixelsPerMeter: json.scale.pixels_per_meter,
            unit: json.scale.unit ?? "m",
            updatedAt: json.scale.updated_at || new Date().toISOString(),
          });
        } else {
          setScaleData(null);
        }
      } catch {
        if (isMounted) setScaleData(null);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [planId]);

  // Save scale to API (shared for all users)
  const saveScale = useCallback(
    async (pixelsPerMeter: number, unit: string) => {
      const data: ScaleData = {
        pixelsPerMeter,
        unit,
        updatedAt: new Date().toISOString(),
      };
      setScaleData(data);
      const token = await getToken();
      if (!token) return;
      try {
        await fetch(`/api/plans/${planId}/scale`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ pixelsPerMeter, unit }),
        });
      } catch {
        // ignore network error
      }
    },
    [planId, getToken]
  );

  // ESC key handler for cancelling current drawing/calibration
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (calibrationModalOpen) {
          setCalibrationModalOpen(false);
          setCalibrationPoints([]);
          setActiveMode("none");
          return;
        }
        if (activeMode !== "none") {
          setActivePoints([]);
          setHoverPoint(null);
          setCalibrationPoints([]);
          setActiveMode("none");
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeMode, calibrationModalOpen]);

  useEffect(() => {
    const isAct = activeMode !== "none";
    if (map) (map as any)._isMeasuring = isAct;
    if (typeof window !== "undefined") (window as any)._isMeasurementActive = isAct;
    return () => {
      if (map) (map as any)._isMeasuring = false;
      if (typeof window !== "undefined") (window as any)._isMeasurementActive = false;
    };
  }, [map, activeMode]);

  // Helper to project cursor point based on fixed length and/or shift angle snapping
  const getProjectedPoint = useCallback(
    (origin: Point, cursor: Point): Point => {
      const dx = cursor.x - origin.x;
      const dy = cursor.y - origin.y;
      const rawDist = Math.sqrt(dx * dx + dy * dy);
      if (rawDist <= 0) return cursor;

      let angle = Math.atan2(dy, dx);
      if (shiftPressed) {
        const snapStep = Math.PI / 4; // 45 degrees
        angle = Math.round(angle / snapStep) * snapStep;
      }

      if (fixedLengthPx != null && fixedLengthPx > 0) {
        return {
          x: origin.x + fixedLengthPx * Math.cos(angle),
          y: origin.y + fixedLengthPx * Math.sin(angle),
        };
      }

      if (shiftPressed) {
        return {
          x: origin.x + rawDist * Math.cos(angle),
          y: origin.y + rawDist * Math.sin(angle),
        };
      }

      return cursor;
    },
    [fixedLengthPx, shiftPressed]
  );

  // Map events for clicks, double clicks, and mouse movement
  function MapEventsHandler() {
    useMapEvents({
      click: (e: any) => {
        if (activeMode === "none") return;

        // Stop propagation so task creation / marker click handlers do not fire
        if (e.originalEvent) {
          (e.originalEvent as any)._measurementHandled = true;
          e.originalEvent.stopImmediatePropagation?.();
          e.originalEvent.stopPropagation?.();
          e.originalEvent.preventDefault?.();
        }
        (e as any)._measurementHandled = true;

        const point = latLngToPlanPoint(e.latlng);

        if (activeMode === "measure") {
          if (activePoints.length === 0) {
            setActivePoints([point]);
          } else {
            const lastPt = activePoints[activePoints.length - 1];
            const nextPt = getProjectedPoint(lastPt, point);
            setActivePoints((prev) => [...prev, nextPt]);
          }
        } else if (activeMode === "calibrate") {
          setCalibrationPoints((prev) => {
            const next = [...prev, point];
            if (next.length === 2) {
              setCalibrationModalOpen(true);
            }
            return next;
          });
        }
      },

      dblclick: (e: any) => {
        if (activeMode === "measure" && activePoints.length >= 2) {
          L.DomEvent.stopPropagation(e.originalEvent);
          L.DomEvent.preventDefault(e.originalEvent);

          // Deduplicate: remove consecutive points that are < 2px apart (e.g. extra point from the dblclick's first click)
          const dedupedPoints = activePoints.filter((p, i) => {
            if (i === 0) return true;
            return getSegmentPxDistance(activePoints[i - 1], p) >= 2;
          });

          if (dedupedPoints.length >= 2) {
            setCompletedMeasurements((prev) => [
              ...prev,
              { id: `m_${Date.now()}_${Math.random()}`, points: dedupedPoints },
            ]);
          }
          setActivePoints([]);
          setHoverPoint(null);
          setTargetDistanceInput("");
        }
      },

      mousemove: (e: any) => {
        if (activeMode === "none") return;
        const point = latLngToPlanPoint(e.latlng);

        if (activeMode === "measure" && activePoints.length > 0) {
          setHoverPoint(point);
        } else if (activeMode === "calibrate" && calibrationPoints.length === 1) {
          setHoverPoint(point);
        }
      },
    });

    return null;
  }

  // Handle scale modal submit
  const handleConfirmScale = () => {
    const val = parseFloat(realDistanceInput.replace(",", "."));
    if (isNaN(val) || val <= 0) {
      setInputError(t("planMeasurement", "invalidDistance", "Podaj poprawną wartość dodatnią"));
      return;
    }

    if (calibrationPoints.length < 2) return;

    const pxDist = getSegmentPxDistance(calibrationPoints[0], calibrationPoints[1]);
    let realMeters = val;
    if (unitInput === "cm") realMeters = val / 100;
    if (unitInput === "mm") realMeters = val / 1000;

    if (pxDist <= 0 || realMeters <= 0) return;

    const pixelsPerMeter = pxDist / realMeters;
    saveScale(pixelsPerMeter, unitInput);

    setCalibrationModalOpen(false);
    setCalibrationPoints([]);
    setActiveMode("none");
    setInputError(null);
  };

  const [hoveredMeasurementId, setHoveredMeasurementId] = useState<string | null>(null);
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<string | null>(null);

  // Delete an individual completed measurement
  const handleDeleteSingleMeasurement = useCallback((id: string) => {
    setCompletedMeasurements((prev) => prev.filter((m) => m.id !== id));
    if (selectedMeasurementId === id) setSelectedMeasurementId(null);
    if (hoveredMeasurementId === id) setHoveredMeasurementId(null);
  }, [selectedMeasurementId, hoveredMeasurementId]);

  // Finish active measurement path
  const handleFinishActiveMeasurement = useCallback(() => {
    if (activePoints.length < 2) return;
    const dedupedPoints = activePoints.filter((p, i) => {
      if (i === 0) return true;
      return getSegmentPxDistance(activePoints[i - 1], p) >= 2;
    });
    if (dedupedPoints.length >= 2) {
      setCompletedMeasurements((prev) => [
        ...prev,
        { id: `m_${Date.now()}_${Math.random()}`, points: dedupedPoints },
      ]);
    }
    setActivePoints([]);
    setHoverPoint(null);
    setTargetDistanceInput("");
  }, [activePoints]);

  // Undo the last placed point in current drawing
  const handleUndoPoint = useCallback(() => {
    setActivePoints((prev) => {
      if (prev.length <= 1) {
        setHoverPoint(null);
        return [];
      }
      return prev.slice(0, -1);
    });
  }, []);

  // Undo the last completed measurement
  const handleUndoMeasurement = useCallback(() => {
    setCompletedMeasurements((prev) => {
      if (prev.length === 0) return prev;
      return prev.slice(0, -1);
    });
  }, []);

  // Keyboard shortcuts (Ctrl+Z, Backspace, Delete, Enter)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      if (e.key === "Enter") {
        if (activeMode === "measure" && activePoints.length >= 2) {
          e.preventDefault();
          handleFinishActiveMeasurement();
          return;
        }
      }

      if (isInput) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (activePoints.length > 0) {
          handleUndoPoint();
        } else if (completedMeasurements.length > 0) {
          handleUndoMeasurement();
        }
        return;
      }

      if (e.key === "Backspace" && activePoints.length > 0) {
        e.preventDefault();
        handleUndoPoint();
        return;
      }

      if (e.key === "Delete" && selectedMeasurementId) {
        e.preventDefault();
        handleDeleteSingleMeasurement(selectedMeasurementId);
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeMode, activePoints.length, completedMeasurements.length, selectedMeasurementId, handleUndoPoint, handleUndoMeasurement, handleDeleteSingleMeasurement, handleFinishActiveMeasurement]);

  const handleClearAll = () => {
    setCompletedMeasurements([]);
    setActivePoints([]);
    setHoverPoint(null);
    setCalibrationPoints([]);
    setSelectedMeasurementId(null);
    setHoveredMeasurementId(null);
    setTargetDistanceInput("");
  };

  // Compute live active path distances (including projected fixed distance)
  const activePathPoints = useMemo(() => {
    if (hoverPoint && activePoints.length > 0) {
      const lastPt = activePoints[activePoints.length - 1];
      const projectedHover = getProjectedPoint(lastPt, hoverPoint);
      return [...activePoints, projectedHover];
    }
    return activePoints;
  }, [activePoints, hoverPoint, getProjectedPoint]);

  const activeTotalDistPx = useMemo(() => {
    let sum = 0;
    for (let i = 1; i < activePathPoints.length; i++) {
      sum += getSegmentPxDistance(activePathPoints[i - 1], activePathPoints[i]);
    }
    return sum;
  }, [activePathPoints]);

  const CircleMarkerAny: any = CircleMarker;

  // ── HTML overlay labels ──────────────────────────────────────────────
  type LabelEntry = {
    key: string;
    latlng: any;
    text: string;
    measurementId?: string;
    isRemovable?: boolean;
  };

  function MeasurementLabels({
    labels,
    onDeleteMeasurement,
  }: {
    labels: LabelEntry[];
    onDeleteMeasurement?: (id: string) => void;
  }) {
    const m = useMap();
    const [positions, setPositions] = React.useState<
      Array<{ key: string; x: number; y: number; text: string; measurementId?: string; isRemovable?: boolean }>
    >([]);

    const recalc = React.useCallback(() => {
      setPositions(
        labels.map((l) => {
          const pt = m.latLngToContainerPoint(l.latlng);
          return { key: l.key, x: pt.x, y: pt.y, text: l.text, measurementId: l.measurementId, isRemovable: l.isRemovable };
        })
      );
    }, [m, labels]);

    useEffect(() => {
      recalc();
      m.on("move zoom zoomend moveend", recalc);
      return () => {
        m.off("move zoom zoomend moveend", recalc);
      };
    }, [m, recalc]);

    const container = m.getContainer();
    if (!container || typeof document === "undefined") return null;

    return ReactDOM.createPortal(
      <>
        {positions.map((p) => {
          const isHovered = hoveredMeasurementId && hoveredMeasurementId === p.measurementId;
          const isSelected = selectedMeasurementId && selectedMeasurementId === p.measurementId;
          const isHighlighted = isHovered || isSelected;

          return (
            <div
              key={p.key}
              onMouseEnter={() => {
                if (p.measurementId) setHoveredMeasurementId(p.measurementId);
              }}
              onMouseLeave={() => {
                if (p.measurementId) setHoveredMeasurementId(null);
              }}
              onClick={(e) => {
                if (p.measurementId) {
                  e.stopPropagation();
                  setSelectedMeasurementId((prev) => (prev === p.measurementId ? null : p.measurementId!));
                }
              }}
              style={{
                position: "absolute",
                left: p.x,
                top: p.y,
                transform: "translate(-50%, -50%)",
                background: isHighlighted ? "rgba(220, 38, 38, 0.95)" : "transparent",
                color: isHighlighted ? "#ffffff" : "#3730a3",
                textShadow: isHighlighted
                  ? "none"
                  : "0 0 3px #ffffff, 0 0 6px #ffffff, 0 0 9px #ffffff, -1px -1px 0 #ffffff, 1px -1px 0 #ffffff, -1px 1px 0 #ffffff, 1px 1px 0 #ffffff",
                fontSize: 12,
                fontWeight: 800,
                padding: isHighlighted ? "3px 8px" : "1px 4px",
                borderRadius: 6,
                whiteSpace: "nowrap",
                pointerEvents: p.isRemovable ? "auto" : "none",
                zIndex: isHighlighted ? 1005 : 1000,
                boxShadow: isHighlighted ? "0 0 12px rgba(239, 68, 68, 0.6)" : "none",
                fontFamily: "inherit",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                border: isHighlighted ? "1px solid #f87171" : "none",
                transition: "all 0.15s ease",
                userSelect: "none",
                cursor: p.isRemovable ? "pointer" : "default",
              }}
            >
              <span>{p.text}</span>
              {isHighlighted && p.isRemovable && p.measurementId && onDeleteMeasurement && (
                <button
                  type="button"
                  title={t("planMeasurement", "deleteSingleMeasurement", "Usuń ten pomiar")}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteMeasurement(p.measurementId!);
                  }}
                  style={{
                    background: "rgba(255,255,255,0.3)",
                    border: "none",
                    color: "#ffffff",
                    borderRadius: "50%",
                    width: 16,
                    height: 16,
                    fontSize: 10,
                    fontWeight: 900,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    padding: 0,
                    lineHeight: 1,
                    transition: "all 0.1s ease",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.6)";
                    (e.currentTarget as HTMLElement).style.transform = "scale(1.15)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.3)";
                    (e.currentTarget as HTMLElement).style.transform = "scale(1)";
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
      </>,
      container
    );
  }

  const [externalToolbarSlot, setExternalToolbarSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const updateSlot = () => {
      const el = document.getElementById("plan-external-top-toolbar");
      if (el) setExternalToolbarSlot(el);
    };
    updateSlot();
    const timer = setTimeout(updateSlot, 100);
    return () => clearTimeout(timer);
  }, []);

  const toolbarContent = (
    <div ref={toolbarRef} className={styles.toolbar}>
      <div id="plan-measurement-toolbar-left" style={{ display: "flex", flexWrap: "nowrap", alignItems: "center", gap: "6px" }} />
      <button
        type="button"
        className={`${styles.btn} ${activeMode === "measure" ? styles.btnActive : ""}`}
        onClick={() => {
          if (activeMode === "measure") {
            setActiveMode("none");
            setActivePoints([]);
            setHoverPoint(null);
          } else {
            onEnsureVisible?.();
            setActiveMode("measure");
            setCalibrationPoints([]);
          }
        }}
        title={t("planMeasurement", "measure", "Pomiar")}
      >
        📏 {t("planMeasurement", "measure", "Pomiar")}
      </button>

      {/* Quick exact length input in toolbar when measuring */}
      {activeMode === "measure" && (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#f8fafc", padding: "2px 6px", borderRadius: 8, border: "1px solid #cbd5e1" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#475569" }}>Długość:</span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="np. 5.5"
            value={targetDistanceInput}
            onChange={(e) => setTargetDistanceInput(e.target.value)}
            style={{
              width: 54,
              padding: "2px 4px",
              fontSize: 11,
              fontWeight: 700,
              border: isFixedLength ? "1px solid #16a34a" : "1px solid #cbd5e1",
              borderRadius: 4,
              outline: "none",
              background: "#ffffff",
              color: isFixedLength ? "#16a34a" : "#1e293b",
            }}
          />
          <select
            value={targetUnit}
            onChange={(e) => setTargetUnit(e.target.value as any)}
            style={{
              padding: "2px 2px",
              fontSize: 11,
              fontWeight: 700,
              border: "1px solid #cbd5e1",
              borderRadius: 4,
              background: "#ffffff",
              color: "#334155",
            }}
          >
            <option value="m">m</option>
            <option value="cm">cm</option>
            <option value="mm">mm</option>
          </select>
          {targetDistanceInput && (
            <button
              type="button"
              onClick={() => setTargetDistanceInput("")}
              style={{
                background: "transparent",
                border: "none",
                color: "#64748b",
                cursor: "pointer",
                fontSize: 10,
                fontWeight: 800,
                padding: "0 2px",
              }}
              title="Wyczyść zadaną długość"
            >
              ✕
            </button>
          )}
        </div>
      )}

      <button
        type="button"
        className={`${styles.btn} ${activeMode === "calibrate" ? styles.btnActive : ""}`}
        onClick={() => {
          if (activeMode === "calibrate") {
            setActiveMode("none");
            setCalibrationPoints([]);
          } else {
            setActiveMode("calibrate");
            setActivePoints([]);
            setHoverPoint(null);
          }
        }}
        title={t("planMeasurement", "setScale", "Ustaw skalę")}
      >
        🎯 {t("planMeasurement", "setScale", "Ustaw skalę")}
      </button>

      {/* Undo point while drawing */}
      {activePoints.length > 0 && (
        <button
          type="button"
          className={styles.btn}
          onClick={handleUndoPoint}
          title={t("planMeasurement", "undoPoint", "Cofnij punkt (Ctrl+Z)")}
        >
          ↩ {t("planMeasurement", "undoPoint", "Cofnij punkt")}
        </button>
      )}

      {/* Undo last completed measurement when not drawing */}
      {completedMeasurements.length > 0 && activePoints.length === 0 && (
        <button
          type="button"
          className={styles.btn}
          onClick={handleUndoMeasurement}
          title={t("planMeasurement", "undoMeasurement", "Cofnij ostatni pomiar (Ctrl+Z)")}
        >
          ↩ {t("planMeasurement", "undoMeasurement", "Cofnij")}
        </button>
      )}

      {(completedMeasurements.length > 0 || activePoints.length > 0) && (
        <button
          type="button"
          className={`${styles.btn} ${styles.btnDanger}`}
          onClick={handleClearAll}
          title={t("planMeasurement", "clear", "Wyczyść")}
        >
          🗑 {t("planMeasurement", "clear", "Wyczyść")}
        </button>
      )}

      {completedMeasurements.length > 0 && (
        <button
          type="button"
          className={`${styles.btn} ${saveStatus === "saved" ? styles.btnActive : ""}`}
          onClick={handleSaveMeasurements}
          disabled={saveStatus === "saving"}
          title={t("planMeasurement", "saveMeasurements", "Zapisz pomiary")}
        >
          {saveStatus === "saving"
            ? `⏳ ${t("planMeasurement", "saving", "Zapisuję...")}`
            : saveStatus === "saved"
            ? `✅ ${t("planMeasurement", "saved", "Zapisano")}`
            : saveStatus === "error"
            ? `❌ ${t("planMeasurement", "error", "Błąd")}`
            : `💾 ${t("planMeasurement", "saveMeasurements", "Zapisz pomiary")}`}
        </button>
      )}

      {(savedCount ?? 0) > 0 && completedMeasurements.length === 0 && (
        <button
          type="button"
          className={styles.btn}
          onClick={handleDeleteSaved}
          title={t("planMeasurement", "deleteSaved", "Usuń zapisane")}
        >
          🗑 {t("planMeasurement", "deleteSaved", "Usuń zapisane")} ({savedCount})
        </button>
      )}

      {activeMode !== "none" && (
        <button
          type="button"
          className={`${styles.btn} ${styles.btnGhost}`}
          onClick={() => {
            setActiveMode("none");
            setActivePoints([]);
            setCalibrationPoints([]);
            setHoverPoint(null);
          }}
        >
          ✕ {t("planMeasurement", "cancel", "Anuluj")}
        </button>
      )}

      {/* Scale summary badge */}
      {scaleData && (
        <div className={styles.badge} style={{ margin: 0 }}>
          🎯 {t("planMeasurement", "scaleSet", "Skala")}: 1m ≈ {Math.round(scaleData.pixelsPerMeter)} px
        </div>
      )}
    </div>
  );

  return (
    <>
      <MapEventsHandler />

      {/* If external toolbar slot exists next to Plan selector, portal there! Otherwise render inside map */}
      {externalToolbarSlot && typeof document !== "undefined" ? (
        ReactDOM.createPortal(toolbarContent, externalToolbarSlot)
      ) : (
        <div className={styles.container}>
          {toolbarContent}
        </div>
      )}

      {/* Live instruction & fixed-length control banner over the map when active */}
      {(activeMode === "measure" || activeMode === "calibrate" || (!scaleData && (activePoints.length > 0 || completedMeasurements.length > 0))) && (
        <div className={styles.container} style={{ pointerEvents: "none", top: 16, right: 16 }}>
          {activeMode === "measure" && (
            <div
              className={styles.hintBanner}
              style={{
                pointerEvents: "auto",
                maxWidth: 420,
                display: "flex",
                flexDirection: "column",
                gap: 6,
                background: "rgba(15, 23, 42, 0.95)",
                color: "#f8fafc",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4)",
              }}
            >
              {/* Step indicator & finish button */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, width: "100%" }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>
                  {activePoints.length === 0 ? (
                    <>📍 {t("planMeasurement", "step1ClickStart", "1. Kliknij punkt początkowy na planie")}</>
                  ) : (
                    <>🎯 {t("planMeasurement", "step2ClickEnd", "2. Wpisz długość i kliknij w kierunku końca linii")}</>
                  )}
                </span>
                {activePoints.length >= 2 && (
                  <button
                    type="button"
                    onClick={handleFinishActiveMeasurement}
                    style={{
                      background: "#16a34a",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: 6,
                      padding: "3px 10px",
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      whiteSpace: "nowrap",
                    }}
                  >
                    ✓ {t("planMeasurement", "finish", "Zakończ (Enter)")}
                  </button>
                )}
              </div>

              {/* Exact Length Input Controls */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", marginTop: 2 }}>
                <span style={{ fontSize: 11, color: "#94a3b8", whiteSpace: "nowrap" }}>
                  {t("planMeasurement", "targetLength", "Długość:")}
                </span>
                <div style={{ display: "inline-flex", alignItems: "center", position: "relative", flex: 1 }}>
                  <input
                    ref={targetInputRef}
                    type="text"
                    inputMode="decimal"
                    placeholder="np. 5.5 (lub klikaj dowolnie)"
                    value={targetDistanceInput}
                    onChange={(e) => setTargetDistanceInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.stopPropagation();
                        if (activePoints.length >= 2) {
                          handleFinishActiveMeasurement();
                        } else if (activePoints.length === 1 && hoverPoint) {
                          const lastPt = activePoints[0];
                          const nextPt = getProjectedPoint(lastPt, hoverPoint);
                          setActivePoints([lastPt, nextPt]);
                        }
                      }
                    }}
                    style={{
                      width: "100%",
                      padding: "4px 22px 4px 8px",
                      fontSize: 12,
                      fontWeight: 700,
                      background: "#1e293b",
                      color: isFixedLength ? "#4ade80" : "#f8fafc",
                      border: isFixedLength ? "1px solid #22c55e" : "1px solid rgba(255,255,255,0.2)",
                      borderRadius: 6,
                      outline: "none",
                    }}
                  />
                  {targetDistanceInput && (
                    <button
                      type="button"
                      onClick={() => setTargetDistanceInput("")}
                      style={{
                        position: "absolute",
                        right: 6,
                        background: "transparent",
                        border: "none",
                        color: "#94a3b8",
                        cursor: "pointer",
                        fontSize: 11,
                        fontWeight: 800,
                        padding: 0,
                      }}
                      title="Wyczyść zadaną długość"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <select
                  value={targetUnit}
                  onChange={(e) => setTargetUnit(e.target.value as any)}
                  style={{
                    padding: "4px 6px",
                    fontSize: 11,
                    fontWeight: 700,
                    background: "#1e293b",
                    color: "#f8fafc",
                    border: "1px solid rgba(255,255,255,0.2)",
                    borderRadius: 6,
                    outline: "none",
                    cursor: "pointer",
                  }}
                >
                  <option value="m">m</option>
                  <option value="cm">cm</option>
                  <option value="mm">mm</option>
                </select>
              </div>

              {/* No scale warning hint inside banner if user typed length but has no scale set */}
              {isFixedLength && (!scaleData || scaleData.pixelsPerMeter <= 0) && (
                <div style={{ fontSize: 11, color: "#f59e0b", fontWeight: 700 }}>
                  ⚠️ Ustaw najpierw skalę (🎯 Ustaw skalę), aby używać metrów.
                </div>
              )}

              {/* Tips & hints */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
                <span>Shift = kąty 0°, 45°, 90°</span>
                {activePoints.length > 0 && (
                  <button
                    type="button"
                    onClick={handleUndoPoint}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#cbd5e1",
                      textDecoration: "underline",
                      cursor: "pointer",
                      fontSize: 10,
                      padding: 0,
                    }}
                  >
                    ↶ Cofnij punkt
                  </button>
                )}
              </div>
            </div>
          )}

          {activeMode === "calibrate" && (
            <div className={styles.hintBanner} style={{ pointerEvents: "auto" }}>
              <span>
                🎯 {calibrationPoints.length === 0
                  ? t("planMeasurement", "calibrateStep1", "Wskazano 1. punkt. Kliknij drugi punkt odniesienia na planie")
                  : t("planMeasurement", "calibrateStep2", "Kliknij drugi punkt odniesienia na planie")}
              </span>
            </div>
          )}

          {/* No scale warning hint if user measures without scale set */}
          {activeMode !== "measure" && !scaleData && (activePoints.length > 0 || completedMeasurements.length > 0) && (
            <div className={styles.hintBanner} style={{ borderLeftColor: "#f59e0b", pointerEvents: "auto" }}>
              <span>⚠️ {t("planMeasurement", "noScaleHint", "Ustaw skalę, aby otrzymywać wyniki w metrach.")}</span>
            </div>
          )}
        </div>
      )}

      {/* RENDER COMPLETED MEASUREMENTS */}
      {(isVisible !== false || activeMode !== "none") && completedMeasurements.map((m) => {
        if (m.points.length < 2) return null;
        const isHovered = hoveredMeasurementId === m.id;
        const isSelected = selectedMeasurementId === m.id;
        const latlngs = m.points.map(planPointToLatLng);

        // Build label list — only midpoint of each segment (skip zero-length segments)
        const labels: Array<LabelEntry> = [];
        m.points.slice(1).forEach((p, idx) => {
          const prevP = m.points[idx];
          const segPx = getSegmentPxDistance(prevP, p);
          if (segPx < 2) return; // skip zero/near-zero segments
          const midP = { x: (prevP.x + p.x) / 2, y: (prevP.y + p.y) / 2 };
          const text = formatDistance(segPx, scaleData?.pixelsPerMeter ?? null, language, scaleData?.unit);
          const numericVal = parseFloat(text.replace(",", ".").split(" ")[0]);
          if (isNaN(numericVal) || numericVal === 0) return; // skip zero-value labels
          labels.push({
            key: `${m.id}_seg_${idx}`,
            latlng: planPointToLatLng(midP),
            text,
            measurementId: m.id,
            isRemovable: true,
          });
        });

        return (
          <React.Fragment key={m.id}>
            <Polyline
              positions={latlngs}
              pathOptions={{
                color: isHovered || isSelected ? "#ef4444" : "#2563eb",
                weight: isHovered || isSelected ? 4 : 3,
                opacity: isHovered || isSelected ? 1 : 0.9,
              }}
              eventHandlers={{
                mouseover: () => setHoveredMeasurementId(m.id),
                mouseout: () => setHoveredMeasurementId(null),
                click: (e: any) => {
                  if (e?.originalEvent) e.originalEvent.stopPropagation();
                  setSelectedMeasurementId((prev) => (prev === m.id ? null : m.id));
                },
              }}
            />
            {m.points.map((p, idx) => (
              <CircleMarkerAny
                key={`${m.id}_pt_${idx}`}
                center={planPointToLatLng(p)}
                radius={isHovered || isSelected ? 6 : 5}
                pathOptions={{
                  color: isHovered || isSelected ? "#ef4444" : "#ffffff",
                  fillColor: isHovered || isSelected ? "#ef4444" : "#2563eb",
                  fillOpacity: 1,
                  weight: 2,
                }}
              />
            ))}
            <MeasurementLabels labels={labels} onDeleteMeasurement={handleDeleteSingleMeasurement} />
          </React.Fragment>
        );
      })}

      {/* RENDER CURRENTLY ACTIVE MEASUREMENT PATH */}
      {activePathPoints.length > 0 && (
        <>
          {/* Main measurement polyline */}
          <Polyline
            positions={activePathPoints.map(planPointToLatLng)}
            pathOptions={{
              color: isFixedLength ? "#22c55e" : "#3b82f6",
              weight: 3,
              opacity: 0.9,
              dashArray: isFixedLength ? undefined : "6, 6",
            }}
          />

          {/* Aiming ray from fixed endpoint to mouse cursor */}
          {isFixedLength && hoverPoint && activePoints.length > 0 && (
            <Polyline
              positions={[
                planPointToLatLng(activePathPoints[activePathPoints.length - 1]),
                planPointToLatLng(hoverPoint),
              ]}
              pathOptions={{
                color: "#22c55e",
                weight: 1.5,
                opacity: 0.6,
                dashArray: "4, 4",
              }}
            />
          )}

          {activePathPoints.map((p, idx) => (
            <CircleMarkerAny
              key={`act_pt_${idx}`}
              center={planPointToLatLng(p)}
              radius={idx === activePathPoints.length - 1 && isFixedLength ? 6 : 5}
              pathOptions={{
                color: "#ffffff",
                fillColor: isFixedLength ? "#22c55e" : "#3b82f6",
                fillOpacity: 1,
                weight: 2,
              }}
            />
          ))}

          <MeasurementLabels
            labels={[
              ...activePathPoints.slice(1).flatMap((p, idx) => {
                const prevP = activePathPoints[idx];
                const midP = { x: (prevP.x + p.x) / 2, y: (prevP.y + p.y) / 2 };
                const segPx = getSegmentPxDistance(prevP, p);
                // Skip tiny/zero segments (hover near last clicked point)
                if (segPx < 2) return [];
                const text = formatDistance(segPx, scaleData?.pixelsPerMeter ?? null, language, scaleData?.unit);
                // Skip labels where the numeric value rounds to 0 (handles "0 mm", "0,0 cm", "0.00 m" etc.)
                const numericVal = parseFloat(text.replace(",", ".").split(" ")[0]);
                if (isNaN(numericVal) || numericVal === 0) return [];
                return [{
                  key: `act_seg_${idx}`,
                  latlng: planPointToLatLng(midP),
                  text,
                }];
              }),
            ]}
          />
        </>
      )}

      {/* RENDER CALIBRATION REFERENCE LINE */}
      {calibrationPoints.length > 0 && (
        <>
          <Polyline
            positions={
              hoverPoint && calibrationPoints.length === 1
                ? [planPointToLatLng(calibrationPoints[0]), planPointToLatLng(hoverPoint)]
                : calibrationPoints.map(planPointToLatLng)
            }
            pathOptions={{ color: "#f59e0b", weight: 3, opacity: 0.9, dashArray: "4, 4" }}
          />
          {calibrationPoints.map((p, idx) => (
            <CircleMarkerAny
              key={`cal_pt_${idx}`}
              center={planPointToLatLng(p)}
              radius={6}
              pathOptions={{ color: "#ffffff", fillColor: "#f59e0b", fillOpacity: 1, weight: 2 }}
            />
          ))}
        </>
      )}

      {/* CALIBRATION MODAL DIALOG – rendered via portal to document.body to bypass Leaflet event interception */}
      {calibrationModalOpen && typeof document !== "undefined" && ReactDOM.createPortal(
        <div
          className={styles.modalOverlay}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setCalibrationModalOpen(false);
            }
          }}
          style={{ zIndex: 99999 }}
        >
          <form
            className={styles.modal}
            onSubmit={(e) => {
              e.preventDefault();
              handleConfirmScale();
            }}
          >
            <h3 className={styles.modalTitle}>🎯 {t("planMeasurement", "calibrateModalTitle", "Podaj rzeczywistą odległość")}</h3>
            <p className={styles.modalDesc}>
              {t("planMeasurement", "calibrateModalDesc", "Wprowadź rzeczywistą odległość między wskazanymi punktami:")}
            </p>

            <div className={styles.formGroup}>
              <input
                type="number"
                step="any"
                className={styles.input}
                value={realDistanceInput}
                onChange={(e) => {
                  setRealDistanceInput(e.target.value);
                  setInputError(null);
                }}
                autoFocus
              />
              <select
                className={styles.select}
                value={unitInput}
                onChange={(e) => setUnitInput(e.target.value as any)}
              >
                <option value="m">m</option>
                <option value="cm">cm</option>
                <option value="mm">mm</option>
              </select>
            </div>

            {inputError && <div style={{ color: "#ef4444", fontSize: 13, fontWeight: 700 }}>{inputError}</div>}

            <div className={styles.modalActions}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGhost}`}
                onClick={() => {
                  setCalibrationModalOpen(false);
                  setCalibrationPoints([]);
                  setActiveMode("none");
                }}
              >
                {t("planMeasurement", "cancel", "Anuluj")}
              </button>
              <button
                type="submit"
                className={`${styles.btn} ${styles.btnActive}`}
              >
                {t("planMeasurement", "saveScale", "Zapisz skalę")}
              </button>
            </div>
          </form>
        </div>,
        document.body
      )}
    </>
  );
}
