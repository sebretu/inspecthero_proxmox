"use client";

import React, { useState } from "react";
import Toolbar, { EditorMode, SymbolType } from "./Toolbar";
import PdfCanvas from "./PdfCanvas";
import { PdfSymbol, PdfText, PdfCutout, exportPdfWithEdits } from "../../lib/pdfEditorExport";
import { getToken, apiGet, apiPut, apiDelete } from "../../lib/apiClient";

export default function EditorContainer() {
  const [mode, setMode] = useState<EditorMode>("select");
  const [textColor, setTextColor] = useState<string>("#000000");
  const [symbolType, setSymbolType] = useState<SymbolType>("socket");
  
  const [texts, setTexts] = useState<PdfText[]>([]);
  const [symbols, setSymbols] = useState<PdfSymbol[]>([]);
  const [cutouts, setCutouts] = useState<PdfCutout[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  
  // Wymiary załadowanej strony PDF z react-pdf (żeby odpowiednio skalować zapis do wektorów)
  const [pdfDimensions, setPdfDimensions] = useState<{ width: number; height: number } | null>(null);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [zoom, setZoom] = useState<number>(1);
  
  // Zapisywanie sesji w chmurze
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionsList, setSessionsList] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Pobierz listę sesji na start
  React.useEffect(() => {
    let mounted = true;
    const init = async () => {
      try {
        const json = await apiGet<any>("/api/pdf-sessions");
        if (mounted) {
          const list = json || [];
          setSessionsList(list);
          
          if (list.length > 0 && !sessionId) {
            loadSession(list[0]);
          }
        }
      } catch (e) {
        console.error("Failed to fetch sessions", e);
      }
    };
    init();
    return () => { mounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadSession = async (session: any) => {
    setIsUploading(true);
    try {
      const res = await fetch(session.pdf_url);
      const blob = await res.blob();
      const file = new File([blob], session.name, { type: "application/pdf" });
      
      setPdfFile(file);
      setSessionId(session.id);
      setSymbols(session.symbols || []);
      setTexts(session.texts || []);
      setCutouts(session.cutouts || []);
      setZoom(session.zoom || 1);
      setPageNumber(session.page_number || 1);
      setSelectedId(null);
    } catch (e) {
      console.error(e);
      alert("Nie udało się załadować pliku sesji.");
    } finally {
      setIsUploading(false);
    }
  };

  const fetchSessionsListOnly = async () => {
    try {
      const list = await apiGet<any>("/api/pdf-sessions");
      setSessionsList(list || []);
    } catch (e) {}
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setPdfFile(file);
      setTexts([]);
      setSymbols([]);
      setCutouts([]);
      setSelectedId(null);
      setPageNumber(1);
      setZoom(1);
      
      // Upload do chmury
      setIsUploading(true);
      try {
        const token = await getToken();
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/pdf-sessions/upload", {
          method: "POST",
          body: formData,
          headers: token ? { "Authorization": `Bearer ${token}` } : {}
        });
        if (res.ok) {
          const json = await res.json();
          setSessionId(json.data.id);
          fetchSessionsListOnly();
        } else {
          throw new Error("Upload failed");
        }
      } catch (err) {
        console.error(err);
        alert("Błąd podczas wgrywania pliku do chmury.");
      } finally {
        setIsUploading(false);
      }
    }
  };

  const deleteSession = async (id: string) => {
    if (!confirm("Czy na pewno chcesz usunąć ten plik i wszystkie zmiany?")) return;
    try {
      await apiDelete(`/api/pdf-sessions/${id}`);
      if (sessionId === id) {
        setPdfFile(null);
        setSessionId(null);
        setSymbols([]);
        setTexts([]);
        setCutouts([]);
      }
      fetchSessionsListOnly();
    } catch (e) {
      console.error(e);
      alert("Błąd podczas usuwania.");
    }
  };

  // Auto-save debounced
  React.useEffect(() => {
    if (!sessionId) return;
    
    const timeout = setTimeout(async () => {
      setIsSaving(true);
      try {
        await apiPut(`/api/pdf-sessions/${sessionId}`, { symbols, texts, cutouts, zoom, page_number: pageNumber });
      } catch (e) {
        console.error("Autosave failed", e);
      } finally {
        setIsSaving(false);
      }
    }, 2000);
    
    return () => clearTimeout(timeout);
  }, [symbols, texts, cutouts, zoom, pageNumber, sessionId]);

  const handleDeleteSelected = () => {
    if (!selectedId) return;
    setTexts(texts.filter(t => t.id !== selectedId));
    setSymbols(symbols.filter(s => s.id !== selectedId));
    setCutouts(cutouts.filter(c => c.id !== selectedId));
    setSelectedId(null);
  };

  const handleExport = async () => {
    if (!pdfFile || !pdfDimensions) return;
    setIsExporting(true);
    try {
      alert(`Rozpoczynam eksport!\nStrona: ${pageNumber}\nSymbole: ${symbols.length}\nTeksty: ${texts.length}\nWycinki: ${cutouts.length}`);
      const arrayBuffer = await pdfFile.arrayBuffer();
      const newPdfBytes = await exportPdfWithEdits(arrayBuffer, symbols, texts, cutouts, pdfDimensions, pageNumber - 1);
      
      const blob = new Blob([newPdfBytes as any], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `edytowany_${pdfFile.name}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Błąd podczas eksportu:", error);
      alert("Nie udało się wyeksportować pliku PDF.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex w-full h-[calc(100vh-64px)] overflow-hidden bg-gray-50 text-gray-900">
      <Toolbar
        mode={mode}
        setMode={setMode}
        selectedId={selectedId}
        onDeleteSelected={handleDeleteSelected}
        textColor={textColor}
        setTextColor={setTextColor}
        symbolType={symbolType}
        setSymbolType={setSymbolType}
        onExport={handleExport}
        isExporting={isExporting}
        onFileChange={handleFileChange}
        zoom={zoom}
        setZoom={setZoom}
        sessionsList={sessionsList}
        currentSessionId={sessionId}
        onLoadSession={loadSession}
        onDeleteSession={deleteSession}
        isUploading={isUploading}
        isSaving={isSaving}
      />
      <PdfCanvas
        pdfFile={pdfFile}
        mode={mode}
        textColor={textColor}
        symbolType={symbolType}
        texts={texts}
        setTexts={setTexts}
        symbols={symbols}
        setSymbols={setSymbols}
        cutouts={cutouts}
        setCutouts={setCutouts}
        selectedId={selectedId}
        setSelectedId={setSelectedId}
        onPdfLoaded={(size) => setPdfDimensions(size)}
        pageNumber={pageNumber}
        setPageNumber={setPageNumber}
        zoom={zoom}
        setZoom={setZoom}
      />
    </div>
  );
}
