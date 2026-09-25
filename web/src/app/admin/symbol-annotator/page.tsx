import { Metadata } from "next";
import SymbolAnnotatorClient from "./SymbolAnnotatorClient";

export const metadata: Metadata = {
  title: "YOLO Symbol Annotator - InspectHero",
  description: "Ręczny annotator symboli elektrycznych do treningu modeli detekcji YOLO",
};

export default function SymbolAnnotatorPage() {
  return <SymbolAnnotatorClient />;
}
