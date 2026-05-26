"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const THEMES = [
  { value: "deep-space", label: "Deep Space", icon: "🌌" },
  { value: "graphite-tech", label: "Graphite Tech", icon: "⚙️" },
  { value: "black-silver", label: "Black Silver", icon: "🌑" },
  { value: "inspect", label: "Inspect", icon: "🔍" },
];

export function ThemeSwitcher() {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return <div className="w-10 h-10 opacity-0"></div>;

  return (
    <div className="flex items-center gap-2 p-1 bg-black/20 backdrop-blur-xl border border-ui-border rounded-full shadow-2xl transition-all hover:border-ui-accent/50 group">
      <div className="flex items-center gap-2 px-3 py-1">
        <span className="text-xs group-hover:animate-pulse" aria-hidden="true">🎨</span>
        <select
          className="bg-transparent text-[10px] font-black uppercase tracking-widest outline-none cursor-pointer appearance-none pr-4 text-ui-text"
          value={theme || "deep-space"}
          onChange={(e) => setTheme(e.target.value)}
          aria-label="Color theme"
          suppressHydrationWarning
        >
          {THEMES.map((t) => (
            <option key={t.value} value={t.value} className="bg-ui-bg text-ui-text font-sans">
              {t.label}
            </option>
          ))}
        </select>
        <span className="text-[10px] text-ui-muted pointer-events-none -ml-3" aria-hidden="true">▾</span>
      </div>
    </div>
  );
}
