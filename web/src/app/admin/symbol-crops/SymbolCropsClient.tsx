"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiGet, getToken } from "@/lib/apiClient";
import { motion } from "framer-motion";

interface PlanInfo {
  id: string;
  version: number;
  floors?: {
    name?: string;
    buildings?: {
      name?: string;
      projects?: {
        name?: string;
        companies?: {
          name?: string;
        };
      };
    };
  } | null;
}

function formatPlanTitle(plan?: PlanInfo | null): string {
  if (!plan) return "Nieznany plan";
  const floorName = plan.floors?.name;
  const buildingName = plan.floors?.buildings?.name;
  const projectName = plan.floors?.buildings?.projects?.name;
  const companyName = plan.floors?.buildings?.projects?.companies?.name;

  const parts: string[] = [];
  if (companyName) parts.push(companyName);
  if (projectName) parts.push(projectName);
  if (buildingName) parts.push(buildingName);
  if (floorName) parts.push(floorName);

  const label = parts.length > 0 ? parts.join(" > ") : (plan.id || "Plan");
  return `${label} (v${plan.version ?? 1})`;
}

interface CropItem {
  id: string;
  stromkreis_id: string;
  plan_id: string;
  image_path: string;
  symbol_type: string;
  embedding_status: string;
  embedding_id: string | null;
  quality_score: number;
  quality_status: string;
  brightness: number;
  edge_density: number;
  contains_lines: boolean;
  metadata: any;
  clip_prompt?: any;
  created_at: string;
  plans?: PlanInfo;
}

function parseEdvDetails(code?: string) {
  const trimmed = (code || "").trim();
  if (!trimmed) {
    return { fullName: "-", patchfield: "-", port1: "-", port2: null };
  }

  const match = trimmed.match(/^P?(\d+)[\.\-]?(\d+)(?:\/(\d+))?$/i);
  if (match) {
    return {
      fullName: trimmed,
      patchfield: match[1],
      port1: match[2],
      port2: match[3] || null
    };
  }

  return {
    fullName: trimmed,
    patchfield: trimmed,
    port1: "-",
    port2: null
  };
}

interface StatsData {
  total: number;
  passed: number;
  failed: number;
  average_quality: number;
  types: Record<string, number>;
}

