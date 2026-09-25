import { Metadata } from "next";
import SymbolCropsClient from "./SymbolCropsClient";

export const metadata: Metadata = {
  title: "Inspekcja Jakości Cropów - ET⚡U.DE",
  description: "Wizualne zarządzenie jakością datasetu symboli elektrycznych do celów RAG/CLIP",
};

export default function SymbolCropsPage() {
  return <SymbolCropsClient />;
}
