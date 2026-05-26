"use client";

import { useLanguage } from "@/contexts/LanguageContext";
import { Language } from "@/lib/translations";

export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="lang-switcher">
      <span className="lang-icon" aria-hidden="true">
        🌐
      </span>
      <select
        className="lang-select"
        value={language}
        onChange={(e) => setLanguage(e.target.value as Language)}
        aria-label="Language"
        suppressHydrationWarning
      >
        <option value="en">English</option>
        <option value="pl">Polski</option>
        <option value="de">Deutsch</option>
        <option value="sk">Slovenčina</option>
      </select>
      <span className="lang-caret" aria-hidden="true">
        ▾
      </span>
    </div>
  );
}
