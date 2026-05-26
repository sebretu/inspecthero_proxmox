"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPatch, apiDelete, apiPost, getApiUrl } from "@/lib/apiClient";
import PlanViewer from "@/components/PlanViewer";
import { useLanguage } from "@/contexts/LanguageContext";
import dynamic from 'next/dynamic';
import PhotoLightbox from "@/components/PhotoLightbox";

const AufmassEditor = dynamic(() => import('@/components/aufmass/AufmassEditor'), {
  ssr: false,
});

export default function AufmassSessionClient({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const { t } = useLanguage();
  const [session, setSession] = useState<any>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [markers, setMarkers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [aufmassPhoto, setAufmassPhoto] = useState<{ url: string; id: string } | null>(null);
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [editFields, setEditFields] = useState({
    name: "",
    description: "",
    client_name: "",
    client_phone: "",
    client_email: ""
  });
  
  useEffect(() => {
    loadData();
  }, [sessionId]);

  async function loadData() {
    setLoading(true);
    try {
      const s = await apiGet<any>(`/api/aufmass/sessions/${sessionId}`);
      setSession(s);
      setEditFields({
        name: s.name || "",
        description: s.description || "",
        client_name: s.client_name || "",
        client_phone: s.client_phone || "",
        client_email: s.client_email || ""
      });
      const ph = await apiGet<any[]>(`/api/aufmass-photos?sessionId=${sessionId}`);
      setPhotos(ph || []);
      const m = await apiGet<any[]>(`/api/aufmass/markers?sessionId=${sessionId}`);
      setMarkers(m || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const handleMapClick = async (x: number, y: number) => {
    if (!session) return;
    try {
      const newMarker = await apiPost('/api/aufmass/markers', {
        session_id: session.id,
        x,
        y
      });
      setMarkers(prev => [...prev, newMarker]);
    } catch (e) {
      console.error("Failed to add marker", e);
    }
  };

  const handleMarkerDragEnd = async (markerId: string, x: number, y: number) => {
    try {
      await apiPatch('/api/aufmass/markers', { id: markerId, x, y });
      setMarkers(prev => prev.map(m => m.id === markerId ? { ...m, x, y } : m));
    } catch (e) {
      console.error("Failed to move marker", e);
    }
  };

  const handleDeleteMarker = async (markerId: string) => {
    if (!confirm(t("aufmass", "deleteMarkerConfirm", "Delete marker?"))) return;
    try {
      await apiDelete(`/api/aufmass/markers?id=${markerId}`);
      setMarkers(prev => prev.filter(m => m.id !== markerId));
    } catch (e) {
      console.error("Failed to delete marker", e);
    }
  };

  const handleUpdateSession = async () => {
    try {
      const updated = await apiPatch('/api/aufmass/sessions', {
        id: session.id,
        ...editFields
      });
      setSession(updated);
      setIsEditingInfo(false);
    } catch (e: any) {
      alert("Update failed: " + e.message);
    }
  };

  const uploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    e.target.value = "";
    
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64 = ev.target?.result as string;
        try {
          const ph = await apiPost<any>("/api/aufmass-photos", {
            session_id: sessionId,
            base64,
            file_name: f.name,
            photo_type: "BEFORE"
          });
          setPhotos((prev) => [ph, ...prev]);
        } catch (err: any) {
          setError(err.message);
        } finally {
          setUploading(false);
        }
      };
      reader.readAsDataURL(f);
    } catch (e: any) {
      setError(e.message);
      setUploading(false);
    }
  };

  if (loading) return <div className="p-12 text-center text-ui-muted uppercase tracking-widest font-black">{t("common", "loading", "Loading...")}</div>;
  if (error) return <div className="p-12 text-center text-danger uppercase tracking-widest font-black">{error}</div>;
  if (!session) return <div className="p-12 text-center text-ui-muted uppercase tracking-widest font-black">{t("common", "notFound", "Not found")}</div>;

  return (
    <div className="flex flex-col md:flex-row h-screen bg-ui-bg overflow-hidden animate-in fade-in zoom-in-95 duration-500">
      <div className="w-full md:w-1/2 h-[40vh] md:h-full relative border-b md:border-b-0 md:border-r border-ui-border shadow-2xl z-10 flex flex-col bg-black/40 backdrop-blur-3xl">
        <div className="flex items-center gap-4 p-4 md:p-6 bg-gradient-to-b from-black/80 to-transparent absolute top-0 left-0 right-0 z-20">
          <button
            onClick={() => router.push("/aufmass")}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md flex items-center justify-center text-white transition-all shadow-xl active:scale-90"
          >
            ←
          </button>
          <div>
            <h1 className="text-sm md:text-base font-black text-white tracking-widest uppercase leading-none">{session.name}</h1>
            <p className="text-[10px] text-ui-accent tracking-widest uppercase mt-1">
              {session.session_type === 'zusatz' ? t("aufmass", "zusatz", "Zusatzplanung") : t("aufmass", "aufmass", "Aufmaß")}
            </p>
          </div>
        </div>

        {session.plan_id ? (
          <PlanViewer
            planId={session.plan_id}
            fullHeight={true}
            aufmassMarkers={markers.map((m, idx) => ({
               id: m.id,
               title: session.name,
               x_norm: m.x,
               y_norm: m.y,
               session_type: session.session_type,
               label: `${session.session_type === 'zusatz' ? 'Z' : 'A'}${idx + 1}`
            }))}
            onMapClick={handleMapClick}
            onMarkerDragEnd={handleMarkerDragEnd}
            onMarkerDelete={handleDeleteMarker}
            allowCreate={true}
            hideTasks={true}
            currentUserId={session.created_by || "temp_user"}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-ui-muted/50 gap-4 p-8 text-center">
            <span className="text-4xl opacity-50">🗺️</span>
            <div className="text-[10px] uppercase tracking-widest font-black">
              {t("aufmass", "noPlanSelected", "No plan selected")}
            </div>
          </div>
        )}
      </div>

      <div className="w-full md:w-1/2 h-[60vh] md:h-full flex flex-col bg-ui-card relative z-20 shadow-[-20px_0_50px_rgba(0,0,0,0.5)]">
        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 no-scrollbar scroll-smooth">
          
          <div className="bg-ui-bg/50 border border-ui-border rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-ui-text tracking-tighter uppercase">
                {t("aufmass", "sessionInfoTitle", "Session Info")}
              </h2>
              <button 
                onClick={() => setIsEditingInfo(!isEditingInfo)}
                className="text-[10px] font-black uppercase tracking-widest text-ui-accent hover:underline"
              >
                {isEditingInfo ? t("common", "cancel", "Cancel") : t("aufmass", "editInfoBtn", "Edit Info")}
              </button>
            </div>

            {isEditingInfo ? (
              <div className="space-y-4 animate-in slide-in-from-top-2 duration-300">
                <div>
                  <label className="text-[9px] font-bold text-ui-muted uppercase tracking-widest mb-1 block">
                    {t("aufmass", "sessionNameLabel", "Session Name")}
                  </label>
                  <input 
                    value={editFields.name}
                    onChange={e => setEditFields({...editFields, name: e.target.value})}
                    className="w-full bg-ui-bg border border-ui-border rounded-xl px-4 py-2 text-xs focus:outline-none focus:border-ui-accent text-ui-text"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-ui-muted uppercase tracking-widest mb-1 block">
                    {t("common", "description", "Description")}
                  </label>
                  <textarea 
                    value={editFields.description}
                    onChange={e => setEditFields({...editFields, description: e.target.value})}
                    rows={2}
                    className="w-full bg-ui-bg border border-ui-border rounded-xl px-4 py-2 text-xs focus:outline-none focus:border-ui-accent text-ui-text resize-none"
                  />
                </div>
                {session.session_type === 'aufmass' && (
                  <div className="grid grid-cols-1 gap-4 pt-2 border-t border-ui-border/30">
                    <h3 className="text-[9px] font-black uppercase tracking-widest text-ui-text/50">
                      {t("aufmass", "clientDetailsSubTitle", "Client Details")}
                    </h3>
                    <div>
                      <label className="text-[9px] font-bold text-ui-muted uppercase tracking-widest mb-1 block">
                        {t("aufmass", "clientNameLabelComp", "Client Name / Company")}
                      </label>
                      <input 
                        value={editFields.client_name}
                        onChange={e => setEditFields({...editFields, client_name: e.target.value})}
                        className="w-full bg-ui-bg border border-ui-border rounded-xl px-4 py-2 text-xs focus:outline-none focus:border-ui-accent text-ui-text"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[9px] font-bold text-ui-muted uppercase tracking-widest mb-1 block">
                          {t("common", "phone", "Phone")}
                        </label>
                        <input 
                          value={editFields.client_phone}
                          onChange={e => setEditFields({...editFields, client_phone: e.target.value})}
                          className="w-full bg-ui-bg border border-ui-border rounded-xl px-4 py-2 text-xs focus:outline-none focus:border-ui-accent text-ui-text"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-ui-muted uppercase tracking-widest mb-1 block">
                          {t("common", "email", "Email")}
                        </label>
                        <input 
                          value={editFields.client_email}
                          onChange={e => setEditFields({...editFields, client_email: e.target.value})}
                          className="w-full bg-ui-bg border border-ui-border rounded-xl px-4 py-2 text-xs focus:outline-none focus:border-ui-accent text-ui-text"
                        />
                      </div>
                    </div>
                  </div>
                )}
                <button 
                  onClick={handleUpdateSession}
                  className="w-full py-3 bg-ui-accent text-ui-bg font-black uppercase tracking-widest rounded-xl text-[10px] shadow-lg hover:brightness-110 transition-all"
                >
                  {t("aufmass", "saveChangesBtn", "Save Changes")}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-sm font-bold text-ui-text">{session.name}</div>
                {session.description && <div className="text-xs text-ui-muted italic line-clamp-2">"{session.description}"</div>}
                {session.session_type === 'aufmass' && (session.client_name || session.client_phone || session.client_email) && (
                  <div className="pt-2 border-t border-ui-border/30 space-y-1">
                    <div className="text-[9px] font-black uppercase tracking-widest text-ui-muted/50 mb-1">
                      {t("aufmass", "clientDetailsSubTitle", "Client")}
                    </div>
                    {session.client_name && <div className="text-[10px] font-bold text-ui-text/80">👤 {session.client_name}</div>}
                    {session.client_phone && <div className="text-[10px] font-bold text-ui-text/80">📞 {session.client_phone}</div>}
                    {session.client_email && <div className="text-[10px] font-bold text-ui-text/80">✉️ {session.client_email}</div>}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black text-ui-text tracking-tighter uppercase">
              {t("aufmass", "photosTitle", "Photos")}
            </h2>
            <label className="px-6 py-2 bg-ui-accent hover:bg-ui-accent/80 text-ui-bg font-black uppercase tracking-widest rounded-full cursor-pointer transition-all shadow-[0_0_20px_rgba(56,189,248,0.3)] text-[10px]">
              {uploading ? t("common", "uploading", "Uploading...") : t("aufmass", "addPhotoBtn", "+ Add Photo")}
              <input type="file" className="hidden" accept="image/*" onChange={uploadPhoto} disabled={uploading} />
            </label>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {photos.map((p) => (
              <div key={p.id} className="relative aspect-square rounded-2xl overflow-hidden group/img border border-ui-border shadow-lg">
                <img src={getApiUrl(p.url)} alt="photo" className="w-full h-full object-cover cursor-zoom-in" onClick={() => setPreviewUrl(getApiUrl(p.url))} />
                
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!confirm(t("aufmass", "deletePhotoConfirm", "Delete?"))) return;
                    await apiDelete(`/api/aufmass-photos?id=${p.id}`);
                    setPhotos(prev => prev.filter(x => x.id !== p.id));
                  }}
                  className="absolute top-2 right-2 w-8 h-8 bg-black/60 text-white rounded-full flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-all hover:bg-danger"
                >✕</button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setAufmassPhoto({ url: getApiUrl(p.url), id: p.id });
                  }}
                  className="absolute bottom-2 left-2 right-2 px-2 py-2 bg-indigo-600/90 text-white text-[10px] font-black uppercase tracking-widest rounded-xl opacity-0 group-hover/img:opacity-100 transition-all hover:bg-indigo-500 shadow-xl"
                >
                  {t("aufmass", "editInAufmassBtn", "Edit in Aufmaß")}
                </button>
              </div>
            ))}
            {photos.length === 0 && (
              <div className="col-span-full py-12 text-center text-ui-muted/40 font-black uppercase tracking-widest text-[10px]">
                {t("aufmass", "noPhotosYet", "No photos yet")}
              </div>
            )}
          </div>
        </div>

        <div className="p-4 md:p-8 bg-ui-bg border-t border-ui-border flex gap-4">
          <button 
            onClick={() => router.push("/aufmass")}
            className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-ui-text font-black uppercase tracking-widest rounded-2xl text-xs transition-all border border-ui-border"
          >
            {t("aufmass", "cancelCloseBtn", "Cancel / Close")}
          </button>
          <button 
            onClick={async () => {
               if (isEditingInfo) {
                  await handleUpdateSession();
               }
               router.push("/aufmass");
            }}
            className="flex-1 py-4 bg-success text-white font-black uppercase tracking-widest rounded-2xl text-xs shadow-[0_0_30px_rgba(34,197,94,0.3)] hover:brightness-110 transition-all"
          >
            {t("aufmass", "saveCloseBtn", "Save & Close")}
          </button>
        </div>
      </div>

      <PhotoLightbox url={previewUrl} onClose={() => setPreviewUrl(null)} />
      
      {aufmassPhoto && (
        <AufmassEditor
          photoUrl={aufmassPhoto.url}
          photoId={aufmassPhoto.id}
          taskId={undefined} 
          projectId={session.project_id}
          existingSessionId={session.id}
          onClose={() => {
            setAufmassPhoto(null);
            router.push('/aufmass');
          }}
        />
      )}
    </div>
  );
}
