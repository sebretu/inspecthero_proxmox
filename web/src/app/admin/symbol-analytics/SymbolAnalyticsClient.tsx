"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPost, getToken } from "@/lib/apiClient";
import { motion } from "framer-motion";

interface DatasetStats {
  total: number;
  passed: number;
  failed: number;
  average_quality: number;
  embedding_coverage: number;
  types: Record<string, number>;
}

interface BenchmarkMetrics {
  total_predictions: number;
  total_reviewed: number;
  approved_count: number;
  rejected_count: number;
  approved_rate: number;
  rejected_rate: number;
  average_confidence: number;
  approval_by_symbol: Record<string, { total: number; approved: number; rate: number }>;
  false_positives: number;
  false_negatives: number;
}

interface DatasetVersion {
  id: string;
  version: string;
  git_commit: string;
  embedding_model: string;
  symbol_count: number;
  plan_count: number;
  export_path: string;
  created_at: string;
}

interface ClusteringStats {
  totalCrops: number;
  totalClusters: number;
  outliersCount: number;
  mislabeledCount: number;
}

export default function SymbolAnalyticsClient() {
  const router = useRouter();

  // Data State
  const [stats, setStats] = useState<DatasetStats | null>(null);
  const [benchmark, setBenchmark] = useState<BenchmarkMetrics | null>(null);
  const [versions, setVersions] = useState<DatasetVersion[]>([]);
  const [clusteringStats, setClusteringStats] = useState<ClusteringStats | null>(null);

  // Loading & Error States
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessingAction, setIsProcessingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadAllData();
  }, []);

  async function loadAllData() {
    setIsLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) {
        router.replace("/auth/login");
        return;
      }

      // Fetch stats
      const s = await apiGet<DatasetStats>("/api/symbol-crops/stats", token);
      setStats(s);

      // Fetch benchmark
      const b = await apiGet<BenchmarkMetrics>("/api/symbol-detection/benchmark", token);
      setBenchmark(b);

      // Fetch versions
      const vRes = (await apiPost("/api/admin/maintenance", { action: "dataset_versions" }, token)) as any;
      if (vRes && vRes.versions) {
        setVersions(vRes.versions);
      }
    } catch (err: any) {
      setError("Błąd ładowania danych analitycznych: " + err.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function triggerMaintenance(action: string, payload = {}) {
    setIsProcessingAction(action);
    setError(null);
    setSuccess(null);
    try {
      const token = await getToken();
      if (!token) return;

      const res = (await apiPost("/api/admin/maintenance", { action, ...payload }, token)) as any;
      if (res && res.ok) {
        if (action === "cluster") {
          setClusteringStats(res.stats);
          setSuccess(`Ukończono klasteryzację! Utworzono ${res.stats.totalClusters} klastrów.`);
        } else if (action === "vacuum") {
          setSuccess(`Baza danych zoptymalizowana! Liczba wektorów: ${res.stats.count}.`);
        } else if (action === "process_queue") {
          setSuccess(`Kolejka przetworzona! Wygenerowano osadzenia dla ${res.processed} wycinków.`);
        }
        await loadAllData(); // Refresh state
      }
    } catch (err: any) {
      setError("Błąd wykonania akcji serwisowej: " + err.message);
    } finally {
      setIsProcessingAction(null);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
          <span className="text-slate-400 text-sm">Ładowanie analiz AI...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-teal-400 to-indigo-400 bg-clip-text text-transparent">
              Centrum Analityki i Samouczenia AI
            </h1>
            <p className="text-slate-400 mt-1">
              Monitorowanie jakości, wersjonowanie zestawów danych oraz optymalizacja wektorów wyszukiwania
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => triggerMaintenance("process_queue")}
              disabled={isProcessingAction !== null}
              className="px-4 py-2 bg-indigo-900/60 hover:bg-indigo-900 border border-indigo-700 text-indigo-300 font-medium rounded-lg text-sm transition-all"
            >
              {isProcessingAction === "process_queue" ? "Generowanie..." : "Uruchom Kolejkę Embeddingów"}
            </button>
            <button
              onClick={() => triggerMaintenance("cluster")}
              disabled={isProcessingAction !== null}
              className="px-4 py-2 bg-cyan-900/60 hover:bg-cyan-900 border border-cyan-700 text-cyan-300 font-medium rounded-lg text-sm transition-all"
            >
              {isProcessingAction === "cluster" ? "Klasteryzacja..." : "Grupuj Symbole (Clustering)"}
            </button>
            <button
              onClick={() => triggerMaintenance("vacuum")}
              disabled={isProcessingAction !== null}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-lg text-sm transition-all"
            >
              {isProcessingAction === "vacuum" ? "Optymalizacja..." : "Uruchom Vacuum Index"}
            </button>
          </div>
        </div>

        {/* Feedback alerts */}
        {error && <div className="bg-rose-950/50 border border-rose-800 text-rose-300 p-4 rounded-lg text-sm">{error}</div>}
        {success && <div className="bg-emerald-950/50 border border-emerald-800 text-emerald-300 p-4 rounded-lg text-sm">{success}</div>}

        {/* Dashboard Grid Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Rozmiar Datasetu</span>
            <div className="text-3xl font-black text-slate-100">{stats?.total || 0}</div>
            <div className="text-xs text-slate-400">
              <span className="text-emerald-400 font-bold">{stats?.passed || 0}</span> zweryfikowanych • <span className="text-rose-400 font-bold">{stats?.failed || 0}</span> odrzuconych
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Pokrycie Embeddingami</span>
            <div className="text-3xl font-black text-indigo-400">
              {stats?.embedding_coverage ? (stats.embedding_coverage * 100).toFixed(0) : 0}%
            </div>
            <div className="text-xs text-slate-400 block h-1 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="bg-indigo-400 h-full"
                style={{ width: `${(stats?.embedding_coverage || 0) * 100}%` }}
              ></div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Skuteczność AI (Akceptacje)</span>
            <div className="text-3xl font-black text-emerald-400">
              {benchmark?.approved_rate || 0}%
            </div>
            <div className="text-xs text-slate-400">
              Na podstawie {benchmark?.total_reviewed || 0} sprawdzonych sugestii
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Średnia Pewność AI</span>
            <div className="text-3xl font-black text-cyan-400">
              {benchmark?.average_confidence || 0}%
            </div>
            <div className="text-xs text-slate-400">
              Dla wszystkich zidentyfikowanych symboli
            </div>
          </div>
        </div>

        {/* Clustering Results & Anomalies Section */}
        {clusteringStats && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <h2 className="text-lg font-bold text-slate-200 border-b border-slate-800 pb-3 flex items-center gap-2">
              <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
              Wyniki Grupowania Symboli (Clustering Stats)
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div className="bg-slate-950 p-4 rounded-lg">
                <div className="text-sm font-bold text-slate-400">Klastry</div>
                <div className="text-2xl font-black text-slate-100">{clusteringStats.totalClusters}</div>
              </div>
              <div className="bg-slate-950 p-4 rounded-lg">
                <div className="text-sm font-bold text-slate-400">Wartości Odstające (Outliers)</div>
                <div className="text-2xl font-black text-amber-500">{clusteringStats.outliersCount}</div>
              </div>
              <div className="bg-slate-950 p-4 rounded-lg">
                <div className="text-sm font-bold text-slate-400">Błędne Etykiety (Mislabeled)</div>
                <div className="text-2xl font-black text-rose-500">{clusteringStats.mislabeledCount}</div>
              </div>
              <div className="bg-slate-950 p-4 rounded-lg">
                <div className="text-sm font-bold text-slate-400">Sprawdzone</div>
                <div className="text-2xl font-black text-emerald-500">{clusteringStats.totalCrops}</div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Symbol benchmark list & FP rate */}
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <h2 className="text-lg font-bold text-slate-200 border-b border-slate-800 pb-3 flex justify-between items-center">
              <span>Metryki Wyszukiwania wg Typu</span>
              <span className="text-xs font-medium px-2 py-0.5 bg-rose-950 text-rose-300 border border-rose-800 rounded">
                Fałszywe Alarmy: {benchmark?.false_positives || 0} (FP)
              </span>
            </h2>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead>
                  <tr className="border-b border-slate-850 text-slate-400 font-medium">
                    <th className="py-2.5">Typ Symbolu</th>
                    <th className="py-2.5">Liczba Zapytań</th>
                    <th className="py-2.5">Zatwierdzone</th>
                    <th className="py-2.5 text-right">Skuteczność (Approval Rate)</th>
                  </tr>
                </thead>
                <tbody>
                  {benchmark && Object.entries(benchmark.approval_by_symbol).length > 0 ? (
                    Object.entries(benchmark.approval_by_symbol).map(([symbol, data]) => (
                      <tr key={symbol} className="border-b border-slate-850 hover:bg-slate-950/40">
                        <td className="py-3 font-semibold capitalize text-slate-100">{symbol}</td>
                        <td className="py-3 font-mono">{data.total}</td>
                        <td className="py-3 font-mono text-emerald-400">{data.approved}</td>
                        <td className="py-3 font-mono text-right text-cyan-400 font-bold">{data.rate}%</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-slate-500">Brak danych historycznych ocen.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Dataset Version List */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <h2 className="text-lg font-bold text-slate-200 border-b border-slate-800 pb-3">Wersje Zbiorów Treningowych</h2>
            
            <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
              {versions.length > 0 ? (
                versions.map((ver) => (
                  <div key={ver.id} className="p-3.5 bg-slate-950/50 border border-slate-850 rounded-lg space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold font-mono text-cyan-400">{ver.version}</span>
                      <span className="text-[10px] text-slate-500">{new Date(ver.created_at).toLocaleDateString()}</span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-y-1 text-xs text-slate-400">
                      <div>Liczba Symboli:</div>
                      <div className="font-mono text-right text-slate-200">{ver.symbol_count}</div>
                      <div>Wersje PDF:</div>
                      <div className="font-mono text-right text-slate-200">{ver.plan_count}</div>
                      <div>Model:</div>
                      <div className="text-right truncate max-w-[120px]">{ver.embedding_model}</div>
                      <div>Git commit:</div>
                      <div className="font-mono text-right text-slate-300 truncate max-w-[120px]" title={ver.git_commit}>
                        {ver.git_commit.slice(0, 7)}
                      </div>
                    </div>

                    <a
                      href={ver.export_path}
                      download
                      className="block w-full py-1 text-center bg-slate-800 hover:bg-slate-700 text-[11px] font-bold rounded mt-2 transition-colors"
                    >
                      Pobierz NDJSON
                    </a>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 text-slate-500 text-sm">
                  Brak wyeksportowanych wersji. Kliknij "Eksportuj" w panelu zbioru danych.
                </div>
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
