"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { apiGet, apiPost, getApiUrl, getToken } from "@/lib/apiClient";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "@/contexts/LanguageContext";
import { Camera, QrCode, Save, MapPin, CheckCircle, Trash2, Calendar, ExternalLink, Image as ImageIcon, Zap, Plus, Layers, Download } from "lucide-react";
import QRCode from "qrcode";

const PlanViewer = dynamic(() => import("@/components/PlanViewer"), {
  ssr: false,
  loading: () => <div className="p-4 bg-ui-card rounded-lg animate-pulse text-ui-muted text-sm" style={{ height: '450px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>...</div>,
});

const QrScanner = dynamic(() => import("@/components/QrScanner").then(m => ({ default: m.QrScanner })), { ssr: false });
const PhotoLightbox = dynamic(() => import("@/components/PhotoLightbox"), { ssr: false });

const QrCodeImage = ({ text, className = "w-12 h-12 rounded-lg p-1" }: { text: string, className?: string }) => {
  const [src, setSrc] = useState<string>("");
  useEffect(() => {
    if (text) {
      QRCode.toDataURL(text, { margin: 1, width: 240 }).then(setSrc).catch(console.error);
    }
  }, [text]);
  if (!src) return <div className={`bg-white/10 animate-pulse ${className}`} />;
  return <img src={src} alt="QR Code" className={`bg-white shadow-lg ${className}`} />;
};

const parseMacAndPin = (text: string) => {
  const cleanText = text.replace(/[\n\r]/g, " ").trim();

  // If it's a pure hex string of 12 to 16 characters, it's just a MAC address, don't try to split it
  if (/^[0-9A-Fa-f]{12,16}$/.test(cleanText)) {
    return null;
  }

  // 1. Try URL patterns first
  const urlPattern = /\/i\/([0-9A-Fa-f]{12,16})\/([A-Za-z0-9]{4,10})/;
  const urlMatch = cleanText.match(urlPattern);
  if (urlMatch) {
    return { mac: urlMatch[1].toUpperCase(), pin: urlMatch[2].toUpperCase() };
  }

  // 2. Try generic URL segments pattern /MAC/PIN
  const urlPatternGeneric = /\/([0-9A-Fa-f]{12,16})\/([A-Za-z0-9]{4,10})/;
  const urlMatchGeneric = cleanText.match(urlPatternGeneric);
  if (urlMatchGeneric) {
    return { mac: urlMatchGeneric[1].toUpperCase(), pin: urlMatchGeneric[2].toUpperCase() };
  }

  // 3. Try concatenated format (MAC and PIN next to each other, optional separator)
  const concatPattern = /([0-9A-Fa-f]{12,16})[\/\-\s]?([A-Za-z0-9]{4,10})(?:\b|$)/;
  const concatMatch = cleanText.match(concatPattern);
  if (concatMatch) {
    return { mac: concatMatch[1].toUpperCase(), pin: concatMatch[2].toUpperCase() };
  }

  // 4. Try segmented MAC formats like MAC1/MAC2/PIN
  const splitPattern = /\/([0-9A-Fa-f]{8})\/([0-9A-Fa-f]{8})\/([A-Za-z0-9]{4,10})/;
  const splitMatch = cleanText.match(splitPattern);
  if (splitMatch) {
    return { mac: (splitMatch[1] + splitMatch[2]).toUpperCase(), pin: splitMatch[3].toUpperCase() };
  }

  // 5. Try split segments by delimiters
  const segments = cleanText.split(/[\/\?\&\s\=\-\_]/);
  let foundMac = "";
  let foundPin = "";
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i].trim();
    if (/^[0-9A-Fa-f]{12,16}$/.test(seg)) {
      foundMac = seg.toUpperCase();
    } else if (i < segments.length - 1) {
      const nextSeg = segments[i+1].trim();
      if (/^[0-9A-Fa-f]{8}$/.test(seg) && /^[0-9A-Fa-f]{8}$/.test(nextSeg)) {
        foundMac = (seg + nextSeg).toUpperCase();
      }
    }
    
    // Accept alphanumeric PINs
    const pinSegMatch = seg.match(/^([A-Za-z0-9]{4,10})$/);
    if (pinSegMatch && !/^[0-9A-Fa-f]{8,}$/.test(seg)) {
      foundPin = pinSegMatch[1].toUpperCase();
    }
  }

  if (foundMac && foundPin) {
    return { mac: foundMac, pin: foundPin };
  }

  // 6. Last resort
  const allHex = cleanText.replace(/[^0-9A-Fa-f]/g, "");
  const macMatch = allHex.match(/[0-9A-Fa-f]{12,16}/);
  const pinMatch = cleanText.match(/[A-Za-z0-9]{4,10}/);
  
  if (macMatch && pinMatch) {
    return { mac: macMatch[0].toUpperCase(), pin: pinMatch[0].toUpperCase() };
  }

  return null;
};

