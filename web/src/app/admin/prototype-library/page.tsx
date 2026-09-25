import { Metadata } from "next";
import PrototypeLibraryClient from "./PrototypeLibraryClient";

export const metadata: Metadata = {
  title: "Menedżer Biblioteki Prototypów — ET⚡U.DE",
  description: "Ręcznie weryfikowana biblioteka wzorców symboli CAD do wyszukiwania wektorowego",
};

export default function PrototypeLibraryPage() {
  return <PrototypeLibraryClient />;
}
