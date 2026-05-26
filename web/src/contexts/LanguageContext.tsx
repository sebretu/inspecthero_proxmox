"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { translations, Language } from "@/lib/translations";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (namespace: keyof typeof translations["en"], key: string, defaultValue?: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");
  const [mounted, setMounted] = useState(false);

  // Load saved language preference from localStorage
  useEffect(() => {
    const savedLanguage = localStorage.getItem("language") as Language | null;
    if (savedLanguage && (savedLanguage === "en" || savedLanguage === "pl" || savedLanguage === "de" || savedLanguage === "sk")) {
      setLanguageState(savedLanguage);
    } else {
      // Auto-detect browser language
      const browserLang = navigator.language.split("-")[0] as Language;
      if (browserLang === "pl" || browserLang === "de" || browserLang === "sk") {
        setLanguageState(browserLang);
      }
    }
    setMounted(true);
  }, []);

  const setLanguage = (lang: Language) => {
    console.log("[LanguageContext] Setting language to:", lang);
    setLanguageState(lang);
    localStorage.setItem("language", lang);
    console.log("[LanguageContext] Language saved to localStorage:", localStorage.getItem("language"));
  };

  const t = (namespace: keyof typeof translations["en"], key: string, defaultValue?: string): string => {
    if (!mounted) return defaultValue || key;
    const ns = translations[language][namespace]  as any;
    const result = ns?.[key] ?? defaultValue ?? key;
    // console.log(`[t] ${namespace}.${key} (${language}) =>`, result);
    return result;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return context;
}