export default function SymbolCropsClient() {
  const router = useRouter();

  // State
  const [crops, setCrops] = useState<CropItem[]>([]);
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [stats, setStats] = useState<StatsData>({
    total: 0,
    passed: 0,
    failed: 0,
    average_quality: 0,
    types: {}
  });

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [planId, setPlanId] = useState("");
  const [symbolType, setSymbolType] = useState("all");
  const [qualityStatus, setQualityStatus] = useState("all");
  const [embeddingStatus, setEmbeddingStatus] = useState("all");
  
  // Pagination
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const limit = 20;

  useEffect(() => {
    setPage(1);
  }, [planId, symbolType, qualityStatus, embeddingStatus]);

  useEffect(() => {
    loadData();
  }, [planId, symbolType, qualityStatus, embeddingStatus, page]);

  async function loadData() {
    setIsLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) {
        router.replace("/auth/login");
        return;
      }

      // 1. Fetch Stats
      const statsRes = await apiGet<StatsData>("/api/symbol-crops/stats", token);
      if (statsRes) setStats(statsRes);

      // 2. Fetch Crops list with pagination and filters
      let queryUrl = `/api/symbol-crops?page=${page}&limit=${limit}`;
      if (planId) queryUrl += `&plan_id=${planId}`;
      if (symbolType !== "all") queryUrl += `&symbol_type=${symbolType}`;
      if (qualityStatus !== "all") queryUrl += `&quality_status=${qualityStatus}`;
      if (embeddingStatus !== "all") queryUrl += `&embedding_status=${embeddingStatus}`;

      const cropsRes = await apiGet<{
        items: CropItem[];
        total: number;
        plans: { id: string; version: number; floors: { name: string } | null }[];
      }>(queryUrl, token);

      if (cropsRes) {
        setCrops(cropsRes.items);
        setTotalItems(cropsRes.total);
        setPlans(cropsRes.plans);
      }
    } catch (err: any) {
      setError("Błąd ładowania danych: " + err.message);
    } finally {
      setIsLoading(false);
    }
  }

  // Build export link with active filters
  const getExportUrl = () => {
    let url = "/api/symbol-crops/export?quality=all";
    if (planId) url += `&plan_id=${planId}`;
    if (symbolType !== "all") url += `&symbol_type=${symbolType}`;
    if (qualityStatus !== "all") url += `&quality=${qualityStatus}`;
    return url;
  };

  // Helper lists for types
  const symbolTypes = ["all", "socket", "light", "switch", "distribution_box", "junction_box", "sensor", "heater", "other"];

  const totalPages = Math.ceil(totalItems / limit) || 1;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Banner linking to Prototype Library Manager V1 */}
        <div className="bg-gradient-to-r from-cyan-900/40 via-blue-900/40 to-slate-900 border border-cyan-500/40 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg shadow-cyan-500/10">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold">
              ★
            </div>
            <div>
              <h2 className="text-sm font-bold text-cyan-300">Wdrożono Menedżera Biblioteki Prototypów V1 (Prototype Library Manager)</h2>
              <p className="text-xs text-slate-300">
                Głównym źródłem wyszukiwania w systemie jest teraz ręcznie weryfikowana biblioteka wzorców. Ten panel (Cropy Historyczne) pozostaje dostępny wyłącznie do wglądu w archiwalne dane.
              </p>
            </div>
          </div>
          <a
            href="/admin/prototype-library"
            className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold rounded-xl shadow-md transition-all whitespace-nowrap"
          >
            Przejdź do Biblioteki Prototypów →
          </a>
        </div>

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
              Panel Inspekcji Cropów Symboli (Archiwum Legacy)
            </h1>
            <p className="text-slate-400 mt-1">
              Archiwalny podgląd wyciętych symboli z planów PDF
            </p>
          </div>
          <a
            href={getExportUrl()}
            download
            className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium rounded-lg shadow-lg hover:shadow-indigo-500/20 transition-all flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Eksportuj Dataset (JSONL)
          </a>
        </div>

        {/* Stats Summary Dashboard */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl shadow-md">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Wszystkie Cropy</span>
            <span className="text-3xl font-bold text-slate-200 block mt-1">{stats.total}</span>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl shadow-md border-l-4 border-l-emerald-400">
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider block">✅ Manualne (Ground Truth)</span>
            <span className="text-3xl font-bold text-emerald-300 block mt-1">{(stats as any).approved ?? 0}</span>
            <span className="text-xs text-slate-500 mt-1 block">quality_status = approved</span>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl shadow-md border-l-4 border-l-cyan-500">
            <span className="text-xs font-semibold text-cyan-500 uppercase tracking-wider block">🤖 AI Passed</span>
            <span className="text-3xl font-bold text-cyan-400 block mt-1">{stats.passed}</span>
            <span className="text-xs text-slate-500 mt-1 block">quality_status = passed</span>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl shadow-md border-l-4 border-l-rose-500">
            <span className="text-xs font-semibold text-rose-500 uppercase tracking-wider block">❌ Odrzucone / Negatywne</span>
            <span className="text-3xl font-bold text-rose-400 block mt-1">{stats.failed}</span>
            <span className="text-xs text-slate-500 mt-1 block">quality_status = failed</span>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl shadow-md border-l-4 border-l-blue-500">
            <span className="text-xs font-semibold text-blue-500 uppercase tracking-wider block">Średnia Jakość (Score)</span>
            <span className="text-3xl font-bold text-blue-400 block mt-1">{(stats.average_quality * 100).toFixed(1)}%</span>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px] space-y-1.5">
            <label className="text-xs font-medium text-slate-400 block">Wybierz Plan PDF</label>
            <select
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2 text-slate-300 focus:outline-none focus:border-blue-500"
            >
              <option value="">Wszystkie plany</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>{formatPlanTitle(p)}</option>
              ))}
            </select>
          </div>

          <div className="w-full sm:w-[160px] space-y-1.5">
            <label className="text-xs font-medium text-slate-400 block">Typ Symbolu</label>
            <select
              value={symbolType}
              onChange={(e) => setSymbolType(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2 text-slate-300 focus:outline-none focus:border-blue-500 capitalize"
            >
              {symbolTypes.map((t) => (
                <option key={t} value={t}>{t === "all" ? "Wszystkie typy" : t}</option>
              ))}
            </select>
          </div>

          <div className="w-full sm:w-[160px] space-y-1.5">
            <label className="text-xs font-medium text-slate-400 block">Jakość (Quality)</label>
            <select
              value={qualityStatus}
              onChange={(e) => setQualityStatus(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2 text-slate-300 focus:outline-none focus:border-blue-500"
            >
              <option value="all">Wszystkie statusy</option>
              <option value="approved">Manualne (Ground Truth)</option>
              <option value="passed">AI Passed</option>
              <option value="failed">Odrzucone (Failed)</option>
            </select>
          </div>

          <div className="w-full sm:w-[160px] space-y-1.5">
            <label className="text-xs font-medium text-slate-400 block">Status Embeddings</label>
            <select
              value={embeddingStatus}
              onChange={(e) => setEmbeddingStatus(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2 text-slate-300 focus:outline-none focus:border-blue-500"
            >
              <option value="all">Wszystkie statusy</option>
              <option value="pending">Oczekujące (Pending)</option>
              <option value="completed">Gotowe (Completed)</option>
            </select>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="bg-rose-950/50 border border-rose-800/80 text-rose-300 p-4 rounded-lg">
            {error}
          </div>
        )}

        {/* Loading overlay or Empty grid */}
        {isLoading ? (
          <div className="flex justify-center items-center py-24">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div>
          </div>
        ) : crops.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 text-center py-16 rounded-xl">
            <svg className="w-12 h-12 text-slate-600 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-slate-400 mt-4 text-lg">Nie znaleziono żadnych cropów pasujących do filtrów.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Grid of Crops */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {crops.map((crop) => {
                const metadata = crop.metadata || {};
                const status = crop.quality_status || "failed";
                const isApproved = status === "approved";
                const isPassed = status === "passed";
                const rawScore = Number(crop.quality_score || 0);
                const displayScore = Math.min(100, Math.max(0, rawScore > 1 ? rawScore : rawScore * 100)).toFixed(1);
                
                return (
                  <motion.div
                    key={crop.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-md flex flex-col group hover:border-slate-700 transition-all"
                  >
                    {/* Crop Image Display */}
                    <div className="bg-slate-950 aspect-square w-full relative flex items-center justify-center border-b border-slate-800 overflow-hidden">
                      <img
                        src={`/api/symbol-crops/image?path=${crop.image_path}`}
                        alt={`Crop ${crop.symbol_type}`}
                        className="w-full h-full object-contain group-hover:scale-105 transition-all duration-300"
                        loading="lazy"
                      />
                      
                      {/* Quality Badge overlays */}
                      <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded shadow-sm ${
                          isApproved 
                            ? "bg-emerald-950/90 border border-emerald-700 text-emerald-300" 
                            : isPassed 
                            ? "bg-cyan-950/90 border border-cyan-700 text-cyan-300" 
                            : "bg-rose-950/90 border border-rose-700 text-rose-300"
                        }`}>
                          {isApproved ? "GROUND TRUTH" : isPassed ? "AI PASSED" : "FAILED"}
                        </span>
                        
                        <span className="text-[10px] font-mono font-bold bg-slate-950/80 border border-slate-800 text-slate-300 px-1.5 py-0.5 rounded">
                          {displayScore}%
                        </span>
                      </div>
                    </div>

                    {/* Metadata Card Info */}
                    <div className="p-4 flex-1 flex flex-col justify-between space-y-4">
                      <div className="space-y-2">
                        <div className="flex justify-between items-start">
                          <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider block">
                            {formatPlanTitle(crop.plans)}
                          </span>
                        </div>
                        
                        <h3 className="font-bold text-slate-200 text-lg capitalize flex items-center gap-2">
                          <span className="inline-block w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
                          {crop.symbol_type}
                        </h3>

                        {/* Specs Table */}
                        {(() => {
                          const isEdv = (crop.symbol_type || "").toLowerCase().includes("edv") ||
                                        (crop.symbol_type || "").toLowerCase().includes("patch") ||
                                        (crop.symbol_type || "").toLowerCase().includes("data");
                          const edv = parseEdvDetails(metadata.circuit_code || crop.clip_prompt?.circuit_code);

                          if (isEdv) {
                            return (
                              <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-xs pt-1">
                                <div className="text-slate-400 font-medium">Vollständiger Name:</div>
                                <div className="text-cyan-400 font-mono font-bold">{edv.fullName}</div>

                                <div className="text-slate-400 font-medium">EDV Patchfeld:</div>
                                <div className="text-slate-200 font-mono">{edv.patchfield}</div>

                                <div className="text-slate-400 font-medium">Port 1:</div>
                                <div className="text-slate-200 font-mono">{edv.port1}</div>

                                {edv.port2 && (
                                  <>
                                    <div className="text-slate-400 font-medium">Port 2:</div>
                                    <div className="text-slate-200 font-mono">{edv.port2}</div>
                                  </>
                                )}
                              </div>
                            );
                          }

                          return (
                            <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-xs pt-1">
                              <div className="text-slate-400 font-medium">Obwód:</div>
                              <div className="text-slate-200 font-mono">{metadata.circuit_code || "-"}</div>
                              
                              <div className="text-slate-400 font-medium">Bezpiecznik:</div>
                              <div className="text-slate-200">{metadata.breaker_curve || ""}{metadata.breaker_current || "-"}</div>
                              
                              <div className="text-slate-400 font-medium">Kabel:</div>
                              <div className="text-slate-200 truncate" title={metadata.kabeltyp}>{metadata.kabeltyp || "-"}</div>
                              
                              <div className="text-slate-400 font-medium">Faza:</div>
                              <div className="text-slate-200">{metadata.phase || "-"}</div>
                            </div>
                          );
                        })()}
                      </div>

                      {/* Coordinates & Technical details */}
                      <div className="border-t border-slate-800/80 pt-3 flex flex-col gap-1 text-[10px] font-mono text-slate-500">
                        <div className="flex justify-between">
                          <span>X: {Number(metadata.x_norm || 0).toFixed(4)}</span>
                          <span>Y: {Number(metadata.y_norm || 0).toFixed(4)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>DPI: {metadata.dpi || 150}</span>
                          <span>Edge: {Number(metadata.edge_density || 0).toFixed(4)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Status: {crop.embedding_status}</span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Pagination Controls */}
            <div className="flex justify-between items-center bg-slate-900 border border-slate-800 px-5 py-4 rounded-xl">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 border border-slate-800 bg-slate-950 text-slate-300 text-sm font-medium rounded-lg hover:bg-slate-900 disabled:opacity-40 disabled:hover:bg-slate-950 transition-colors"
              >
                Poprzednia
              </button>
              
              <span className="text-sm font-medium text-slate-400">
                Strona {page} z {totalPages} (łącznie {totalItems} cropów)
              </span>

              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 border border-slate-800 bg-slate-950 text-slate-300 text-sm font-medium rounded-lg hover:bg-slate-900 disabled:opacity-40 disabled:hover:bg-slate-950 transition-colors"
              >
                Następna
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
