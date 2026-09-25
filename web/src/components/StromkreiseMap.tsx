"use client";
import React, { useEffect, useMemo, useState, useRef } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents, Polyline, Polygon, CircleMarker, Popup, Tooltip } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useLanguage } from "@/contexts/LanguageContext";

const CRS = L.CRS.Simple;

interface StromkreisMarker {
  id: string;
  circuit_code: string;
  short_label: string;
  full_name: string;
  type: string;
  marker_shape: string;
  x_norm: number;
  y_norm: number;
  metadata?: any;
  panel_group?: string | null;
}

export interface UVBoardLocation {
  id: string;
  name: string;
  color?: string;
  x_norm: number;
  y_norm: number;
  plan_id?: string;
}

interface Props {
  projectId: string;
  planId: string;
  token: string | null;
  markers: StromkreisMarker[];
  selectedMarkerId: string | null;
  selectedCircuitCode?: string | null;
  selectedPanelGroup?: string | null;
  onSelectMarker: (marker: StromkreisMarker) => void;
  onDeselectMarker?: () => void;
  onMoveMarker: (id: string, x: number, y: number) => void;
  onAddMarker: (x: number, y: number) => void;
  onToggleMarkerOrientation?: (id: string) => void;
  activeType: string;
  activeShape: string;
  isAdmin: boolean;
  isEditMode?: boolean;
  addMode: boolean;
  tempCoordinates?: { x: number, y: number } | null;
  onAddLineArrow?: (x1: number, y1: number, x2: number, y2: number) => void;
  onMoveLineArrowPoint?: (id: string, pointIndex: 1 | 2, x: number, y: number) => void;
  onExecutionSubmit?: (markerId: string, subCable: string) => void;
  onExecutionUndo?: (markerId: string, subCable: string) => void;
  onExecutionAction?: (markerId: string, subCable: string, action: "APPROVED" | "REJECTED") => void;
  onReportProblem?: (markerId: string, problemDescription: string) => void;
  onApproveAiPrediction?: (predictionId: string) => void;
  duplicateMarkerIds?: Set<string>;
  collisionMarkerIds?: Set<string>;
  hideExecutionStatus?: boolean;
  uvBoards?: UVBoardLocation[];
  onMoveUvBoard?: (id: string, x: number, y: number) => void;
  onSelectUvBoard?: (board: UVBoardLocation) => void;
}

export function getSubCables(code: string): string[] {
  if (!code) return [];
  if (!code.includes("/")) return [code];
  const parts = code.split("/");
  const base = parts[0];
  const res = [base];
  const match = base.match(/^(.*?)(\d+)$/);
  if (match) {
    const prefix = match[1];
    for (let i = 1; i < parts.length; i++) res.push(prefix + parts[i]);
  } else {
    for (let i = 1; i < parts.length; i++) res.push(parts[i]);
  }
  return res;
}

// Derive canonical shape from type (overrides stored shape for correct display)
function getShapeForType(type: string, storedShape: string): string {
  // Type always wins for correct visual representation
  if (type === "socket") return "triangle";
  if (type === "light") return "circle";
  if (type === "edv") return "square";
  if (type === "cee") return "rhombus";
  if (type === "special" || type === "reserve") return "hexagon";
  if (type === "text") return "text";
  return storedShape || "circle";
}

