"use client";

import { useEffect, useState, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPost, getToken } from "@/lib/apiClient";
import DraftOverlayReviewUI from "./DraftOverlayReviewUI";
import ShiftPinsUI from "./ShiftPinsUI";

export default function PlanVersionsPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id: planId } = use(params);
  
  const [versions, setVersions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [reviewDraftId, setReviewDraftId] = useState<string | null>(null);
  const [isShifting, setIsShifting] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadVersions = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Unauthorized");
      
      const data = await apiGet<any[]>(`/api/plans/${planId}/versions`, token);
      setVersions(data || []);
    } catch (e: any) {
      setError(e.message || "Failed to load versions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!planId) return;
    loadVersions();
  }, [planId]);

  const handleEnableVersioning = async () => {
    if (!confirm("Are you sure you want to enable versioning for this plan? This will freeze the current geometry into V1.")) return;
    try {
      const token = await getToken();
      await apiPost(`/api/plans/${planId}/enable-versioning`, {}, token!);
      await loadVersions();
      alert("Versioning enabled!");
    } catch (e: any) {
      alert("Failed: " + e.message);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm(`Upload ${file.name} as a new Draft Version?`)) return;

    setIsUploading(true);
    try {
      const token = await getToken();
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`/api/plans/${planId}/upload-version`, {
        method: "POST",
        body: formData,
        headers: token ? { "Authorization": `Bearer ${token}` } : {}
      });

      if (!res.ok) {
        const js = await res.json();
        throw new Error(js.error || "Upload failed");
      }
      
      alert("Draft version uploaded successfully! Tiles are generating in the background.");
      await loadVersions();
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteDraft = async (draftId: string) => {
    if (!confirm("Are you sure you want to delete this draft? This cannot be undone.")) return;
    try {
      const token = await getToken();
      const res = await fetch(`/api/plans/${planId}/delete-draft`, {
        method: "DELETE",
        body: JSON.stringify({ versionId: draftId }),
        headers: token ? { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" }
      });
      if (!res.ok) {
        const js = await res.json();
        throw new Error(js.error || "Failed to delete draft");
      }
      alert("Draft deleted successfully.");
      await loadVersions();
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  const handleDeleteArchived = async (versionId: string) => {
    if (!confirm("Are you sure you want to permanently delete this archived version and its map tiles? This will save disk space, but you will not be able to rollback to this version later. Markers will NOT be deleted.")) return;
    try {
      const token = await getToken();
      await apiPost(`/api/plans/${planId}/delete-archived`, { versionId }, token!);
      alert("Archived version and its tiles deleted successfully to save space.");
      await loadVersions();
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  const handleRestoreArchived = async (versionId: string, versionNumber: number) => {
    if (!confirm(`⚠️ Restore V${versionNumber} as the active version? The current active version will become archived. Note: this only works if the tile files for V${versionNumber} still exist on disk (were not deleted).`)) return;
    try {
      const token = await getToken();
      await apiPost(`/api/plans/${planId}/restore-archived`, { versionId }, token!);
      alert(`V${versionNumber} has been restored as the active version!`);
      await loadVersions();
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };



  const activeVersion = versions.find(v => v.status === "active");
  const draftVersion = versions.find(v => v.status === "needs_alignment");

  return (
    <div className="p-8 max-w-4xl mx-auto text-white">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-black uppercase tracking-widest text-ui-accent">
          Plan Versions Manager
        </h1>
        <button 
          onClick={() => router.push("/plans")}
          className="px-4 py-2 border border-ui-border rounded-lg text-xs font-bold hover:bg-white/10"
        >
          BACK TO LIBRARY
        </button>
      </div>

      {error && (
        <div className="p-4 mb-6 bg-red-500/20 border border-red-500 text-red-300 rounded-lg text-sm font-bold">
          {error}
        </div>
      )}

      {versions.length === 0 ? (
        <div className="p-8 bg-black/40 border border-ui-border rounded-xl text-center space-y-4">
          <h2 className="text-xl font-bold">Versioning is not enabled</h2>
          <p className="text-ui-muted text-sm max-w-md mx-auto">
            Enable versioning to start tracking revisions for this plan. 
            This will lock the current geometry as Version 1 and prepare the system for safe updates.
          </p>
          <button
            onClick={handleEnableVersioning}
            className="mt-4 px-6 py-3 bg-ui-accent text-ui-bg font-black uppercase tracking-widest rounded-xl hover:scale-105 transition-all"
          >
            ENABLE VERSIONING (CREATE V1)
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="p-6 bg-black/40 border border-ui-border rounded-xl flex justify-between items-center">
            <div>
              <h3 className="text-lg font-bold">Current Active Version</h3>
              <p className="text-ui-muted text-sm">
                V{activeVersion?.version_number} - {activeVersion ? new Date(activeVersion.created_at).toLocaleString() : 'Unknown'}
              </p>
            </div>
            
            <input 
              type="file" 
              accept=".pdf" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
            />
            
            <button
              onClick={handleUploadClick}
              disabled={isUploading || !!draftVersion}
              className="px-6 py-3 bg-ui-accent text-ui-bg font-black uppercase tracking-widest rounded-xl disabled:opacity-50 hover:scale-105 transition-all"
            >
              {isUploading ? "UPLOADING..." : "UPLOAD NEW REVISION (PDF)"}
            </button>
          </div>

          {draftVersion && (
            <div className="p-6 bg-blue-500/10 border border-blue-500/30 rounded-xl space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-bold text-blue-400">Draft Version Ready</h3>
                  <p className="text-blue-300/70 text-sm">
                    V{draftVersion.version_number} has been uploaded and requires spatial alignment before it can be activated.
                  </p>
                </div>
                <span className="px-3 py-1 bg-blue-500/20 text-blue-400 text-xs font-bold uppercase rounded-full tracking-widest">
                  NEEDS ALIGNMENT
                </span>
              </div>
              
              <div className="flex gap-4">
                <button
                  onClick={() => setReviewDraftId(draftVersion.id)}
                  className="flex-1 px-6 py-4 bg-blue-600 text-white font-black uppercase tracking-widest rounded-xl hover:bg-blue-500 transition-all shadow-lg"
                >
                  START DRAFT ALIGNMENT WIZARD
                </button>
                <button
                  onClick={() => handleDeleteDraft(draftVersion.id)}
                  className="px-6 py-4 border border-red-500/50 text-red-400 font-bold uppercase tracking-widest rounded-xl hover:bg-red-500/10 transition-all"
                >
                  DELETE DRAFT
                </button>
              </div>
            </div>
          )}

          <div className="mt-8">
            <h3 className="text-sm font-black uppercase tracking-widest text-ui-muted mb-4">Version History</h3>
            <div className="space-y-3">
              {versions.map(v => (
                <div key={v.id} className="p-4 bg-black/20 border border-ui-border rounded-lg flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <span className="text-xl font-black text-ui-accent w-12">V{v.version_number}</span>
                    <div>
                      <div className="font-bold">{new Date(v.created_at).toLocaleString()}</div>
                      <div className="text-xs text-ui-muted mt-1 uppercase tracking-widest">{v.status}</div>
                    </div>
                  </div>
                  {v.status === 'active' && (
                    <div className="flex items-center gap-4">
                      <span className="text-green-400 text-sm font-bold">● ACTIVE</span>
                      <button
                        onClick={() => setIsShifting(true)}
                        className="px-3 py-1 bg-blue-600/20 text-blue-400 text-xs font-bold rounded-lg hover:bg-blue-600/40"
                      >
                        SHIFT PINS (FIX ALIGNMENT)
                      </button>
                    </div>
                  )}
                  {v.status === 'archived' && (
                    <div className="flex items-center gap-2">
                      <span className="text-ui-muted text-sm font-bold">ARCHIVED</span>
                      <button
                        onClick={() => handleRestoreArchived(v.id, v.version_number)}
                        className="text-xs font-bold text-amber-400/70 hover:text-amber-400 hover:underline px-2 py-1"
                        title="Restore this version as the active version (only works if tiles were not deleted)"
                      >
                        RESTORE
                      </button>
                      <button
                        onClick={() => handleDeleteArchived(v.id)}
                        className="text-xs font-bold text-red-400/50 hover:text-red-400 hover:underline px-2 py-1"
                        title="Delete this archived version to free up disk space"
                      >
                        DELETE
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {reviewDraftId && activeVersion && (
        <DraftOverlayReviewUI 
          planId={planId}
          draftVersion={versions.find(v => v.id === reviewDraftId)}
          activeVersion={activeVersion}
          onClose={() => setReviewDraftId(null)}
          onSuccess={() => {
            setReviewDraftId(null);
            loadVersions();
          }}
        />
      )}

      {isShifting && activeVersion && (
        <ShiftPinsUI 
          planId={planId}
          activeVersion={activeVersion}
          onClose={() => setIsShifting(false)}
          onSuccess={() => {
            setIsShifting(false);
            loadVersions();
          }}
        />
      )}
    </div>
  );
}
