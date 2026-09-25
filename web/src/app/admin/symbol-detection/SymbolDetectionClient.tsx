"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPost, getToken } from "@/lib/apiClient";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";

const SymbolDetectionMap = dynamic(
  () => import("@/components/SymbolDetectionMap"),
  { ssr: false }
);

interface Plan {
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

function formatPlanTitle(plan?: Plan | null): string {
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

interface Prediction {
  id: string;
  plan_id: string;
  x_norm: number;
  y_norm: number;
  predicted_symbol_type: string;
  predicted_circuit_code: string | null;
  confidence: number;
  matched_crop_id: string | null;
  status: string;
  metadata: any;
  created_at: string;
}

export default function SymbolDetectionClient() {
  const router = useRouter();

  // State
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isLoadingPlans, setIsLoadingPlans] = useState(true);
  const [isLoadingPredictions, setIsLoadingPredictions] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedPred, setSelectedPred] = useState<Prediction | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState("pending");
  const [typeFilter, setTypeFilter] = useState("all");
  const [minConfidence, setMinConfidence] = useState(0.80);

  useEffect(() => {
    loadPlans();
  }, []);

  useEffect(() => {
    if (selectedPlanId) {
      loadPredictions(selectedPlanId);
    } else {
      setPredictions([]);
    }
    setSelectedPred(null);
  }, [selectedPlanId]);

  async function loadPlans() {
    setIsLoadingPlans(true);
    setError(null);
    try {
      const token = await getToken();
      setAuthToken(token);
      if (!token) {
        router.replace("/auth/login");
        return;
      }
      
      // Load plans through symbol-crops index lists or standard plans API
      const cropsRes = await apiGet<{ plans: Plan[] }>("/api/symbol-crops?limit=1", token);
      if (cropsRes && cropsRes.plans) {
        setPlans(cropsRes.plans);
        if (cropsRes.plans.length > 0) {
          setSelectedPlanId(cropsRes.plans[0].id);
        }
      }
    } catch (err: any) {
      setError("Błąd ładowania planów: " + err.message);
    } finally {
      setIsLoadingPlans(false);
    }
  }

