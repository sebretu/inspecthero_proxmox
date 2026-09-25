"use client";

import React, { useState, useRef, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Stage, Layer, Text, Rect, Group, Transformer, Image as KonvaImage } from "react-konva";
import Konva from "konva";
import { PdfSymbol, PdfText, PdfCutout } from "../../lib/pdfEditorExport";
import { EditorMode, SymbolType } from "./Toolbar";

// Worker configuration
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/legacy/build/pdf.worker.min.mjs`;

interface PdfCanvasProps {
  pdfFile: File | null;
  mode: EditorMode;
  textColor: string;
  symbolType: SymbolType;
  texts: PdfText[];
  setTexts: React.Dispatch<React.SetStateAction<PdfText[]>>;
  symbols: PdfSymbol[];
  setSymbols: React.Dispatch<React.SetStateAction<PdfSymbol[]>>;
  cutouts: PdfCutout[];
  setCutouts: React.Dispatch<React.SetStateAction<PdfCutout[]>>;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  onPdfLoaded: (size: { width: number; height: number }) => void;
  pageNumber: number;
  setPageNumber: (n: number | ((prev: number) => number)) => void;
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
}

// Komponent obrazka ładujący base64
function URLImage({
  cutout,
  isSelected,
  onSelect,
  onChange,
  isDraggable,
}: {
  cutout: PdfCutout;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (newAttrs: PdfCutout) => void;
  isDraggable: boolean;
}) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new window.Image();
    img.src = cutout.dataUrl;
    img.onload = () => setImage(img);
  }, [cutout.dataUrl]);

  return (
    <Group
      id={cutout.id}
      x={cutout.x}
      y={cutout.y}
      rotation={cutout.rotation}
      draggable={isDraggable}
      onClick={(e) => {
        e.cancelBubble = true;
        if (isDraggable) onSelect();
      }}
      onDragEnd={(e) => {
        onChange({ ...cutout, x: e.target.x(), y: e.target.y() });
      }}
      onTransformEnd={(e) => {
        const node = e.target;
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();
        node.scaleX(1);
        node.scaleY(1);
        onChange({
          ...cutout,
          x: node.x(),
          y: node.y(),
          rotation: node.rotation(),
          width: Math.max(5, node.width() * scaleX),
          height: Math.max(5, node.height() * scaleY),
        });
      }}
    >
      {image && <KonvaImage image={image} width={cutout.width} height={cutout.height} />}
      {isSelected && (
        <Rect
          width={cutout.width}
          height={cutout.height}
          stroke="#3b82f6"
          strokeWidth={2}
          dash={[5, 5]}
        />
      )}
    </Group>
  );
}

export default function PdfCanvas({
  pdfFile,
  mode,
  textColor,
  symbolType,
  texts,
  setTexts,
  symbols,
  setSymbols,
  cutouts,
  setCutouts,
  selectedId,
  setSelectedId,
  onPdfLoaded,
  pageNumber,
  setPageNumber,
  zoom,
  setZoom,
}: PdfCanvasProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pdfDimensions, setPdfDimensions] = useState<{ width: number; height: number }>({ width: 800, height: 1130 });

  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);

  const [fileUrl, setFileUrl] = useState<string | null>(null);
  
  // Stan dla narzędzia wycinania (Lasso)
  const [isLassoing, setIsLassoing] = useState(false);
  const [lassoStart, setLassoStart] = useState<{ x: number; y: number } | null>(null);
  const [lassoRect, setLassoRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  // Stan dla przesuwania (Pan) i Zooma
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pdfFile) {
      const url = URL.createObjectURL(pdfFile);
      setFileUrl(url);
    } else {
      setFileUrl(null);
    }
  }, [pdfFile]);

  // Wyśrodkowanie planu przy załadowaniu (gdy znamy wymiary)
  useEffect(() => {
    if (containerRef.current && pdfDimensions.width > 0) {
      const rect = containerRef.current.getBoundingClientRect();
      setPan({
        x: (rect.width - pdfDimensions.width * zoom) / 2,
        y: Math.max(32, (rect.height - pdfDimensions.height * zoom) / 2)
      });
    }
  }, [pdfDimensions]);

  // Stan schowka
  const [clipboardItem, setClipboardItem] = useState<{ type: 'symbol' | 'text' | 'cutout', data: any } | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignoruj jeśli użytkownik pisze w inpucie
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'c' || e.key === 'C') {
          if (selectedId) {
            const symbol = symbols.find(s => s.id === selectedId);
            if (symbol) { setClipboardItem({ type: 'symbol', data: symbol }); return; }
            const text = texts.find(t => t.id === selectedId);
            if (text) { setClipboardItem({ type: 'text', data: text }); return; }
            const cutout = cutouts.find(c => c.id === selectedId);
            if (cutout) { setClipboardItem({ type: 'cutout', data: cutout }); return; }
          }
        }
        
        if (e.key === 'v' || e.key === 'V') {
          if (clipboardItem) {
            if (clipboardItem.type === 'symbol') {
              const newSym = { ...clipboardItem.data, id: `symbol-${Date.now()}`, x: clipboardItem.data.x + 30, y: clipboardItem.data.y + 30 };
              setSymbols([...symbols, newSym]);
              setSelectedId(newSym.id);
            } else if (clipboardItem.type === 'text') {
              const newTxt = { ...clipboardItem.data, id: `text-${Date.now()}`, x: clipboardItem.data.x + 30, y: clipboardItem.data.y + 30 };
              setTexts([...texts, newTxt]);
              setSelectedId(newTxt.id);
            } else if (clipboardItem.type === 'cutout') {
              const newCut = { ...clipboardItem.data, id: `cutout-${Date.now()}`, x: clipboardItem.data.x + 30, y: clipboardItem.data.y + 30, isCopy: true };
              setCutouts([...cutouts, newCut]);
              setSelectedId(newCut.id);
            }
          }
        }
      }
      
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId) {
          setTexts(texts.filter(t => t.id !== selectedId));
          setSymbols(symbols.filter(s => s.id !== selectedId));
          setCutouts(cutouts.filter(c => c.id !== selectedId));
          setSelectedId(null);
        }
      }
      
      if (e.code === 'Space') {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        e.preventDefault();
        setIsSpacePressed(true);
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
        setIsPanning(false);
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [selectedId, symbols, texts, cutouts, clipboardItem, setTexts, setSymbols, setCutouts, setSelectedId]);

  // Obsługa zaznaczania elementów za pomocą Transformera
  useEffect(() => {
    if (transformerRef.current && stageRef.current) {
      if (selectedId && mode === "select") {
        const node = stageRef.current.findOne(`#${selectedId}`);
        if (node) {
          transformerRef.current.nodes([node]);
          transformerRef.current.getLayer()?.batchDraw();
        } else {
          transformerRef.current.nodes([]);
        }
      } else {
        transformerRef.current.nodes([]);
      }
    }
  }, [selectedId, mode, texts, symbols, cutouts]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (mode === "cut" || mode === "copy") {
      const stage = e.target.getStage();
      const pointerPosition = stage?.getPointerPosition();
      if (pointerPosition) {
        setIsLassoing(true);
        setLassoStart({ x: pointerPosition.x, y: pointerPosition.y });
        setLassoRect({ x: pointerPosition.x, y: pointerPosition.y, width: 0, height: 0 });
      }
    }
  };

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if ((mode === "cut" || mode === "copy") && isLassoing && lassoStart) {
      const stage = e.target.getStage();
      const point = stage?.getPointerPosition();
      if (point) {
        setLassoRect({
          x: Math.min(lassoStart.x, point.x),
          y: Math.min(lassoStart.y, point.y),
          width: Math.abs(point.x - lassoStart.x),
          height: Math.abs(point.y - lassoStart.y),
        });
      }
    }
  };

  const handleMouseUp = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if ((mode === "cut" || mode === "copy") && isLassoing && lassoRect) {
      setIsLassoing(false);
      
      if (lassoRect.width > 10 && lassoRect.height > 10) {
        // Zrzut pikseli z płótna react-pdf
        const pdfCanvasEl = document.querySelector(".react-pdf__Page__canvas") as HTMLCanvasElement;
        if (pdfCanvasEl) {
          const tmpCanvas = document.createElement("canvas");
          tmpCanvas.width = lassoRect.width;
          tmpCanvas.height = lassoRect.height;
          const ctx = tmpCanvas.getContext("2d");
          if (ctx) {
            // Uwzględnienie skalowania ekranów Retina przez react-pdf
            const ratio = window.devicePixelRatio || 1;
            
            ctx.drawImage(
              pdfCanvasEl,
              lassoRect.x * ratio, lassoRect.y * ratio, lassoRect.width * ratio, lassoRect.height * ratio,
              0, 0, lassoRect.width, lassoRect.height
            );
            
            const dataUrl = tmpCanvas.toDataURL("image/png");
            const newCutout: PdfCutout = {
              id: `cutout-${Date.now()}`,
              dataUrl,
              originalX: lassoRect.x,
              originalY: lassoRect.y,
              originalWidth: lassoRect.width,
              originalHeight: lassoRect.height,
              x: lassoRect.x,
              y: lassoRect.y,
              width: lassoRect.width,
              height: lassoRect.height,
              rotation: 0,
              isCopy: mode === "copy"
            };
            
            setCutouts([...cutouts, newCutout]);
            setSelectedId(newCutout.id);
          }
        }
      }
      setLassoRect(null);
    }
  };

  const handleStageClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    if (!stage) return;

    const pointerPosition = stage.getPointerPosition();
    if (!pointerPosition) return;

    if (mode === "select") {
      if (e.target === stage) {
        setSelectedId(null);
      }
      return;
    }

    if (mode === "addText") {
      const newText: PdfText = {
        id: `text-${Date.now()}`,
        text: "Nowy Tekst", 
        x: pointerPosition.x,
        y: pointerPosition.y,
        color: textColor,
        fontSize: 16,
        rotation: 0,
      };
      const input = window.prompt("Wpisz tekst:", "Twój tekst");
      if (input) {
        newText.text = input;
        setTexts([...texts, newText]);
        setSelectedId(newText.id);
      }
    } else if (mode === "addSymbol") {
      const newSymbol: PdfSymbol = {
        id: `symbol-${Date.now()}`,
        type: symbolType,
        code: "X", 
        x: pointerPosition.x,
        y: pointerPosition.y,
        rotation: 0,
        scale: 1,
      };
      
      const input = window.prompt("Wpisz oznaczenie symbolu (np. 1, A):", "");
      if (input !== null) {
        newSymbol.code = input || "X";
        setSymbols([...symbols, newSymbol]);
        setSelectedId(newSymbol.id);
      }
    }
  };

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>, id: string, type: "text" | "symbol") => {
    const node = e.target;
    if (type === "text") {
      setTexts(texts.map(t => t.id === id ? { ...t, x: node.x(), y: node.y() } : t));
    } else {
      setSymbols(symbols.map(s => s.id === id ? { ...s, x: node.x(), y: node.y() } : s));
    }
  };

  const handleTransformEnd = (e: Konva.KonvaEventObject<Event>, id: string, type: "text" | "symbol") => {
    const node = e.target;
    if (type === "text") {
      const scaleX = node.scaleX();
      node.scaleX(1);
      node.scaleY(1);
      setTexts(texts.map(t => t.id === id ? { ...t, x: node.x(), y: node.y(), rotation: node.rotation(), fontSize: t.fontSize * scaleX } : t));
    } else {
      setSymbols(symbols.map(s => s.id === id ? { ...s, x: node.x(), y: node.y(), rotation: node.rotation(), scale: s.scale * node.scaleX() } : s));
      node.scaleX(1);
      node.scaleY(1);
    }
  };

  const getSymbolColor = (type: SymbolType) => {
    if (type === "socket") return "#dc2626";
    if (type === "light") return "#d97706";
    if (type === "edv") return "#dc2626";
    if (type === "cee") return "#a855f7";
    if (type === "special") return "#8b5cf6";
    if (type === "reserve") return "#64748b";
    return "#000000";
  };

  const handleContainerWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    setZoom(z => {
      const zoomFactor = -e.deltaY * 0.002;
      const newZoom = Math.max(0.2, Math.min(5, z + zoomFactor));
      
      if (newZoom !== z) {
        const scaleDelta = newZoom / z;
        setPan(p => ({
          x: mouseX - (mouseX - p.x) * scaleDelta,
          y: mouseY - (mouseY - p.y) * scaleDelta
        }));
      }
      
      return newZoom;
    });
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (isSpacePressed || e.button === 1) { // Middle click or Space
      setIsPanning(true);
      e.preventDefault();
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isPanning) {
      setPan(p => ({ x: p.x + e.movementX, y: p.y + e.movementY }));
    }
  };

  const handlePointerUp = () => {
    setIsPanning(false);
  };

  if (!fileUrl) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 text-gray-400">
        Wybierz plik PDF, aby rozpocząć edycję
      </div>
    );
  }

  return (
    <div 
      className={`flex-1 overflow-hidden bg-gray-100 relative ${isSpacePressed || isPanning ? 'cursor-grab active:cursor-grabbing' : ''}`}
      onWheel={handleContainerWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      ref={containerRef}
    >
      <div 
        className="absolute shadow-xl bg-white origin-top-left" 
        style={{ 
          left: 0, top: 0,
          width: pdfDimensions.width, 
          height: pdfDimensions.height,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        }}
      >
        
        {/* Render PDF jako tło */}
        <Document
          file={fileUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          className="absolute top-0 left-0"
        >
          <Page 
            pageNumber={pageNumber} 
            renderTextLayer={false} 
            renderAnnotationLayer={false}
            onLoadSuccess={(page) => {
              const { width, height } = page.getViewport({ scale: 1.5 });
              setPdfDimensions({ width, height });
              onPdfLoaded({ width, height });
            }}
            width={pdfDimensions.width}
          />
        </Document>

        {/* Warstwa interaktywna na wierzchu */}
        <div className={`absolute top-0 left-0 w-full h-full z-10 ${(mode === "cut" || mode === "copy") ? "cursor-crosshair" : "cursor-default"}`}>
          <Stage
            width={pdfDimensions.width}
            height={pdfDimensions.height}
            onClick={handleStageClick}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            ref={stageRef}
          >
            <Layer>
              {/* Białe łatki ukrywające oryginalne wycięcia na PDF */}
              {cutouts.map((c) => (
                !c.isCopy && (
                <Rect
                  key={`mask-${c.id}`}
                  x={c.originalX}
                  y={c.originalY}
                  width={c.originalWidth}
                  height={c.originalHeight}
                  fill="white"
                />
                )
              ))}

              {/* Sklonowane obrazki z wycinków */}
              {cutouts.map((c) => (
                <URLImage
                  key={c.id}
                  cutout={c}
                  isSelected={selectedId === c.id}
                  isDraggable={mode === "select"}
                  onSelect={() => setSelectedId(c.id)}
                  onChange={(newAttrs) => {
                    setCutouts(cutouts.map(cut => cut.id === c.id ? newAttrs : cut));
                  }}
                />
              ))}

              {/* Zaznaczenie lassa */}
              {(mode === "cut" || mode === "copy") && lassoRect && (
                <Rect
                  x={lassoRect.x}
                  y={lassoRect.y}
                  width={lassoRect.width}
                  height={lassoRect.height}
                  fill={mode === "copy" ? "rgba(34, 197, 94, 0.2)" : "rgba(168, 85, 247, 0.2)"}
                  stroke={mode === "copy" ? "#22c55e" : "#a855f7"}
                  strokeWidth={2}
                  dash={[5, 5]}
                />
              )}

              {symbols.map((sym) => {
                const isSelected = selectedId === sym.id;
                const sColor = getSymbolColor(sym.type);
                const sWidth = 38.4 * sym.scale; // Podobne proporcje do aktualnych markerów w systemie
                const sHeight = 18 * sym.scale;

                return (
                  <Group
                    key={sym.id}
                    id={sym.id}
                    x={sym.x}
                    y={sym.y}
                    rotation={sym.rotation}
                    draggable={mode === "select"}
                    onClick={(e) => {
                      e.cancelBubble = true;
                      if (mode === "select") setSelectedId(sym.id);
                    }}
                    onDragEnd={(e) => handleDragEnd(e, sym.id, "symbol")}
                    onTransformEnd={(e) => handleTransformEnd(e, sym.id, "symbol")}
                  >
                    <Rect
                      x={-sWidth / 2}
                      y={-sHeight / 2}
                      width={sWidth}
                      height={sHeight}
                      fill="transparent"
                      stroke={isSelected ? "#3b82f6" : "transparent"}
                      strokeWidth={1}
                    />
                    <Text
                      text={sym.code}
                      fontSize={14 * sym.scale}
                      fontFamily="Arial"
                      fill={sColor}
                      fontStyle="bold"
                      align="center"
                      verticalAlign="middle"
                      x={-sWidth / 2}
                      y={-sHeight / 2}
                      width={sWidth}
                      height={sHeight}
                    />
                  </Group>
                );
              })}

              {texts.map((txt) => {
                const isSelected = selectedId === txt.id;
                return (
                  <Text
                    key={txt.id}
                    id={txt.id}
                    x={txt.x}
                    y={txt.y}
                    text={txt.text}
                    fontSize={txt.fontSize}
                    fontFamily="Arial"
                    fill={txt.color}
                    fontStyle="bold"
                    rotation={txt.rotation}
                    draggable={mode === "select"}
                    onClick={(e) => {
                      e.cancelBubble = true;
                      if (mode === "select") setSelectedId(txt.id);
                    }}
                    onDragEnd={(e) => handleDragEnd(e, txt.id, "text")}
                    onTransformEnd={(e) => handleTransformEnd(e, txt.id, "text")}
                  />
                );
              })}

              {mode === "select" && <Transformer ref={transformerRef} />}
            </Layer>
          </Stage>
        </div>
      </div>
      
      {/* Podpowiedź o nawigacji na dole */}
      <div className="absolute bottom-4 left-4 bg-white/90 p-3 rounded-lg shadow border border-gray-200 text-sm text-gray-700 z-50 pointer-events-none">
        <p><strong>Scroll:</strong> Przybliżanie / Oddalanie</p>
        <p><strong>Spacja + Przeciągnij (lub Środkowy Przycisk):</strong> Przesuwanie planu</p>
        <p><strong>Ctrl+C / Ctrl+V:</strong> Kopiuj / Wklej wycięty element</p>
      </div>
      {numPages > 1 && (
        <div className="mt-6 flex items-center gap-4 bg-white px-4 py-2 rounded-full shadow border border-gray-200">
          <button 
            disabled={pageNumber <= 1} 
            onClick={() => setPageNumber(p => p - 1)}
            className="text-sm font-medium text-gray-700 disabled:opacity-50"
          >
            Poprzednia
          </button>
          <span className="text-sm">Strona {pageNumber} z {numPages}</span>
          <button 
            disabled={pageNumber >= numPages} 
            onClick={() => setPageNumber(p => p + 1)}
            className="text-sm font-medium text-gray-700 disabled:opacity-50"
          >
            Następna
          </button>
        </div>
      )}
    </div>
  );
}
