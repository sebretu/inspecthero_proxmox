"use client";

import React from "react";
import dynamic from "next/dynamic";
import { useLanguage } from "../../contexts/LanguageContext";

const EditorContainer = dynamic(() => import("../../components/StandalonePdfEditor/EditorContainer"), {
  ssr: false,
});

export default function PdfEditorClient() {
  const { t } = useLanguage();

  return (
    <div className="w-full h-screen flex flex-col bg-white dark:bg-gray-900">
      <header className="h-16 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex items-center px-6 shadow-sm shrink-0">
        <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
          {t("nav", "pdfEditor", "Edytor PDF")}
        </h1>
        <div className="ml-auto text-sm text-gray-500 dark:text-gray-400">
          {t("common", "localChangesOnly", "Wszystkie zmiany są zapisywane tylko na Twoim urządzeniu")}
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        <EditorContainer />
      </main>
    </div>
  );
}
