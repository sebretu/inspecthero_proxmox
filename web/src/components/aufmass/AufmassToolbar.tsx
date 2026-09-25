import React from 'react';
import { MousePointer2, Hand, PenTool, Minus, MoveDiagonal, Square, Circle, Type, MapPin, Ruler, ArrowLeftRight } from 'lucide-react';
import { ToolType } from './AufmassCanvas';

interface AufmassToolbarProps {
  activeTool: ToolType;
  onChangeTool: (tool: ToolType) => void;
  currentColor: string;
  onChangeColor: (color: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  currentStrokeWidth: number;
  onChangeStrokeWidth: (width: number) => void;
}

const tools: { id: ToolType; icon: React.FC<any>; label: string }[] = [
  { id: 'select', icon: MousePointer2, label: 'Select' },
  { id: 'pan', icon: Hand, label: 'Pan' },
  { id: 'pen', icon: PenTool, label: 'Draw' },
  { id: 'line', icon: Minus, label: 'Line' },
  { id: 'arrow', icon: MoveDiagonal, label: 'Arrow' },
  { id: 'double-arrow', icon: ArrowLeftRight, label: 'Double Arrow' },
  { id: 'rect', icon: Square, label: 'Rectangle' },
  { id: 'circle', icon: Circle, label: 'Circle' },
  { id: 'text', icon: Type, label: 'Text' },
  { id: 'marker', icon: MapPin, label: 'Marker' },
  { id: 'measurement', icon: Ruler, label: 'Measure' },
];

const colors = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#ffffff', '#000000'];

export default function AufmassToolbar({
  activeTool, onChangeTool, currentColor, onChangeColor, onUndo, onRedo, canUndo, canRedo, currentStrokeWidth, onChangeStrokeWidth
}: AufmassToolbarProps) {
  return (
    <div className="flex flex-col gap-4 bg-slate-900/60 backdrop-blur-2xl border border-white/10 p-4 rounded-3xl shadow-2xl">
      {/* Tools Grid */}
      <div className="grid grid-cols-2 gap-2">
        {tools.map((t) => (
          <button
            key={t.id}
            onClick={() => onChangeTool(t.id)}
            title={t.label}
            className={`p-3 rounded-xl flex items-center justify-center transition-all ${
              activeTool === t.id 
                ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.5)]' 
                : 'text-slate-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <t.icon className="w-5 h-5" />
          </button>
        ))}
      </div>

      <div className="h-px bg-white/10 my-2"></div>

      {/* Stroke Widths */}
      <div className="flex justify-between items-center gap-2">
        {[2, 4, 8, 12].map((w) => (
          <button
            key={w}
            onClick={() => onChangeStrokeWidth(w)}
            className={`flex-1 h-10 rounded-xl transition-all flex items-center justify-center border ${
              currentStrokeWidth === w ? 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-500/30' : 'bg-white/5 border-white/10 text-slate-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <div 
              style={{ width: Math.max(1, w/2), height: Math.max(1, w/2), borderRadius: '50%' }} 
              className="bg-current"
            />
          </button>
        ))}
      </div>

      <div className="h-px bg-white/10 my-2"></div>

      {/* Colors */}
      <div className="grid grid-cols-2 gap-2">
        {colors.map((c) => (
          <button
            key={c}
            onClick={() => onChangeColor(c)}
            className={`w-10 h-10 rounded-xl transition-all flex items-center justify-center ${
              currentColor === c ? 'ring-2 ring-white scale-110' : 'hover:scale-105'
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>

      <div className="h-px bg-white/10 my-2"></div>

      {/* Undo / Redo */}
      <div className="flex gap-2">
         <button 
           onClick={onUndo} disabled={!canUndo}
           className="flex-1 py-2 bg-white/5 hover:bg-white/10 disabled:opacity-30 rounded-xl text-[10px] font-black text-slate-300 uppercase"
         >
            Undo
         </button>
         <button 
           onClick={onRedo} disabled={!canRedo}
           className="flex-1 py-2 bg-white/5 hover:bg-white/10 disabled:opacity-30 rounded-xl text-[10px] font-black text-slate-300 uppercase"
         >
            Redo
         </button>
      </div>
    </div>
  );
}
