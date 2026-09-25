"use client";

import React, { useState, useEffect } from "react";
import QRCode from "react-qr-code";
import { X, Printer, Download, Monitor } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { BrotherProvider } from "@/lib/brotherProvider";

interface Props {
  planId: string;
  planName: string;
  onClose: () => void;
}

export default function BmaPlanQrModal({ planId, planName, onClose }: Props) {
  const { t } = useLanguage();
  const [domain, setDomain] = useState("");
  const [qrPrinterType, setQrPrinterType] = useState<"brother_40x18" | "brother_50x24" | "zebra" | "brother_csv">("brother_40x18");

  useEffect(() => {
    setDomain(window.location.origin);
    const saved = localStorage.getItem("qrPrinterType_plan");
    if (saved) setQrPrinterType(saved as any);
  }, []);

  useEffect(() => {
    localStorage.setItem("qrPrinterType_plan", qrPrinterType);
  }, [qrPrinterType]);

  const publicUrl = `${domain}/public/bma/${planId}`;

  const handlePrint = () => {
    if (qrPrinterType === "brother_csv") {
      let csvContent = "ID,Type,Name,Project,QR_URL\n";
      csvContent += `"${planId}","PLAN","${planName}","","${publicUrl}"\n`;
      const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `plan_qr_${planId}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    if (qrPrinterType.startsWith("brother")) {
      const tapeWidth = qrPrinterType === "brother_40x18" ? 18 : 24;
      BrotherProvider.printLabels([{
        id: planId,
        type: "plan",
        name: planName,
        info: "BMA AUTOMATION PLAN",
        origin: domain
      }], tapeWidth as 18 | 24);
      return;
    }

    // Zebra / Browser Print
    const svgEl = document.querySelector("#qr-hidden-plan svg");
    if (!svgEl) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    let pageStyle = "";
    let bodyStyle = "";
    let contentHtml = "";

    if (qrPrinterType === "zebra") {
      pageStyle = "@page { size: 39mm 52mm; margin: 0; }";
      bodyStyle = "width: 39mm; height: 52mm; flex-direction: column; align-items: center; justify-content: center;";
      contentHtml = `
        <div style="width: 100%; height: 2mm; background: #2563eb; position: absolute; top: 0; left: 0;"></div>
        <div style="width: 34mm; height: 34mm; display: flex; align-items: center; justify-content: center; margin-top: 2mm;">
          ${svgEl.outerHTML.replace(/width="[^"]*"/, 'width="32mm"').replace(/height="[^"]*"/, 'height="32mm"')}
        </div>
        <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1mm 2mm; text-align: center; width: 100%; box-sizing: border-box;">
          <div style="font-size: 7pt; font-weight: bold; color: #2563eb; text-transform: uppercase; margin-bottom: 1mm;">BMA PLAN</div>
          <div style="font-size: 9pt; font-weight: bold; color: #111827; line-height: 1.1; margin-bottom: 1mm;">${planName}</div>
          <div style="font-size: 6pt; color: #64748b;">Scan to view interactive map</div>
        </div>
      `;
    }

    printWindow.document.write(`<!DOCTYPE html>
      <html>
        <head>
          <title>Print Plan QR</title>
          <style>
            ${pageStyle}
            body { margin: 0; padding: 0; display: flex; font-family: sans-serif; background: white; color: black; overflow: hidden; position: relative; ${bodyStyle} }
          </style>
        </head>
        <body>
          ${contentHtml}
          <script>setTimeout(() => { window.print(); window.close(); }, 300);</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 z-[20000] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" onClick={onClose} />
      
      <div id="qr-hidden-plan" className="hidden">
         <QRCode value={publicUrl} size={120} level="M" />
      </div>

      <div className="relative w-full max-w-lg bg-[#0f172a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
         {/* Header */}
         <div className="p-8 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-4">
               <div className="w-12 h-12 rounded-2xl bg-blue-600/20 flex items-center justify-center border border-blue-500/50">
                  <Printer className="w-6 h-6 text-blue-400" />
               </div>
               <div>
                  <h3 className="text-xl font-black text-white uppercase tracking-tight">Generate Plan QR</h3>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Industrial Label System</p>
               </div>
            </div>
            <button onClick={onClose} className="p-3 bg-white/5 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-all">
               <X className="w-5 h-5" />
            </button>
         </div>

         <div className="p-10 space-y-10">
            {/* QR Preview */}
            <div className="flex flex-col items-center gap-6">
               <div className="p-6 bg-white rounded-2xl shadow-2xl shadow-blue-500/10 scale-110">
                  <QRCode value={publicUrl} size={160} level="H" />
               </div>
               <div className="text-center space-y-2">
                  <p className="text-[11px] font-black text-white uppercase tracking-widest">{planName}</p>
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest break-all px-12">{publicUrl}</p>
               </div>
            </div>

            {/* Printer Selection */}
            <div className="space-y-6">
               <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Select Hardware Configuration</p>
               <div className="grid grid-cols-2 gap-4">
                  {[
                    { id: "brother_40x18", label: "Brother 18mm" },
                    { id: "brother_50x24", label: "Brother 24mm" },
                    { id: "zebra", label: "Zebra G52" },
                    { id: "brother_csv", label: "Export CSV" }
                  ].map((p) => (
                    <button 
                       key={p.id}
                       onClick={() => setQrPrinterType(p.id as any)}
                       className={`px-6 py-4 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all ${qrPrinterType === p.id ? "bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/20" : "bg-white/5 border-white/10 text-slate-500 hover:text-white hover:border-white/20"}`}
                    >
                       {p.label}
                    </button>
                  ))}
               </div>
            </div>

            {/* Actions */}
            <div className="flex gap-4">
               <button 
                  onClick={() => window.open(publicUrl, '_blank')}
                  className="flex-1 flex items-center justify-center gap-3 py-6 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black text-slate-300 uppercase tracking-widest hover:bg-white/10 hover:text-white transition-all"
               >
                  <Monitor className="w-4 h-4" />
                  Preview View
               </button>
               <button 
                  onClick={handlePrint}
                  className="flex-1 flex items-center justify-center gap-3 py-6 bg-blue-600 shadow-2xl shadow-blue-600/30 rounded-2xl text-[10px] font-black text-white uppercase tracking-[0.2em] hover:bg-blue-500 transition-all hover:scale-[1.02]"
               >
                  {qrPrinterType === 'brother_csv' ? <Download className="w-4 h-4" /> : <Printer className="w-4 h-4" />}
                  {qrPrinterType === 'brother_csv' ? "DOWNLOAD CSV" : "PRINT LABEL"}
               </button>
            </div>
         </div>
      </div>
    </div>
  );
}
