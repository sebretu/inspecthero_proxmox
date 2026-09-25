import { Metadata } from "next";
import SymbolDetectionClient from "./SymbolDetectionClient";

export const metadata: Metadata = {
  title: "Detekcja Symboli AI - ET⚡U.DE",
  description: "Automatyczne rozpoznawanie symboli elektrycznych z planów PDF za pomocą RAG/CLIP oraz współrzędnych przestrzennych",
};

export default function SymbolDetectionPage() {
  return <SymbolDetectionClient />;
}
