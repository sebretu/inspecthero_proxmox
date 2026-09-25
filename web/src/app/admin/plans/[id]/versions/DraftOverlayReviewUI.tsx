"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { apiPost, getToken } from "@/lib/apiClient";

const DraftOverlayMap = dynamic(() => import("./DraftOverlayMap"), {
  ssr: false,
  loading: () => <div className="w-full h-[600px] flex items-center justify-center bg-black/50 text-white">Loading Map Editor...</div>,
});

export default function DraftOverlayReviewUI({
  planId,
  draftVersion,
  activeVersion,
  onClose,
  onSuccess
}: {
  planId: string;
  draftVersion: any;
  activeVersion: any;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [opacity, setOpacity] = useState(0.5);
  const [anchorsOld, setAnchorsOld] = useState<{x: number, y: number}[]>([]);
  const [anchorsDraft, setAnchorsDraft] = useState<{x: number, y: number}[]>([]);
  const [calculating, setCalculating] = useState(false);
  const [activating, setActivating] = useState(false);

  // Initialize Nudge Alignment states from database model if available
  const initialModel = draftVersion?.transformation_model;
  let initX = 0, initY = 0, initScale = 1.0, initRot = 0;
  if (initialModel?.nudgeState) {
    initX = initialModel.nudgeState.offsetX;
    initY = initialModel.nudgeState.offsetY;
    initScale = initialModel.nudgeState.scale;
    initRot = initialModel.nudgeState.rotation;
  } else if (initialModel?.matrix) {
    const m = initialModel.matrix;
    initX = m[0][2] ?? 0;
    initY = m[1][2] ?? 0;
    const m00 = m[0][0] ?? 1;
    const m10 = m[1][0] ?? 0;
    initScale = Math.sqrt(m00 * m00 + m10 * m10);
    initRot = (Math.atan2(m10, m00) * 180) / Math.PI;
  }

  const [alignMode, setAlignMode] = useState<"interactive" | "anchors">("interactive");
  const [offsetX, setOffsetX] = useState(initX);
  const [offsetY, setOffsetY] = useState(initY);
  const [scale, setScale] = useState(initScale);
  const [rotation, setRotation] = useState(initRot);
  const [dragToAlign, setDragToAlign] = useState(false);
  const [nudgeStep, setNudgeStep] = useState(0.001);

  const handleResetAlignment = async () => {
    if (!confirm("Are you sure you want to reset and clear the alignment? Pins will not be shifted upon activation.")) return;
    setCalculating(true);
    try {
      const token = await getToken();
      await apiPost(`/api/plans/${planId}/calculate-transform`, {
        versionId: draftVersion.id,
        clear: true
      }, token!);
      setAnchorsOld([]);
      setAnchorsDraft([]);
      setOffsetX(0);
      setOffsetY(0);
      setScale(1.0);
      setRotation(0);
      alert("Alignment cleared successfully! Pins will stay in their current positions when you activate.");
    } catch (e: any) {
      alert("Failed to clear alignment: " + e.message);
    } finally {
      setCalculating(false);
    }
  };

  const handleCalculateMatrix = async () => {
    if (anchorsOld.length < 2) {
      alert("Please place at least 2 reference points on both the old and draft plans.");
      return;
    }
    if (anchorsOld.length !== anchorsDraft.length) {
      alert(`Mismatched reference points! You placed ${anchorsOld.length} Old anchors and ${anchorsDraft.length} Draft anchors. They must match 1-to-1.`);
      return;
    }
    setCalculating(true);
    try {
      const token = await getToken();
      await apiPost(`/api/plans/${planId}/calculate-transform`, {
        versionId: draftVersion.id,
        v_old_anchors: anchorsOld,
        v_draft_anchors: anchorsDraft
      }, token!);
      alert(`Transformation matrix calculated successfully using ${anchorsOld.length} points! You can now review the alignment. If it looks good, click ACTIVATE VERSION.`);
    } catch (e: any) {
      alert("Failed to calculate: " + e.message);
    } finally {
      setCalculating(false);
    }
  };

  const handleSaveNudgeAlignment = async () => {
    setCalculating(true);
    try {
      const r = (rotation * Math.PI) / 180;
      const m00 = scale * Math.cos(r);
      const m01 = -scale * Math.sin(r);
      const tx = offsetX;
      const m10 = scale * Math.sin(r);
      const m11 = scale * Math.cos(r);
      const ty = offsetY;

      const customModel = {
        type: "similarity",
        matrix: [
          [m00, m01, tx],
          [m10, m11, ty]
        ],
        nudgeState: {
          offsetX,
          offsetY,
          scale,
          rotation
        }
      };

      const token = await getToken();
      await apiPost(`/api/plans/${planId}/calculate-transform`, {
        versionId: draftVersion.id,
        custom_transformation_model: customModel
      }, token!);
      
      alert("Nudge alignment saved successfully! You can now click ACTIVATE VERSION.");
    } catch (e: any) {
      alert("Failed to save alignment: " + e.message);
    } finally {
      setCalculating(false);
    }
  };

  const handleActivateVersion = async () => {
    if (!confirm("Are you sure? This will permanently activate the new version and apply the transformation to all markers.")) return;
    setActivating(true);
    try {
      const token = await getToken();
      await apiPost(`/api/plans/${planId}/activate-version`, { versionId: draftVersion.id }, token!);
      alert("Version Activated successfully!");
      onSuccess();
    } catch (e: any) {
      alert("Failed to activate: " + e.message);
    } finally {
      setActivating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-ui-bg text-ui-text flex flex-col">
      <div className="p-4 border-b border-ui-border flex justify-between items-center bg-black/40">
        <div>
          <h2 className="text-lg font-black uppercase tracking-widest text-blue-400">Draft Alignment Wizard</h2>
          <p className="text-xs text-ui-muted">
            Align the markers to the new PDF plan. Use **Interactive Nudge** to drag or slide markers, or **Anchor Points** to match features.
            <strong className="text-amber-400 block mt-1">If the plan does not need shifting, click ACTIVATE VERSION directly.</strong>
          </p>
        </div>
        <div className="flex gap-4">
          <button onClick={onClose} className="px-4 py-2 border border-ui-border rounded-lg text-xs font-bold hover:bg-white/10">CANCEL</button>
        </div>
      </div>

      <div className="flex-1 relative">
        <DraftOverlayMap 
          planId={planId}
          draftVersionId={draftVersion.id}
          opacity={opacity}
          anchorsOld={anchorsOld}
          anchorsDraft={anchorsDraft}
          setAnchorsOld={setAnchorsOld}
          setAnchorsDraft={setAnchorsDraft}
          nudgeMode={alignMode === "interactive"}
          offsetX={offsetX}
          offsetY={offsetY}
          scale={scale}
          rotation={rotation}
          dragToAlign={dragToAlign}
          setOffsetX={setOffsetX}
          setOffsetY={setOffsetY}
        />
        
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/85 backdrop-blur-md p-4 rounded-xl border border-ui-border z-[1000] shadow-2xl flex flex-col gap-4 min-w-[420px]">
          {/* Alignment Mode Tabs */}
          <div className="flex border-b border-ui-border pb-1">
            <button 
              onClick={() => { setAlignMode("interactive"); setDragToAlign(false); }}
              className={`flex-1 py-1 text-xs font-black uppercase tracking-widest ${alignMode === "interactive" ? "border-b-2 border-blue-400 text-blue-400 font-bold" : "opacity-60"}`}
            >
              Interactive Nudge
            </button>
            <button 
              onClick={() => { setAlignMode("anchors"); setDragToAlign(false); }}
              className={`flex-1 py-1 text-xs font-black uppercase tracking-widest ${alignMode === "anchors" ? "border-b-2 border-blue-400 text-blue-400 font-bold" : "opacity-60"}`}
            >
              Anchor Points
            </button>
          </div>

          {alignMode === "interactive" ? (
            <div className="space-y-3">
              {/* Opacity Control */}
              <div className="flex items-center gap-4">
                <span className="text-[10px] font-black uppercase tracking-widest text-ui-muted w-24">Draft Opacity:</span>
                <input 
                  type="range" 
                  min="0" max="1" step="0.05" 
                  value={opacity} 
                  onChange={e => setOpacity(parseFloat(e.target.value))} 
                  className="flex-1"
                />
                <span className="text-xs font-mono w-8 text-right">{Math.round(opacity * 100)}%</span>
              </div>

              {/* Drag Align Mode Toggle */}
              <div className="flex items-center justify-between p-2 rounded bg-white/5 border border-ui-border">
                <div className="flex flex-col">
                  <span className="text-xs font-bold uppercase text-amber-400">Drag Map to Align Markers</span>
                  <span className="text-[9px] opacity-60">Disables panning to slide pins with mouse</span>
                </div>
                <input 
                  type="checkbox" 
                  checked={dragToAlign}
                  onChange={e => setDragToAlign(e.target.checked)}
                  className="w-4 h-4 accent-amber-400"
                />
              </div>

              {/* Offset X Slider & Nudges */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-ui-muted">
                  <span>Shift X (Horizontal)</span>
                  <span className="font-mono text-blue-400">{offsetX.toFixed(5)}</span>
                </div>
                <div className="flex gap-2 items-center">
                  <button onClick={() => setOffsetX(prev => prev - nudgeStep)} className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded font-bold text-sm">◀</button>
                  <input 
                    type="range" 
                    min="-0.2" max="0.2" step="0.0001" 
                    value={offsetX} 
                    onChange={e => setOffsetX(parseFloat(e.target.value))} 
                    className="flex-1"
                  />
                  <button onClick={() => setOffsetX(prev => prev + nudgeStep)} className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded font-bold text-sm">▶</button>
                </div>
              </div>

              {/* Offset Y Slider & Nudges */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-ui-muted">
                  <span>Shift Y (Vertical)</span>
                  <span className="font-mono text-blue-400">{offsetY.toFixed(5)}</span>
                </div>
                <div className="flex gap-2 items-center">
                  <button onClick={() => setOffsetY(prev => prev - nudgeStep)} className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded font-bold text-sm">▲</button>
                  <input 
                    type="range" 
                    min="-0.2" max="0.2" step="0.0001" 
                    value={offsetY} 
                    onChange={e => setOffsetY(parseFloat(e.target.value))} 
                    className="flex-1"
                  />
                  <button onClick={() => setOffsetY(prev => prev + nudgeStep)} className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded font-bold text-sm">▼</button>
                </div>
              </div>

              {/* Scale Slider & Nudges */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-ui-muted">
                  <span>Scale Factor</span>
                  <span className="font-mono text-blue-400">{scale.toFixed(5)}</span>
                </div>
                <div className="flex gap-2 items-center">
                  <button onClick={() => setScale(prev => Math.max(0.2, prev - nudgeStep))} className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded font-bold text-sm">-</button>
                  <input 
                    type="range" 
                    min="0.8" max="1.2" step="0.0001" 
                    value={scale} 
                    onChange={e => setScale(parseFloat(e.target.value))} 
                    className="flex-1"
                  />
                  <button onClick={() => setScale(prev => Math.min(2.0, prev + nudgeStep))} className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded font-bold text-sm">+</button>
                </div>
              </div>

              {/* Rotation Slider & Nudges */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-ui-muted">
                  <span>Rotation Angle (Degrees)</span>
                  <span className="font-mono text-blue-400">{rotation.toFixed(2)}°</span>
                </div>
                <div className="flex gap-2 items-center">
                  <button onClick={() => setRotation(prev => prev - 0.1)} className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded font-bold text-sm">↺</button>
                  <input 
                    type="range" 
                    min="-10" max="10" step="0.05" 
                    value={rotation} 
                    onChange={e => setRotation(parseFloat(e.target.value))} 
                    className="flex-1"
                  />
                  <button onClick={() => setRotation(prev => prev + 0.1)} className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded font-bold text-sm">↻</button>
                </div>
              </div>

              {/* Step Size Selector */}
              <div className="flex items-center justify-between text-xs pt-1">
                <span className="font-black uppercase tracking-widest text-ui-muted text-[10px]">Nudge Step Size:</span>
                <div className="flex gap-1">
                  {[0.01, 0.001, 0.0001].map(step => (
                    <button
                      key={step}
                      type="button"
                      onClick={() => setNudgeStep(step)}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${nudgeStep === step ? "bg-blue-600 text-white" : "bg-white/10 text-ui-muted"}`}
                    >
                      {step.toString()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-2 pt-2 border-t border-ui-border">
                <button
                  onClick={handleSaveNudgeAlignment}
                  disabled={calculating}
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg disabled:opacity-50 text-xs uppercase"
                >
                  {calculating ? "SAVING..." : "1. SAVE NUDGE ALIGNMENT"}
                </button>
                <button
                  onClick={handleActivateVersion}
                  disabled={activating}
                  className="w-full px-4 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg disabled:opacity-50 text-xs uppercase"
                >
                  {activating ? "ACTIVATING..." : "2. ACTIVATE VERSION"}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <span className="text-xs font-bold uppercase w-32">Draft Opacity:</span>
                <input 
                  type="range" 
                  min="0" max="1" step="0.05" 
                  value={opacity} 
                  onChange={e => setOpacity(parseFloat(e.target.value))} 
                  className="flex-1"
                />
                <span className="text-xs font-mono">{Math.round(opacity * 100)}%</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/5 p-2 rounded-lg flex flex-col justify-between min-h-[90px]">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-ui-muted mb-1">V_OLD Anchors</div>
                    <div className="text-sm font-bold text-red-400">{anchorsOld.length} Placed</div>
                    <p className="text-[9px] opacity-60 mt-1">Right-click on map to place.</p>
                  </div>
                  {anchorsOld.length > 0 && (
                    <button 
                      onClick={() => setAnchorsOld(anchorsOld.slice(0, -1))}
                      className="mt-2 text-[9px] font-bold text-red-400/80 hover:text-red-400 border border-red-500/30 rounded px-2 py-0.5 self-start"
                    >
                      UNDO LAST
                    </button>
                  )}
                </div>
                <div className="bg-white/5 p-2 rounded-lg flex flex-col justify-between min-h-[90px]">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-ui-muted mb-1">V_DRAFT Anchors</div>
                    <div className="text-sm font-bold text-blue-400">{anchorsDraft.length} Placed</div>
                    <p className="text-[9px] opacity-60 mt-1">Left-click on map to place.</p>
                  </div>
                  {anchorsDraft.length > 0 && (
                    <button 
                      onClick={() => setAnchorsDraft(anchorsDraft.slice(0, -1))}
                      className="mt-2 text-[9px] font-bold text-blue-400/80 hover:text-blue-400 border border-blue-500/30 rounded px-2 py-0.5 self-start"
                    >
                      UNDO LAST
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2 mt-2">
                <button 
                  onClick={handleCalculateMatrix}
                  disabled={calculating || anchorsOld.length < 2 || anchorsOld.length !== anchorsDraft.length}
                  className="w-full px-4 py-2 bg-blue-600 text-white font-bold rounded-lg disabled:opacity-50 text-xs"
                >
                  {calculating ? "CALCULATING..." : `1. CALCULATE MATRIX (${anchorsOld.length} PAIRS)`}
                </button>

                {(anchorsOld.length > 0 || anchorsDraft.length > 0) && (
                  <button 
                    onClick={handleResetAlignment}
                    disabled={calculating}
                    className="w-full px-4 py-2 border border-red-500/50 text-red-400 font-bold rounded-lg hover:bg-red-500/10 text-xs"
                  >
                    RESET ALIGNMENT
                  </button>
                )}

                <button 
                  onClick={handleActivateVersion}
                  disabled={activating}
                  className="w-full px-4 py-2 bg-green-600 text-white font-bold rounded-lg disabled:opacity-50 text-xs"
                >
                  {activating ? "ACTIVATING..." : "2. ACTIVATE VERSION"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
