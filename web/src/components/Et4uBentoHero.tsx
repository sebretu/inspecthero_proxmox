"use client";
import React from "react";
import Link from "next/link";
import { Zap, Cable, ShieldCheck, Activity, Cpu, FileSpreadsheet, ArrowUpRight } from "lucide-react";
import { Et4uLogo } from "@/components/Et4uLogo";

function HeroCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative overflow-hidden transition-all duration-300 ${className}`}>
      {children}
    </div>
  );
}

export function Et4uBentoHero({ hasVdeAccess = false }: { hasVdeAccess?: boolean }) {
  return (
    <section className="w-full mb-8 md:mb-14">
      {/* ── BENTO GRID CONTAINER ── */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 md:gap-7 w-full items-stretch">

        {/* ── 1. MAIN HERO CARD (Span 8 on desktop) ── */}
        <div className="md:col-span-8 flex">
          <HeroCard className="w-full min-h-[380px] md:min-h-[440px] rounded-[28px] md:rounded-[36px] bg-gradient-to-br from-[#16181C] via-[#111215] to-[#0D0E10] border border-[#FFD000]/30 hover:border-[#FFD000]/60 p-6 sm:p-8 md:p-10 shadow-[0_20px_50px_rgba(0,0,0,0.7)] flex flex-col justify-between gap-6">
            {/* Ambient Electric Amber Glows */}
            <div className="absolute top-0 right-0 w-80 h-80 bg-[#FFD000]/10 rounded-full blur-[80px] pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-72 h-72 bg-[#FF9500]/5 rounded-full blur-[70px] pointer-events-none" />

            {/* Top Row: Brand & Status Chip */}
            <div className="relative z-10 flex items-center justify-between gap-4 flex-wrap">
              <Et4uLogo size="md" animated />
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#FFD000]/10 border border-[#FFD000]/30 text-[#FFD000] text-[10px] font-black uppercase tracking-widest shadow-sm">
                <span className="w-2 h-2 rounded-full bg-[#FFD000] animate-ping" />
                Live Platform
              </div>
            </div>

            {/* Middle: Headline & Supporting Typography */}
            <div className="relative z-10 space-y-3">
              <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-[40px] font-black text-white tracking-tight leading-[1.15] uppercase break-words">
                Elektrotechnik, <br />
                <span className="bg-gradient-to-r from-[#FFD000] via-[#FFE270] to-[#FFFFFF] bg-clip-text text-transparent">
                  die verbindet.
                </span>
              </h1>
              <p className="text-ui-muted text-xs sm:text-sm md:text-base max-w-xl font-medium leading-relaxed">
                Präzise digitale Bau- und Elektroplanung, Kabeltrassen, VDE-Prüfprotokolle und automatisierte Mängeldokumentation.
              </p>
            </div>

            {/* Bottom Row: Quick CTAs */}
            <div className="relative z-10 flex items-center gap-3.5 flex-wrap pt-2">
              <Link
                href="/plans"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-[100px] bg-gradient-to-r from-[#FFD000] via-[#FBBF24] to-[#F59E0B] text-black font-extrabold text-xs md:text-sm tracking-wide uppercase shadow-[0_8px_25px_rgba(255,208,0,0.35)] hover:scale-105 active:scale-95 transition-all duration-200"
              >
                <span>Pläne & Gebäude</span>
                <ArrowUpRight className="w-4 h-4 text-black stroke-[3]" />
              </Link>
              <Link
                href="/cables"
                className="inline-flex items-center gap-2 px-5 py-3.5 rounded-[100px] bg-white/5 hover:bg-white/10 border border-white/15 hover:border-[#FFD000]/40 text-white font-bold text-xs md:text-sm tracking-wide uppercase transition-all duration-200"
              >
                <span>Kabelmanagement</span>
              </Link>
            </div>
          </HeroCard>
        </div>

        {/* ── 2. STATS & ENGINEERING PRECISION CARD (Span 4 on desktop) ── */}
        <div className="md:col-span-4 flex">
          <HeroCard className="w-full min-h-[380px] md:min-h-[440px] rounded-[28px] md:rounded-[36px] bg-gradient-to-b from-[#181A1E] to-[#101114] border border-white/10 hover:border-[#FFD000]/40 p-6 sm:p-8 shadow-xl flex flex-col justify-between gap-5">
            <div className="flex items-center justify-between pb-1">
              <div className="w-10 h-10 rounded-xl bg-[#FFD000]/15 border border-[#FFD000]/30 flex items-center justify-center text-[#FFD000]">
                <Cpu className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#FFD000] bg-[#FFD000]/10 px-3 py-1 rounded-full border border-[#FFD000]/20">
                Precision Core
              </span>
            </div>

            <div className="space-y-3">
              <h3 className="text-lg sm:text-xl md:text-2xl font-black text-white leading-snug">
                Digitale Bauleitung & Automation
              </h3>
              <div className="space-y-2.5 text-xs text-ui-muted font-medium">
                <div className="flex items-center justify-between p-3 rounded-xl bg-black/40 border border-white/5">
                  <span className="flex items-center gap-2 text-white/90">
                    <Zap className="w-4 h-4 text-[#FFD000]" /> DIN VDE Normen
                  </span>
                  <span className="font-bold text-[#FFD000]">0100 / 0105</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-black/40 border border-white/5">
                  <span className="flex items-center gap-2 text-white/90">
                    <Cable className="w-4 h-4 text-[#FFD000]" /> Kabeltrassen
                  </span>
                  <span className="font-bold text-white">100% Digital</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-black/40 border border-white/5">
                  <span className="flex items-center gap-2 text-white/90">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" /> BMA Brandschutz
                  </span>
                  <span className="font-bold text-emerald-400">Automatisiert</span>
                </div>
              </div>
            </div>

            {hasVdeAccess ? (
              <div className="pt-2">
                <Link
                  href="/measurement-protocols"
                  className="w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-xl bg-white/5 hover:bg-[#FFD000]/15 border border-white/10 hover:border-[#FFD000]/40 text-white hover:text-[#FFD000] text-xs font-black uppercase tracking-wider transition-all duration-200"
                >
                  <span>E-Check Protokolle</span>
                  <ArrowUpRight className="w-4 h-4" />
                </Link>
              </div>
            ) : (
              <div className="pt-2">
                <Link
                  href="/plans"
                  className="w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-xl bg-white/5 hover:bg-[#FFD000]/15 border border-white/10 hover:border-[#FFD000]/40 text-white hover:text-[#FFD000] text-xs font-black uppercase tracking-wider transition-all duration-200"
                >
                  <span>Pläne & Baupläne</span>
                  <ArrowUpRight className="w-4 h-4" />
                </Link>
              </div>
            )}
          </HeroCard>
        </div>

        {/* ── 3. BENTO MODULE PILLS (Row of 4 modules, warm amber/dark styling) ── */}
        <div className="md:col-span-3 flex">
          <Link href="/cables-map" className="w-full block group">
            <HeroCard className="h-full rounded-[24px] bg-ui-card border border-ui-border p-5 shadow-lg group-hover:border-[#FFD000]/60 group-hover:shadow-[0_10px_30px_rgba(255,208,0,0.15)] group-hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-[#FFD000]/15 border border-[#FFD000]/30 flex items-center justify-center text-[#FFD000] group-hover:scale-110 transition-transform">
                    <Cable className="w-5 h-5" />
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-ui-muted group-hover:text-[#FFD000] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                </div>
                <h4 className="text-sm md:text-base font-extrabold text-white group-hover:text-[#FFD000] transition-colors">
                  Kabel-Netzwerk
                </h4>
                <p className="text-[11px] text-ui-muted mt-1 leading-snug">
                  Topologische Netzwerkkarten und Leitungen
                </p>
              </div>
            </HeroCard>
          </Link>
        </div>

        <div className="md:col-span-3 flex">
          <Link href="/stromkreise" className="w-full block group">
            <HeroCard className="h-full rounded-[24px] bg-ui-card border border-ui-border p-5 shadow-lg group-hover:border-[#FFD000]/60 group-hover:shadow-[0_10px_30px_rgba(255,208,0,0.15)] group-hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-[#FFD000]/15 border border-[#FFD000]/30 flex items-center justify-center text-[#FFD000] group-hover:scale-110 transition-transform">
                    <Activity className="w-5 h-5" />
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-ui-muted group-hover:text-[#FFD000] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                </div>
                <h4 className="text-sm md:text-base font-extrabold text-white group-hover:text-[#FFD000] transition-colors">
                  Stromkreise & UV
                </h4>
                <p className="text-[11px] text-ui-muted mt-1 leading-snug">
                  Unterverteiler, Sicherungen & Lasten
                </p>
              </div>
            </HeroCard>
          </Link>
        </div>

        <div className="md:col-span-3 flex">
          <Link href="/bma-automation" className="w-full block group">
            <HeroCard className="h-full rounded-[24px] bg-ui-card border border-ui-border p-5 shadow-lg group-hover:border-[#FFD000]/60 group-hover:shadow-[0_10px_30px_rgba(255,208,0,0.15)] group-hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-ui-muted group-hover:text-emerald-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                </div>
                <h4 className="text-sm md:text-base font-extrabold text-white group-hover:text-emerald-400 transition-colors">
                  BMA Automatik
                </h4>
                <p className="text-[11px] text-ui-muted mt-1 leading-snug">
                  Brandmeldeanlagen & Ringbus-Berechnung
                </p>
              </div>
            </HeroCard>
          </Link>
        </div>

        <div className="md:col-span-3 flex">
          <Link href="/maengelanzeige" className="w-full block group">
            <HeroCard className="h-full rounded-[24px] bg-ui-card border border-ui-border p-5 shadow-lg group-hover:border-[#FFD000]/60 group-hover:shadow-[0_10px_30px_rgba(255,208,0,0.15)] group-hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-ui-muted group-hover:text-amber-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                </div>
                <h4 className="text-sm md:text-base font-extrabold text-white group-hover:text-amber-400 transition-colors">
                  Mängelanzeige
                </h4>
                <p className="text-[11px] text-ui-muted mt-1 leading-snug">
                  VOB/B-konforme Fotopins & Berichte
                </p>
              </div>
            </HeroCard>
          </Link>
        </div>

      </div>
    </section>
  );
}

export default Et4uBentoHero;
