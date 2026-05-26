"use client";
import { useState, useMemo, useEffect } from "react";
import { apiPatch, apiDelete, apiPost } from "@/lib/apiClient";
import { BrotherProvider } from "@/lib/brotherProvider";
import dynamic from "next/dynamic";
import { useLanguage } from "@/contexts/LanguageContext";
import { TrommelVisual } from "./TrommelVisual";
import { motion } from "framer-motion";


const LeafletMap = dynamic(
  () => import("./_CableMapLeaflet").then(m => ({ default: m.CableMapLeaflet })),
  { ssr: false }
);

interface TrommelCable {
  id: string; name: string; index_number?: number | null; length: number | null; status: string;
  cable_type?: string | null;
  cable_routes?: { 
    id: string; name: string | null; point_a_label: string; point_b_label: string; 
    plan_id?: string | null; point_a_x?: number | null; point_a_y?: number | null; point_b_x?: number | null; point_b_y?: number | null;
    plan_id_2?: string | null; point_c_x?: number | null; point_c_y?: number | null; point_d_x?: number | null; point_d_y?: number | null;
    waypoints?: { x: number; y: number }[] | null;
    waypoints_2?: { x: number; y: number }[] | null;
  } | null;
  reported_profile?: { id: string; full_name: string } | null;
}

interface Trommel {
  id: string; name: string; total_length: number | null;
  index_number?: number | null;
  used_length?: number; remaining_length?: number | null; cables?: TrommelCable[];
  photo_url?: string | null;
  company_name?: string | null;
  serial_number?: string | null;
  cable_type?: string | null;
  diameter?: number | null;
  status?: "pending" | "delivered" | "empty" | "pickup_requested" | "picked_up";
  pickup_requested_at?: string | null;
  pickup_requested_email_sent?: boolean;
  picked_up_at?: string | null;
  pickup_email_sent?: boolean;
  is_archived?: boolean;
}

interface Props {
  trommel: Trommel;
  token: string | null;
  onClose: () => void;
  onUpdated?: (tr: Trommel) => void;
  onDeleted?: (id: string) => void;
  isMod?: boolean;
  isAdmin?: boolean;
  onCableClick?: (cable: TrommelCable) => void;
  onEditCable?: (cable: TrommelCable) => void;
  cableTypes?: string[];
  initialEditing?: boolean;
}

const COLORS = ["#38bdf8","#f97316","#a78bfa","#34d399","#fb7185","#fbbf24","#60a5fa","#f472b6","#4ade80","#e879f9"];
const STATUS_COLOR: Record<string, string> = { pending: "#fde047", in_progress: "#93c5fd", done: "#86efac" };

import QRCode from "react-qr-code";

