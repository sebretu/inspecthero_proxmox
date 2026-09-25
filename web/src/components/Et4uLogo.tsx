"use client";
import React, { useState, useEffect } from "react";

interface Et4uLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl" | "hero";
  animated?: boolean;
}

export function Et4uLogo({
  className = "",
  size = "md",
  animated = true,
}: Et4uLogoProps) {
  // Page-load initial electric lightning flash & sparkle
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    // Show glowing lightning bolt on initial page load / mount for 2.2s, then settle to '4'
    const timer = setTimeout(() => {
      setIsPageLoading(false);
    }, 2200);
    return () => clearTimeout(timer);
  }, []);

  // Ultra-readable, technical DIN / CAD engineering typography scale in lowercase
  const sizeClasses = {
    sm: "text-2xl md:text-3xl gap-0.5",
    md: "text-3xl md:text-4xl lg:text-[46px] gap-1",
    lg: "text-4xl md:text-5xl lg:text-6xl gap-1.5",
    xl: "text-5xl md:text-6xl lg:text-7xl gap-2",
    hero: "text-6xl md:text-7xl lg:text-8xl gap-2.5",
  };

  const lightningSize = {
    sm: "w-5 h-7 md:w-6 md:h-8",
    md: "w-7 h-9 md:w-9 md:h-11 lg:w-11 lg:h-13",
    lg: "w-9 h-11 md:w-11 md:h-14 lg:w-13 lg:h-16",
    xl: "w-11 h-14 md:w-14 md:h-18 lg:w-16 lg:h-21",
    hero: "w-14 h-18 md:w-18 md:h-24 lg:w-22 lg:h-28",
  };

  const isLightningActive = isPageLoading || isHovered;

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`group inline-flex items-baseline font-[family-name:var(--font-tech),ui-monospace,monospace] font-black tracking-normal leading-none select-none bg-transparent hover:bg-transparent cursor-pointer transition-all duration-300 ${sizeClasses[size]} ${className}`}
    >
      {/* "et" - Lowercase high contrast bright white */}
      <span className="text-white font-black tracking-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)] transition-colors duration-200 lowercase">
        et
      </span>

      {/* Dynamic Central Element: '4' in default state, morphing to glowing lightning bolt on hover or loading */}
      <div className="relative inline-flex items-center justify-center -mx-0.5 self-center">
        {/* Ambient & Hover Electric Aura Glow */}
        <span
          className={`absolute inset-0 bg-[#FFF500] rounded-full pointer-events-none transition-all duration-300 ${
            isLightningActive
              ? "opacity-100 blur-[20px] scale-150 animate-pulse"
              : "opacity-0 group-hover:opacity-100 group-hover:blur-[20px] group-hover:scale-150"
          }`}
        />

        {/* 1. Digit "4" - Visible by default, fades on hover / loading */}
        <span
          className={`text-[#FFD000] font-black tracking-tight drop-shadow-[0_2px_10px_rgba(255,208,0,0.6)] transition-all duration-200 ease-out ${
            isLightningActive
              ? "opacity-0 scale-50 absolute pointer-events-none"
              : "opacity-100 scale-100 group-hover:opacity-0 group-hover:scale-50 group-hover:absolute"
          }`}
        >
          4
        </span>

        {/* 2. Sparkling Glowing Lightning Bolt SVG - Visible on hover or page loading */}
        <div
          className={`transition-all duration-200 ease-out ${
            isLightningActive
              ? "opacity-100 scale-100"
              : "opacity-0 scale-50 absolute pointer-events-none group-hover:opacity-100 group-hover:scale-125 group-hover:static group-hover:pointer-events-auto"
          }`}
        >
          <svg
            className={`${lightningSize[size]} relative z-10 text-[#FFD000] drop-shadow-[0_0_14px_rgba(255,208,0,0.95)] transition-all duration-200 ease-out group-hover:scale-125 group-hover:-rotate-3 group-hover:drop-shadow-[0_0_28px_rgba(255,245,0,1)] ${
              animated ? "animate-electric-pulse" : ""
            }`}
            viewBox="0 0 24 28"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M13.8 1L2.5 15H12L10.2 27L21.5 13H12.2L13.8 1Z"
              fill="url(#et4u-tech-yellow-lc)"
              stroke="#FFFFFF"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
            <defs>
              <linearGradient id="et4u-tech-yellow-lc" x1="12" y1="1" x2="12" y2="27" gradientUnits="userSpaceOnUse">
                <stop stopColor="#FFFFEE" />
                <stop offset="0.25" stopColor="#FFF500" />
                <stop offset="0.7" stopColor="#FFD000" />
                <stop offset="1" stopColor="#FF9500" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>

      {/* "u" - Lowercase letter */}
      <span className="text-white font-black tracking-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)] transition-colors duration-200 lowercase">
        u
      </span>

      {/* ".de" in electric engineering cyan-blue accent */}
      <span className="text-[#00C8FF] font-black tracking-tight ml-0.5 drop-shadow-[0_0_12px_rgba(0,200,255,0.75)] transition-colors duration-200 lowercase">
        .de
      </span>
    </div>
  );
}

export default Et4uLogo;
