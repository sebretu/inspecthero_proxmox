import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Stage, Layer, Image, Line, Rect, Circle, Arrow, Text, Group } from 'react-konva';
import useImage from 'use-image';
import Konva from 'konva';

export type ToolType = 'select' | 'pan' | 'pen' | 'line' | 'arrow' | 'rect' | 'circle' | 'text' | 'marker' | 'measurement';

interface Shape {
  id: string;
  type: ToolType;
  points?: number[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  radius?: number;
  text?: string;
  color: string;
  strokeWidth: number;
}

interface AufmassCanvasProps {
  imageUrl: string;
  shapes: Shape[];
  onShapesChange: (shapes: Shape[]) => void;
  activeTool: ToolType;
  currentColor: string;
  currentStrokeWidth: number;
  onSelectMarker: (id: string | null) => void;
  readOnly?: boolean;
}

// Helper to get distance between two touch points
function getDistance(p1: { x: number, y: number }, p2: { x: number, y: number }) {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

function getCenter(p1: { x: number, y: number }, p2: { x: number, y: number }) {
  return {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2,
  };
}

export default function AufmassCanvas({
  imageUrl,
  shapes,
  onShapesChange,
  activeTool,
  currentColor,
  currentStrokeWidth,
  onSelectMarker,
  readOnly = false
}: AufmassCanvasProps) {
  const [image] = useImage(imageUrl, 'anonymous');
  const stageRef = useRef<Konva.Stage>(null);
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [draftShape, setDraftShape] = useState<Shape | null>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Touch gesture state
  const lastCenterRef = useRef<{ x: number, y: number } | null>(null);
  const lastDistRef = useRef<number>(0);

  // Resize observer
  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      if (entries[0]) {
        const { width, height } = entries[0].contentRect;
        setStageSize({ width, height });
      }
    });
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, []);

  // Center image on load
  useEffect(() => {
    if (image && stageSize.width && stageSize.height) {
      const scaleX = stageSize.width / image.width;
      const scaleY = stageSize.height / image.height;
      const newScale = Math.min(scaleX, scaleY) * 0.9;
      setScale(newScale);
      
      setPosition({
        x: (stageSize.width - image.width * newScale) / 2,
        y: (stageSize.height - image.height * newScale) / 2
      });
    }
  }, [image, stageSize.width, stageSize.height]);

  const getRelativePointerPosition = (node: Konva.Node) => {
    const transform = node.getAbsoluteTransform().copy();
    transform.invert();
    const pos = node.getStage()?.getPointerPosition();
    if (!pos) return { x: 0, y: 0 };
    return transform.point(pos);
  };

  const handlePointerDown = (e: any) => {
    if (readOnly) return;
    
    // Handle touch gestures (Pinch to zoom / Two finger pan)
    const stage = stageRef.current;
    if (e.evt.touches && e.evt.touches.length === 2 && stage) {
       const touch1 = e.evt.touches[0];
       const touch2 = e.evt.touches[1];
       const p1 = { x: touch1.clientX, y: touch1.clientY };
       const p2 = { x: touch2.clientX, y: touch2.clientY };
       
       lastCenterRef.current = getCenter(p1, p2);
       lastDistRef.current = getDistance(p1, p2);
       return; // skip drawing
    }

    // Pan mode or middle click
    if (activeTool === 'pan' || e.evt.button === 1 || (e.evt.touches && e.evt.touches.length > 1)) {
      if (stageRef.current) stageRef.current.container().style.cursor = 'grabbing';
      return;
    }

    if (activeTool === 'select') {
      const clickedOnEmpty = e.target === e.target.getStage() || e.target.name() === 'background-image';
      if (clickedOnEmpty) {
        onSelectMarker(null);
      }
      return;
    }

    // Drawing mode
    const pos = getRelativePointerPosition(e.target.getStage());
    setIsDrawing(true);

    const newId = `shape_${Date.now()}`;
    const newShape: Shape = {
      id: newId,
      type: activeTool,
      color: currentColor,
      strokeWidth: currentStrokeWidth,
      points: [pos.x, pos.y],
      x: pos.x,
      y: pos.y,
    };

    if (activeTool === 'text' || activeTool === 'marker') {
      if (activeTool === 'marker') {
        // Obliczamy kolejny numer markera na podstawie istniejących
        const markerCount = shapes.filter(s => s.type === 'marker').length;
        newShape.text = (markerCount + 1).toString();
      } else {
        newShape.text = 'Note';
      }
      setIsDrawing(false); // Don't drag to create
      onShapesChange([...shapes, newShape]);
    } else {
      setDraftShape(newShape);
    }
  };

  const handlePointerMove = (e: any) => {
    if (readOnly) return;
    
    const stage = stageRef.current;
    if (e.evt.touches && e.evt.touches.length === 2 && stage) {
      e.evt.preventDefault(); // Prevent page scrolling
      const touch1 = e.evt.touches[0];
      const touch2 = e.evt.touches[1];
      const p1 = { x: touch1.clientX, y: touch1.clientY };
      const p2 = { x: touch2.clientX, y: touch2.clientY };
      
      const newCenter = getCenter(p1, p2);
      const newDist = getDistance(p1, p2);

      if (lastCenterRef.current && lastDistRef.current > 0) {
        // Pinch zoom
        const scaleBy = newDist / lastDistRef.current;
        const oldScale = stage.scaleX();
        const newScale = oldScale * scaleBy;
        
        // Pan
        const dx = newCenter.x - lastCenterRef.current.x;
        const dy = newCenter.y - lastCenterRef.current.y;
        
        setScale(newScale);
        setPosition({
           x: stage.x() + dx,
           y: stage.y() + dy
        });
      }

      lastCenterRef.current = newCenter;
      lastDistRef.current = newDist;
      return;
    }

    if (!isDrawing || !draftShape) return;

    if (activeTool === 'pan') return;

    const pointerStage = e.target.getStage();
    const point = getRelativePointerPosition(pointerStage);
    
    const lastShape = { ...draftShape };

    if (activeTool === 'pen') {
      lastShape.points = lastShape.points?.concat([point.x, point.y]);
    } else if (activeTool === 'line' || activeTool === 'arrow' || activeTool === 'measurement') {
      lastShape.points = [lastShape.points![0], lastShape.points![1], point.x, point.y];
    } else if (activeTool === 'rect') {
      lastShape.width = point.x - lastShape.x!;
      lastShape.height = point.y - lastShape.y!;
    } else if (activeTool === 'circle') {
      const dx = point.x - lastShape.x!;
      const dy = point.y - lastShape.y!;
      lastShape.radius = Math.sqrt(dx * dx + dy * dy);
    }

    setDraftShape(lastShape);
  };

  const handlePointerUp = (e: any) => {
    lastCenterRef.current = null;
    lastDistRef.current = 0;

    if (isDrawing && draftShape) {
      onShapesChange([...shapes, draftShape]);
      setDraftShape(null);
    }

    setIsDrawing(false);
    if (stageRef.current && activeTool === 'pan') {
      stageRef.current.container().style.cursor = 'grab';
    }
  };

  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    if (!stageRef.current) return;

    const scaleBy = 1.1;
    const stage = stageRef.current;
    const oldScale = stage.scaleX();

    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;

    setScale(newScale);
    setPosition({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  };

  const handleDragEnd = (e: any) => {
    setPosition({
      x: e.target.x(),
      y: e.target.y()
    });
  };

  return (
    <div ref={containerRef} className="w-full h-full bg-slate-900/50 rounded-2xl overflow-hidden relative">
      <Stage
        ref={stageRef}
        width={stageSize.width}
        height={stageSize.height}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
        draggable={activeTool === 'pan'}
        onDragEnd={handleDragEnd}
        scaleX={scale}
        scaleY={scale}
        x={position.x}
        y={position.y}
        className={activeTool === 'pan' ? 'cursor-grab' : activeTool === 'select' ? 'cursor-default' : 'cursor-crosshair'}
      >
        <Layer>
          {image && (
            <Image
              image={image}
              name="background-image"
              listening={true}
            />
          )}

          {[...shapes, ...(draftShape ? [draftShape] : [])].map((shape, i) => {
            const isMarker = shape.type === 'marker';
            
            // Performance optimizations: hitStrokeWidth for touch targets, perfectDrawEnabled false for memory
            const commonProps = {
               perfectDrawEnabled: false,
               hitStrokeWidth: 15, 
            };

            if (shape.type === 'pen' || shape.type === 'line') {
              return (
                <Line
                  key={shape.id}
                  {...commonProps}
                  points={shape.points || []}
                  stroke={shape.color}
                  strokeWidth={shape.strokeWidth}
                  tension={shape.type === 'pen' ? 0.5 : 0}
                  lineCap="round"
                  lineJoin="round"
                />
              );
            }
            if (shape.type === 'arrow') {
              return (
                <Arrow
                  key={shape.id}
                  {...commonProps}
                  points={shape.points || []}
                  stroke={shape.color}
                  fill={shape.color}
                  strokeWidth={shape.strokeWidth}
                  pointerLength={10}
                  pointerWidth={10}
                />
              );
            }
            if (shape.type === 'measurement') {
               const pts = shape.points || [0,0,0,0];
               const dx = pts[2] - pts[0];
               const dy = pts[3] - pts[1];
               const dist = Math.sqrt(dx*dx + dy*dy).toFixed(1);
               return (
                 <Group key={shape.id}>
                   <Line
                      {...commonProps}
                      points={pts}
                      stroke={shape.color}
                      strokeWidth={shape.strokeWidth}
                      dash={[5, 5]}
                   />
                   <Text
                      x={(pts[0] + pts[2])/2}
                      y={(pts[1] + pts[3])/2 - 15}
                      text={`${dist} px`}
                      fontSize={14 / scale}
                      fill={shape.color}
                      fontFamily="Inter, sans-serif"
                      align="center"
                      perfectDrawEnabled={false}
                   />
                 </Group>
               );
            }
            if (shape.type === 'rect') {
              return (
                <Rect
                  key={shape.id}
                  {...commonProps}
                  x={shape.x}
                  y={shape.y}
                  width={shape.width || 0}
                  height={shape.height || 0}
                  stroke={shape.color}
                  strokeWidth={shape.strokeWidth}
                />
              );
            }
            if (shape.type === 'circle') {
              return (
                <Circle
                  key={shape.id}
                  {...commonProps}
                  x={shape.x}
                  y={shape.y}
                  radius={shape.radius || 0}
                  stroke={shape.color}
                  strokeWidth={shape.strokeWidth}
                />
              );
            }
            if (shape.type === 'text') {
              return (
                <Text
                  key={shape.id}
                  x={shape.x}
                  y={shape.y}
                  text={shape.text || "Text"}
                  fontSize={20 / scale}
                  fill={shape.color}
                  fontFamily="Inter, sans-serif"
                  draggable={activeTool === 'select' && !readOnly}
                  onDragEnd={(e) => {
                    if (readOnly || shape.id === draftShape?.id) return;
                    const newShapes = shapes.map(s => s.id === shape.id ? { ...s, x: e.target.x(), y: e.target.y() } : s);
                    onShapesChange(newShapes);
                  }}
                  perfectDrawEnabled={false}
                  hitStrokeWidth={20}
                />
              );
            }
            if (isMarker) {
              return (
                <Group 
                  key={shape.id} 
                  x={shape.x} 
                  y={shape.y}
                  draggable={activeTool === 'select' && !readOnly}
                  onDragEnd={(e) => {
                    if (readOnly || shape.id === draftShape?.id) return;
                    const newShapes = shapes.map(s => s.id === shape.id ? { ...s, x: e.target.x(), y: e.target.y() } : s);
                    onShapesChange(newShapes);
                  }}
                  onClick={() => activeTool === 'select' && onSelectMarker(shape.id)}
                  onTap={() => activeTool === 'select' && onSelectMarker(shape.id)}
                >
                  <Circle radius={15 / scale} fill={shape.color} stroke="white" strokeWidth={2 / scale} shadowColor="black" shadowBlur={5} shadowOpacity={0.5} />
                  <Text text={shape.text || "!"} fontSize={14 / scale} fill="white" fontStyle="bold" align="center" verticalAlign="middle" offsetX={5 / scale} offsetY={7 / scale} />
                </Group>
              );
            }
            return null;
          })}
        </Layer>
      </Stage>
      
      {/* Zoom controls overlay */}
      <div className="absolute bottom-4 right-4 flex bg-black/60 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden shadow-2xl">
         <button onClick={() => setScale(s => s * 1.2)} className="p-3 text-white hover:bg-white/10 transition-colors">+</button>
         <div className="p-3 text-white text-xs font-bold border-x border-white/5">{Math.round(scale * 100)}%</div>
         <button onClick={() => setScale(s => s / 1.2)} className="p-3 text-white hover:bg-white/10 transition-colors">-</button>
      </div>
    </div>
  );
}