export function TrommelPanel({ trommel, token, onClose, onUpdated, onDeleted, isMod, isAdmin, onCableClick, onEditCable, cableTypes = [], initialEditing = false }: Props) {
  const { t } = useLanguage();
  const [showMap, setShowMap] = useState(false);
  const [editing, setEditing] = useState(initialEditing);
  const [editName, setEditName] = useState(trommel.name);
  const [editLen, setEditLen] = useState(trommel.total_length != null ? String(trommel.total_length) : "");
  const [editCompany, setEditCompany] = useState(trommel.company_name || "");
  const [editSerial, setEditSerial] = useState(trommel.serial_number || "");
  const [editType, setEditType] = useState(trommel.cable_type || "");
  const [editDiameter, setEditDiameter] = useState(trommel.diameter != null ? String(trommel.diameter) : "");
  const [editPhotoBase64, setEditPhotoBase64] = useState<string | null>(null);
  const [editPhotoName, setEditPhotoName] = useState("");
  const [editStatus, setEditStatus] = useState(trommel.status || "pending");
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [domain, setDomain] = useState("");
  const [qrPrinterType, setQrPrinterType] = useState<"brother_40x18" | "brother_50x24" | "zebra" | "brother_csv">("brother_40x18");

  // Correction System states
  const [showCorrection, setShowCorrection] = useState(false);
  const [actualRemaining, setActualRemaining] = useState("");
  const [isCorrecting, setIsCorrecting] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("qrPrinterType_single");
    if (saved) setQrPrinterType(saved as any);
  }, []);

  useEffect(() => {
    localStorage.setItem("qrPrinterType_single", qrPrinterType);
  }, [qrPrinterType]);

  useEffect(() => { setDomain(window.location.origin); }, []);

  const cables = trommel.cables || [];
  const usedLength = trommel.used_length ?? cables.reduce((s, c) => s + (c.length || 0), 0);
  const totalLength = trommel.total_length;
  const remainingLength = totalLength != null ? totalLength - usedLength : null;
  const usedPct = totalLength ? Math.min(100, (usedLength / totalLength) * 100) : 0;

  const mappableCables = useMemo(() => cables.filter(c => {
    const r = c.cable_routes;
    if (!r) return false;
    const hasP1 = r.plan_id && r.point_a_x != null && r.point_b_x != null;
    const hasP2 = r.plan_id_2 && r.point_c_x != null && r.point_d_x != null;
    return hasP1 || hasP2;
  }), [cables]);

  const cablesByPlan = useMemo(() => {
    const m: Record<string, TrommelCable[]> = {};
    for (const c of mappableCables) {
      const r = c.cable_routes!;
      if (r.plan_id && r.point_a_x != null) {
        if (!m[r.plan_id]) m[r.plan_id] = [];
        m[r.plan_id].push(c);
      }
      if (r.plan_id_2 && r.point_c_x != null) {
        if (!m[r.plan_id_2]) m[r.plan_id_2] = [];
        if (!m[r.plan_id_2].find(x => x.id === c.id)) {
          m[r.plan_id_2].push(c);
        }
      }
    }
    return m;
  }, [mappableCables]);

  const planIds = Object.keys(cablesByPlan);
  const [selectedPlan, setSelectedPlan] = useState("");
  const activePlan = selectedPlan || planIds[0] || "";
  const planCables = cablesByPlan[activePlan] || [];

  const mapProps = useMemo(() => {
    if (planCables.length === 0) return null;
    
    return {
      planId: activePlan,
      routes: planCables.map((c, i) => {
        const r = c.cable_routes!;
        const isPlan1 = r.plan_id === activePlan;
        return {
          id: c.id,
          name: c.index_number ? `#${c.index_number} ${c.name}` : c.name,
          color: COLORS[i % COLORS.length],
          pinA: isPlan1 ? { x: r.point_a_x!, y: r.point_a_y! } : { x: r.point_c_x!, y: r.point_c_y! },
          pinB: isPlan1 ? { x: r.point_b_x!, y: r.point_b_y! } : { x: r.point_d_x!, y: r.point_d_y! },
          labelA: isPlan1 ? r.point_a_label : "Wjazd z planu 1",
          labelB: isPlan1 ? (r.plan_id_2 ? "Przejście na plan 2" : r.point_b_label) : r.point_b_label,
          waypoints: isPlan1 ? (Array.isArray(r.waypoints) ? r.waypoints : []) : (Array.isArray(r.waypoints_2) ? r.waypoints_2 : [])
        };
      })
    };
  }, [planCables, activePlan]);

  async function handleSave() {
    if (!editName.trim()) return;
    setSaving(true); setErr(null);
    try {
      const body: any = { id: trommel.id };
      if (editName.trim() !== trommel.name) body.name = editName.trim();
      const lenVal = editLen === "" ? null : Number(editLen);
      if (lenVal !== trommel.total_length) body.total_length = lenVal;
      if ((editCompany || null) !== trommel.company_name) body.company_name = editCompany.trim() || null;
      if ((editSerial || null) !== trommel.serial_number) body.serial_number = editSerial.trim() || null;
      if ((editType || null) !== trommel.cable_type) body.cable_type = editType.trim() || null;
      const diaVal = editDiameter === "" ? null : Number(editDiameter);
      if (diaVal !== trommel.diameter) body.diameter = diaVal;

      if (editPhotoBase64) {
        try {
          const res = await fetch("/api/trommel-photos", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ trommel_id: trommel.id, base64: editPhotoBase64, file_name: editPhotoName || "photo.jpg" })
          });
          const j = await res.json();
          if (j.ok) body.photo_url = j.data.url;
        } catch {}
      }

      const currentSerial = body.serial_number !== undefined ? body.serial_number : trommel.serial_number;
      const currentPhoto = body.photo_url !== undefined ? body.photo_url : trommel.photo_url;
      let nextStatus = editStatus;
      
      // Auto-status logic: if has serial and photo, and it was pending, move to delivered
      if (currentSerial && currentPhoto && editStatus === "pending") {
        nextStatus = "delivered";
      }
      
      if (nextStatus !== trommel.status) body.status = nextStatus;

      if (Object.keys(body).length <= 1) { setEditing(false); return; }

      const updated = await apiPatch<any>("/api/trommels", body);
      onUpdated?.({ ...trommel, ...updated, cables: trommel.cables });
      setEditing(false);
      setEditPhotoBase64(null);
    } catch (e: any) { setErr(e?.message || "Błąd"); }
    finally { setSaving(false); }
  }

  async function handleCorrection() {
    const actual = Number(actualRemaining);
    if (isNaN(actual) || actual < 0) return;
    if (cables.length === 0) return;
    if (totalLength === null) return;

    setIsCorrecting(true);
    setErr(null);

    try {
      // 1. Calculate current state
      const totalUsedCalculated = cables.reduce((s, c) => s + (c.length || 0), 0);
      if (totalUsedCalculated === 0) {
        throw new Error("Brak przypisanych długości kabli do skorygowania.");
      }

      const calculatedRemaining = totalLength - totalUsedCalculated;
      const missingMeters = calculatedRemaining - actual;

      // 2. Calculate adjustment factor
      // newTotalUsed = totalLength - actual
      // factor = (totalLength - actual) / totalUsedCalculated
      const factor = (totalLength - actual) / totalUsedCalculated;

      // 3. Update all cables
      const updates = cables.map(c => {
        const currentLen = c.length || 0;
        const newLen = Math.round(currentLen * factor); // Round to full meters
        return apiPatch<any>("/api/cables", { id: c.id, length: newLen }, token);
      });

      await Promise.all(updates);

      // 4. Refresh trommel data (local update for UI)
      const updatedCables = cables.map(c => {
        const currentLen = c.length || 0;
        const newLen = Math.round(currentLen * factor);
        return { ...c, length: newLen };
      });

      onUpdated?.({ 
        ...trommel, 
        cables: updatedCables,
        used_length: totalLength - actual,
        remaining_length: actual
      });

      setShowCorrection(false);
      setActualRemaining("");
      alert(t("cables", "correctionSuccess", "Długości kabli zostały skorygowane proporcjonalnie."));
    } catch (e: any) {
      setErr(e?.message || "Błąd podczas korekcji");
    } finally {
      setIsCorrecting(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Usunąć bęben "${trommel.name}"? Kable pozostaną, ale zostaną odpięte.`)) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/trommels?id=${trommel.id}`);
      onDeleted?.(trommel.id);
      onClose();
    } catch (e: any) { setErr(e?.message || "Błąd"); setDeleting(false); }
  }

  async function handleMarkEmpty() {
    if (!confirm(t("cables", "confirmMarkEmpty", "Oznaczyć bęben jako pusty?"))) return;
    try {
      const updated = await apiPatch<any>("/api/trommels", { id: trommel.id, status: "empty" });
      onUpdated?.({ ...trommel, ...updated, cables: trommel.cables });
    } catch (e: any) { setErr(e?.message || "Błąd"); }
  }

  async function handleReportPickup() {
    if (!confirm(t("cables", "confirmReportPickup", "Zgłosić bęben do odbioru przez e-mail?"))) return;
    setSaving(true);
    try {
      const subject = `${t("cables", "pickupEmailSubject", "Zgłoszenie odbioru bębna")} - ${trommel.name}`;
      const html = `
        <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 12px;">
          <h2 style="color: #0284c7; border-bottom: 2px solid #0284c7; padding-bottom: 10px;">${t("cables", "logisticSystem", "System logistyczny InspectHero")}</h2>
          <p style="font-size: 16px; margin: 20px 0; font-weight: bold;">${t("cables", "pickupEmailSubject", "Zgłoszenie odbioru bębna")}</p>
          <p style="font-size: 14px; margin: 10px 0;">${t("cables", "pickupEmailBody", "Proszę o odbiór pustego bębna:")}</p>
          <table style="width: 100%; border-collapse: collapse; margin-top: 20px; background: #f9f9f9; border-radius: 8px; overflow: hidden;">
            <tr><td style="padding: 12px; border-bottom: 1px solid #eee; font-weight: bold; width: 40%;">${t("cables", "serialNumber", "Nr bębna")}:</td><td style="padding: 12px; border-bottom: 1px solid #eee;">${trommel.serial_number || "-"}</td></tr>
            <tr><td style="padding: 12px; border-bottom: 1px solid #eee; font-weight: bold;">${t("cables", "companyName", "Firma")}:</td><td style="padding: 12px; border-bottom: 1px solid #eee;">${trommel.company_name || "-"}</td></tr>
            <tr><td style="padding: 12px; border-bottom: 1px solid #eee; font-weight: bold;">${t("cables", "cableType", "Typ kabla")}:</td><td style="padding: 12px; border-bottom: 1px solid #eee;">${trommel.cable_type || "-"}</td></tr>
            <tr><td style="padding: 12px; border-bottom: 1px solid #eee; font-weight: bold;">${t("cables", "diameter", "Średnica")}:</td><td style="padding: 12px; border-bottom: 1px solid #eee;">${trommel.diameter ? `${trommel.diameter} mm` : "-"}</td></tr>
          </table>
          ${trommel.photo_url ? `<div style="margin-top: 30px; text-align: center;"><img src="${trommel.photo_url}" style="max-width: 100%; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);" alt="Trommel Photo" /></div>` : ""}
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center;">
            <p style="font-size: 12px; color: #999; margin: 0;">${t("cables", "emailFooterSystem", "Wysłano z systemu InspectHero")}</p>
            <p style="font-size: 10px; color: #ccc; margin: 4px 0;">${t("cables", "automatedEmailNote", "Wiadomość wygenerowana automatycznie")}</p>
          </div>
        </div>
      `;
      
      await apiPost("/api/send-email", { to: "m.slapinski@etecprojekt.de", subject, html });
      
      const updated = await apiPatch<any>("/api/trommels", { id: trommel.id, status: "pickup_requested" });
      onUpdated?.({ ...trommel, ...updated, cables: trommel.cables });
    } catch (e: any) { setErr(e?.message || "Błąd wysyłki e-mail"); }
    finally { setSaving(false); }
  }

  async function handleMarkPickedUp() {
    if (!confirm(t("cables", "confirmMarkPickedUp", "Oznaczyć bęben jako odebrany z budowy?"))) return;
    setSaving(true);
    try {
      const updated = await apiPatch<any>("/api/trommels", { 
        id: trommel.id, 
        status: "picked_up",
        picked_up_at: new Date().toISOString()
      });
      onUpdated?.({ ...trommel, ...updated, cables: trommel.cables });
    } catch (e: any) { setErr(e?.message || "Błąd"); }
    finally { setSaving(false); }
  }

  async function handleUndoPickedUp() {
    if (!confirm(t("cables", "confirmUndoPickedUp", "Cofnąć oznaczenie jako odebrany?"))) return;
    setSaving(true);
    try {
      const updated = await apiPatch<any>("/api/trommels", { 
        id: trommel.id, 
        status: "empty",
        picked_up_at: null
      });
      onUpdated?.({ ...trommel, ...updated, cables: trommel.cables });
    } catch (e: any) { setErr(e?.message || "Błąd"); }
    finally { setSaving(false); }
  }
  
  async function handleArchive() {
    if (!confirm(t("cables", "confirmMoveToArchive", "Przenieść bęben do archiwum?"))) return;
    setSaving(true);
    try {
      const updated = await apiPatch<any>("/api/trommels", { 
        id: trommel.id, 
        is_archived: true
      });
      onUpdated?.({ ...trommel, ...updated, cables: trommel.cables });
      onClose(); // Close after archiving
    } catch (e: any) { setErr(e?.message || "Błąd"); }
    finally { setSaving(false); }
  }

  async function handleDetachCable(cableId: string) {
    if (!confirm(t("cables", "confirmDetachCable", "Odpiąć kabel od bębna?"))) return;
    try {
      await apiPatch("/api/cables", { id: cableId, trommel_id: null });
      if (trommel.cables) {
        const nextCables = trommel.cables.filter(c => c.id !== cableId);
        onUpdated?.({ ...trommel, cables: nextCables });
      }
    } catch (e: any) { setErr(e?.message || "Błąd podczas odpinania kabla"); }
  }

  function handlePrint() {
    if (qrPrinterType === "brother_csv") {
      const info = trommel.remaining_length != null ? `${t("cables_pdf", "remaining", "Pozostało")}: ${trommel.remaining_length}m` : "";
      const qrText = `${domain}/cables?scan_type=trommel&scan_id=${trommel.id}&name=${encodeURIComponent(trommel.name)}&index_number=${trommel.index_number || ""}`;
      let csvContent = "ID,Type,Number,Name,Info,Project,QR_URL\n";
      csvContent += `"${trommel.id}","TROMMEL","${trommel.index_number || ""}","${trommel.name}","${info}","","${qrText}"\n`;
      const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
      const filename = `label_trommel_${trommel.index_number || "new"}.csv`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    if (qrPrinterType.startsWith("brother")) {
      const tapeWidth = qrPrinterType === "brother_40x18" ? 18 : 24;
      const info = trommel.remaining_length != null ? `${t("cables_pdf", "remaining", "Pozostało")}: ${trommel.remaining_length}m` : "";
      BrotherProvider.printLabels([{
        id: trommel.id,
        type: "trommel",
        index_number: trommel.index_number,
        name: trommel.name,
        info: info,
        origin: domain
      }], tapeWidth as 18 | 24);
      return;
    }

    const svgEl = document.querySelector("#qr-hidden-container-trommel svg");
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
        <div style="width: 100%; height: 2mm; background: #f59e0b; position: absolute; top: 0; left: 0;"></div>
        <div style="width: 34mm; height: 34mm; display: flex; align-items: center; justify-content: center; margin-top: 2mm;">
          ${svgEl.outerHTML.replace(/width="[^"]*"/, 'width="32mm"').replace(/height="[^"]*"/, 'height="32mm"')}
        </div>
        <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1mm 2mm; text-align: center; width: 100%; box-sizing: border-box;">
          <div style="font-size: 7pt; font-weight: bold; color: #f59e0b; text-transform: uppercase; margin-bottom: 1mm;">TROMMEL</div>
          <div style="font-size: 9pt; font-weight: bold; color: #111827; line-height: 1.1; margin-bottom: 1mm;">${trommel.index_number ? `#${trommel.index_number} ` : ""}${trommel.name}</div>
          <div style="font-size: 7pt; color: #4b5563;">${trommel.cable_type || "-"} · ${trommel.total_length || "0"}m</div>
        </div>
      `;
    }

    printWindow.document.write(`<!DOCTYPE html>
      <html>
        <head>
          <title>Print Label</title>
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
  }

  const gaugeColor = remainingLength != null ? (remainingLength <= 0 ? "#f87171" : remainingLength < (totalLength! * 0.2) ? "#fde047" : "#86efac") : "#888";

  const displayPhoto = editPhotoBase64 || trommel.photo_url;

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = "auto"; };
  }, []);

  return (
    <div className="no-print" style={{ position: "fixed", inset: 0, zIndex: 12000, display: "flex", justifyContent: "flex-end" }}>
      
      <div id="qr-hidden-container-trommel" style={{ display: "none" }}>
        {domain && <QRCode value={`${domain}/cables?scan_type=trommel&scan_id=${trommel.id}&name=${encodeURIComponent(trommel.name)}&index_number=${trommel.index_number || ""}`} size={120} level="M" />}
      </div>

      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }} onClick={onClose} />
      <div className="custom-scrollbar" style={{ 
        position: "relative", 
        width: "min(580px, 100vw)", 
        height: "100%", 
        background: "#0f172a", 
        borderLeft: "1px solid rgba(255,255,255,0.1)", 
        display: "flex", 
        flexDirection: "column", 
        boxShadow: "-30px 0 80px rgba(0,0,0,0.6)",
        overflowY: "auto",
        zIndex: 12001
      }}>

        <div style={{ padding: "18px 22px 14px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: editing ? "column" : "row", alignItems: editing ? "stretch" : "center", justifyContent: "space-between", gap: editing ? 16 : 0, flexShrink: 0, position: "sticky", top: 0, background: "#0f172a", zIndex: 20 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: editing ? 8 : 0 }}>
              <p style={{ margin: 0, fontSize: 10, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", color: "#38bdf8" }}>{t("cables","trommelTitle","BĘBEN KABLOWY")}</p>
              {editing && <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#888", fontSize: 17, cursor: "pointer" }}>✕</button>}
            </div>
            {editing ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <input value={editName} onChange={e => setEditName(e.target.value)} style={{ width: "100%", padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(56,189,248,0.4)", background: "#000", color: "#fff", fontSize: 15, fontWeight: 700 }} autoFocus placeholder={t("cables", "trommelNamePlaceholder", "Nazwa bębna *")} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <input type="number" min={0} value={editLen} onChange={e => setEditLen(e.target.value)} placeholder={t("cables", "lengthOpt", "Długość (m)")} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "#000", color: "#fff", fontSize: 13 }} />
                  <div style={{ position: "relative" }}>
                    <input list="edit-cable-types" value={editType} onChange={e => setEditType(e.target.value)} placeholder={t("cables", "cableType", "Typ kabla")} style={{ width: "100%", padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "#000", color: "#fff", fontSize: 13 }} />
                    <datalist id="edit-cable-types">
                      {cableTypes.map(ct => <option key={ct} value={ct} />)}
                    </datalist>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <input value={editSerial} onChange={e => setEditSerial(e.target.value)} placeholder={t("cables", "serialNumber", "Nr trommla (Serial)")} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "#000", color: "#fff", fontSize: 13 }} />
                  <input value={editCompany} onChange={e => setEditCompany(e.target.value)} placeholder={t("cables", "companyName", "Nazwa firmy")} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "#000", color: "#fff", fontSize: 13 }} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <input type="number" min={0} value={editDiameter} onChange={e => setEditDiameter(e.target.value)} placeholder={t("cables", "diameter", "Średnica (cm)")} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "#000", color: "#fff", fontSize: 13 }} />
                  <select value={editStatus} onChange={e => setEditStatus(e.target.value as any)} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "#000", color: "#fff", fontSize: 13 }}>
                    <option value="pending">{t("cables", "trommel_status_pending", "Oczekuje")}</option>
                    <option value="delivered">{t("cables", "trommel_status_delivered", "Dostarczony")}</option>
                    <option value="empty">{t("cables", "trommel_status_empty", "Pusty")}</option>
                    <option value="pickup_requested">{t("cables", "trommel_status_pickup_requested", "Zgłoszony do odbioru")}</option>
                    <option value="picked_up">{t("cables", "trommel_status_picked_up", "Odebrany")}</option>
                  </select>
                </div>
                <div style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)" }}>
                  <p style={{ margin: "0 0 6px", fontSize: 10, fontWeight: 800, color: "#666", textTransform: "uppercase" }}>{t("cables", "trommelPhoto", "Zdjęcie bębna")}</p>
                  <input type="file" accept="image/*" onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setEditPhotoName(f.name);
                      const reader = new FileReader();
                      reader.onload = (ev) => setEditPhotoBase64(ev.target?.result as string);
                      reader.readAsDataURL(f);
                    }
                  }} style={{ fontSize: 11, color: "#888" }} />
                  {displayPhoto && <p style={{ margin: "4px 0 0", fontSize: 10, color: "#22c55e" }}>✓ Foto wybrane</p>}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button onClick={handleSave} disabled={saving} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "#22c55e", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>{saving ? "..." : t("common","save","Zapisz")}</button>
                  <button onClick={() => { setEditing(false); setEditName(trommel.name); setEditPhotoBase64(null); }} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#888", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>{t("common","cancel","Anuluj")}</button>
                </div>
              </div>
            ) : (
              <div>
                <h2 style={{ margin: "4px 0 0", fontSize: 19, fontWeight: 900, color: "#fff" }}>
                  🔄 {trommel.index_number ? `#${trommel.index_number} ` : ""}{trommel.name}
                </h2>
                <div style={{ display: "flex", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, fontWeight: 900, background: trommel.status === "delivered" ? "rgba(34,197,94,0.15)" : trommel.status === "empty" ? "rgba(56,189,248,0.15)" : trommel.status === "pickup_requested" ? "rgba(245,158,11,0.15)" : trommel.status === "picked_up" ? "rgba(16,185,129,0.2)" : "rgba(255,255,255,0.05)", color: trommel.status === "delivered" ? "#86efac" : trommel.status === "empty" ? "#38bdf8" : trommel.status === "pickup_requested" ? "#fbbf24" : trommel.status === "picked_up" ? "#10b981" : "#888", border: `1px solid ${trommel.status === "delivered" ? "rgba(34,197,94,0.3)" : trommel.status === "empty" ? "rgba(56,189,248,0.3)" : trommel.status === "pickup_requested" ? "rgba(245,158,11,0.3)" : trommel.status === "picked_up" ? "rgba(16,185,129,0.4)" : "rgba(255,255,255,0.1)"}` }}>
                    {trommel.status === "delivered" ? "🚚 " + t("cables", "trommel_status_delivered", "Dostarczony") : 
                     trommel.status === "empty" ? "📦 " + t("cables", "trommel_status_empty", "Pusty") : 
                     trommel.status === "pickup_requested" ? "📧 " + t("cables", "trommel_status_pickup_requested", "Zgłoszony do odbioru") :
                     trommel.status === "picked_up" ? "✅ " + t("cables", "trommel_status_picked_up", "Odebrany") :
                     "🕒 " + t("cables", "trommel_status_pending", "Oczekuje")}
                  </span>
                  {trommel.is_archived && (
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, fontWeight: 900, background: "rgba(100,116,139,0.2)", color: "#94a3b8", border: "1px solid rgba(100,116,139,0.3)" }}>
                      📁 {t("cables", "archiveTab", "Archiwum")}
                    </span>
                  )}
                  {trommel.company_name && <span style={{ fontSize: 11, color: "#888", fontWeight: 700 }}>🏭 {trommel.company_name}</span>}
                  {trommel.serial_number && <span style={{ fontSize: 11, color: "#38bdf8", fontWeight: 800 }}>№ {trommel.serial_number}</span>}
                  {trommel.cable_type && <span style={{ fontSize: 11, color: "#a78bfa", fontWeight: 800 }}>🔌 {trommel.cable_type}</span>}
                  {trommel.diameter && <span style={{ fontSize: 11, color: "#fb7185", fontWeight: 800 }}>⭕ Ø {trommel.diameter}cm</span>}
                </div>
              </div>
            )}
          </div>
          {!editing && (
            <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
              {isMod && (
                <button onClick={() => setEditing(true)} style={{ padding: "7px 12px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#888", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>✏️ {t("common","edit","Edytuj")}</button>
              )}
              <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#888", fontSize: 17, cursor: "pointer" }}>✕</button>
            </div>
          )}
        </div>

        {err && <div style={{ padding: "8px 22px", background: "rgba(239,68,68,0.1)", color: "#f87171", fontSize: 12, fontWeight: 700 }}>{err}</div>}

        <div style={{ flex: 1, overflowY: "auto" }}>
          {!editing && (
             <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 22px 0", gap: 20 }}>
                <TrommelVisual 
                  totalLength={totalLength} 
                  usedLength={usedLength} 
                  cables={cables.map((c, i) => ({
                    id: c.id,
                    name: c.name,
                    length: c.length || 0,
                    color: COLORS[i % COLORS.length],
                    status: t("cables", `status_${c.status}`, c.status),
                    rawStatus: c.status,
                    location: c.cable_routes?.point_b_label,
                    user: c.reported_profile?.full_name
                  }))} 
                  name={trommel.name} 
                  cableType={trommel.cable_type} 
                  size={280}
                />
                
                <div style={{ padding: "10px", background: "rgba(255,255,255,0.05)", borderRadius: "16px", border: "1px solid rgba(255,255,255,0.1)" }}>
                   {domain && <QRCode value={`${domain}/cables?scan_type=trommel&scan_id=${trommel.id}&name=${encodeURIComponent(trommel.name)}&index_number=${trommel.index_number || ""}`} size={100} level="M" bgColor="transparent" fgColor="#fff" />}
                </div>
             </div>
          )}

          {!editing && trommel.photo_url && (
            <div style={{ padding: "16px 22px 0" }}>
              <img src={trommel.photo_url} alt={trommel.name} style={{ width: "100%", maxHeight: 200, objectFit: "cover", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)" }} />
            </div>
          )}

          <div style={{ padding: "16px 22px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "#888" }}>{t("cables","capacity","Pojemność")}</span>
              <span style={{ fontSize: 13, fontWeight: 900, color: usedPct >= 100 ? "#ef4444" : usedPct >= 80 ? "#f97316" : "#22c55e" }}>
                {totalLength != null ? `${usedLength}m / ${totalLength}m` : `${usedLength}m ${t("cables","used","użyte")}`}
              </span>
            </div>
            {totalLength != null && (
              <>
                <div style={{ height: 10, background: "rgba(255,255,255,0.06)", borderRadius: 5, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.min(100, usedPct)}%`, background: usedPct >= 100 ? "#ef4444" : usedPct >= 80 ? "#f97316" : "#22c55e", borderRadius: 5, transition: "width 0.4s" }} />
                </div>
                <div style={{ display: "flex", gap: 20, marginTop: 8 }}>
                  <div style={{ display: "flex", gap: 4, alignItems: "baseline" }}>
                    <span style={{ fontSize: 11, color: "#888", fontWeight: 700 }}>{t("cables","available","Dostępne")}:</span>
                    <span style={{ color: (remainingLength || 0) <= 0 ? "#f87171" : "#86efac", fontWeight: 900, fontSize: 13 }}>{Math.max(0, remainingLength ?? 0)}m</span>
                  </div>
                  <div style={{ display: "flex", gap: 4, alignItems: "baseline" }}>
                    <span style={{ fontSize: 11, color: "#888", fontWeight: 700 }}>{t("cables","cablesCount","kabli")}:</span>
                    <span style={{ color: "#fff", fontWeight: 900, fontSize: 13 }}>{cables.length}</span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* LENGTH CORRECTION SYSTEM */}
          {!editing && isMod && totalLength != null && cables.length > 0 && (
            <div style={{ padding: "12px 22px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(56,189,248,0.03)" }}>
              <button 
                onClick={() => setShowCorrection(!showCorrection)}
                style={{ 
                  width: "100%", 
                  display: "flex", 
                  alignItems: "center", 
                  justifyContent: "space-between", 
                  padding: "8px 0", 
                  background: "transparent", 
                  border: "none", 
                  cursor: "pointer",
                  color: "#38bdf8",
                  fontSize: 11,
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em"
                }}
              >
                <span>🛠 {t("cables", "lengthCorrection", "Korekcja długości")}</span>
                <span style={{ fontSize: 10, opacity: 0.5 }}>{showCorrection ? "▲" : "▼"}</span>
              </button>

              <motion.div
                initial={false}
                animate={{ height: showCorrection ? "auto" : 0, opacity: showCorrection ? 1 : 0 }}
                style={{ overflow: "hidden" }}
              >
                <div style={{ padding: "8px 0 4px", display: "flex", flexDirection: "column", gap: 10 }}>
                  <p style={{ margin: 0, fontSize: 11, color: "#888", lineHeight: 1.4 }}>
                    System skoryguje długości wszystkich kabli na bębnie tak, aby suma użytych metrów zgadzała się z faktycznym stanem.
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <div style={{ flex: 1, position: "relative" }}>
                      <input 
                        type="number" 
                        value={actualRemaining} 
                        onChange={e => setActualRemaining(e.target.value)}
                        placeholder={t("cables", "actualRemaining", "Faktycznie pozostało (m)")}
                        style={{ 
                          width: "100%", 
                          padding: "10px 14px", 
                          borderRadius: 12, 
                          border: "1px solid rgba(56,189,248,0.3)", 
                          background: "rgba(0,0,0,0.4)", 
                          color: "#fff", 
                          fontSize: 13,
                          fontWeight: 700
                        }} 
                      />
                    </div>
                    <button 
                      onClick={handleCorrection}
                      disabled={isCorrecting || !actualRemaining}
                      style={{ 
                        padding: "0 20px", 
                        borderRadius: 12, 
                        border: "none", 
                        background: "#38bdf8", 
                        color: "#0f172a", 
                        fontWeight: 900, 
                        fontSize: 12, 
                        cursor: (isCorrecting || !actualRemaining) ? "not-allowed" : "pointer",
                        opacity: (isCorrecting || !actualRemaining) ? 0.5 : 1
                      }}
                    >
                      {isCorrecting ? "..." : t("cables", "correctionBtn", "Koryguj")}
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}

          {!editing && isMod && (
            <div style={{ padding: "16px 22px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
              <p style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "#555", marginBottom: 10 }}>{t("cables", "trommelPickup", "Odbiór bębna")}</p>
              
              {trommel.status === "pickup_requested" && (
                <div style={{ marginBottom: 12, padding: "10px", borderRadius: "10px", background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.2)" }}>
                   <p style={{ margin: 0, fontSize: 12, color: "#38bdf8", fontWeight: 700 }}>
                     🚚 {t("cables", "trommel_status_pickup_requested", "Zgłoszono do odbioru")}: {trommel.pickup_requested_at ? new Date(trommel.pickup_requested_at).toLocaleString() : "-"}
                   </p>
                   {trommel.pickup_requested_email_sent && (
                     <p style={{ margin: "4px 0 0", fontSize: 11, color: "#38bdf8", opacity: 0.8, fontWeight: 700 }}>
                       📧 {t("cables", "pickupEmailSent", "Email z prośbą o odbiór wysłany.")}
                     </p>
                   )}
                </div>
              )}

              {trommel.status === "picked_up" && (
                <div style={{ marginBottom: 12, padding: "10px", borderRadius: "10px", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)" }}>
                   <p style={{ margin: 0, fontSize: 12, color: "#10b981", fontWeight: 700 }}>
                     ✅ {t("cables", "trommel_status_picked_up", "Odebrano")}: {trommel.picked_up_at ? new Date(trommel.picked_up_at).toLocaleString() : "-"}
                   </p>
                   {trommel.pickup_email_sent && (
                     <p style={{ margin: "4px 0 0", fontSize: 11, color: "#38bdf8", fontWeight: 700 }}>
                       📧 {t("cables", "pickupConfirmedEmailSent", "Potwierdzenie e-mail zostało wysłane.")}
                     </p>
                   )}
                </div>
              )}

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {(trommel.status === "delivered" || !trommel.status) && (
                  <button onClick={handleMarkEmpty} style={{ padding: "8px 16px", borderRadius: 10, background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.3)", color: "#38bdf8", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                    📦 {t("cables", "markAsEmpty", "Oznacz jako pusty")}
                  </button>
                )}
                {trommel.status === "empty" && (
                  <button onClick={handleReportPickup} disabled={saving} style={{ padding: "8px 16px", borderRadius: 10, background: "#0284c7", border: "none", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                    📧 {saving ? "..." : t("cables", "reportForPickup", "Zgłoś do odbioru")}
                  </button>
                )}
                {trommel.status === "pickup_requested" && (
                  <button onClick={handleReportPickup} disabled={saving} style={{ padding: "8px 16px", borderRadius: 10, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    🔄 {t("cables", "reportForPickup", "Wyślij e-mail ponownie")}
                  </button>
                )}
                {trommel.status !== "picked_up" && (
                  <button onClick={handleMarkPickedUp} style={{ padding: "8px 16px", borderRadius: 10, background: "#10b981", border: "none", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                    ✅ {t("cables", "markAsPickedUp", "Oznacz odebrany bez e-mail")}
                  </button>
                )}
                {isAdmin && trommel.status === "picked_up" && !trommel.is_archived && (
                  <>
                    <button onClick={handleUndoPickedUp} disabled={saving} style={{ padding: "8px 16px", borderRadius: 10, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                      ↩️ {t("cables", "undoPickedUp", "Cofnij odebranie")}
                    </button>
                    <button onClick={handleArchive} disabled={saving} style={{ padding: "8px 16px", borderRadius: 10, background: "#64748b", border: "none", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                      📁 {saving ? "..." : t("cables", "moveToArchive", "Archiwizuj")}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          <div style={{ padding: "16px 22px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <p style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "#666", marginBottom: 8 }}>{t("reports", "qrPrinterType", "Wybierz drukarkę")}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {[
                { id: "brother_40x18", label: "Brother 40x18mm" },
                { id: "brother_50x24", label: "Brother 50x24mm" },
                { id: "zebra", label: "Zebra 52x39mm" },
                { id: "brother_csv", label: "Brother CSV (Best Quality)" }
              ].map(p => (
                <button
                  key={p.id}
                  onClick={() => setQrPrinterType(p.id as any)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 700,
                    border: "1px solid",
                    borderColor: qrPrinterType === p.id ? "#f59e0b" : "rgba(255,255,255,0.1)",
                    background: qrPrinterType === p.id ? "rgba(245,158,11,0.15)" : "transparent",
                    color: qrPrinterType === p.id ? "#fbbf24" : "#888",
                    cursor: "pointer",
                    transition: "all 0.2s"
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 12 }}>
              <button
                onClick={handlePrint}
                disabled={printing}
                style={{ width: "100%", padding: "14px", borderRadius: 12, border: "1px solid var(--ui-border, rgba(255,255,255,0.1))", background: qrPrinterType === "brother_csv" ? "rgba(245,158,11,0.1)" : "transparent", color: "#f59e0b", fontWeight: 800, fontSize: 15, cursor: printing ? "not-allowed" : "pointer" }}
              >
                {qrPrinterType === "brother_csv" ? "📥 Export CSV" : `🏷 ${t("cables", "printQr", "Print QR")}`}
              </button>
            </div>
          </div>

          {mappableCables.length > 0 && (
            <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <button onClick={() => setShowMap(v => !v)} style={{ width: "100%", padding: "13px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "transparent", border: "none", cursor: "pointer" }}>
                <span style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "#38bdf8" }}>🗺 {t("cables","cablesMap","Mapa kabli")} ({mappableCables.length})</span>
                <span style={{ fontSize: 12, color: "#888" }}>{showMap ? "▲" : "▼"}</span>
              </button>
              {showMap && (
                <div style={{ height: 360, position: "relative" }}>
                  {planIds.length > 1 && (
                    <div style={{ position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", zIndex: 1000, display: "flex", gap: 6 }}>
                      {planIds.map((pid, i) => (
                        <button key={pid} onClick={() => setSelectedPlan(pid)} style={{ padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 800, border: `1px solid ${pid === activePlan ? "#38bdf8" : "rgba(255,255,255,0.1)"}`, background: pid === activePlan ? "rgba(56,189,248,0.15)" : "rgba(0,0,0,0.7)", color: pid === activePlan ? "#38bdf8" : "#888", cursor: "pointer" }}>
                          Plan {i + 1}
                        </button>
                      ))}
                    </div>
                  )}
                  {mapProps ? (
                    <LeafletMap 
                      {...mapProps} 
                      token={token} 
                      onSelectCable={(id) => {
                        const c = cables.find(x => x.id === id);
                        if (c) onCableClick?.(c);
                      }}
                      onEditCable={(id) => {
                        const c = cables.find(x => x.id === id);
                        if (c) (onEditCable || onCableClick)?.(c);
                      }}
                    />
                  ) : (
                    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#555" }}>
                      {t("cables","noPlanMap","Brak planu")}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div style={{ padding: "14px 22px", display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "#888", margin: "0 0 4px" }}>{t("cables","cablesOnTrommel","Kable na bębnie")} ({cables.length})</p>
            {cables.length === 0 ? (
              <p style={{ fontSize: 13, color: "#444", fontWeight: 600 }}>{t("cables","noAssignedCables","Brak przypisanych kabli")}</p>
            ) : cables.map((c, i) => {
              const hasMap = !!(c.cable_routes?.plan_id && c.cable_routes.point_a_x != null);
              return (
                <div key={c.id} style={{ display: "flex", flexDirection: "column", gap: 8, padding: "14px", borderRadius: 16, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", position: "relative" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {hasMap && <div style={{ width: 12, height: 12, borderRadius: "50%", background: COLORS[i % COLORS.length], flexShrink: 0, boxShadow: `0 0 10px ${COLORS[i % COLORS.length]}44` }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p onClick={() => onCableClick?.(c)} style={{ margin: 0, fontSize: 14, fontWeight: 900, color: hasMap ? "#38bdf8" : "#fff", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                        {c.index_number ? `#${c.index_number} ` : ""}{c.name}
                      </p>
                      <div style={{ display: "flex", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
                        {c.cable_type && <span style={{ fontSize: 10, color: "#888", fontWeight: 700 }}>🔌 {c.cable_type}</span>}
                        {c.reported_profile && <span style={{ fontSize: 10, color: "#a78bfa", fontWeight: 700 }}>👤 {c.reported_profile.full_name}</span>}
                      </div>
                    </div>
                    {c.length != null && <span style={{ fontSize: 14, fontVariantNumeric: "tabular-nums", fontWeight: 900, color: "#fff", flexShrink: 0 }}>{c.length}m</span>}
                  </div>
                  
                  {c.cable_routes && (
                    <div style={{ background: "rgba(0,0,0,0.2)", padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.03)" }}>
                      <p style={{ margin: 0, fontSize: 11, color: "#888", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ color: "#38bdf8 opacity-50" }}>📍</span>
                        {c.cable_routes.point_a_label} 
                        <span style={{ color: "#38bdf8", opacity: 0.4 }}>→</span> 
                        {c.cable_routes.point_b_label}
                      </p>
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em", color: STATUS_COLOR[c.status] || "#888", background: `${STATUS_COLOR[c.status] || "#888"}15`, padding: "2px 8px", borderRadius: 6, border: `1px solid ${STATUS_COLOR[c.status] || "#888"}33` }}>
                      {t("cables", `status_${c.status}`, c.status)}
                    </span>
                    {isMod && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDetachCable(c.id); }}
                        style={{ padding: "4px 10px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.2)", background: "rgba(239,68,68,0.05)", color: "#f87171", fontSize: 10, fontWeight: 800, cursor: "pointer", transition: "all 0.2s" }}
                        title={t("cables", "detachCable", "Odpiąć kabel")}
                      >
                        🔗 {t("cables", "detach", "Odpięty")}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ padding: "0 22px 22px" }}>
            {isMod && (
              <button onClick={handleDelete} disabled={deleting} style={{ width: "100%", padding: "11px", borderRadius: 10, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.07)", color: "#f87171", fontWeight: 800, fontSize: 13, cursor: deleting ? "not-allowed" : "pointer" }}>
                {deleting ? "..." : `🗑 ${t("cables","deleteTrommel","Usuń bęben")} "${trommel.name}"`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