export default function ChargerInstallationClient() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<"FORM" | "LIST">("FORM");
  
  const [projects, setProjects] = useState<any[]>([]);
  const [projectId, setProjectId] = useState("");
  const [plans, setPlans] = useState<any[]>([]);
  const [planId, setPlanId] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const [chargers, setChargers] = useState<any[]>([]);
  const [loadingChargers, setLoadingChargers] = useState(false);
  
  const [location, setLocation] = useState<{ x: number, y: number } | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [mac, setMac] = useState("");
  const [pin, setPin] = useState("");
  const [servicePin, setServicePin] = useState("");
  const [activationPin, setActivationPin] = useState("");
  const [qrText, setQrText] = useState("");
  const [showScanner, setShowScanner] = useState(false);
  
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  // New states for the LIST view
  const [selectedChargerId, setSelectedChargerId] = useState<string | null>(null);
  const [editingChargerId, setEditingChargerId] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const handleEditCharger = (c: any) => {
    setEditingChargerId(c.id);
    setProjectId(c.project_id || "");
    setPlanId(c.plan_id || "");
    setLocation({ x: Number(c.x_norm), y: Number(c.y_norm) });
    setMac(c.mac || "");
    setPin(c.pin || "");
    setServicePin(c.service_pin || "");
    setActivationPin(c.activation_pin || "");
    setQrText(c.qr_text || "");
    setPhotoPreview(c.photo_url || null);
    setPhoto(null);
    setActiveTab("FORM");
  };

  const fullTitle = t("charger", "title", "Instalacja Ładowarek");
  const titleWords = fullTitle.split(" ");
  const firstWord = titleWords[0];
  const otherWords = titleWords.slice(1).join(" ");

  useEffect(() => {
    apiGet<any[]>("/api/projects").then(rows => {
      setProjects(rows || []);
    }).catch(console.error);
    
    const checkUser = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session?.user?.id) {
          setCurrentUserId(data.session.user.id);
          const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.session.user.id).single();
          if (profile?.role === "ADMIN") {
            setIsAdmin(true);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    checkUser();
  }, []);

  useEffect(() => {
    if (projectId) {
      apiGet<any>(`/api/plans?projectId=${projectId}`).then(res => {
        setPlans(res.data || res || []);
      }).catch(console.error);
      
      fetchChargers();
    } else {
      setPlans([]);
      setPlanId("");
      setChargers([]);
    }
  }, [projectId]);

  const fetchChargers = () => {
    if (!projectId) return;
    setLoadingChargers(true);
    apiGet<any>(`/api/chargers?projectId=${projectId}&limit=1000`).then(res => {
      setChargers(res.data || res || []);
    }).catch(console.error).finally(() => setLoadingChargers(false));
  };

  const handleDeleteCharger = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm(t("common", "confirmDelete", "Czy na pewno chcesz usunąć?"))) return;
    try {
      const token = await getToken();
      const res = await fetch(`/api/chargers?id=${id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to delete");
      setChargers(prev => prev.filter(c => c.id !== id));
      if (selectedChargerId === id) setSelectedChargerId(null);
    } catch (e) {
      console.error(e);
      alert(t("common", "error", "Błąd"));
    }
  };

  const formatDate = (ds: string) => {
    const d = new Date(ds);
    if (isNaN(d.getTime())) return ds;
    const lang = (typeof window !== 'undefined' ? localStorage.getItem('language') : 'pl') || 'pl';
    return d.toLocaleDateString(lang === "pl" ? "pl-PL" : "de-DE", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
    });
  };

  const handleScan = (text: string) => {
    setShowScanner(false);
    
    const parsed = parseMacAndPin(text);
    if (parsed) {
      setMac(parsed.mac);
      setPin(parsed.pin);
      setQrText(text);
      setSuccess(false);
    } else {
      alert(t("charger", "scanError", "Nie rozpoznano formatu QR") + ": " + text);
    }
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setPhoto(file);
      setPhotoPreview(URL.createObjectURL(file));
      setSuccess(false);
    }
  };

  const removePhoto = () => {
    setPhoto(null);
    if (photoPreview) {
      URL.revokeObjectURL(photoPreview);
      setPhotoPreview(null);
    }
  };

  const handleDownloadPhoto = async (url: string, filename: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error("Download error:", error);
      alert(t("common", "error", "Błąd pobierania pliku"));
    }
  };

  const handleSave = async () => {
    if (!projectId || !planId || !location || !mac || !pin) {
      alert(t("charger", "fillAllData", "Proszę uzupełnić wszystkie dane (Projekt, Plan, Pozycja, QR)"));
      return;
    }

    setSaving(true);
    try {
      let chargerId = editingChargerId;
      if (editingChargerId) {
        const token = await getToken();
        const updateRes = await fetch(getApiUrl("/api/chargers"), {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingChargerId,
            project_id: projectId,
            plan_id: planId,
            x_norm: location.x,
            y_norm: location.y,
            mac: mac,
            pin: pin,
            service_pin: servicePin || null,
            activation_pin: activationPin || null,
            qr_text: qrText && qrText.startsWith("http") ? qrText : `https://o.chargepoint.com/i/${mac}/${pin}`
          })
        });
        if (!updateRes.ok) throw new Error("Update failed");
      } else {
        const chargerRes = await apiPost<any>("/api/chargers", {
          project_id: projectId,
          plan_id: planId,
          x_norm: location.x,
          y_norm: location.y,
          mac: mac,
          pin: pin,
          service_pin: servicePin || null,
          activation_pin: activationPin || null,
          qr_text: qrText && qrText.startsWith("http") ? qrText : `https://o.chargepoint.com/i/${mac}/${pin}`
        });
        chargerId = chargerRes.id || chargerRes.data?.id;
      }

      if (chargerId && photo) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(photo);
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = error => reject(error);
        });

        const token = await getToken();
        const uploadRes = await fetch(getApiUrl("/api/charger-photos"), {
          method: "POST",
          headers: { 
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            charger_id: chargerId,
            file_name: photo.name,
            base64
          })
        });
        
        if (!uploadRes.ok) {
           console.error("Failed to upload photo");
        }
      }

      setSuccess(true);
      fetchChargers();
      setLocation(null);
      setMac("");
      setPin("");
      setQrText("");
      setPhoto(null);
      setPhotoPreview(null);
      setEditingChargerId(null);
      if (editingChargerId) {
        setActiveTab("LIST");
      }
      
    } catch (err) {
      console.error(err);
      alert(t("charger", "error", "Błąd podczas zapisywania"));
    } finally {
      setSaving(false);
    }
  };

  const renderForm = () => (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto pb-32 animate-in fade-in duration-500 mt-10">
      <div className="bg-slate-900/40 backdrop-blur-3xl border border-white/5 rounded-2xl p-8 shadow-2xl shadow-black/50">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex flex-col gap-2">
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-2">{t("charger", "project", "Projekt")}</label>
            <select 
              value={projectId} 
              onChange={e => setProjectId(e.target.value)} 
              className="w-full bg-black/60 border border-white/10 text-white text-xs font-bold rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500/20"
            >
              <option value="">{t("charger", "selectProject", "Wybierz projekt")}</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}{p.companies?.name ? ` (${p.companies.name})` : ''}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-2">{t("charger", "plan", "Plan")}</label>
            <select 
              value={planId} 
              onChange={e => setPlanId(e.target.value)} 
              disabled={!projectId}
              className="w-full bg-black/60 border border-white/10 text-white text-xs font-bold rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500/20 disabled:opacity-50"
            >
              <option value="">{t("charger", "selectPlan", "Wybierz plan")}</option>
              {plans.map(p => (
                <option key={p.id} value={p.id}>
                  {p.floors?.buildings?.name} — {p.floors?.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 flex justify-between ml-2">
          {t("charger", "positionOnPlan", "Pozycja na planie")}
          {location && <span className="text-green-500 lowercase font-normal italic">{t("charger", "positionSet", "Pozycja zaznaczona")} ✔</span>}
        </label>
        <div className="border border-white/5 rounded-2xl overflow-hidden shadow-2xl bg-black/40" style={{ height: '450px', position: 'relative' }}>
          {planId ? (
            <PlanViewer 
              planId={planId} 
              onMapClick={(x, y) => {
                setLocation({ x, y });
                setSuccess(false);
              }}
              onMarkerDragEnd={async (id, x, y) => {
                if (id === 'new') {
                  setLocation({ x, y });
                  setSuccess(false);
                } else {
                  try {
                    const token = await getToken();
                    const res = await fetch(getApiUrl(`/api/chargers`), {
                      method: "PATCH",
                      headers: {
                        "Authorization": `Bearer ${token}`,
                        "Content-Type": "application/json"
                      },
                      body: JSON.stringify({ id, x_norm: x, y_norm: y })
                    });
                    if (!res.ok) throw new Error("Failed to update position");
                    fetchChargers();
                  } catch (e) {
                    console.error(e);
                    alert(t("charger", "error", "Błąd podczas aktualizacji pozycji"));
                  }
                }
              }}
              onMarkerClick={async (id) => {
                if (id === 'new') {
                  if (confirm(t("charger", "removeNewMarkerConfirm", "Czy chcesz usunąć nowo wstawiony marker?"))) {
                    setLocation(null);
                  }
                } else {
                  const charger = chargers.find(c => c.id === id);
                  if (charger) {
                    handleEditCharger(charger);
                  }
                }
              }}
              currentUserId={currentUserId}
              allowCreate={true}
              hideTasks={true}
              aufmassMarkers={[
                ...(() => {
                  const sorted = [...chargers.filter(c => c.plan_id === planId)].sort(
                    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                  );
                  return sorted.map((c, idx) => ({
                    id: c.id,
                    title: `Ładowarka #${idx + 1}`,
                    x_norm: Number(c.x_norm),
                    y_norm: Number(c.y_norm),
                    color: '#22c55e',
                    textColor: 'black',
                    label: `${idx + 1} ⚡`
                  }));
                })(),
                ...(location ? [{
                  id: 'new',
                  title: t("charger", "newCharger", "Nowa ładowarka"),
                  x_norm: location.x,
                  y_norm: location.y,
                  color: '#ea580c',
                  textColor: 'black',
                  label: 'N ⚡'
                }] : [])
              ]}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-black/40 text-slate-500 gap-4">
              <MapPin size={48} className="opacity-20" />
              <p className="font-bold text-sm uppercase tracking-widest opacity-50">{t("charger", "selectPlanToMark", "Wybierz plan, aby zaznaczyć pozycję")}</p>
            </div>
          )}
          
          {location && (
             <div className="absolute top-4 left-4 z-[1001] flex items-center gap-2">
               <div className="bg-orange-600 text-white px-3 py-2 rounded-xl text-[10px] flex items-center gap-2 shadow-xl font-black uppercase tracking-wider">
                 <MapPin size={14} /> {t("charger", "positionSaved", "Pozycja zapisana")}
               </div>
               <button
                 type="button"
                 onClick={() => {
                   setLocation(null);
                   setEditingChargerId(null);
                 }}
                 className="bg-red-600 hover:bg-red-500 text-white px-3 py-2 rounded-xl text-[10px] flex items-center gap-1 shadow-xl font-black uppercase tracking-wider active:scale-95 transition-all"
               >
                 <Trash2 size={12} /> {t("common", "delete", "Usuń")}
               </button>
             </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
        <div className="flex flex-col gap-3">
          <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-2">{t("charger", "chargerData", "Dane ładowarki (MAC / PIN)")}</label>
          <div className="flex gap-3 items-end">
            <div className="flex-1 grid grid-cols-2 gap-3 bg-black/40 border border-white/5 rounded-2xl p-3">
              <div className="flex flex-col gap-1">
                <label className="text-[8px] font-bold text-slate-500 uppercase ml-1">{t("charger", "mac", "MAC")}</label>
                <input
                  type="text"
                  value={mac}
                  onChange={e => {
                    const val = e.target.value;
                    const parsed = parseMacAndPin(val);
                    if (parsed) {
                      setMac(parsed.mac);
                      setPin(parsed.pin);
                      setQrText(val);
                      setSuccess(false);
                      return;
                    }

                    setMac(val.toUpperCase().replace(/[^0-9A-F]/g, ""));
                    setQrText(""); // Clear stale QR text
                    setSuccess(false);
                  }}
                  placeholder="001122334455"
                  className="w-full bg-black/40 border border-white/10 text-white text-xs font-bold rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-orange-500/20 font-mono uppercase"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[8px] font-bold text-slate-500 uppercase ml-1">{t("charger", "pin", "PIN")}</label>
                <input
                  type="text"
                  value={pin}
                  onChange={e => {
                    const val = e.target.value;
                    const parsed = parseMacAndPin(val);
                    if (parsed) {
                      setMac(parsed.mac);
                      setPin(parsed.pin);
                      setQrText(val);
                      setSuccess(false);
                      return;
                    }

                    // PIN can be alphanumeric, e.g., 21112N
                    setPin(val.toUpperCase().replace(/[^A-Z0-9]/g, ""));
                    setQrText(""); // Clear stale QR text
                    setSuccess(false);
                  }}
                  placeholder="1234N"
                  className="w-full bg-black/40 border border-white/10 text-orange-500 text-xs font-bold rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-orange-500/20 font-mono"
                />
              </div>
            </div>
            <button 
              type="button"
              onClick={() => { setShowScanner(true); setSuccess(false); }}
              className="w-16 h-[68px] bg-orange-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-orange-600/20 active:scale-95 transition-all"
            >
              <QrCode size={24} />
            </button>
          </div>

          {/* Service PIN and Activation PIN */}
          <div className="grid grid-cols-2 gap-3 bg-black/20 border border-white/5 rounded-2xl p-3">
            <div className="flex flex-col gap-1">
              <label className="text-[8px] font-bold text-slate-500 uppercase ml-1">{t("charger", "servicePin" as any, "Service PIN")}</label>
              <input
                type="text"
                value={servicePin}
                onChange={e => setServicePin(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                placeholder="SERVICE123"
                className="w-full bg-black/40 border border-white/10 text-yellow-400 text-xs font-bold rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-yellow-500/20 font-mono uppercase"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[8px] font-bold text-slate-500 uppercase ml-1">{t("charger", "activationPin" as any, "Aktivierungs PIN")}</label>
              <input
                type="text"
                value={activationPin}
                onChange={e => setActivationPin(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                placeholder="ACTIV456"
                className="w-full bg-black/40 border border-white/10 text-blue-400 text-xs font-bold rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/20 font-mono uppercase"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
           <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-2">{t("charger", "photo", "Zdj. Pozycji")}</label>
           <div className="flex gap-3">
             <label className="flex-1 bg-white/5 border border-white/10 rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-white/10 transition-colors min-h-[80px]">
               <Camera size={24} className="text-slate-400" />
               <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{t("charger", "takePhoto", "Zrób zdjęcie")}</span>
               <input type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} className="hidden" />
             </label>
             {photoPreview && (
               <div className="relative w-20 h-20 rounded-2xl border border-ui-border overflow-hidden shadow-xl">
                 <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                 <button 
                  onClick={removePhoto}
                  className="absolute top-1 right-1 bg-red-600 text-white p-1 rounded-full shadow-lg active:scale-95 transition-all"
                  title={t("common", "delete", "Usuń")}
                 >
                   <Trash2 size={16} />
                 </button>
               </div>
             )}
           </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#020617] via-[#020617] to-transparent z-[1000]">
        <div className="max-w-4xl mx-auto flex gap-4">
          {editingChargerId && (
            <button
              type="button"
              onClick={() => {
                setEditingChargerId(null);
                setLocation(null);
                setMac("");
                setPin("");
                setQrText("");
                setPhoto(null);
                setPhotoPreview(null);
                setActiveTab("LIST");
              }}
              className="flex-1 py-5 rounded-3xl flex items-center justify-center gap-3 font-black text-sm uppercase tracking-widest shadow-2xl transition-all active:scale-[0.98] bg-slate-800 hover:bg-slate-700 text-white border border-white/10"
            >
              {t("common", "cancel", "Anuluj")}
            </button>
          )}
          <button
              onClick={handleSave}
              disabled={saving || !planId || !location || !mac || !pin}
              className={`${editingChargerId ? 'flex-1' : 'w-full'} py-5 rounded-3xl flex items-center justify-center gap-3 font-black text-sm uppercase tracking-widest shadow-2xl transition-all active:scale-[0.98] ${saving || !planId || !location || !mac || !pin ? 'bg-white/5 text-slate-500 border border-white/10' : 'bg-green-600 text-white hover:bg-green-500 shadow-green-600/30'}`}
          >
              {saving ? (
                  <div className="w-5 h-5 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                  <>
                      <Save size={18} />
                      {editingChargerId ? t("charger", "saveChanges", "Zapisz zmiany") : t("charger", "saveInstallation", "Zapisz instalację")}
                  </>
              )}
          </button>
        </div>
      </div>
    </div>
  );

  const renderList = () => {
    // Determine the current plan to display on the left map. If a charger is selected, use its plan, otherwise use selected plan from dropdown or the first plan that has chargers.
    const selectedCharger = chargers.find(c => c.id === selectedChargerId);
    const activePlanId = selectedCharger?.plan_id || planId || (chargers.length > 0 ? chargers[0].plan_id : null);
    const chargersForActivePlan = chargers.filter(c => c.plan_id === activePlanId);
    const activePlan = plans.find(p => p.id === activePlanId);

    // Sort all chargers on this plan chronologically (oldest first) to assign sequential numbers
    const sortedActivePlanChargers = [...chargersForActivePlan].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const chargerNumbers = new Map(sortedActivePlanChargers.map((c, idx) => [c.id, idx + 1]));

    return (
      <div className="flex flex-col lg:flex-row w-full animate-in fade-in zoom-in-95 duration-500 rounded-2xl border border-white/5 bg-slate-900/40 shadow-2xl shadow-black/50 backdrop-blur-3xl mt-4">
        {/* LEFT PANEL: Map */}
        <div className="w-full lg:w-1/2 h-[40vh] lg:sticky lg:top-24 lg:h-[calc(100vh-240px)] relative border-b lg:border-b-0 lg:border-r border-white/5 shadow-2xl z-10 flex flex-col bg-black/40 backdrop-blur-3xl">
          <div className="flex items-center justify-between gap-4 p-4 md:p-6 bg-gradient-to-b from-black/80 to-transparent absolute top-0 left-0 right-0 z-20">
            <div>
              <h1 className="text-sm md:text-base font-black text-white tracking-widest uppercase leading-none">
                {activePlan ? `${activePlan.floors?.buildings?.name} — ${activePlan.floors?.name}` : t("charger", "mapPreview", "Podgląd mapy")}
              </h1>
              <p className="text-[9px] text-orange-500 font-bold tracking-widest uppercase mt-1">
                {chargersForActivePlan.length} {t("charger", "chargers", "Ładowarek")}
              </p>
            </div>
            
            <div className="flex gap-2 opacity-90 hover:opacity-100 transition-opacity">
              <select 
                value={projectId} 
                onChange={e => { setProjectId(e.target.value); setSelectedChargerId(null); }}
                className="bg-black/60 text-white text-[10px] font-black uppercase tracking-widest border border-white/10 rounded-xl px-3 py-2 outline-none backdrop-blur-md"
              >
                <option value="">{t("charger", "project", "Projekt")}</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}{p.companies?.name ? ` (${p.companies.name})` : ''}</option>)}
              </select>
              <select 
                value={planId} 
                onChange={e => { setPlanId(e.target.value); setSelectedChargerId(null); }}
                disabled={!projectId}
                className="bg-black/60 text-white text-[10px] font-black uppercase tracking-widest border border-white/10 rounded-xl px-3 py-2 outline-none backdrop-blur-md max-w-[120px]"
              >
                <option value="">{t("charger", "plan", "Plan")}</option>
                {plans.map(p => <option key={p.id} value={p.id}>{p.floors?.name}</option>)}
              </select>
            </div>
          </div>

          {activePlanId ? (
            <PlanViewer 
              planId={activePlanId} 
              fullHeight={true}
              onMarkerDragEnd={async (id, x, y) => {
                try {
                  const token = await getToken();
                  const res = await fetch(getApiUrl(`/api/chargers`), {
                    method: "PATCH",
                    headers: {
                      "Authorization": `Bearer ${token}`,
                      "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ id, x_norm: x, y_norm: y })
                  });
                  if (!res.ok) throw new Error("Failed to update position");
                  fetchChargers();
                } catch (e) {
                  console.error(e);
                  alert(t("charger", "error", "Błąd podczas aktualizacji pozycji"));
                }
              }}
              onMarkerClick={(id) => {
                const charger = chargers.find(c => c.id === id);
                if (charger) {
                  handleEditCharger(charger);
                }
              }}
              aufmassMarkers={chargersForActivePlan.map((c) => {
                const num = chargerNumbers.get(c.id) || 1;
                return {
                  id: c.id,
                  title: `Ładowarka #${num}`,
                  x_norm: Number(c.x_norm),
                  y_norm: Number(c.y_norm),
                  color: selectedChargerId === c.id ? '#ea580c' : '#22c55e',
                  textColor: 'black',
                  label: `${num} ⚡`
                };
              })}
              currentUserId={currentUserId}
              allowCreate={false}
              hideTasks={true}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-slate-500/50 gap-4 p-8 text-center">
              <MapPin size={48} className="opacity-50" />
              <div className="text-[10px] uppercase tracking-widest font-black">
                {t("charger", "selectPlan", "Wybierz plan, aby zobaczyć mapę")}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT PANEL: List */}
        <div className="w-full lg:w-1/2 flex flex-col relative z-20 shadow-[-20px_0_50px_rgba(0,0,0,0.5)] bg-transparent">
          <div className="p-6 border-b border-white/5 flex items-center justify-between bg-black/20">
             <h2 className="text-xs font-black uppercase tracking-widest text-white">{t("charger", "listTitle", "Ladegeräte")}</h2>
          </div>
          
          <div className="p-4 space-y-4">
            {loadingChargers ? (
              <div className="py-10 flex justify-center">
                <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : chargersForActivePlan.length === 0 ? (
              <div className="py-10 flex flex-col items-center justify-center text-slate-500 gap-4 opacity-50">
                <MapPin size={48} className="opacity-50" />
                <p className="font-black uppercase tracking-widest text-[10px]">{t("charger", "noChargersOnPlan", "Brak ładowarek na tym planie")}</p>
              </div>
            ) : (
              chargersForActivePlan.map((c) => {
                const planPath = plans.find(p => p.id === c.plan_id)?.image_path;
                const mapX = Number(c.x_norm) * 100;
                const mapY = Number(c.y_norm) * 100;
                const num = chargerNumbers.get(c.id) || 1;

                return (
                  <div 
                    key={c.id} 
                    id={`charger-card-${c.id}`}
                    onClick={() => handleEditCharger(c)}
                    className={`flex flex-col p-6 rounded-2xl border transition-all cursor-pointer shadow-lg hover:-translate-y-1 ${selectedChargerId === c.id ? 'border-orange-500 bg-orange-600/10 ring-4 ring-orange-500/10' : 'border-white/5 bg-black/40 hover:border-white/20'}`}
                  >
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div className="flex items-center gap-4">
                        <div>
                          <div className="flex items-center gap-3 mb-1">
                            <span className="px-2 py-0.5 rounded-md bg-orange-600 text-white font-black text-[9px] uppercase tracking-widest">#{num}</span>
                            <h3 className="font-black font-monospace text-white tracking-wider text-sm">{c.mac}</h3>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-[9px] text-slate-500 uppercase tracking-widest font-bold">
                            <p>PIN: <span className="text-orange-400 font-mono">{c.pin}</span></p>
                            {c.service_pin && (
                              <p>Service PIN: <span className="text-yellow-400 font-mono">{c.service_pin}</span></p>
                            )}
                            {c.activation_pin && (
                              <p>Aktivierungs PIN: <span className="text-blue-400 font-mono">{c.activation_pin}</span></p>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {(isAdmin || c.created_by === currentUserId) && (
                        <button 
                          onClick={(e) => handleDeleteCharger(c.id, e)}
                          className="p-2 text-red-500 hover:bg-red-500/10 rounded-xl transition-colors"
                          title={t("common", "delete", "Usuń")}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                    
                    <div className="flex gap-4 h-32 mt-2">
                       {/* Map Snippet */}
                       <div 
                         className="flex-1 rounded-xl overflow-hidden relative border border-white/10 shadow-inner"
                         style={{
                           backgroundImage: planPath ? `url(${planPath})` : 'none',
                           backgroundPosition: `${mapX}% ${mapY}%`,
                           backgroundSize: '1500%',
                           backgroundColor: '#0f172a'
                         }}
                       >
                         <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-6 px-1.5 bg-orange-600 rounded-full border-2 border-white/20 shadow-lg flex items-center justify-center">
                            <span className="text-[9px] font-bold text-white whitespace-nowrap">{num} ⚡</span>
                         </div>
                       </div>

                       {/* QR Code Snippet */}
                       <div className="w-32 h-32 rounded-xl border border-white/10 shadow-inner bg-white flex items-center justify-center p-2 relative flex-shrink-0">
                         <QrCodeImage text={c.qr_text || `https://o.chargepoint.com/i/${c.mac}/${c.pin}`} className="w-full h-full object-contain" />
                       </div>
                       
                       {/* Photo Snippet */}
                       <div 
                         className="w-32 h-32 flex-shrink-0 rounded-xl overflow-hidden relative border border-white/10 shadow-inner bg-black/40 flex items-center justify-center group"
                         onClick={(e) => {
                           if (c.photo_url) {
                             e.stopPropagation();
                             setLightboxImage(c.photo_url);
                           }
                         }}
                       >
                         {c.photo_url ? (
                           <>
                             <img src={c.photo_url} alt="Charger" className="w-full h-full object-cover hover:scale-110 transition-transform cursor-zoom-in" />
                             <button
                               onClick={(e) => handleDownloadPhoto(c.photo_url, `${num}_${c.mac}.jpg`, e)}
                               className="absolute bottom-2 right-2 p-2 bg-black/60 hover:bg-orange-600 text-white rounded-lg backdrop-blur-sm transition-colors opacity-0 group-hover:opacity-100 shadow-lg"
                               title={t("common", "download", "Pobierz")}
                             >
                               <Download size={14} />
                             </button>
                           </>
                         ) : (
                           <div className="flex flex-col items-center gap-1 opacity-20 text-slate-400">
                             <ImageIcon size={24} />
                             <span className="text-[8px] uppercase tracking-widest font-bold">{t("charger", "noPhoto", "Brak")}</span>
                           </div>
                         )}
                       </div>
                    </div>
                    
                    <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between text-[9px] font-bold uppercase tracking-widest text-slate-500">
                       <div className="flex items-center gap-1">
                         <Calendar size={12} /> {formatDate(c.created_at)}
                       </div>
                       <div>
                         {c.profiles?.full_name || c.profiles?.email || 'N/A'}
                       </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center text-slate-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#020617] text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md bg-slate-900/50 backdrop-blur-3xl border border-white/5 rounded-3xl p-8 shadow-2xl">
          <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Zap className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-black uppercase tracking-wider mb-2">
            {t("access", "adminOnlyTitle", "Brak dostępu")}
          </h1>
          <p className="text-slate-400 text-sm font-semibold mb-6">
            {t("access", "adminOnlyBody", "Ta strona jest dostępna tylko dla administratorów.")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020617] text-slate-300 font-sans selection:bg-orange-500/30">
      <div className="p-4 md:p-8 lg:p-12 max-w-7xl mx-auto">
        <div className="space-y-8">
          {/* Header - Unified Look */}
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-10">
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-2xl shadow-orange-500/20">
                   <Zap className="w-6 h-6 text-white" />
                </div>
                <div className="space-y-2">
                  <h1 className="text-2xl md:text-4xl font-black text-white tracking-tighter uppercase">
                    {firstWord} {otherWords}
                  </h1>
                </div>
              </div>
            </div>
            
            <div className="flex items-center bg-black/40 p-2 rounded-2xl border border-white/5 backdrop-blur-xl gap-2 shadow-2xl">
              <button
                onClick={() => {
                  setEditingChargerId(null);
                  setLocation(null);
                  setMac("");
                  setPin("");
                  setQrText("");
                  setPhoto(null);
                  setPhotoPreview(null);
                  setActiveTab("FORM");
                }}
                className={`flex items-center gap-3 px-6 py-3 md:px-8 md:py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-500 ${activeTab === "FORM" ? "bg-orange-600 text-white shadow-[0_0_40px_rgba(234,88,12,0.4)] scale-105" : "text-slate-500 hover:text-slate-300 hover:bg-white/5"}`}
              >
                <Plus className={`w-4 h-4 ${activeTab === "FORM" ? "animate-pulse" : ""}`} />
                <span className="hidden md:inline">{t("charger", "newInstallationTab", "Nowa Instalacja")}</span>
              </button>
              <button
                onClick={() => setActiveTab("LIST")}
                className={`flex items-center gap-3 px-6 py-3 md:px-8 md:py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-500 ${activeTab === "LIST" ? "bg-orange-600 text-white shadow-[0_0_40px_rgba(234,88,12,0.4)] scale-105" : "text-slate-500 hover:text-slate-300 hover:bg-white/5"}`}
              >
                <Layers className={`w-4 h-4 ${activeTab === "LIST" ? "animate-pulse" : ""}`} />
                <span className="hidden md:inline">{t("charger", "listTab", "Ladegeräte")}</span>
              </button>
            </div>
          </div>

          {success && activeTab === "FORM" && (
            <div className="flex items-center justify-center gap-2 text-green-500 font-bold bg-green-500/10 px-4 py-3 rounded-xl border border-green-500/20 animate-in fade-in max-w-4xl mx-auto mt-4">
              <CheckCircle size={18} />
              <span className="text-[10px] uppercase tracking-wider font-black">{t("charger", "success", "Zapisano pomyślnie")}</span>
            </div>
          )}

          {activeTab === "FORM" ? renderForm() : renderList()}
        </div>
      </div>

      {showScanner && activeTab === "FORM" && (
        <QrScanner onScan={handleScan} onClose={() => setShowScanner(false)} />
      )}
      
      {lightboxImage && (
        <PhotoLightbox url={lightboxImage} onClose={() => setLightboxImage(null)} />
      )}
    </div>
  );
}
