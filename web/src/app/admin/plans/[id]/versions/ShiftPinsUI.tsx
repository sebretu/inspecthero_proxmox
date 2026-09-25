"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { apiPost, getToken } from "@/lib/apiClient";

const ShiftPinsMap = dynamic(() => import("./ShiftPinsMap"), {
  ssr: false,
  loading: () => <div className="w-full h-[600px] flex items-center justify-center bg-black/50 text-white">Loading Map Editor...</div>,
});

export default function ShiftPinsUI({
  planId,
  activeVersion,
  onClose,
  onSuccess
}: {
  planId: string;
  activeVersion: any;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [opacity, setOpacity] = useState(0.5);
  const [anchorsOld, setAnchorsOld] = useState<{x: number, y: number}[]>([]);
  const [anchorsDraft, setAnchorsDraft] = useState<{x: number, y: number}[]>([]);
  const [calculating, setCalculating] = useState(false);
  const [activating, setActivating] = useState(false);

  const handleShiftPins = async () => {
    if (anchorsOld.length < 2) {
      alert("Please place at least 2 reference points on both sides.");
      return;
    }
    if (anchorsOld.length !== anchorsDraft.length) {
      alert(`Mismatched reference points! You placed ${anchorsOld.length} Old anchors and ${anchorsDraft.length} Draft anchors. They must match 1-to-1.`);
      return;
    }
    if (!confirm(`Are you sure? This will shift all markers immediately using ${anchorsOld.length}-point Least-Squares alignment.`)) return;
    setActivating(true);
    try {
      const token = await getToken();
      await apiPost(`/api/plans/${planId}/shift-pins`, {
        v_old_anchors: anchorsOld,
        v_draft_anchors: anchorsDraft
      }, token!);
      alert("Pins shifted successfully!");
      onSuccess();
    } catch (e: any) {
      alert("Failed to shift pins: " + e.message);
    } finally {
      setActivating(false);
    }
  };

  const isSubmitDisabled = activating || anchorsOld.length < 2 || anchorsOld.length !== anchorsDraft.length;

  return (
    <div className="fixed inset-0 z-[9999] bg-ui-bg text-ui-text flex flex-col">
      <div className="p-4 border-b border-ui-border flex justify-between items-center bg-black/40">
        <div>
          <h2 className="text-lg font-black uppercase tracking-widest text-blue-400">Shift Active Pins Wizard</h2>
          <p className="text-xs text-ui-muted">
            Place matching reference points to shift all markers. (O1, O2... = where they are, D1, D2... = where they should be)
            <strong className="text-amber-400 block mt-1">Tip: Place 3 or more matching pairs for highly precise alignment (allows stretching horizontally and vertically independently).</strong>
          </p>
        </div>
        <div className="flex gap-4">
          <button onClick={onClose} className="px-4 py-2 border border-ui-border rounded-lg text-xs font-bold hover:bg-white/10">CANCEL</button>
        </div>
      </div>

      <div className="flex-1 relative">
        <ShiftPinsMap 
          planId={planId}
          anchorsOld={anchorsOld}
          anchorsDraft={anchorsDraft}
          setAnchorsOld={setAnchorsOld}
          setAnchorsDraft={setAnchorsDraft}
        />
        
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-md p-4 rounded-xl border border-ui-border z-[1000] shadow-2xl flex flex-col gap-4 min-w-[420px]">

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

          <div className="flex gap-4 mt-2">
            <button 
              onClick={handleShiftPins}
              disabled={isSubmitDisabled}
              className="flex-1 px-4 py-2 bg-blue-600 text-white font-bold rounded-lg disabled:opacity-50 text-xs"
            >
              {activating ? "SHIFTING..." : `SHIFT PINS (${anchorsOld.length} PAIRS)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
