import React, { useState, useEffect } from 'react';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/apiClient';
import { Plus, Trash2, Save, FileText, Package, Users } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface AufmassPanelProps {
  sessionId: string;
  photoId?: string;
  description: string;
  onChangeDescription: (val: string) => void;
}

export default function AufmassPanel({ sessionId, photoId, description, onChangeDescription }: AufmassPanelProps) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'desc' | 'materials' | 'labor'>('desc');
  
  // States
  // description is now a prop
  const [materials, setMaterials] = useState<any[]>([]);
  const [labor, setLabor] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [sessionMaterialsList, setSessionMaterialsList] = useState<any[]>([]);
  const [masterMaterialsList, setMasterMaterialsList] = useState<any[]>([]);

  useEffect(() => {
    if (!sessionId) return;
    loadData();
  }, [sessionId, photoId]);

  useEffect(() => {
    const fetchSuggestions = async () => {
      try {
        // Fetch from master materials table
        const masterRes = await apiGet<any>("/api/materials?limit=1000");
        const masterItems = masterRes?.data?.items || masterRes?.items || [];
        setMasterMaterialsList(masterItems);

        // Fetch from all aufmass materials in this session
        const sessionMats = await apiGet<any[]>(`/api/aufmass/materials?sessionId=${sessionId}`);
        setSessionMaterialsList(sessionMats || []);
      } catch (e) {
        console.error("Failed to load material suggestions", e);
      }
    };
    if (sessionId) {
      fetchSuggestions();
    }
  }, [sessionId]);

  // Derive unique suggestions using useMemo
  const suggestions = React.useMemo(() => {
    const masterNames = masterMaterialsList.map((m: any) => m.display_name || m.name || "").filter(Boolean);
    const sessionNames = sessionMaterialsList.map((m: any) => m.item_name || "").filter(Boolean);
    return Array.from(new Set([...masterNames, ...sessionNames]));
  }, [masterMaterialsList, sessionMaterialsList]);

  const loadData = async () => {
    try {
      const matsUrl = photoId 
        ? `/api/aufmass/materials?sessionId=${sessionId}&photoId=${photoId}`
        : `/api/aufmass/materials?sessionId=${sessionId}&photoId=none`;
      const labUrl = photoId 
        ? `/api/aufmass/labor?sessionId=${sessionId}&photoId=${photoId}`
        : `/api/aufmass/labor?sessionId=${sessionId}&photoId=none`;

      const mats = await apiGet<any[]>(matsUrl);
      const lab = await apiGet<any[]>(labUrl);
      setMaterials(mats || []);
      setLabor(lab || []);
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddMaterial = async () => {
    try {
      const newMat = await apiPost('/api/aufmass/materials', {
        session_id: sessionId,
        photo_id: photoId || null,
        item_name: 'New Material',
        quantity: 1,
        unit: 'pcs'
      });
      setMaterials([...materials, newMat]);
      setSessionMaterialsList(prev => [...prev, newMat]);
    } catch (e) {}
  };

  const handleUpdateMaterial = async (id: string, updates: any) => {
    // Optimistic UI
    setMaterials(mats => mats.map(m => m.id === id ? { ...m, ...updates } : m));
    setSessionMaterialsList(mats => mats.map(m => m.id === id ? { ...m, ...updates } : m));
    try {
      await apiPatch('/api/aufmass/materials', { id, ...updates });
    } catch (e) {
      loadData(); // Revert on error
    }
  };

  const handleMaterialNameChange = (id: string, name: string) => {
    const trimmedName = name.toLowerCase().trim();
    // 1. Search in master materials list
    const matchedMaster = masterMaterialsList.find(
      (m: any) => (m.display_name || m.name || "").toLowerCase() === trimmedName
    );
    if (matchedMaster) {
      handleUpdateMaterial(id, {
        item_name: name,
        unit: matchedMaster.unit || 'pcs',
        price: matchedMaster.price ? parseFloat(matchedMaster.price) : null
      });
      return;
    }

    // 2. Search in previously entered session materials
    const matchedSession = sessionMaterialsList.find(
      (m: any) => (m.item_name || "").toLowerCase() === trimmedName
    );
    if (matchedSession) {
      handleUpdateMaterial(id, {
        item_name: name,
        unit: matchedSession.unit || 'pcs',
        price: matchedSession.price ? parseFloat(matchedSession.price) : null
      });
      return;
    }

    // 3. Fallback to updating only name
    handleUpdateMaterial(id, { item_name: name });
  };

  const handleDeleteMaterial = async (id: string) => {
    setMaterials(mats => mats.filter(m => m.id !== id));
    setSessionMaterialsList(mats => mats.filter(m => m.id !== id));
    try {
      await apiDelete(`/api/aufmass/materials?id=${id}`);
    } catch (e) {
      loadData();
    }
  };

  const handleAddLabor = async () => {
    try {
      const newLab = await apiPost('/api/aufmass/labor', {
        session_id: sessionId,
        photo_id: photoId || null,
        worker_count: 1,
        estimated_hours: 1
      });
      setLabor([...labor, newLab]);
    } catch (e) {}
  };

  const handleUpdateLabor = async (id: string, updates: any) => {
    setLabor(labs => labs.map(l => l.id === id ? { ...l, ...updates } : l));
    try {
      await apiPatch('/api/aufmass/labor', { id, ...updates });
    } catch (e) {
      loadData();
    }
  };

  const handleDeleteLabor = async (id: string) => {
    setLabor(labs => labs.filter(l => l.id !== id));
    try {
      await apiDelete(`/api/aufmass/labor?id=${id}`);
    } catch (e) {
      loadData();
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/60 backdrop-blur-2xl border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
      {/* Tabs */}
      <div className="flex border-b border-white/10">
        <button
          onClick={() => setActiveTab('desc')}
          className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest flex flex-col items-center gap-2 transition-all ${
            activeTab === 'desc' ? 'bg-blue-600/20 text-blue-400 border-b-2 border-blue-500' : 'text-slate-500 hover:bg-white/5'
          }`}
        >
          <FileText className="w-4 h-4" />
          {t("aufmass", "descriptionTab", "Description")}
        </button>
        <button
          onClick={() => setActiveTab('materials')}
          className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest flex flex-col items-center gap-2 transition-all ${
            activeTab === 'materials' ? 'bg-emerald-600/20 text-emerald-400 border-b-2 border-emerald-500' : 'text-slate-500 hover:bg-white/5'
          }`}
        >
          <Package className="w-4 h-4" />
          {t("aufmass", "materialsTab", "Materials")}
        </button>
        <button
          onClick={() => setActiveTab('labor')}
          className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest flex flex-col items-center gap-2 transition-all ${
            activeTab === 'labor' ? 'bg-purple-600/20 text-purple-400 border-b-2 border-purple-500' : 'text-slate-500 hover:bg-white/5'
          }`}
        >
          <Users className="w-4 h-4" />
          {t("aufmass", "laborTab", "Labor")}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        {activeTab === 'desc' && (
          <div className="space-y-4 h-full flex flex-col">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
              {t("aufmass", "workDescription", "Work Description")}
            </label>
            <textarea
              className="w-full flex-1 bg-black/40 border border-white/10 rounded-2xl p-4 text-sm text-slate-300 resize-none outline-none focus:border-blue-500/50 transition-all"
              placeholder={t("aufmass", "describeWorkPlaceholder", "Describe the work done...")}
              value={description}
              onChange={(e) => onChangeDescription(e.target.value)}
            />
          </div>
        )}

        {activeTab === 'materials' && (
          <div className="space-y-4">
            {materials.map((mat) => (
              <div key={mat.id} className="bg-black/40 border border-white/5 p-4 rounded-2xl space-y-3 group hover:border-white/10 transition-all">
                <div className="flex justify-between items-start">
                  <input
                    type="text"
                    value={mat.item_name}
                    list="material-suggestions"
                    onChange={(e) => handleMaterialNameChange(mat.id, e.target.value)}
                    className="bg-transparent border-b border-dashed border-white/20 text-sm font-bold text-white outline-none w-2/3 focus:border-emerald-500"
                  />
                  <button onClick={() => handleDeleteMaterial(mat.id)} className="text-slate-600 hover:text-red-500">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                 <div className="flex gap-4">
                  <div className="w-1/3">
                    <label className="text-[8px] font-black text-slate-500 uppercase">
                      {t("aufmass", "qty", "Qty")}
                    </label>
                    <input
                      type="number"
                      value={mat.quantity}
                      onChange={(e) => handleUpdateMaterial(mat.id, { quantity: parseFloat(e.target.value) })}
                      className="w-full bg-slate-900 border border-white/10 rounded-lg p-2 text-xs text-white outline-none mt-1"
                    />
                  </div>
                  <div className="w-1/3">
                    <label className="text-[8px] font-black text-slate-500 uppercase">
                      {t("aufmass", "unit", "Unit")}
                    </label>
                    <input
                      type="text"
                      value={mat.unit}
                      onChange={(e) => handleUpdateMaterial(mat.id, { unit: e.target.value })}
                      className="w-full bg-slate-900 border border-white/10 rounded-lg p-2 text-xs text-white outline-none mt-1"
                    />
                  </div>
                  <div className="w-1/3">
                    <label className="text-[8px] font-black text-slate-500 uppercase">
                      {t("aufmass", "priceOpt", "Price (Opt)")}
                    </label>
                    <input
                      type="number"
                      value={mat.price || ''}
                      onChange={(e) => handleUpdateMaterial(mat.id, { price: parseFloat(e.target.value) })}
                      className="w-full bg-slate-900 border border-white/10 rounded-lg p-2 text-xs text-white outline-none mt-1"
                    />
                  </div>
                </div>
              </div>
            ))}
            <button
              onClick={handleAddMaterial}
              className="w-full py-4 border border-dashed border-white/20 rounded-2xl flex items-center justify-center gap-2 text-[10px] font-black text-emerald-500 uppercase tracking-widest hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-all"
            >
              <Plus className="w-4 h-4" /> {t("aufmass", "addMaterialBtn", "Add Material")}
            </button>
          </div>
        )}

         {activeTab === 'labor' && (
          <div className="space-y-4">
            {labor.map((lab) => (
              <div key={lab.id} className="bg-black/40 border border-white/5 p-4 rounded-2xl space-y-3 group hover:border-white/10 transition-all">
                <div className="flex justify-between items-start mb-2">
                   <p className="text-[10px] font-black text-slate-400 uppercase">
                     {t("aufmass", "laborEntry", "Labor Entry")}
                   </p>
                   <button onClick={() => handleDeleteLabor(lab.id)} className="text-slate-600 hover:text-red-500">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="text-[8px] font-black text-slate-500 uppercase">
                      {t("aufmass", "workers", "Workers")}
                    </label>
                    <input
                      type="number"
                      value={lab.worker_count}
                      onChange={(e) => handleUpdateLabor(lab.id, { worker_count: parseInt(e.target.value) })}
                      className="w-full bg-slate-900 border border-white/10 rounded-lg p-2 text-xs text-white outline-none mt-1"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[8px] font-black text-slate-500 uppercase">
                      {t("aufmass", "estHours", "Est. Hours (each)")}
                    </label>
                    <input
                      type="number"
                      value={lab.estimated_hours}
                      onChange={(e) => handleUpdateLabor(lab.id, { estimated_hours: parseFloat(e.target.value) })}
                      className="w-full bg-slate-900 border border-white/10 rounded-lg p-2 text-xs text-white outline-none mt-1"
                    />
                  </div>
                </div>
                <div>
                   <label className="text-[8px] font-black text-slate-500 uppercase">
                     {t("aufmass", "descriptionTab", "Description")}
                   </label>
                   <input
                      type="text"
                      value={lab.description || ''}
                      onChange={(e) => handleUpdateLabor(lab.id, { description: e.target.value })}
                      placeholder={t("aufmass", "laborPlaceholder", "e.g., Installation of cables")}
                      className="w-full bg-slate-900 border border-white/10 rounded-lg p-2 text-xs text-white outline-none mt-1"
                    />
                </div>
              </div>
            ))}
            <button
              onClick={handleAddLabor}
              className="w-full py-4 border border-dashed border-white/20 rounded-2xl flex items-center justify-center gap-2 text-[10px] font-black text-purple-500 uppercase tracking-widest hover:bg-purple-500/10 hover:border-purple-500/30 transition-all"
            >
              <Plus className="w-4 h-4" /> {t("aufmass", "addLaborBtn", "Add Labor")}
            </button>
          </div>
        )}
      </div>
      <datalist id="material-suggestions">
        {suggestions.map((name, idx) => (
          <option key={idx} value={name} />
        ))}
      </datalist>
    </div>
  );
}
