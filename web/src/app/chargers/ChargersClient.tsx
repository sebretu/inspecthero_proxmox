"use client";

import React, { useEffect, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import { useLanguage } from "@/contexts/LanguageContext";
import { Trash2, MapPin, ExternalLink, Calendar, Plus } from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function ChargersClient() {
  const { t, language } = useLanguage();
  const [projects, setProjects] = useState<any[]>([]);
  const [projectId, setProjectId] = useState("");
  const [chargers, setChargers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setCurrentUserId(session.user.id);
        const { data: profile } = await supabase.from("profiles").select("role").eq("id", session.user.id).single();
        if (profile?.role === "ADMIN") {
          setIsAdmin(true);
        }
      }
    };
    init();

    apiGet<any[]>("/api/projects").then(rows => {
      setProjects(rows || []);
      if (rows && rows.length > 0) {
        setProjectId(rows[0].id);
      }
    }).catch(console.error);
  }, []);

  useEffect(() => {
    if (projectId) {
      setLoading(true);
      apiGet<any>(`/api/chargers?projectId=${projectId}&limit=1000`).then(res => {
        setChargers(res.data || res || []);
      }).catch(console.error)
        .finally(() => setLoading(false));
    } else {
      setChargers([]);
    }
  }, [projectId]);

  const handleDelete = async (id: string) => {
    if (!confirm(t("common", "confirmDelete", "Czy na pewno chcesz usunąć?"))) return;
    try {
      const { getToken } = await import("@/lib/apiClient");
      const token = await getToken();
      const res = await fetch(`/api/chargers?id=${id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to delete");
      setChargers(prev => prev.filter(c => c.id !== id));
    } catch (e) {
      console.error(e);
      alert(t("common", "error", "Błąd"));
    }
  };

  const formatDate = (ds: string) => {
    const d = new Date(ds);
    if (isNaN(d.getTime())) return ds;
    return d.toLocaleDateString(language === "pl" ? "pl-PL" : "de-DE", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
    });
  };

  const title = t("charger", "listTitle", "Ladegeräte / Ładowarki");

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8 max-w-7xl mx-auto pb-32 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
           <h1 className="text-3xl md:text-4xl font-black tracking-tight text-ui-text uppercase">{title}</h1>
           <p className="text-sm font-bold tracking-widest text-ui-muted uppercase mt-1">Zainstalowane urządzenia</p>
        </div>
        
        <Link 
          href="/charger-install" 
          className="bg-ui-accent text-white px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-sm flex items-center gap-2 shadow-lg shadow-ui-accent/20 hover:bg-ui-accent/90 transition-all active:scale-95"
        >
          <Plus size={18} /> {t("charger", "addNew", "Nowa Instalacja")}
        </Link>
      </div>

      <div className="bg-ui-card border border-ui-border rounded-3xl p-6 shadow-xl">
        <div className="flex flex-col gap-2 max-w-sm mb-8">
          <label className="text-[10px] font-black uppercase tracking-widest text-ui-muted">{t("charger", "project", "Projekt")}</label>
          <select 
            value={projectId} 
            onChange={e => setProjectId(e.target.value)} 
            className="w-full bg-ui-bg border border-ui-border text-ui-text text-sm font-bold rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-ui-accent/20"
          >
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="py-20 flex justify-center">
            <div className="w-8 h-8 border-4 border-ui-accent border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : chargers.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-ui-muted gap-4 opacity-50">
            <MapPin size={48} className="opacity-50" />
            <p className="font-black uppercase tracking-widest text-sm">{t("charger", "noChargers", "Brak ładowarek w tym projekcie")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-ui-border text-[10px] font-black uppercase tracking-widest text-ui-muted">
                  <th className="p-4">{t("charger", "mac", "MAC")}</th>
                  <th className="p-4">{t("charger", "pin", "PIN")}</th>
                  <th className="p-4">{t("charger", "date", "Data instalacji")}</th>
                  <th className="p-4">{t("charger", "user", "Użytkownik")}</th>
                  <th className="p-4">{t("charger", "photo", "Zdjęcie")}</th>
                  <th className="p-4 text-right">{t("common", "actions", "Akcje")}</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {chargers.map((c) => (
                  <tr key={c.id} className="border-b border-ui-border/50 hover:bg-ui-bg/50 transition-colors">
                    <td className="p-4 font-black font-monospace text-ui-text">{c.mac}</td>
                    <td className="p-4 font-bold text-ui-accent tracking-widest">{c.pin}</td>
                    <td className="p-4 text-ui-muted whitespace-nowrap">
                       <div className="flex items-center gap-2">
                         <Calendar size={14} /> {formatDate(c.created_at)}
                       </div>
                    </td>
                    <td className="p-4 text-ui-text font-medium">{c.profiles?.full_name || c.profiles?.email || 'N/A'}</td>
                    <td className="p-4">
                      {c.photo_url ? (
                        <a href={c.photo_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-ui-accent hover:underline font-bold text-xs uppercase tracking-wider">
                          <ExternalLink size={14} /> Link
                        </a>
                      ) : (
                        <span className="text-ui-muted text-xs italic">-</span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      {(isAdmin || c.created_by === currentUserId) && (
                         <button 
                           onClick={() => handleDelete(c.id)}
                           className="p-2 text-red-500 hover:bg-red-500/10 rounded-xl transition-colors inline-block"
                           title={t("common", "delete", "Usuń")}
                         >
                           <Trash2 size={18} />
                         </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
