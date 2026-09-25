import { Metadata } from "next";
import SymbolAnalyticsClient from "./SymbolAnalyticsClient";

export const metadata: Metadata = {
  title: "Analityka Modelu i Klastry AI - ET⚡U.DE",
  description: "Wersjonowanie danych treningowych, klasteryzacja bez nadzoru, jakość detekcji oraz metryki benchmarku",
};

export default function SymbolAnalyticsPage() {
  return <SymbolAnalyticsClient />;
}
