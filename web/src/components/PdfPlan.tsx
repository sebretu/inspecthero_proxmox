"use client";

import { useEffect, useMemo, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

// PDF.js worker (ważne, bez tego często jest pusty/szary)
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

export default function PdfPlan({
  planId,
  height = "calc(100vh - 120px)",
}: {
  planId: string;
  height?: string | number;
}) {
  const fileUrl = useMemo(() => `/api/plans/pdf?id=${encodeURIComponent(planId)}`, [planId]);

  const [numPages, setNumPages] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [width, setWidth] = useState<number>(900);

  // dopasuj szerokość do kontenera/okna
  useEffect(() => {
    const onResize = () => {
      // trochę marginesu
      setWidth(Math.min(1200, Math.max(320, window.innerWidth - 80)));
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <div style={{ width: "100%", height, overflow: "auto", background: "#f6f6f6" }}>
      <div style={{ padding: 10, fontSize: 12, opacity: 0.7 }}>
        PDF podkład (planId: <span style={{ fontFamily: "monospace" }}>{planId}</span>)
      </div>

      {err ? (
        <div style={{ padding: 12, color: "crimson" }}>
          ❌ PDF error: {err}
          <div style={{ marginTop: 8 }}>
            <a href={fileUrl} target="_blank" rel="noreferrer">
              Otwórz PDF w nowej karcie
            </a>
          </div>
        </div>
      ) : null}

      <div style={{ display: "grid", justifyContent: "center", paddingBottom: 24 }}>
        <Document
          file={fileUrl}
          onLoadSuccess={(info) => {
            setNumPages(info.numPages);
            setErr(null);
          }}
          onLoadError={(e: any) => setErr(e?.message || String(e))}
          loading={<div style={{ padding: 12 }}>Ładuję PDF…</div>}
          error={<div style={{ padding: 12, color: "crimson" }}>Nie udało się wczytać PDF.</div>}
        >
          {/* render pierwszej strony jako podkład; jak chcesz wszystkie, dam pętlę */}
          <Page
            pageNumber={1}
            width={width}
            renderTextLayer={false}
            renderAnnotationLayer={false}
          />
        </Document>

        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7, textAlign: "center" }}>
          Stron: {numPages ?? "…"} •{" "}
          <a href={fileUrl} target="_blank" rel="noreferrer">
            Otwórz PDF
          </a>
        </div>
      </div>
    </div>
  );
}