  async function loadPredictions(planId: string) {
    setIsLoadingPredictions(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) return;

      const preds = await apiGet<Prediction[]>(`/api/symbol-detection/${planId}`, token);
      setPredictions(preds || []);
    } catch (err: any) {
      setError("Błąd ładowania sugestii: " + err.message);
    } finally {
      setIsLoadingPredictions(false);
    }
  }

  async function handleRunScan() {
    if (!selectedPlanId) return;
    setIsScanning(true);
    setError(null);
    setSuccess(null);
    try {
      const token = await getToken();
      if (!token) return;

      await apiPost("/api/symbol-detection/run", { plan_id: selectedPlanId }, token);
      setSuccess("Uruchomiono analizę automatyczną w tle! Dane odświeżą się za chwilę.");
      
      // Poll predictions list after 8 seconds
      setTimeout(() => {
        loadPredictions(selectedPlanId);
        setIsScanning(false);
      }, 8000);
    } catch (err: any) {
      setError("Błąd uruchamiania skanowania: " + err.message);
      setIsScanning(false);
    }
  }

  async function handlePredictionAction(predictionId: string, action: "approve" | "reject") {
    setError(null);
    setSuccess(null);
    try {
      const token = await getToken();
      if (!token) return;

      const res = (await apiPost("/api/symbol-detection/approve", {
        prediction_id: predictionId,
        action
      }, token)) as any;

      if (res && res.ok) {
        setSuccess(action === "approve" ? "Zatwierdzono symbol! Utworzono marker." : "Odrzucono sugestię.");
        setSelectedPred(null);
        // Refresh predictions list
        loadPredictions(selectedPlanId);
      }
    } catch (err: any) {
      setError("Błąd zapisu decyzji: " + err.message);
    }
  }

  // Filter computations
  const filteredPredictions = predictions.filter((p) => {
    const matchesStatus = statusFilter === "all" || p.status === statusFilter;
    const matchesType = typeFilter === "all" || p.predicted_symbol_type === typeFilter;
    const matchesConfidence = p.confidence >= minConfidence;
    return matchesStatus && matchesType && matchesConfidence;
  });

  // Confidence color mapper
  const getMarkerColor = (confidence: number) => {
    if (confidence >= 0.90) return "bg-emerald-500 ring-emerald-300";
    if (confidence >= 0.80) return "bg-amber-500 ring-amber-300";
    return "bg-rose-500 ring-rose-300";
  };

  const getMarkerBorder = (confidence: number) => {
    if (confidence >= 0.90) return "border-emerald-500";
    if (confidence >= 0.80) return "border-amber-500";
    return "border-rose-500";
  };

  const uniqueSymbolTypes = Array.from(new Set(predictions.map((p) => p.predicted_symbol_type)));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
              Automatyczna Detekcja Symboli
            </h1>
            <p className="text-slate-400 mt-1">
              Rozpoznawanie symboli elektrycznych za pomocą RAG/CLIP oraz inteligencji współrzędnych
            </p>
          </div>
          <button
            onClick={handleRunScan}
            disabled={!selectedPlanId || isScanning}
            className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 disabled:opacity-50 text-white font-medium rounded-lg shadow-lg hover:shadow-cyan-500/20 transition-all flex items-center gap-2"
          >
            {isScanning ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Skanowanie PDF w toku...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Uruchom Skanowanie AI
              </>
            )}
          </button>
        </div>

        {/* Filters & Selector Bar */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[220px] space-y-1.5">
            <label className="text-xs font-medium text-slate-400 block">Wybierz Plan PDF</label>
            <select
              value={selectedPlanId}
              onChange={(e) => setSelectedPlanId(e.target.value)}
              disabled={isLoadingPlans}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2 text-slate-300 focus:outline-none focus:border-cyan-500"
            >
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {formatPlanTitle(p)}
                </option>
              ))}
            </select>
          </div>

          <div className="w-full sm:w-[150px] space-y-1.5">
            <label className="text-xs font-medium text-slate-400 block">Status sugestii</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2 text-slate-300 focus:outline-none focus:border-cyan-500"
            >
              <option value="all">Wszystkie</option>
              <option value="pending">Oczekujące (Pending)</option>
              <option value="approved">Zatwierdzone</option>
              <option value="rejected">Odrzucone</option>
            </select>
          </div>

          <div className="w-full sm:w-[150px] space-y-1.5">
            <label className="text-xs font-medium text-slate-400 block">Typ Symbolu</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2 text-slate-300 focus:outline-none focus:border-cyan-500 capitalize"
            >
              <option value="all">Wszystkie typy</option>
              {uniqueSymbolTypes.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div className="w-full sm:w-[180px] space-y-1.5">
            <label className="text-xs font-medium text-slate-400 block">Min. Pewność: {(minConfidence * 100).toFixed(0)}%</label>
            <input
              type="range"
              min="0.50"
              max="0.99"
              step="0.01"
              value={minConfidence}
              onChange={(e) => setMinConfidence(parseFloat(e.target.value))}
              className="w-full accent-cyan-500 h-2 bg-slate-800 rounded-lg cursor-pointer"
            />
          </div>
        </div>

        {/* Feedback alerts */}
        {error && <div className="bg-rose-950/50 border border-rose-800 text-rose-300 p-4 rounded-lg">{error}</div>}
        {success && <div className="bg-emerald-950/50 border border-emerald-800 text-emerald-300 p-4 rounded-lg">{success}</div>}

        {/* Interactive Viewer Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          
          {/* Plan Canvas (Map View) */}
          <div className="lg:col-span-3 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl flex flex-col relative">
            <div className="bg-slate-950 border-b border-slate-800 px-4 py-3 flex justify-between items-center text-sm font-medium">
              <span className="text-slate-400">Podgląd Planu ze znacznikami AI</span>
              <span className="text-cyan-400">{filteredPredictions.length} wykrytych punktów</span>
            </div>
            
            {/* Leaflet Tile Map Container */}
            <div className="p-3 bg-slate-950">
              {selectedPlanId ? (
                <SymbolDetectionMap
                  planId={selectedPlanId}
                  token={authToken}
                  predictions={filteredPredictions}
                  selectedPrediction={selectedPred}
                  onSelectPrediction={(pred) => setSelectedPred(pred)}
                />
              ) : (
                <div className="py-24 text-center text-slate-500">Wybierz plan z listy rozwijanej, aby wyświetlić mapę detekcji.</div>
              )}
            </div>
          </div>

          {/* Inspector sidebar (Marker Popups/Actions) */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-5">
            <h2 className="text-lg font-bold border-b border-slate-800 pb-3 text-slate-200">Inspektor detekcji</h2>
            
            <AnimatePresence mode="wait">
              {selectedPred ? (
                <motion.div
                  key={selectedPred.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-4"
                >
                  <div className={`p-4 border rounded-lg bg-slate-950/60 ${getMarkerBorder(selectedPred.confidence)}`}>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase font-mono">Dopasowano AI</span>
                      <span className="text-xs font-mono font-bold bg-slate-900 px-2 py-0.5 rounded text-slate-300">
                        {(selectedPred.confidence * 100).toFixed(1)}%
                      </span>
                    </div>

                    <h3 className="text-xl font-black capitalize text-slate-100 mt-2">
                      {selectedPred.predicted_symbol_type}
                    </h3>
                    
                    <div className="grid grid-cols-2 gap-y-1.5 text-xs text-slate-400 mt-3.5 border-t border-slate-800/80 pt-3">
                      <div>Status sugestii:</div>
                      <div className="font-bold text-slate-300 capitalize">{selectedPred.status}</div>

                      <div>Algorytm:</div>
                      <div className="font-mono">{selectedPred.metadata?.algorithm || "NMS_CLIP"}</div>

                      <div>Rozmiar cropu:</div>
                      <div>{selectedPred.metadata?.crop_size || "256"}px</div>

                      <div>X (norm):</div>
                      <div className="font-mono">{(selectedPred.x_norm).toFixed(4)}</div>

                      <div>Y (norm):</div>
                      <div className="font-mono">{(selectedPred.y_norm).toFixed(4)}</div>
                    </div>
                  </div>

                  {/* Actions for pending prediction */}
                  {selectedPred.status === "pending" ? (
                    <div className="flex gap-3">
                      <button
                        onClick={() => handlePredictionAction(selectedPred.id, "approve")}
                        className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 font-semibold rounded-lg text-white shadow transition-colors flex justify-center items-center gap-1.5"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                        Zatwierdź
                      </button>
                      <button
                        onClick={() => handlePredictionAction(selectedPred.id, "reject")}
                        className="flex-1 py-2.5 bg-rose-950 border border-rose-800 hover:bg-rose-900 font-semibold rounded-lg text-rose-300 transition-colors flex justify-center items-center gap-1.5"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Odrzuć
                      </button>
                    </div>
                  ) : (
                    <div className="text-center text-xs text-slate-500 py-2">
                      Decyzja zapisana jako: <span className="font-bold text-slate-400 uppercase">{selectedPred.status}</span>
                    </div>
                  )}
                </motion.div>
              ) : (
                <div className="text-center py-12 text-slate-500 text-sm border border-dashed border-slate-800 rounded-lg">
                  Kliknij dowolny znacznik na planie, aby obejrzeć szczegóły i zatwierdzić.
                </div>
              )}
            </AnimatePresence>
          </div>

        </div>

      </div>
    </div>
  );
}
