import React from "react";
import PdfEditorClient from "./PdfEditorClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Edytor PDF | ET⚡U.DE",
  description: "Narzędzie do edycji plików PDF, dodawania opisów i symboli elektrycznych.",
};

export default function PdfEditorPage() {
  return <PdfEditorClient />;
}
