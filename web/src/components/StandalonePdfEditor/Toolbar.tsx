"use client";

import React from "react";
import { MousePointer2, Type, Trash2, Zap, Palette, ArrowDownToLine, FileUp, Scissors } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";

export type EditorMode = "select" | "addText" | "addSymbol" | "cut" | "copy";
export type SymbolType = "socket" | "light" | "edv" | "cee" | "special" | "reserve";

interface ToolbarProps {
  mode: EditorMode;
  setMode: (m: EditorMode) => void;
  selectedId: string | null;
  onDeleteSelected: () => void;
  textColor: string;
  setTextColor: (c: string) => void;
  symbolType: SymbolType;
  setSymbolType: (s: SymbolType) => void;
  onExport: () => void;
  isExporting: boolean;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  zoom: number;
  setZoom: (z: number | ((prev: number) => number)) => void;
  sessionsList?: any[];
  currentSessionId?: string | null;
  onLoadSession?: (session: any) => void;
  onDeleteSession?: (id: string) => void;
  isUploading?: boolean;
  isSaving?: boolean;
}

export default function Toolbar({
  mode,
  setMode,
  selectedId,
  onDeleteSelected,
  textColor,
  setTextColor,
  symbolType,
  setSymbolType,
  onExport,
  isExporting,
  onFileChange,
  zoom,
  setZoom,
  sessionsList = [],
  currentSessionId,
  onLoadSession,
  onDeleteSession,
  isUploading,
  isSaving,
}: ToolbarProps) {
  const { t } = useLanguage();

  const symbolOptions: { type: SymbolType; label: string }[] = [
    { type: "socket", label: t("aufmass", "socket", "Gniazdko (Socket)") },
    { type: "light", label: t("aufmass", "light", "Światło (Light)") },
    { type: "edv", label: "EDV" },
    { type: "cee", label: "CEE" },
    { type: "special", label: t("aufmass", "special", "Specjalne") },
    { type: "reserve", label: t("aufmass", "reserve", "Rezerwa") },
  ];

  const colors = ["#000000", "#dc2626", "#2563eb", "#16a34a", "#d97706", "#8b5cf6"];

  return (
    <div className="w-72 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 p-5 flex flex-col h-full overflow-y-auto shrink-0 shadow-sm z-10 relative">
      <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-gray-800 dark:text-gray-100">
        <Zap className="text-yellow-500" /> {t("nav", "pdfEditor", "Edytor PDF")}
      </h2>

      {/* Wybór pliku */}
      <div className="mb-8">
        <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">
          1. {t("common", "myFiles", "Moje pliki (Chmura)")}
        </label>
        
        {sessionsList.length > 0 && (
          <div className="mb-3 flex flex-col gap-2 max-h-40 overflow-y-auto pr-1">
            {sessionsList.map(session => (
              <div key={session.id} className={`flex items-center justify-between p-2 rounded-lg border text-sm transition ${currentSessionId === session.id ? 'bg-blue-50 border-blue-300 dark:bg-blue-900/30 dark:border-blue-700' : 'bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700 hover:border-gray-300'}`}>
                <button 
                  onClick={() => onLoadSession && onLoadSession(session)}
                  className="flex-1 text-left truncate pr-2 font-medium text-gray-700 dark:text-gray-300"
                  title={session.name}
                >
                  {session.name}
                </button>
                <button 
                  onClick={() => onDeleteSession && onDeleteSession(session.id)}
                  className="text-gray-400 hover:text-red-500 transition"
                  title="Usuń plik"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}

        <label className={`cursor-pointer flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border font-medium transition ${isUploading ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/50'}`}>
          <FileUp size={18} />
          {isUploading ? "Wgrywanie..." : "Wgraj nowy PDF"}
          <input type="file" accept="application/pdf" className="hidden" onChange={onFileChange} disabled={isUploading} />
        </label>
        
        {isSaving && (
          <div className="mt-2 text-xs text-green-600 dark:text-green-400 font-medium animate-pulse flex items-center justify-center gap-1">
            <Zap size={12} /> Zapisywanie zmian w chmurze...
          </div>
        )}
      </div>

      {/* Narzędzia główne */}
      <div className="mb-8">
        <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">
          2. {t("common", "tools", "Narzędzia")}
        </label>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => setMode("select")}
            className={`flex items-center gap-3 p-2.5 rounded-lg text-left transition ${mode === "select" ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"}`}
          >
            <MousePointer2 size={18} /> {t("common", "selectMove", "Zaznacz / Przesuń")}
          </button>
          <button
            onClick={() => setMode("copy")}
            className={`flex items-center gap-3 p-2.5 rounded-lg text-left transition ${mode === "copy" ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 font-semibold" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"}`}
          >
            <Zap size={18} /> Kopiuj obszar
          </button>
          <button
            onClick={() => setMode("cut")}
            className={`flex items-center gap-3 p-2.5 rounded-lg text-left transition ${mode === "cut" ? "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 font-semibold" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"}`}
          >
            <Scissors size={18} /> {t("common", "cut", "Wytnij obszar")}
          </button>
          <button
            onClick={() => setMode("addText")}
            className={`flex items-center gap-3 p-2.5 rounded-lg text-left transition ${mode === "addText" ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"}`}
          >
            <Type size={18} /> {t("common", "addText", "Dodaj tekst")}
          </button>
          <button
            onClick={() => setMode("addSymbol")}
            className={`flex items-center gap-3 p-2.5 rounded-lg text-left transition ${mode === "addSymbol" ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"}`}
          >
            <Zap size={18} /> {t("common", "addSymbol", "Dodaj symbol elektryczny")}
          </button>
        </div>
      </div>

      {/* Opcje zależne od trybu */}
      {mode === "addText" && (
        <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700/50">
          <label className="block text-xs font-semibold mb-3 text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            {t("common", "textColor", "Kolor tekstu")}
          </label>
          <div className="flex flex-wrap gap-3">
            {colors.map((c) => (
              <button
                key={c}
                onClick={() => setTextColor(c)}
                className={`w-7 h-7 rounded-full border-2 transition-transform ${textColor === c ? "border-blue-500 scale-110 shadow-sm" : "border-transparent shadow-sm hover:scale-105"}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2">
            <Palette size={16} className="text-gray-400" />
            <input
              type="color"
              value={textColor}
              onChange={(e) => setTextColor(e.target.value)}
              className="w-full h-8 cursor-pointer rounded border-0 bg-transparent"
            />
          </div>
        </div>
      )}

      {mode === "addSymbol" && (
        <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700/50">
          <label className="block text-xs font-semibold mb-3 text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            {t("common", "symbolType", "Rodzaj symbolu")}
          </label>
          <select
            value={symbolType}
            onChange={(e) => setSymbolType(e.target.value as SymbolType)}
            className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
          >
            {symbolOptions.map((opt) => (
              <option key={opt.type} value={opt.type}>{opt.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Akcje na zaznaczonym elemencie */}
      {selectedId && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-100 dark:border-red-900/30">
          <label className="block text-xs font-semibold mb-3 text-red-700 dark:text-red-400 uppercase tracking-wider">
            {t("common", "selectedElement", "Zaznaczony element")}
          </label>
          <button
            onClick={onDeleteSelected}
            className="flex items-center justify-center gap-2 w-full p-2.5 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 font-medium rounded-lg hover:bg-red-200 dark:hover:bg-red-900/60 transition"
          >
            <Trash2 size={18} /> {t("common", "delete", "Usuń")}
          </button>
        </div>
      )}



      <div className="mt-auto pt-6">
        <label className="block text-sm font-semibold mb-3 text-gray-700 dark:text-gray-300">
          3. {t("common", "finish", "Zakończ")}
        </label>
        <button
          onClick={onExport}
          disabled={isExporting}
          className="flex items-center justify-center gap-2 w-full p-3 bg-green-600 dark:bg-green-500 text-white font-bold rounded-xl hover:bg-green-700 dark:hover:bg-green-600 transition disabled:opacity-50 shadow-sm"
        >
          {isExporting ? (
            t("common", "saving", "Zapisywanie...")
          ) : (
            <>
              <ArrowDownToLine size={18} /> {t("common", "exportPdf", "Eksportuj PDF")}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