const MarkerPopupContent = ({ marker, onExecutionSubmit, onExecutionUndo, onExecutionAction, onReportProblem, onApproveAiPrediction, isAdmin, isDuplicate, isCollision, hideExecutionStatus = false }: any) => {
  const { t } = useLanguage();
  const subCables = getSubCables(marker.circuit_code);
  const executions = marker.metadata?.executions || {};

  if (marker.metadata?.is_ai_suggestion) {
    const conf = ((marker.metadata?.confidence || 0) * 100).toFixed(0);
    return (
      <div className="flex flex-col gap-2 min-w-[210px] p-1" onClick={e => e.stopPropagation()}>
        <div className="bg-cyan-50 border border-cyan-200 p-2.5 rounded-lg flex flex-col gap-1">
          <div className="text-xs font-black text-cyan-900 flex justify-between items-center">
            <span>✨ Sugestia AI</span>
            <span className="bg-cyan-600 text-white px-1.5 py-0.5 rounded text-[10px]">{conf}%</span>
          </div>
          <div className="text-xs text-cyan-800 font-semibold mt-1">
            {marker.full_name || marker.type}
          </div>
          <div className="text-[11px] text-cyan-700 font-mono">
            Kabel: {marker.metadata?.kabeltyp || "NYM-J 3x2.5"}
          </div>
        </div>

        {onApproveAiPrediction && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onApproveAiPrediction(marker.metadata?.prediction_id);
            }}
            className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded shadow transition-colors flex items-center justify-center gap-1"
          >
            ✓ Zatwierdź i wstaw marker
          </button>
        )}
      </div>
    );
  }

  if (
    !marker.metadata?.kabeltyp &&
    (hideExecutionStatus || subCables.length === 0) &&
    !marker.metadata?.problem &&
    !marker.full_name &&
    !isDuplicate &&
    !isCollision &&
    !marker.metadata?.uv_name
  ) return null;

  return (
    <div className="flex flex-col gap-2 min-w-[200px]" onClick={e => e.stopPropagation()}>
      {isDuplicate && (
        <div className="bg-red-50 border border-red-300 text-red-700 p-2 rounded text-xs font-bold flex items-center gap-1.5">
          <span>⚠️</span>
          <span>Zduplikowany numer na tym planie!</span>
        </div>
      )}
      {isCollision && !isDuplicate && (
        <div className="bg-amber-50 border border-amber-300 text-amber-800 p-2 rounded text-xs font-bold flex items-center gap-1.5">
          <span>⚠️</span>
          <span>Kolizja numeracji: port zajęty na planie bazowym!</span>
        </div>
      )}

      {(marker.full_name || marker.metadata?.kabeltyp || marker.metadata?.uv_name) && (
        <div className="border-b border-gray-200 pb-1.5 mb-1">
          {marker.full_name && (
            <div className="text-sm font-bold text-gray-800">
              {marker.full_name}
            </div>
          )}
          {marker.metadata?.uv_name && (
            <div className="text-[11px] font-bold text-blue-600 mt-0.5">
              Verteiler: {marker.metadata.uv_name}
            </div>
          )}
          {marker.metadata?.kabeltyp && (
            <div className="text-xs text-gray-500 mt-0.5">
              {t("stromkreise", "cableType", "Cable Type")}: {marker.metadata.kabeltyp}
            </div>
          )}
        </div>
      )}

      {marker.metadata?.problem && (
        <div className="flex flex-col gap-1 p-2 bg-red-50 rounded border border-red-200">
          <div className="text-xs font-bold text-red-700 flex items-center gap-1">
            ⚠️ Problem:
          </div>
          <div className="text-xs text-red-600 font-medium break-all">
            {marker.metadata.problem}
          </div>
          {onReportProblem && (
            <div className="flex gap-1.5 mt-1">
              <button 
                onClick={(e) => { 
                  e.preventDefault(); 
                  e.stopPropagation(); 
                  const desc = window.prompt("Opisz problem / Describe the problem:", marker.metadata.problem); 
                  if (desc !== null) {
                    onReportProblem(marker.id, desc); 
                  }
                }} 
                className="text-[10px] bg-red-100 hover:bg-red-200 text-red-700 py-0.5 px-1.5 rounded transition-colors font-semibold"
              >
                Edytuj problem
              </button>
              <button 
                onClick={(e) => { 
                  e.preventDefault(); 
                  e.stopPropagation(); 
                  onReportProblem(marker.id, ""); // clear problem
                }} 
                className="text-[10px] bg-red-100 hover:bg-red-200 text-red-700 py-0.5 px-1.5 rounded transition-colors font-semibold"
              >
                Usuń problem
              </button>
            </div>
          )}
        </div>
      )}
      
      {!hideExecutionStatus && subCables.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-xs font-bold text-gray-600">{t("stromkreise", "executionStatus", "Execution Status")}:</div>
          {subCables.map((sc: string) => {
            const ex = executions[sc];
            return (
              <div key={sc} className="flex flex-col gap-1 p-2 bg-gray-50 rounded border border-gray-200">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold">{sc}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    !ex ? 'bg-gray-200 text-gray-600' :
                    ex.status === 'PENDING_APPROVAL' ? 'bg-yellow-200 text-yellow-800' :
                    ex.status === 'APPROVED' ? 'bg-green-200 text-green-800' :
                    'bg-red-200 text-red-800'
                  }`}>
                    {!ex ? t("stromkreise", "notSubmitted", "Not submitted") : 
                     ex.status === 'PENDING_APPROVAL' ? t("stromkreise", "pendingApproval", "Pending approval") : 
                     ex.status === 'APPROVED' ? t("stromkreise", "approved", "Approved") : 
                     t("stromkreise", "rejected", "Rejected")}
                  </span>
                </div>
                
                {/* User actions */}
                {(!ex || ex.status === 'REJECTED') && onExecutionSubmit && (
                  <div className="flex gap-1 mt-1">
                    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onExecutionSubmit(marker.id, sc); }} className="flex-1 text-[10px] bg-blue-500 hover:bg-blue-600 text-white py-1 rounded transition-colors font-semibold">
                      {t("stromkreise", "confirmExecution", "Confirm execution")}
                    </button>
                    <button 
                      onClick={(e) => { 
                        e.preventDefault(); 
                        e.stopPropagation(); 
                        const desc = window.prompt("Opisz problem / Describe the problem:", marker.metadata?.problem || ""); 
                        if (desc !== null) {
                          onReportProblem?.(marker.id, desc); 
                        }
                      }} 
                      className="flex-1 text-[10px] bg-red-500 hover:bg-red-600 text-white py-1 rounded transition-colors font-semibold"
                    >
                      Zgłoś problem
                    </button>
                  </div>
                )}
                {ex && ex.status === 'PENDING_APPROVAL' && onExecutionUndo && (
                  <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onExecutionUndo(marker.id, sc); }} className="mt-1 w-full text-[10px] bg-gray-400 hover:bg-gray-500 text-white py-1 rounded transition-colors">
                    {t("stromkreise", "undoSubmission", "Undo submission")}
                  </button>
                )}
                
                {/* Admin actions */}
                {isAdmin && ex && ex.status === 'PENDING_APPROVAL' && onExecutionAction && (
                  <div className="flex gap-1 mt-1">
                    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onExecutionAction(marker.id, sc, "APPROVED"); }} className="flex-1 text-[10px] bg-green-500 hover:bg-green-600 text-white py-1 rounded transition-colors">
                      {t("stromkreise", "approve", "Approve")}
                    </button>
                    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onExecutionAction(marker.id, sc, "REJECTED"); }} className="flex-1 text-[10px] bg-red-500 hover:bg-red-600 text-white py-1 rounded transition-colors">
                      {t("stromkreise", "reject", "Reject")}
                    </button>
                  </div>
                )}
                {isAdmin && ex && ex.status === 'APPROVED' && onExecutionUndo && (
                  <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onExecutionUndo(marker.id, sc); }} className="mt-1 w-full text-[10px] bg-orange-500 hover:bg-orange-600 text-white py-1 rounded transition-colors">
                    {t("stromkreise", "undoApproval", "Undo Approval")}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {onReportProblem && !marker.metadata?.problem && (
        <button 
          onClick={(e) => { 
            e.preventDefault(); 
            e.stopPropagation(); 
            const desc = window.prompt("Opisz problem / Describe the problem:"); 
            if (desc !== null) {
              onReportProblem(marker.id, desc); 
            }
          }} 
          className="mt-1 w-full text-[10px] bg-red-500 hover:bg-red-600 text-white py-1 rounded font-semibold transition-colors"
        >
          Zgłoś problem
        </button>
      )}
    </div>
  );
};

const iconCache: Record<string, any> = {};

const makeStromkreisIcon = (
  code: string, 
  type: string, 
  scale: number = 1, 
  isSelected = false, 
  orientation = "horizontal", 
  markerId = "", 
  isFullyApproved = false, 
  isPendingApproval = false,
  executions: any = {},
  circuitCode: string = "",
  metadata: any = {},
  canDrag = false,
  isDuplicate = false,
  isCollision = false,
  isCircuitGroupSelected = false
) => {
  const cacheKey = `${code}_${type}_${scale.toFixed(4)}_${isSelected}_${orientation}_${markerId}_${isFullyApproved}_${isPendingApproval}_${JSON.stringify(executions)}_${circuitCode}_${JSON.stringify(metadata)}_${canDrag}_${isDuplicate}_${isCollision}_${isCircuitGroupSelected}`;
  if (iconCache[cacheKey]) {
    return iconCache[cacheKey];
  }

  const rotation = metadata?.rotation || (orientation === "vertical" ? 270 : 0);
  const isHighlighted = isSelected || isCircuitGroupSelected;

  if (["sym_socket", "sym_cee16", "sym_cee32"].includes(type)) {
    let svgHtml = "";
    if (type === "sym_socket") {
      svgHtml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" style="width:100%;height:100%;"><path d="M 20 70 A 30 30 0 0 1 80 70" fill="none" stroke="#16a34a" stroke-width="8" stroke-linecap="round" /><line x1="16" y1="40" x2="84" y2="40" stroke="#16a34a" stroke-width="8" stroke-linecap="round" /><line x1="50" y1="40" x2="50" y2="10" stroke="#16a34a" stroke-width="8" stroke-linecap="round" /></svg>`;
    } else if (type === "sym_cee16") {
      svgHtml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 110" style="width:100%;height:100%;"><path d="M 25 70 A 25 25 0 0 1 75 70" fill="none" stroke="#16a34a" stroke-width="7" stroke-linecap="round" /><line x1="20" y1="45" x2="80" y2="45" stroke="#16a34a" stroke-width="7" stroke-linecap="round" /><line x1="50" y1="45" x2="50" y2="10" stroke="#16a34a" stroke-width="7" stroke-linecap="round" /><line x1="38" y1="36" x2="62" y2="28" stroke="#16a34a" stroke-width="7" stroke-linecap="round" /><line x1="38" y1="27" x2="62" y2="19" stroke="#16a34a" stroke-width="7" stroke-linecap="round" /><line x1="38" y1="18" x2="62" y2="10" stroke="#16a34a" stroke-width="7" stroke-linecap="round" /><text x="50" y="102" fill="#16a34a" font-family="system-ui, sans-serif" font-weight="900" font-size="28px" text-anchor="middle">16A</text></svg>`;
    } else if (type === "sym_cee32") {
      svgHtml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 110" style="width:100%;height:100%;"><path d="M 25 70 A 25 25 0 0 1 75 70" fill="none" stroke="#16a34a" stroke-width="7" stroke-linecap="round" /><line x1="20" y1="45" x2="80" y2="45" stroke="#16a34a" stroke-width="7" stroke-linecap="round" /><line x1="50" y1="45" x2="50" y2="10" stroke="#16a34a" stroke-width="7" stroke-linecap="round" /><line x1="38" y1="36" x2="62" y2="28" stroke="#16a34a" stroke-width="7" stroke-linecap="round" /><line x1="38" y1="27" x2="62" y2="19" stroke="#16a34a" stroke-width="7" stroke-linecap="round" /><line x1="38" y1="18" x2="62" y2="10" stroke="#16a34a" stroke-width="7" stroke-linecap="round" /><text x="50" y="102" fill="#16a34a" font-family="system-ui, sans-serif" font-weight="900" font-size="28px" text-anchor="middle">32A</text></svg>`;
    }

    const size = Math.max(8, Math.round(38 * scale));
    const anchor = Math.round(size / 2);
    
    let symBg = "rgba(255,255,255,0.95)";
    let symBorder = `${Math.max(1, Math.round(2 * scale))}px solid #16a34a`;
    let symShadow = scale < 0.4 ? "none" : "0 2px 6px rgba(0,0,0,0.35)";
    let symTransform = `rotate(${rotation}deg)`;

    if (isSelected) {
      symBg = "rgba(37,99,235,0.35)";
      symBorder = `${Math.max(2, Math.round(3 * scale))}px solid #2563eb`;
      symShadow = "0 0 0 3px rgba(37, 99, 235, 0.7), 0 0 24px rgba(59,130,246,1)";
      symTransform = `rotate(${rotation}deg) scale(1.25)`;
    } else if (isCircuitGroupSelected) {
      symBg = "rgba(14, 165, 233, 0.2)";
      symBorder = `${Math.max(1.5, Math.round(2 * scale))}px dashed #0284c7`;
      symShadow = "0 0 14px rgba(14,165,233,0.75)";
      symTransform = `rotate(${rotation}deg) scale(1.12)`;
    }

    const icon = L.divIcon({
      className: "stromkreis-div-icon",
      html: `<div 
        onmousedown="if (event.shiftKey) { event.preventDefault(); event.stopPropagation(); window.toggleMarkerOrientation('${markerId}'); }"
        style="
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 100%;
          padding: ${scale < 0.4 ? 0 : Math.max(1, Math.round(2 * scale))}px;
          background: ${symBg};
          border: ${symBorder};
          border-radius: ${Math.max(2, Math.round(8 * scale))}px;
          box-shadow: ${symShadow};
          transform: ${symTransform};
          transform-origin: center;
          cursor: ${canDrag ? "grab" : "pointer"};
          box-sizing: border-box;
        "
      >${svgHtml}</div>`,
      iconSize: [size, size],
      iconAnchor: [anchor, anchor],
    });
    iconCache[cacheKey] = icon;
    return icon;
  }

  const fontSize = Math.max(4.5, Math.round(14 * scale));
  const paddingX = scale < 0.35 ? 1 : Math.max(1, Math.round(7 * scale));
  const paddingY = scale < 0.35 ? 0.5 : Math.max(1, Math.round(3 * scale));
  const borderRadius = Math.max(1.5, Math.round(5 * scale));
  
  let txtColor = "#0f172a";
  let bg = "rgba(255, 255, 255, 0.95)";
  let borderColor = "#cbd5e1";
  let borderWidth = scale < 0.65 ? "1px" : scale < 1.0 ? "1.5px" : "2px";
  let shadow = scale < 0.45 ? "none" : "0 2px 6px rgba(0, 0, 0, 0.35)";

  if (isFullyApproved) {
    txtColor = "#ffffff";
    bg = "#16a34a";
    borderColor = "#15803d";
    shadow = scale < 0.45 ? "none" : "0 2px 8px rgba(22, 163, 74, 0.4)";
  } else if (isPendingApproval) {
    txtColor = "#854d0e";
    bg = "#fef08a";
    borderColor = "#eab308";
    shadow = scale < 0.45 ? "none" : "0 2px 8px rgba(234, 179, 8, 0.4)";
  } else {
    if (type === "socket") { txtColor = "#dc2626"; borderColor = "#ef4444"; }
    else if (type === "light") { txtColor = "#d97706"; borderColor = "#f59e0b"; }
    else if (type === "edv") { txtColor = "#dc2626"; borderColor = "#ef4444"; }
    else if (type === "cee") { txtColor = "#7e22ce"; borderColor = "#a855f7"; }
    else if (type === "special") { txtColor = "#6d28d9"; borderColor = "#8b5cf6"; }
    else if (type === "reserve") { txtColor = "#475569"; borderColor = "#64748b"; }
    else if (type === "text") { txtColor = "#0f172a"; borderColor = "#94a3b8"; }
  }
  
  let extraBadge = "";
  const badgeFontSize = Math.max(5, Math.round(7.5 * scale));
  const badgeTop = -Math.round(13 * scale);

  if (isSelected) {
    borderColor = "#93c5fd";
    borderWidth = scale < 0.65 ? "2px" : "3px";
    bg = "#2563eb";
    txtColor = "#ffffff";
    shadow = "0 0 0 3px rgba(37, 99, 235, 0.7), 0 0 24px rgba(59, 130, 246, 1)";
    if (scale >= 0.55) {
      extraBadge = `<span style="position: absolute; top: ${badgeTop}px; left: 50%; transform: translateX(-50%); background: #2563eb; color: white; font-size: ${badgeFontSize}px; font-weight: 900; padding: 1px ${Math.max(2, Math.round(4 * scale))}px; border-radius: 3px; box-shadow: 0 0 8px rgba(37,99,235,0.9); z-index: 15; letter-spacing: 0.5px; white-space: nowrap;">WYBRANY</span>`;
    }
  } else if (isCircuitGroupSelected) {
    borderColor = "#38bdf8";
    borderWidth = scale < 0.65 ? "1.5px" : "2px";
    bg = "#1e40af";
    txtColor = "#e0f2fe";
    shadow = "0 0 14px rgba(56, 189, 248, 0.85)";
    if (scale >= 0.55) {
      extraBadge = `<span style="position: absolute; top: ${badgeTop}px; left: 50%; transform: translateX(-50%); background: #0284c7; color: white; font-size: ${badgeFontSize}px; font-weight: 900; padding: 1px ${Math.max(2, Math.round(4 * scale))}px; border-radius: 3px; box-shadow: 0 1px 4px rgba(0,0,0,0.5); z-index: 10; letter-spacing: 0.5px; white-space: nowrap;">DUPLIKAT</span>`;
    }
  }

  if (isDuplicate && !isSelected && !isCircuitGroupSelected) {
    borderColor = "#ef4444";
    borderWidth = scale < 0.65 ? "1.5px" : "2.5px";
    bg = "#fee2e2";
    shadow = scale < 0.45 ? "none" : "0 0 12px rgba(239, 68, 68, 0.85)";
    txtColor = "#b91c1c";
    if (scale >= 0.55 && !extraBadge) {
      extraBadge = `<span style="position: absolute; top: ${badgeTop}px; left: 50%; transform: translateX(-50%); background: #ef4444; color: white; font-size: ${badgeFontSize}px; font-weight: 900; padding: 1px ${Math.max(2, Math.round(4 * scale))}px; border-radius: 3px; box-shadow: 0 1px 3px rgba(0,0,0,0.5); z-index: 10; letter-spacing: 0.5px; white-space: nowrap;">DUPLIKAT</span>`;
    }
  } else if (isCollision && !isSelected && !isCircuitGroupSelected) {
    borderColor = "#f59e0b";
    borderWidth = scale < 0.65 ? "1.5px" : "2.5px";
    bg = "#fef3c7";
    shadow = scale < 0.45 ? "none" : "0 0 12px rgba(245, 158, 11, 0.85)";
    txtColor = "#b45309";
    if (scale >= 0.55 && !extraBadge) {
      extraBadge = `<span style="position: absolute; top: ${badgeTop}px; left: 50%; transform: translateX(-50%); background: #f59e0b; color: black; font-size: ${badgeFontSize}px; font-weight: 900; padding: 1px ${Math.max(2, Math.round(4 * scale))}px; border-radius: 3px; box-shadow: 0 1px 3px rgba(0,0,0,0.5); z-index: 10; letter-spacing: 0.5px; white-space: nowrap;">KOLIZJA</span>`;
    }
  }

  const minWidth = Math.max(8, Math.round(36 * scale));
  const width = Math.max(minWidth, Math.round(code.length * fontSize * 0.68) + paddingX * 2);
  const height = Math.max(6, Math.round(fontSize + paddingY * 2 + (scale < 0.5 ? 1 : 3)));
  const anchorX = Math.round(width / 2);
  const anchorY = Math.round(height / 2);

  let htmlContent = code;
  if (!isFullyApproved && !isHighlighted && circuitCode && circuitCode.includes("/") && scale >= 0.4) {
    const parts = code.split("/");
    const subCables = getSubCables(circuitCode);
    const htmlParts = parts.map((part, index) => {
      const scName = subCables[index];
      const status = executions[scName]?.status;
      
      let partColor = txtColor;
      let partBg = "transparent";
      if (status === "APPROVED") {
        partColor = "#16a34a";
      } else if (status === "PENDING_APPROVAL") {
        partColor = "#ca8a04";
      }
      return `<span style="color: ${partColor}; background: ${partBg}; padding: 0 1px; border-radius: 2px;">${part}</span>`;
    });
    htmlContent = htmlParts.join("/");
  }

  const transformStyle = `rotate(${rotation}deg)${isSelected ? " scale(1.25)" : isCircuitGroupSelected ? " scale(1.12)" : ""}`;

  const icon = L.divIcon({
    className: "stromkreis-div-icon",
    html: `<div 
      onmousedown="if (event.shiftKey) { event.preventDefault(); event.stopPropagation(); window.toggleMarkerOrientation('${markerId}'); }"
      style="
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background-color: ${bg};
        color: ${txtColor};
        border: ${borderWidth} solid ${borderColor};
        border-radius: ${borderRadius}px;
        width: 100%;
        height: 100%;
        box-sizing: border-box;
        font-size: ${fontSize}px;
        font-weight: 900;
        line-height: 1;
        letter-spacing: ${scale < 0.5 ? 0 : 0.2}px;
        white-space: nowrap;
        box-shadow: ${shadow};
        font-family: system-ui, -apple-system, sans-serif;
        transform: ${transformStyle};
        transform-origin: center;
        cursor: ${canDrag ? "grab" : "pointer"};
        padding: 0 ${paddingX}px;
      "
    >${extraBadge}${htmlContent}</div>`,
    iconSize: [width, height],
    iconAnchor: [anchorX, anchorY],
  });

  iconCache[cacheKey] = icon;
  return icon;
};

export const makeUvBoardIcon = (name: string, color: string = "#2563eb", isSelected = false, canDrag = false, scale: number = 1) => {
  const fontSize = Math.max(7, Math.round(11 * scale));
  const paddingX = Math.max(3, Math.round(8 * scale));
  const paddingY = Math.max(1.5, Math.round(3 * scale));
  const icon = L.divIcon({
    className: "uv-board-div-icon",
    html: `<div style="
      display: inline-flex;
      align-items: center;
      gap: ${Math.max(2, Math.round(5 * scale))}px;
      padding: ${paddingY}px ${paddingX}px;
      background: #090d16;
      color: #ffffff;
      border: ${scale < 0.7 ? '1px' : '2px'} solid ${color};
      border-radius: ${Math.max(3, Math.round(6 * scale))}px;
      box-shadow: 0 0 14px ${color}aa, 0 4px 8px rgba(0,0,0,0.6);
      font-size: ${fontSize}px;
      font-weight: 900;
      white-space: nowrap;
      font-family: system-ui, -apple-system, sans-serif;
      cursor: ${canDrag ? "grab" : "pointer"};
      transform: translate(-50%, -50%);
      ${isSelected ? `outline: 2px dashed #ffffff; outline-offset: 2px;` : ''}
    ">
      <span style="display: flex; align-items: center; justify-content: center; width: ${Math.max(10, Math.round(16 * scale))}px; height: ${Math.max(10, Math.round(16 * scale))}px; background: ${color}; color: white; border-radius: 3px; font-size: ${Math.max(6, Math.round(10 * scale))}px;">⚡</span>
      <span style="letter-spacing: 0.5px; text-transform: uppercase; color: #ffffff;">${name}</span>
    </div>`,
    iconSize: [1, 1],
    iconAnchor: [0, 0]
  });
  return icon;
};

const viewStateCache: Record<string, { center: any; zoom: number }> = {};

function MapEvents({
  planId,
  onClick,
  onDeselect,
  addMode,
  selectedMarkerId,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onZoomChange
}: {
  planId: string;
  onClick: (e: any) => void;
  onDeselect?: () => void;
  addMode: boolean;
  selectedMarkerId?: string | null;
  onMouseDown: (e: any) => void;
  onMouseMove: (e: any) => void;
  onMouseUp: (e: any) => void;
  onZoomChange?: (zoom: number) => void;
}) {
  const onClickRef = useRef(onClick);
  const onDeselectRef = useRef(onDeselect);
  const addModeRef = useRef(addMode);
  const onMouseDownRef = useRef(onMouseDown);
  const onMouseMoveRef = useRef(onMouseMove);
  const onMouseUpRef = useRef(onMouseUp);
  const planIdRef = useRef(planId);
  const onZoomChangeRef = useRef(onZoomChange);

  useEffect(() => {
    onClickRef.current = onClick;
    onDeselectRef.current = onDeselect;
    addModeRef.current = addMode;
    onMouseDownRef.current = onMouseDown;
    onMouseMoveRef.current = onMouseMove;
    onMouseUpRef.current = onMouseUp;
    planIdRef.current = planId;
    onZoomChangeRef.current = onZoomChange;
  }, [onClick, onDeselect, addMode, onMouseDown, onMouseMove, onMouseUp, planId, onZoomChange]);

  const map = useMapEvents({
    moveend: () => {
      if (planIdRef.current) {
        viewStateCache[planIdRef.current] = {
          center: map.getCenter(),
          zoom: map.getZoom()
        };
      }
    },
    zoomend: () => {
      const z = map.getZoom();
      if (planIdRef.current) {
        viewStateCache[planIdRef.current] = {
          center: map.getCenter(),
          zoom: z
        };
      }
      onZoomChangeRef.current?.(z);
    },
    zoom: () => {
      onZoomChangeRef.current?.(map.getZoom());
    },
    click: (e: any) => {
      if (addModeRef.current) {
        onClickRef.current(e);
      } else {
        onDeselectRef.current?.();
        map.closePopup();
      }
    },
    popupclose: () => {
      onDeselectRef.current?.();
    },
    mousedown: (e: any) => {
      if (addModeRef.current) onMouseDownRef.current(e);
    },
    mousemove: (e: any) => {
      (window as any).lastMouseLatLng = e.latlng;
      if (addModeRef.current) onMouseMoveRef.current(e);
    },
    mouseup: (e: any) => {
      if (addModeRef.current) onMouseUpRef.current(e);
    }
  });

  useEffect(() => {
    if (!selectedMarkerId) {
      map.closePopup();
    }
  }, [selectedMarkerId, map]);

  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Esc") {
        onDeselectRef.current?.();
        map.closePopup();
      }
    };
    window.addEventListener("keydown", handleGlobalKey, true);
    return () => {
      window.removeEventListener("keydown", handleGlobalKey, true);
    };
  }, [map]);

  return null;
}

function MapInitializer({ planId, bounds, z, onZoomChange }: { planId: string; bounds: any; z: number; onZoomChange?: (zoom: number) => void }) {
  const map = useMap();
  const lastPlanRef = useRef<string>("");

  useEffect(() => {
    if (lastPlanRef.current !== planId) {
      lastPlanRef.current = planId;
      const cached = viewStateCache[planId];
      if (cached) {
        map.setView(cached.center, cached.zoom, { animate: false });
        onZoomChange?.(cached.zoom);
      } else {
        const initCenter = bounds.getCenter();
        const initZoom = z ? z - 2 : 0;
        viewStateCache[planId] = { center: initCenter, zoom: initZoom };
        map.setView(initCenter, initZoom, { animate: false });
        onZoomChange?.(initZoom);
      }
    }
  }, [planId, bounds, z, map, onZoomChange]);

  return null;
}

function MapDraggingController({ disabled }: { disabled: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (disabled) {
      map.dragging.disable();
    } else {
      map.dragging.enable();
    }
  }, [disabled, map]);
  return null;
}

function MapFocusController({ selectedMarkerId, markers, mapData }: { selectedMarkerId: string | null, markers: StromkreisMarker[], mapData: any }) {
  return null;
}

const MemoizedTileLayer = React.memo(function MemoizedTileLayer({ url, maxNativeZoom, maxZoom }: { url: string; maxNativeZoom: number; maxZoom: number }) {
  const TL = TileLayer as any;
  return (
    <TL
      url={url}
      maxNativeZoom={maxNativeZoom}
      maxZoom={maxZoom}
    />
  );
});

const metaCache: Record<string, any> = {};

export default function StromkreiseMap({
  projectId, planId, token, markers, selectedMarkerId, selectedCircuitCode, selectedPanelGroup, onSelectMarker, onDeselectMarker, onMoveMarker, onAddMarker, onToggleMarkerOrientation, activeType, activeShape, isAdmin, isEditMode = false, addMode, tempCoordinates, onAddLineArrow, onMoveLineArrowPoint, onExecutionSubmit, onExecutionUndo, onExecutionAction, onReportProblem, onApproveAiPrediction, duplicateMarkerIds, collisionMarkerIds, hideExecutionStatus = false, uvBoards = [], onMoveUvBoard, onSelectUvBoard
}: Props) {
  const selectedMarkerObj = markers.find(m => m.id === selectedMarkerId);
  const activeCircuitCode = selectedCircuitCode || selectedMarkerObj?.circuit_code || null;
  const activePanelGroup = selectedPanelGroup !== undefined ? selectedPanelGroup : (selectedMarkerObj?.panel_group || null);
  const [meta, setMeta] = useState<any>(() => (planId ? metaCache[planId] || null : null));
  const [metaError, setMetaError] = useState<string | null>(null);
  const [currentZoom, setCurrentZoom] = useState<number>(() => viewStateCache[planId]?.zoom ?? 0);
  const [localMarkerPos, setLocalMarkerPos] = useState<Record<string, {x: number, y: number}>>({});
  const [localMarkerPos2, setLocalMarkerPos2] = useState<Record<string, {x: number, y: number}>>({});
  const [localUvBoardPos, setLocalUvBoardPos] = useState<Record<string, {x: number, y: number}>>({});
  const lastInteractionTime = useRef(0);
  const lastPlanIdRef = useRef<string>(planId || "");
  const [drawingState, setDrawingState] = useState<{ startX: number, startY: number, currentX: number, currentY: number } | null>(null);

  useEffect(() => {
    if (planId) {
      const cached = viewStateCache[planId];
      if (cached && typeof cached.zoom === "number") {
        setCurrentZoom(cached.zoom);
      } else if (meta?.maxZoom) {
        setCurrentZoom(meta.maxZoom - 2);
      }
    }
  }, [planId, meta?.maxZoom]);

  useEffect(() => {
    if (!planId) return;

    if (metaCache[planId]) {
      setMeta(metaCache[planId]);
      setMetaError(null);
      return;
    }
    
    // Only reset meta when planId actually changes and not in cache
    if (lastPlanIdRef.current !== planId) {
      setMeta(null);
      setMetaError(null);
      lastPlanIdRef.current = planId;
    }

    const url = `/api/tiles/${planId}/meta?${token ? "" : "public=true"}`;
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        metaCache[planId] = data;
        setMeta(data);
        setMetaError(null);
      })
      .catch(err => {
        console.error(err);
        setMetaError(err.message);
      });
  }, [planId]);

  const mapData = useMemo(() => {
    if (!meta || !meta.gridW || !meta.gridH || !meta.tileSize) return null;
    const W = meta.gridW * meta.tileSize;
    const H = meta.gridH * meta.tileSize;
    const z = meta.maxZoom;
    const toLL = (x: number, y: number) => {
      if (isNaN(x) || isNaN(y)) return L.latLng(0, 0);
      return (CRS as any).pointToLatLng(L.point(x * W, y * H), z);
    };
    const fromLL = (ll: any) => {
      if (!ll) return { x: 0, y: 0 };
      const p = (CRS as any).latLngToPoint(ll, z);
      return { x: p.x / W, y: p.y / H };
    };
    const bounds = L.latLngBounds(
      (CRS as any).pointToLatLng(L.point(0, H), z),
      (CRS as any).pointToLatLng(L.point(W, 0), z)
    );
    const initialCenter = bounds.getCenter();
    const initialZoom = z ? z - 2 : 0;
    return { W, H, z, toLL, fromLL, bounds, initialCenter, initialZoom };
  }, [meta]);

  useEffect(() => {
    if (mapData) {
      (window as any).latLngToXY = mapData.fromLL;
    } else {
      (window as any).latLngToXY = null;
    }
    return () => {
      (window as any).latLngToXY = null;
    };
  }, [mapData]);

  useEffect(() => {
    if (Date.now() - lastInteractionTime.current < 1500) return;
    const markerIds = new Set(markers.map(m => m.id));
    setLocalMarkerPos(prev => {
      const next: Record<string, {x: number, y: number}> = {};
      let changed = false;

      // Purge deleted marker IDs
      Object.keys(prev).forEach(id => {
        if (markerIds.has(id)) {
          next[id] = prev[id];
        } else {
          changed = true;
        }
      });

      markers.forEach(m => {
        const current = prev[m.id];
        if (!current || Math.sqrt(Math.pow(current.x - m.x_norm, 2) + Math.pow(current.y - m.y_norm, 2)) > 0.01) {
          next[m.id] = { x: m.x_norm, y: m.y_norm };
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [markers]);

  const handleMarkerDrag = (id: string, pointIndex: 1 | 2, latlng: any) => {
    if (!mapData) return;
    const { x, y } = mapData.fromLL(latlng);
    if (pointIndex === 1) {
      setLocalMarkerPos(prev => ({ ...prev, [id]: { x, y } }));
    } else {
      setLocalMarkerPos2(prev => ({ ...prev, [id]: { x, y } }));
    }
  };

  const handleMarkerDragEnd = async (id: string, pointIndex: 1 | 2, latlng: any) => {
    if (!mapData) return;
    lastInteractionTime.current = Date.now();
    const { x, y } = mapData.fromLL(latlng);
    
    if (pointIndex === 1) {
      setLocalMarkerPos(prev => ({ ...prev, [id]: { x, y } }));
      if (onMoveLineArrowPoint) {
        onMoveLineArrowPoint(id, 1, x, y);
      } else {
        onMoveMarker(id, x, y);
      }
    } else {
      setLocalMarkerPos2(prev => ({ ...prev, [id]: { x, y } }));
      if (onMoveLineArrowPoint) {
        onMoveLineArrowPoint(id, 2, x, y);
      }
    }
  };

  const handleMapClick = (e: any) => {
    if (!mapData) return;
    if (activeType === "line" || activeType === "arrow") return; // Handled by drag
    const { x, y } = mapData.fromLL(e.latlng);
    onAddMarker(x, y);
  };

  const handleMouseDown = (e: any) => {
    if (!mapData || !addMode) return;
    if (activeType === "line" || activeType === "arrow") {
      const { x, y } = mapData.fromLL(e.latlng);
      setDrawingState({ startX: x, startY: y, currentX: x, currentY: y });
    }
  };

  const handleMouseMove = (e: any) => {
    if (!mapData || !drawingState) return;
    const { x, y } = mapData.fromLL(e.latlng);
    setDrawingState(prev => prev ? { ...prev, currentX: x, currentY: y } : null);
  };

  const handleMouseUp = (e: any) => {
    if (!mapData || !drawingState) return;
    const { x, y } = mapData.fromLL(e.latlng);
    if (onAddLineArrow) {
      // Only add if it's actually dragged a tiny bit (not just a click)
      if (Math.abs(drawingState.startX - x) > 0.001 || Math.abs(drawingState.startY - y) > 0.001) {
        onAddLineArrow(drawingState.startX, drawingState.startY, x, y);
      }
    }
    setDrawingState(null);
  };

  const tileUrl = useMemo(() => {
    return `/api/tiles/${planId}/{z}/{x}/{y}.png?${token ? `token=${token}` : "public=true"}&v=${meta?.activeVersionId || ''}`;
  }, [planId, !!token, meta?.activeVersionId]);

  if (metaError) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-black/40 p-8">
        <p className="text-[10px] font-black text-red-500 uppercase">{metaError}</p>
      </div>
    );
  }

  if (!meta || !mapData) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500 text-[10px] font-black uppercase animate-pulse">
        Loading Map...
      </div>
    );
  }

  const { toLL, bounds, z } = mapData;
  const initialCenter = viewStateCache[planId]?.center || bounds.getCenter();
  const initialZoom = viewStateCache[planId]?.zoom ?? (z ? z - 2 : 0);

  const baseZoom = z || 4;
  // On zoom in above baseZoom: scale up smoothly up to 3.5x
  // On zoom out below baseZoom: scale down sharply (down to ~0.18 on full zoom-out)
  const scale = currentZoom >= baseZoom 
    ? Math.min(3.5, 1.0 + (currentZoom - baseZoom) * 1.25) 
    : Math.max(0.18, Math.pow(0.58, baseZoom - currentZoom));

  const MC = MapContainer as any;
  const Mk = Marker as any;
  const TL = TileLayer as any;

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ cursor: addMode ? "crosshair" : "default" }}
    >
      <MC
        key={planId}
        crs={CRS}
        center={initialCenter}
        zoom={initialZoom}
        minZoom={1}
        maxZoom={z + 2}
        dragging={true}
        scrollWheelZoom={true}
        zoomSnap={0.1}
        zoomDelta={0.5}
        wheelPxPerZoomLevel={60}
        style={{ height: "100%", width: "100%", background: "#0f172a" }}
      >
        <MapInitializer planId={planId} bounds={bounds} z={z} onZoomChange={setCurrentZoom} />
        <MapDraggingController disabled={addMode && (activeType === "line" || activeType === "arrow")} />
        <MapFocusController selectedMarkerId={selectedMarkerId} markers={markers} mapData={mapData} />
        <MemoizedTileLayer
          url={tileUrl}
          maxNativeZoom={z}
          maxZoom={z + 2}
        />
        <MapEvents
          planId={planId}
          onClick={handleMapClick}
          onDeselect={onDeselectMarker}
          selectedMarkerId={selectedMarkerId}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onZoomChange={setCurrentZoom}
          addMode={addMode}
        />
        
        {tempCoordinates && (
          <CircleMarker center={toLL(tempCoordinates.x, tempCoordinates.y)} pathOptions={{ color: "red", fillOpacity: 1, radius: 4 }} />
        )}

        {drawingState && (
          <React.Fragment>
            <Polyline 
              positions={[toLL(drawingState.startX, drawingState.startY), toLL(drawingState.currentX, drawingState.currentY)]} 
              pathOptions={{ color: "#ef4444", weight: 3, dashArray: "5, 5" }} 
            />
            {activeType === "arrow" && (() => {
              const p1 = toLL(drawingState.startX, drawingState.startY);
              const p2 = toLL(drawingState.currentX, drawingState.currentY);
              const dx = p2.lng - p1.lng;
              const dy = p2.lat - p1.lat;
              if (dx === 0 && dy === 0) return null;
              const angle = Math.atan2(dy, dx);
              const headLen = 15 * scale;
              const p3 = L.latLng(p2.lat - headLen * Math.sin(angle - Math.PI / 6), p2.lng - headLen * Math.cos(angle - Math.PI / 6));
              const p4 = L.latLng(p2.lat - headLen * Math.sin(angle + Math.PI / 6), p2.lng - headLen * Math.cos(angle + Math.PI / 6));
              return <Polygon positions={[p2, p3, p4]} pathOptions={{ color: "#ef4444", fillColor: "#ef4444", fillOpacity: 1 }} />;
            })()}
          </React.Fragment>
        )}

        {markers.map(marker => {
          const pos = localMarkerPos[marker.id] || { x: marker.x_norm, y: marker.y_norm };
          const isSelected = selectedMarkerId === marker.id;
          
          if (marker.type === "line" || marker.type === "arrow") {
            const p1 = toLL(pos.x, pos.y);
            const pos2 = localMarkerPos2[marker.id] || { x: marker.metadata?.x2_norm ?? pos.x, y: marker.metadata?.y2_norm ?? pos.y };
            const p2 = toLL(pos2.x, pos2.y);
            
            const subCables = getSubCables(marker.circuit_code);
            let isFullyApproved = false;
            if (subCables.length > 0) {
              isFullyApproved = subCables.every(sc => marker.metadata?.executions?.[sc]?.status === "APPROVED");
            }
            const color = isSelected ? "#ef4444" : (isFullyApproved ? "#000000" : "#eab308");
            const elements = [];
            
            elements.push(
              <Polyline 
                key={`line-${marker.id}`} 
                positions={[p1, p2]} 
                pathOptions={{ color: color, weight: isSelected ? 5 : 3 }} 
                eventHandlers={{
                  click: () => onSelectMarker(marker)
                }}
              >
                <Popup>
                  <MarkerPopupContent 
                    marker={marker} 
                    isAdmin={isAdmin}
                    onExecutionSubmit={onExecutionSubmit}
                    onExecutionUndo={onExecutionUndo}
                    onExecutionAction={onExecutionAction}
                    onReportProblem={onReportProblem}
                    onApproveAiPrediction={onApproveAiPrediction}
                    hideExecutionStatus={hideExecutionStatus}
                  />
                </Popup>
                {marker.metadata?.problem && (
                  <Tooltip {...({ direction: "top", opacity: 0.9, sticky: true } as any)}>
                    <div className="bg-red-500 text-white text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded shadow-md border border-red-400">
                      ⚠️ PROBLEM: {marker.metadata.problem}
                    </div>
                  </Tooltip>
                )}
              </Polyline>
            );

            if (marker.type === "arrow" && (p1.lat !== p2.lat || p1.lng !== p2.lng)) {
              const dx = p2.lng - p1.lng;
              const dy = p2.lat - p1.lat;
              const angle = Math.atan2(dy, dx);
              const headLen = 15 * scale;
              const p3 = L.latLng(p2.lat - headLen * Math.sin(angle - Math.PI / 6), p2.lng - headLen * Math.cos(angle - Math.PI / 6));
              const p4 = L.latLng(p2.lat - headLen * Math.sin(angle + Math.PI / 6), p2.lng - headLen * Math.cos(angle + Math.PI / 6));
              
              elements.push(
                <Polygon 
                  key={`arrowhead-${marker.id}`} 
                  positions={[p2, p3, p4]} 
                  pathOptions={{ color: color, fillColor: color, fillOpacity: 1 }} 
                  eventHandlers={{ click: () => onSelectMarker(marker) }}
                />
              );
            }
            
            elements.push(
              <Mk
                key={`handle1-${marker.id}`}
                position={p1}
                icon={L.divIcon({ className: "empty-icon", html: `<div style="width:12px;height:12px;background:${color};border-radius:50%;margin:-6px 0 0 -6px; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>` })}
                draggable={isAdmin && isEditMode}
                eventHandlers={{
                  click: () => onSelectMarker(marker),
                  drag: (e: any) => handleMarkerDrag(marker.id, 1, e.latlng),
                  dragend: (e: any) => handleMarkerDragEnd(marker.id, 1, e.latlng),
                }}
              />
            );

            if (pos2.x !== pos.x || pos2.y !== pos.y) {
              elements.push(
                <Mk
                  key={`handle2-${marker.id}`}
                  position={p2}
                  icon={L.divIcon({ className: "empty-icon", html: `<div style="width:12px;height:12px;background:${color};border-radius:50%;margin:-6px 0 0 -6px; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>` })}
                  draggable={isAdmin && isEditMode}
                  eventHandlers={{
                    click: () => onSelectMarker(marker),
                    drag: (e: any) => handleMarkerDrag(marker.id, 2, e.latlng),
                    dragend: (e: any) => handleMarkerDragEnd(marker.id, 2, e.latlng),
                  }}
                />
              );
            }

            return <React.Fragment key={`fragment-${marker.id}`}>{elements}</React.Fragment>;
          }
          
          const isDuplicate = !!(duplicateMarkerIds && duplicateMarkerIds.has(marker.id));
          const isCollision = !!(collisionMarkerIds && collisionMarkerIds.has(marker.id));
          const markerPanelGroup = (marker.panel_group || marker.metadata?.uv_name || "").trim().toLowerCase();
          const activePanelGroupNorm = (activePanelGroup || "").trim().toLowerCase();
          const isCircuitGroupSelected = !!(
            activeCircuitCode && 
            marker.circuit_code?.trim().toLowerCase() === activeCircuitCode.trim().toLowerCase() && 
            (activePanelGroupNorm ? markerPanelGroup === activePanelGroupNorm : true)
          );

          return (
            <Mk
              key={marker.id}
              position={toLL(pos.x, pos.y)}
              icon={makeStromkreisIcon(
                marker.type === "text" ? marker.short_label : marker.circuit_code,
                marker.type,
                scale,
                isSelected,
                marker.metadata?.orientation || "horizontal",
                marker.id,
                (() => {
                  const sc = getSubCables(marker.circuit_code);
                  return sc.length > 0 && sc.every(c => marker.metadata?.executions?.[c]?.status === "APPROVED");
                })(),
                (() => {
                  const sc = getSubCables(marker.circuit_code);
                  const isFullyApproved = sc.length > 0 && sc.every(c => marker.metadata?.executions?.[c]?.status === "APPROVED");
                  return !isFullyApproved && sc.length > 0 && sc.every(c => {
                    const status = marker.metadata?.executions?.[c]?.status;
                    return status === "APPROVED" || status === "PENDING_APPROVAL";
                  });
                })(),
                marker.metadata?.executions || {},
                marker.circuit_code,
                marker.metadata || {},
                isAdmin && isEditMode,
                isDuplicate,
                isCollision,
                isCircuitGroupSelected
              )}
              draggable={isAdmin && isEditMode && !addMode}
              eventHandlers={{
                drag: (e: any) => handleMarkerDrag(marker.id, 1, e.target.getLatLng()),
                dragend: (e: any) => handleMarkerDragEnd(marker.id, 1, e.target.getLatLng()),
                click: (e: any) => {
                  if (!addMode) {
                    if (e.originalEvent?.shiftKey && onToggleMarkerOrientation) {
                      onToggleMarkerOrientation(marker.id);
                    } else {
                      onSelectMarker(marker);
                    }
                  }
                }
              }}
            >
              {!["sym_socket", "sym_cee16", "sym_cee32"].includes(marker.type) && (
                <Popup>
                  <MarkerPopupContent 
                    marker={marker} 
                    isAdmin={isAdmin}
                    onExecutionSubmit={onExecutionSubmit}
                    onExecutionUndo={onExecutionUndo}
                    onExecutionAction={onExecutionAction}
                    onReportProblem={onReportProblem}
                    isDuplicate={isDuplicate}
                    isCollision={isCollision}
                    hideExecutionStatus={hideExecutionStatus}
                  />
                </Popup>
              )}
              {isDuplicate && !marker.metadata?.problem && (
                <Tooltip {...({ direction: "top", offset: [0, -14], opacity: 0.95 } as any)}>
                  <div className="bg-red-600 text-white text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded shadow-md border border-red-400">
                    ⚠️ DUPLIKAT NA TYM PLANIE: {marker.circuit_code}
                  </div>
                </Tooltip>
              )}
              {isCollision && !isDuplicate && !marker.metadata?.problem && (
                <Tooltip {...({ direction: "top", offset: [0, -14], opacity: 0.95 } as any)}>
                  <div className="bg-amber-600 text-white text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded shadow-md border border-amber-400">
                    ⚠️ KOLIZJA Z INNYM PLANEM: {marker.circuit_code}
                  </div>
                </Tooltip>
              )}
              {marker.metadata?.problem && (
                <Tooltip {...({ direction: "top", offset: [0, -10], opacity: 0.9 } as any)}>
                  <div className="bg-red-500 text-white text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded shadow-md border border-red-400">
                    ⚠️ PROBLEM: {marker.metadata.problem}
                  </div>
                </Tooltip>
              )}
            </Mk>
          );
        })}

        {/* Render UV Distribution Boards */}
        {(uvBoards || []).map(board => {
          const bPos = localUvBoardPos[board.id] || { x: board.x_norm, y: board.y_norm };
          const isSelected = selectedMarkerId === `uv-${board.id}` || selectedMarkerId === board.id;

          return (
            <Mk
              key={`uv-board-${board.id}`}
              position={toLL(bPos.x, bPos.y)}
              icon={makeUvBoardIcon(board.name, board.color || "#2563eb", isSelected, isAdmin && isEditMode, scale)}
              draggable={isAdmin && isEditMode && !addMode}
              eventHandlers={{
                drag: (e: any) => {
                  if (!mapData) return;
                  const { x, y } = mapData.fromLL(e.target.getLatLng());
                  setLocalUvBoardPos(prev => ({ ...prev, [board.id]: { x, y } }));
                },
                dragend: (e: any) => {
                  if (!mapData) return;
                  lastInteractionTime.current = Date.now();
                  const { x, y } = mapData.fromLL(e.target.getLatLng());
                  setLocalUvBoardPos(prev => ({ ...prev, [board.id]: { x, y } }));
                  if (onMoveUvBoard) {
                    onMoveUvBoard(board.id, x, y);
                  }
                },
                click: () => {
                  if (onSelectUvBoard) onSelectUvBoard(board);
                }
              }}
            >
              <Popup>
                <div className="flex flex-col gap-1.5 p-1 min-w-[170px]" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-2 border-b border-gray-200 pb-1.5">
                    <span className="w-6 h-6 rounded flex items-center justify-center text-white text-xs font-black shadow-sm" style={{ background: board.color || "#2563eb" }}>⚡</span>
                    <div>
                      <div className="text-xs font-black text-gray-900">{board.name}</div>
                      <div className="text-[10px] text-gray-500 font-bold">Rozdzielnica / Verteiler</div>
                    </div>
                  </div>
                  <div className="text-[10px] text-gray-600">
                    Lokalizacja: x={bPos.x.toFixed(3)}, y={bPos.y.toFixed(3)}
                  </div>
                </div>
              </Popup>
            </Mk>
          );
        })}
      </MC>
    </div>
  );
}
