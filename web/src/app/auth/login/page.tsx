"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "@/contexts/LanguageContext";
import { PWAInstallBanner } from "@/components/PWAInstallBanner";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Et4uLogo } from "@/components/Et4uLogo";
import { useAntiGravity3D } from "@/lib/antiGravity3d";
import { Lock, Mail, Eye, EyeOff, ArrowRight } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const cardRef = useAntiGravity3D<HTMLDivElement>({ maxRotation: 4, enableShine: true });

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }

      // Wait a moment for auth state to update
      await new Promise((r) => setTimeout(r, 300));

      // Redirect to home
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setLoading(false);
    }
  }

  return (
    <>
      <PWAInstallBanner />
      <div className="min-h-screen w-full flex items-center justify-center p-4 bg-[#101114] relative overflow-hidden font-sans select-none ag-perspective-container">
        {/* Ambient background glows */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#FFD000]/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#1A73E8]/10 rounded-full blur-[120px] pointer-events-none" />

        <div
          ref={cardRef}
          className="ag-3d-card w-full max-w-md bg-[#1B1D21]/90 backdrop-blur-2xl border border-[#FFD000]/20 rounded-[36px] p-8 md:p-10 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] relative z-10"
        >
          <div className="card-shine" />

          {/* Top Bar with Language Selector */}
          <div className="ag-layer-decor flex items-center justify-between mb-8">
            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-ui-muted/70 bg-white/5 px-3 py-1 rounded-full border border-white/5">
              Portal Access
            </span>
            <LanguageSwitcher />
          </div>

          {/* Brand Logo & Headline */}
          <div className="ag-layer-content text-center mb-8 flex flex-col items-center">
            <Et4uLogo size="lg" animated className="mb-4" />
            <p className="text-ui-muted text-xs font-medium tracking-wide">
              {t("auth", "subtitle", "Digitale Plattform für Elektrotechnik")}
            </p>
          </div>

          {error && (
            <div className="ag-layer-badge mb-6 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-2.5 shadow-sm">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            {/* Email Field */}
            <div className="ag-layer-content space-y-2">
              <label className="block text-xs font-bold text-ui-muted uppercase tracking-wider">
                {t("auth", "demoEmail", "E-Mail-Adresse")}
              </label>
              <div className="relative flex items-center">
                <Mail className="absolute left-4 w-4 h-4 text-ui-muted pointer-events-none" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  placeholder="name@et4u.de"
                  className="w-full bg-[#101114] border border-white/10 rounded-2xl pl-11 pr-4 py-3.5 text-sm text-white placeholder:text-ui-muted/30 focus:outline-none focus:border-[#FFD000] transition-colors"
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="ag-layer-content space-y-2">
              <label className="block text-xs font-bold text-ui-muted uppercase tracking-wider">
                {t("auth", "demoPassword", "Passwort")}
              </label>
              <div className="relative flex items-center">
                <Lock className="absolute left-4 w-4 h-4 text-ui-muted pointer-events-none" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  placeholder="••••••••"
                  className="w-full bg-[#101114] border border-white/10 rounded-2xl pl-11 pr-12 py-3.5 text-sm text-white placeholder:text-ui-muted/30 focus:outline-none focus:border-[#FFD000] transition-colors"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={loading}
                  className="absolute right-4 text-ui-muted hover:text-white transition-colors"
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <div className="ag-layer-btn pt-3">
              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2.5 py-4 px-6 rounded-[100px] bg-gradient-to-r from-[#FFD000] via-[#FBBF24] to-[#F59E0B] text-black font-black text-sm tracking-wider uppercase shadow-[0_10px_25px_rgba(255,208,0,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>{loading ? t("auth", "loggingIn", "Anmeldung...") : t("auth", "loginButton", "Anmelden")}</span>
                {!loading && <ArrowRight className="w-4 h-4 text-black stroke-[3]" />}
              </button>
            </div>
          </form>

          <div className="ag-layer-decor mt-8 pt-6 border-t border-white/5 text-center text-[11px] text-ui-muted/60">
            ET⚡U.DE • German Electrical Engineering Platform
          </div>
        </div>
      </div>
    </>
  );
}
