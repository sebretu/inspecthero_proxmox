import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, Save, RefreshCw, Undo, Redo } from 'lucide-react';
import AufmassCanvas, { ToolType } from './AufmassCanvas';
import AufmassToolbar from './AufmassToolbar';
import AufmassPanel from './AufmassPanel';
import { useNotification } from '@/contexts/NotificationContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiPost, apiGet, apiPatch } from '@/lib/apiClient';

interface AufmassEditorProps {
  photoUrl: string;
  taskId?: string;
  photoId?: string;
  projectId: string;
  onClose: () => void;
  existingSessionId?: string;
}

export default function AufmassEditor({ photoUrl, taskId, photoId, projectId, onClose, existingSessionId }: AufmassEditorProps) {
  const { showNotification } = useNotification();
  const { t } = useLanguage();

  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [currentColor, setCurrentColor] = useState('#ef4444');
  const [currentStrokeWidth, setCurrentStrokeWidth] = useState(2);
  const [description, setDescription] = useState('');
  
  // History stack for Undo/Redo
  const [history, setHistory] = useState<any[][]>([[]]);
  const [historyStep, setHistoryStep] = useState(0);

  const [sessionId, setSessionId] = useState<string | null>(existingSessionId || null);
  
  // Save System Hardening
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'offline' | 'failed' | 'unsaved'>('saved');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);

  // Autosave ref
  const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isDirtyRef = useRef(false);

  const currentShapes = history[historyStep] || [];

  // Offline / Online detection
  useEffect(() => {
    const handleOnline = () => setSaveStatus(isDirtyRef.current ? 'unsaved' : 'saved');
    const handleOffline = () => setSaveStatus('offline');
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Beforeunload protection
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Initialize session if not exists
  useEffect(() => {
    const initSession = async () => {
      if (!sessionId) {
        // Check local recovery cache
        const localCache = localStorage.getItem(`aufmass_recovery_${photoId}`);
        if (localCache) {
           try {
             const parsed = JSON.parse(localCache);
             setHistory([parsed.shapes]);
             setHistoryStep(0);
             showNotification(t("aufmass", "restoredFromCache", "Restored unsaved changes from local cache"), "info");
           } catch (e) {}
        }

        try {
           const res = (await apiPost('/api/aufmass/sessions', {
             project_id: projectId,
             task_id: taskId,
             photo_id: photoId,
             name: `Aufmaß - ${new Date().toLocaleDateString()}`,
             status: 'draft'
           })) as any;
           if (res.id) {
             setSessionId(res.id);
             setDescription(res.description || '');
           }
        } catch (e) {
           showNotification(t("aufmass", "failedInitSession", "Failed to initialize Aufmaß session"), "error");
        }
      } else {
        // Load latest version
        try {
            const versionUrl = photoId 
              ? `/api/aufmass/versions?sessionId=${sessionId}&photoId=${photoId}`
              : `/api/aufmass/versions?sessionId=${sessionId}`;

            const [versions, sessionData, photoData] = await Promise.all([
              apiGet<any[]>(versionUrl),
              apiGet<any>(`/api/aufmass/sessions?projectId=${projectId}`),
              photoId ? apiGet<any>(`/api/aufmass-photos?sessionId=${sessionId}`) : Promise.resolve(null)
            ]);

            if (versions && versions.length > 0) {
               // Wersje z API przychodzą posortowane od najnowszej (index 0).
               // Odwracamy je żeby najstarsza była na początku stosu historii.
               // Dokładamy pusty [] na początku żeby można było cofnąć się
               // do czystego (pustego) zdjęcia – przed pierwszym rysowaniem.
               const historyFromVersions = [[], ...[...versions].reverse().map((v: any) => v.data)];
               setHistory(historyFromVersions);
               setHistoryStep(historyFromVersions.length - 1);
            }

            if (photoId && photoData) {
               const photosList = Array.isArray(photoData) ? photoData : (photoData as any)?.data || [];
               const currentPhoto = photosList.find((p: any) => p.id === photoId);
               if (currentPhoto) {
                 setDescription(currentPhoto.caption || '');
               }
            } else {
               // Find our session in the project's sessions to get the description
               const sess = Array.isArray(sessionData) ? sessionData.find((s: any) => s.id === sessionId) : null;
               if (sess) {
                 setDescription(sess.description || '');
               }
            }
         } catch (e) {
            console.error("Failed to load session data", e);
         }
      }
    };
    initSession();
  }, [sessionId, projectId, taskId, photoId]);

  const handleShapesChange = (newShapes: any[]) => {
    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push(newShapes);
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);
    
    setSaveStatus('unsaved');
    isDirtyRef.current = true;

    // Save to local cache instantly for disaster recovery
    if (photoId) {
      localStorage.setItem(`aufmass_recovery_${photoId}`, JSON.stringify({ shapes: newShapes, timestamp: Date.now() }));
    }

    // Trigger Autosave
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      triggerAutosave(newShapes);
    }, 5000);
  };

  const handleUndo = () => {
    if (historyStep > 0) {
      setHistoryStep(historyStep - 1);
      setSaveStatus('unsaved');
      isDirtyRef.current = true;
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = setTimeout(() => triggerAutosave(history[historyStep - 1]), 5000);
    }
  };

  const handleRedo = () => {
    if (historyStep < history.length - 1) {
      setHistoryStep(historyStep + 1);
      setSaveStatus('unsaved');
      isDirtyRef.current = true;
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = setTimeout(() => triggerAutosave(history[historyStep + 1]), 5000);
    }
  };

  const triggerAutosave = async (shapesToSave: any[]) => {
    if (!sessionId || !navigator.onLine) {
        if (!navigator.onLine) setSaveStatus('offline');
        return;
    }
    
    setSaveStatus('saving');
    try {
      const promises = [
        apiPost('/api/aufmass/versions', {
          session_id: sessionId,
          photo_id: photoId || null,
          data: shapesToSave
        })
      ];

      if (photoId) {
        promises.push(
          apiPatch('/api/aufmass-photos', {
            id: photoId,
            caption: description
          })
        );
      } else {
        promises.push(
          apiPatch('/api/aufmass/sessions', {
            id: sessionId,
            description: description
          })
        );
      }

      await Promise.all(promises);
      setSaveStatus('saved');
      setLastSaved(new Date());
      isDirtyRef.current = false;
      if (photoId) localStorage.removeItem(`aufmass_recovery_${photoId}`);
    } catch (e) {
      console.error("Autosave failed", e);
      setSaveStatus('failed');
    }
  };

  const handleManualSave = async () => {
    if (!sessionId) return;
    setSaveStatus('saving');
    try {
      const promises = [
        apiPost('/api/aufmass/versions', {
          session_id: sessionId,
          photo_id: photoId || null,
          data: currentShapes
        })
      ];

      if (photoId) {
        promises.push(
          apiPatch('/api/aufmass-photos', {
            id: photoId,
            caption: description
          })
        );
      } else {
        promises.push(
          apiPatch('/api/aufmass/sessions', {
            id: sessionId,
            description: description
          })
        );
      }

      await Promise.all(promises);
      setSaveStatus('saved');
      setLastSaved(new Date());
      isDirtyRef.current = false;
      if (photoId) localStorage.removeItem(`aufmass_recovery_${photoId}`);
      showNotification(t("aufmass", "sessionSavedSuccess", "Session Saved Successfully"), "success");
      onClose();
    } catch (e) {
      setSaveStatus('failed');
      showNotification(t("aufmass", "failedSaveRetry", "Failed to save. It will retry in background."), "error");
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="fixed inset-x-0 bottom-0 top-20 z-[9999] bg-[#020617] flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="h-16 border-b border-white/5 bg-slate-900/60 flex items-center justify-between px-6 shrink-0">
         <div className="flex items-center gap-4">
            <h2 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-3">
               {t("nav", "aufmass", "Aufmaß & Zusatzplanung")} 
               <span className="text-slate-500 font-normal flex items-center gap-2 text-[10px]">
                 | {sessionId ? t("aufmass", "activeSession", "Active Session") : t("aufmass", "initializing", "Initializing...")}
                 
                 {/* Save Status Indicator */}
                 {sessionId && (
                   <span className={`px-2 py-0.5 rounded flex items-center gap-1 ${
                     saveStatus === 'saved' ? 'bg-emerald-500/10 text-emerald-400' :
                     saveStatus === 'saving' ? 'bg-blue-500/10 text-blue-400' :
                     saveStatus === 'unsaved' ? 'bg-amber-500/10 text-amber-400' :
                     'bg-red-500/10 text-red-400'
                   }`}>
                      {saveStatus === 'saving' && <RefreshCw className="w-3 h-3 animate-spin" />}
                      {saveStatus.toUpperCase()}
                      {saveStatus === 'saved' && lastSaved && ` (${lastSaved.toLocaleTimeString()})`}
                   </span>
                 )}
               </span>
            </h2>
         </div>
         <div className="flex items-center gap-3">
            <button 
              onClick={handleManualSave}
              disabled={saveStatus === 'saving' || !sessionId}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 disabled:grayscale text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-blue-500/20"
            >
              {saveStatus === 'saving' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {t("aufmass", "saveProgressBtn", "Save Progress")}
            </button>
            <button 
              onClick={() => {
                if (isDirtyRef.current) {
                  if (window.confirm(t("aufmass", "unsavedChangesExit", "You have unsaved changes. Exit anyway?"))) onClose();
                } else {
                  onClose();
                }
              }}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all"
            >
              <X className="w-5 h-5" />
            </button>
         </div>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* Left Toolbar - Absolute so it floats over canvas or sits next to it */}
        <div className="absolute left-6 top-6 bottom-6 z-10 w-16">
          <AufmassToolbar 
            activeTool={activeTool}
            onChangeTool={setActiveTool}
            currentColor={currentColor}
            onChangeColor={setCurrentColor}
            onUndo={handleUndo}
            onRedo={handleRedo}
            canUndo={historyStep > 0}
            canRedo={historyStep < history.length - 1}
            currentStrokeWidth={currentStrokeWidth}
            onChangeStrokeWidth={setCurrentStrokeWidth}
          />
        </div>

        {/* Center Canvas */}
        <div className="flex-1 p-6 pl-28 relative">
           <AufmassCanvas 
             imageUrl={photoUrl}
             shapes={currentShapes}
             onShapesChange={handleShapesChange}
             activeTool={activeTool}
             currentColor={currentColor}
             currentStrokeWidth={currentStrokeWidth}
             onSelectMarker={setSelectedMarkerId}
           />
        </div>

        {/* Right Panel */}
        <div className="w-80 lg:w-96 p-6 pl-0 shrink-0">
           {sessionId ? (
             <AufmassPanel 
               sessionId={sessionId} 
               photoId={photoId}
               description={description}
               onChangeDescription={(val: string) => {
                 setDescription(val);
                 setSaveStatus('unsaved');
                 isDirtyRef.current = true;
               }}
             />
           ) : (
             <div className="h-full bg-slate-900/60 border border-white/5 rounded-3xl flex items-center justify-center">
                <RefreshCw className="w-6 h-6 text-slate-500 animate-spin" />
             </div>
           )}
        </div>
      </div>
    </motion.div>
  );
}
