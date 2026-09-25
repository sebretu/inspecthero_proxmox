"use client";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";

interface CableSegment {
  id: string;
  name: string;
  length: number;
  color: string;
  status: string;
  rawStatus?: string;
  user?: string;
  location?: string;
}

interface TrommelVisualProps {
  totalLength: number | null;
  usedLength: number;
  cables: CableSegment[];
  name: string;
  cableType?: string | null;
  size?: number;
  showDetails?: boolean;
}

export function TrommelVisual({ 
  totalLength, 
  usedLength, 
  cables, 
  name, 
  cableType,
  size = 240,
  showDetails = false
}: TrommelVisualProps) {
  const { t } = useLanguage();
  const [hoveredSegment, setHoveredSegment] = useState<CableSegment | null>(null);

  const remainingLength = totalLength != null ? Math.max(0, totalLength - usedLength) : null;
  const usedPct = totalLength ? Math.min(100, (usedLength / totalLength) * 100) : 0;
  const remainingPct = totalLength ? Math.max(0, 100 - usedPct) : 100;
  
  // Urgent color logic: Green > 70%, Yellow 30-70%, Red < 30% remaining
  // Using industrial monitoring colors
  const indicatorColor = remainingPct > 70 ? "#22c55e" : remainingPct > 30 ? "#f59e0b" : "#ef4444";
  const isCritical = remainingPct < 30;

  // Calculate percentage of cables with 'done' status
  const doneCablesCount = cables.filter(c => c.rawStatus === 'done' || c.status === 'done').length;
  const totalCablesCount = cables.length;
  const donePct = totalCablesCount > 0 ? (doneCablesCount / totalCablesCount) * 100 : 0;

  const radius = 88;
  const circumference = 2 * Math.PI * radius;

  // Monochrome segment system: Using shades of blue/neutral
  const getSegmentColor = (index: number) => {
    const opacities = [0.8, 0.6, 0.45, 0.7, 0.5];
    return `rgba(56, 189, 248, ${opacities[index % opacities.length]})`;
  };

  const segments = useMemo(() => {
    if (!totalLength) return [];
    let currentOffset = 0;
    return cables.map((c, i) => {
      const segmentPct = (c.length / totalLength) * 100;
      const strokeDasharray = `${(segmentPct / 100) * circumference} ${circumference}`;
      const strokeDashoffset = -((currentOffset / 100) * circumference);
      currentOffset += segmentPct;
      return {
        ...c,
        color: getSegmentColor(i),
        strokeDasharray,
        strokeDashoffset
      };
    });
  }, [cables, totalLength, circumference]);

  return (
    <div className="relative flex flex-col items-center justify-center" style={{ width: size, height: size }}>
      <svg
        viewBox="0 0 200 200"
        className="w-full h-full"
        style={{ transform: "rotate(-90deg)" }}
      >
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* Outer Rim - Industrial dark */}
        <circle
          cx="100"
          cy="100"
          r="98"
          fill="rgba(15, 23, 42, 0.8)"
          stroke="rgba(255, 255, 255, 0.05)"
          strokeWidth="1"
        />
        
        {/* Track */}
        <circle
          cx="100"
          cy="100"
          r={radius}
          fill="none"
          stroke="rgba(255, 255, 255, 0.03)"
          strokeWidth="16"
        />

        {/* Remaining Background */}
        <circle
          cx="100"
          cy="100"
          r={radius}
          fill="none"
          stroke="rgba(255, 255, 255, 0.08)"
          strokeWidth="16"
          strokeDasharray={`${circumference} ${circumference}`}
        />

        {/* Monochrome Segments - Thinner for precision look */}
        {segments.map((s, i) => (
          <motion.circle
            key={s.id}
            cx="100"
            cy="100"
            r={radius}
            fill="none"
            stroke={s.color}
            strokeWidth="16"
            strokeDasharray={s.strokeDasharray}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: s.strokeDashoffset }}
            transition={{ duration: 1.5, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
            onMouseEnter={() => setHoveredSegment(s)}
            onMouseLeave={() => setHoveredSegment(null)}
            style={{ 
              cursor: "pointer", 
              filter: hoveredSegment?.id === s.id ? "brightness(1.5) drop-shadow(0 0 8px currentColor)" : "none" 
            }}
          />
        ))}

        {/* Center Hub Display Area */}
        <motion.circle
          cx="100"
          cy="100"
          r="68"
          fill="rgba(10, 15, 28, 0.98)"
          stroke="rgba(255, 255, 255, 0.05)"
          strokeWidth="1"
          style={{ filter: isCritical ? `drop-shadow(0 0 15px ${indicatorColor}22)` : "none" }}
        />
        
        {/* Urgent Status Line */}
        <motion.circle
          cx="100"
          cy="100"
          r="68"
          fill="none"
          stroke={indicatorColor}
          strokeWidth="2"
          animate={isCritical ? { opacity: [1, 0.4, 1] } : { opacity: 0.8 }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      </svg>

      {/* Center Data Display */}
      <div 
        className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none"
        style={{ transform: "none" }}
      >
        <motion.span 
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-3xl font-black tracking-tighter leading-none"
          style={{ color: donePct >= 100 ? "#10b981" : "white" }}
        >
          {Math.round(donePct)}%
        </motion.span>
        
        <div className="flex flex-col items-center mt-2 space-y-0.5">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/5 border border-white/5">
             <span className="text-[10px] font-black text-white">
                {cables.length} {t("cables", "cablesCount", "Cables")}
             </span>
          </div>
          <span className="text-[8px] font-black text-ui-muted uppercase tracking-[0.2em] opacity-40">
             {t("cables", "status_done", "Done")}
          </span>
        </div>
      </div>

      {/* Tooltip */}
      <AnimatePresence>
        {hoveredSegment && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute -bottom-24 left-1/2 -translate-x-1/2 bg-[#0F172A] border border-white/10 p-4 rounded-2xl shadow-2xl z-[100] min-w-[200px] backdrop-blur-2xl"
          >
            <div className="flex items-center gap-2 mb-3">
               <div className="w-1.5 h-1.5 rounded-full bg-ui-accent shadow-[0_0_8px_rgba(56,189,248,0.5)]" />
               <p className="text-[11px] font-black text-white uppercase tracking-wider truncate">{hoveredSegment.name}</p>
            </div>
            <div className="space-y-2">
               <div className="flex justify-between text-[10px] font-bold">
                  <span className="text-ui-muted uppercase tracking-widest">{t("cables", "length", "Length")}:</span>
                  <span className="text-white">{hoveredSegment.length}m</span>
               </div>
               <div className="flex justify-between text-[10px] font-bold">
                  <span className="text-ui-muted uppercase tracking-widest">{t("attendance", "worker", "User")}:</span>
                  <span className="text-white truncate max-w-[80px]">{hoveredSegment.user || "-"}</span>
               </div>
               <div className="flex justify-between text-[10px] font-bold">
                  <span className="text-ui-muted uppercase tracking-widest">{t("common", "status", "Status")}:</span>
                  <span className="text-ui-accent uppercase">{hoveredSegment.status}</span>
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
