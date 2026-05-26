"use client";
import { useState, useEffect, useCallback } from "react";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/apiClient";
import { normalizeCableType } from "@/lib/cableUtils";
import { BrotherProvider } from '@/lib/brotherProvider';
import { useLanguage } from "@/contexts/LanguageContext";

import QRCode from "react-qr-code";
import { generateDataMatrixBase64 } from "@/lib/qrUtils";


type CableStatus = "pending" | "in_progress" | "pending_approval" | "done";

type HistoryEntry = {
  id: string;
  action: string;
  old_value: Record<string, any> | null;
  new_value: Record<string, any> | null;
  user_id: string | null;
  created_at: string;
  profiles?: { id: string; full_name: string } | null;
};

type Cable = {
  id: string;
  name: string;
  length: number | null;
  status: CableStatus;
  cable_type: string | null;
  route_id: string | null;
  trommel_id: string | null;
  index_number: number | null;
  created_at: string;
  cable_routes?: {
    id: string;
    name: string | null;
    point_a_label: string;
    point_b_label: string;
    plan_id?: string | null;
    point_a_x?: number | null;
    point_a_y?: number | null;
    point_b_x?: number | null;
    point_b_y?: number | null;
    waypoints?: any[] | null;
    plan_id_2?: string | null;
    point_c_x?: number | null;
    point_c_y?: number | null;
    point_d_x?: number | null;
    point_d_y?: number | null;
    waypoints_2?: any[] | null;
    scale?: number | null;
    scale_2?: number | null;
  } | null;
  trommels?: { id: string; name: string; index_number?: number | null; serial_number?: string | null; total_length: number | null } | null;
  profiles?: { id: string; full_name: string } | null;
  category_id: string | null;
  is_verified?: boolean;
};

type Category = { id: string; name: string };

type Route = { id: string; name: string | null; point_a_label: string; point_b_label: string };
type Trommel = { 
  id: string; 
  name: string; 
  index_number?: number | null; 
  total_length: number | null; 
  remaining_length?: number | null; 
  used_length?: number; 
  cable_type?: string | null;
  status?: "pending" | "delivered" | "empty" | "pickup_requested" | "picked_up";
  remnant_length?: number | null;
  is_archived?: boolean;
};

interface Props {
  cable: Cable;
  onClose: () => void;
  onUpdated: (cable: Cable) => void;
  onDeleted: (id: string) => void;
  isMod: boolean;
  projectId: string;
  routes: Route[];
  trommels: Trommel[];
  token: string | null;
  cableTypes: string[];
  categories: Category[];
  onEditRoute?: (cable: Cable) => void;
  findBestTrommel?: (cable: any) => string | null;
  onSelectTrommel?: (trommelId: string) => void;
  allCables?: Cable[];
}

const STATUS_COLORS: Record<CableStatus, string> = {
  pending:          "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  in_progress:      "bg-blue-500/20 text-blue-300 border-blue-500/30",
  pending_approval: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  done:             "bg-green-500/20 text-green-300 border-green-500/30",
};

export function CableDrawer({ cable, onClose, onUpdated, onDeleted, isMod, projectId, routes, trommels, token, cableTypes, categories, onEditRoute, findBestTrommel, onSelectTrommel, allCables = [] }: Props) {
  const { t } = useLanguage();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const [editName, setEditName]           = useState(cable.name);
  const [editLength, setEditLength]       = useState(cable.length != null ? String(cable.length) : "");
  const [editStatus, setEditStatus]       = useState<CableStatus>(cable.status);
  const [editCableType, setEditCableType] = useState(cable.cable_type || "");
  const [editRouteId, setEditRouteId]     = useState(cable.route_id || "");
  const [editTrommelId, setEditTrommelId] = useState(cable.trommel_id || "");
  const [editCategoryId, setEditCategoryId] = useState(cable.category_id || "");
  const [isVerified, setIsVerified] = useState(!!cable.is_verified);
  const [saving, setSaving]             = useState(false);
  const [saveErr, setSaveErr]           = useState<string | null>(null);
  const [printing, setPrinting]         = useState(false);
  const [printMsg, setPrintMsg]         = useState<string | null>(null);
  const [deleting, setDeleting]         = useState(false);
  const [domain, setDomain]             = useState("");
  const [qrPrinterType, setQrPrinterType] = useState<"brother_40x18" | "brother_50x24" | "zebra" | "brother_csv">("brother_40x18");
  const [logisticsNotification, setLogisticsNotification] = useState<{
    type: 'sameTrommel' | 'nearbySameType' | 'nearbyDiffType';
    cable: Cable;
    trommelName?: string;
  } | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showShortCableForm, setShowShortCableForm] = useState(false);
  const [remnantLength, setRemnantLength] = useState("");
  const [dataMatrixBase64, setDataMatrixBase64] = useState<string | null>(null);


  const bestId = findBestTrommel?.({ 
    ...cable, 
    cable_type: editCableType,
    route_id: editRouteId,
    cable_routes: routes.find(r => r.id === editRouteId) || cable.cable_routes,
    length: editLength ? Number(editLength) : cable.length
  });

  useEffect(() => {
    const saved = localStorage.getItem("qrPrinterType_single");
    if (saved) setQrPrinterType(saved as any);
  }, []);

  useEffect(() => {
    localStorage.setItem("qrPrinterType_single", qrPrinterType);
  }, [qrPrinterType]);

  useEffect(() => { setDomain(window.location.origin); }, []);

  useEffect(() => {
    if (domain) {
      const text = `${domain}/cables?scan_type=cable&scan_id=${cable.id}&name=${encodeURIComponent(cable.name)}&index_number=${cable.index_number || ""}`;
      generateDataMatrixBase64(text).then(setDataMatrixBase64);
    }
  }, [domain, cable.id, cable.name, cable.index_number]);


  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const data = await apiGet<HistoryEntry[]>(`/api/cable-history?cableId=${cable.id}`);
      setHistory(data || []);
    } catch { setHistory([]); }
    finally { setHistoryLoading(false); }
  }, [cable.id]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  async function handleSave() {
    setSaving(true); setSaveErr(null);
    try {
      const body: Record<string, any> = { id: cable.id };
      if (editName.trim() !== cable.name) body.name = editName.trim();
      const lenNum = editLength === "" ? null : Number(editLength);
      if (lenNum !== cable.length) body.length = lenNum;
      if (editStatus !== cable.status) body.status = editStatus;
      const ctype = editCableType.trim() || null;
      if (ctype !== cable.cable_type) body.cable_type = ctype;
      if ((editRouteId || null) !== cable.route_id) body.route_id = editRouteId || null;
      if ((editTrommelId || null) !== cable.trommel_id) body.trommel_id = editTrommelId || null;
      if ((editCategoryId || null) !== cable.category_id) body.category_id = editCategoryId || null;
      if (isVerified !== !!cable.is_verified) body.is_verified = isVerified;

      if (Object.keys(body).length === 1) { setSaving(false); return; }

      const updated = await apiPatch<Cable>("/api/cables", body);
      onUpdated(updated);
      onClose();
    } catch (e: any) {
      if (e.code === "TROMMEL_FULL") {
        setSaveErr(t("cables", "errorTrommelFull", "Not enough space on the trommel. Please choose another one."));
      } else {
        setSaveErr(e?.message || "Error");
      }
    }
    finally { setSaving(false); }
  }

  async function handleMarkDone() {
    setSaving(true); setSaveErr(null);
    try {
      const updated = await apiPatch<Cable>("/api/cables", { id: cable.id, status: "done" });
      setEditStatus("done");
      onUpdated(updated);
      onClose();
    } catch (e: any) { setSaveErr(e?.message || "Error"); }
    finally { setSaving(false); }
  }

  function handlePrint() {
    if (qrPrinterType === "brother_csv") {
      const info = [editCableType, editLength ? `${editLength}m` : null].filter(Boolean).join(" · ") || "";
      const qrText = `${domain}/cables?scan_type=cable&scan_id=${cable.id}&name=${encodeURIComponent(cable.name)}&index_number=${cable.index_number || ""}`;
      let csvContent = "ID,Type,Number,Name,Info,Project,QR_URL\n";
      csvContent += `"${cable.id}","KABEL","${cable.index_number || ""}","${editName}","${info}","","${qrText}"\n`;
      const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
      const filename = `label_cable_${cable.index_number || "new"}.csv`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }    if (qrPrinterType.startsWith("brother")) {
      const tapeWidth = qrPrinterType === "brother_40x18" ? 18 : 24;
      const info = [editCableType, editLength ? `${editLength}m` : null].filter(Boolean).join(" · ") || "";
      BrotherProvider.printLabels([{
        id: cable.id,
        type: "cable",
        index_number: cable.index_number,
        name: editName,
        info: info,
        origin: domain
      }], tapeWidth as 18 | 24);
      return;
    }

    const svgEl = document.querySelector("#qr-hidden-container-cable svg");
    if (!svgEl) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    let pageStyle = "";
    let bodyStyle = "";
    let contentHtml = "";

    if (qrPrinterType === "zebra") {
      pageStyle = "@page { size: 39mm 52mm; margin: 0; }";
      bodyStyle = "width: 39mm; height: 52mm; flex-direction: column; align-items: center; justify-content: center;";
      
      const codeHtml = dataMatrixBase64 
        ? `<img src="${dataMatrixBase64}" style="width: 32mm; height: 32mm; image-rendering: pixelated;" />`
        : svgEl.outerHTML.replace(/width="[^"]*"/, 'width="32mm"').replace(/height="[^"]*"/, 'height="32mm"');

      contentHtml = `
        <div style="width: 100%; height: 2mm; background: #3b82f6; position: absolute; top: 0; left: 0;"></div>
        <div style="width: 34mm; height: 34mm; display: flex; align-items: center; justify-content: center; margin-top: 2mm;">
          ${codeHtml}
        </div>

        <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1mm 2mm; text-align: center; width: 100%; box-sizing: border-box;">
          <div style="font-size: 7pt; font-weight: bold; color: #3b82f6; text-transform: uppercase; margin-bottom: 1mm;">KABEL</div>
          <div style="font-size: 9pt; font-weight: bold; color: #111827; line-height: 1.1; margin-bottom: 1mm;">${cable.index_number ? `#${cable.index_number} ` : ""}${editName}</div>
          <div style="font-size: 7pt; color: #4b5563;">${[editCableType, editLength ? `${editLength}m` : null].filter(Boolean).join(" · ")}</div>
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

  async function handleDelete() {
    if (!confirm(t("cables", "deleteConfirm", "Delete this cable?"))) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/cables?id=${cable.id}`);
      onDeleted(cable.id);
    } catch (e: any) { setSaveErr(e?.message || "Error"); setDeleting(false); }
  }

  async function handleShortCableSave() {
    const len = Number(remnantLength);
    if (isNaN(len)) return;

    setSaving(true);
    try {
      const oldTrommelId = cable.trommel_id;
      
      // 1. Mark old drum as empty and save remnant length
      if (oldTrommelId) {
        await apiPatch("/api/trommels", { 
          id: oldTrommelId, 
          status: "empty",
          remnant_length: len
        });
      }
      
      // 2. Detach the cable from the drum
      const updated = await apiPatch<Cable>("/api/cables", { 
        id: cable.id, 
        trommel_id: null 
      });
      
      onUpdated(updated);
      onClose();
    } catch (e: any) {
      setSaveErr(e?.message || "Error during saving remnant");
    } finally {
      setSaving(false);
    }
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  }

  function actionLabel(entry: HistoryEntry): string {
    const a = entry.action;
    if (a === "created") return t("cables", "historyCreated", "Created");
    if (a === "status_changed") {
      const to = entry.new_value?.status || "";
      return `${t("cables", "historyStatusChanged", "Status")} → ${t("cables", `status_${to}`, to)}`;
    }
    if (a === "deleted") return t("cables", "historyDeleted", "Deleted");
    if (a === "updated") {
      const parts: string[] = [];
      if (entry.new_value?.name !== undefined) parts.push(`${t("cables", "name", "Name")} → "${entry.new_value.name}"`);
      if (entry.new_value?.length !== undefined) parts.push(`${t("cables", "length", "Length")} → ${entry.new_value.length}`);
      if (entry.new_value?.route_id !== undefined) parts.push(t("cables", "routeChanged", "Route changed"));
      if (entry.new_value?.trommel_id !== undefined) parts.push(t("cables", "trommelChanged", "Trommel changed"));
      if (entry.new_value?.category_id !== undefined) parts.push(t("cables", "categoryChanged", "Category changed"));
      if (entry.new_value?.is_verified !== undefined) parts.push(entry.new_value.is_verified ? `✓ ${t("cables", "verified", "Zweryfikowano")}` : `✕ ${t("cables", "unverifiedHistory", "Cofnięto weryfikację")}`);
      return parts.join(" | ") || t("cables", "historyUpdated", "Updated");
    }
    return a;
  }

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = "auto"; };
  }, []);

  return (
    <div className="no-print" style={{ position: "fixed", inset: 0, zIndex: 10000, display: "flex", justifyContent: "flex-end" }}>
      {/* HIDDEN PRINT CONTAINER */}
      <div id="qr-hidden-container-cable" style={{ display: "none" }}>
        {dataMatrixBase64 ? (
          <img src={dataMatrixBase64} alt="DataMatrix" />
        ) : (
          domain && <QRCode value={`${domain}/cables?scan_type=cable&scan_id=${cable.id}&name=${encodeURIComponent(cable.name)}&index_number=${cable.index_number || ""}`} size={120} level="M" />
        )}
      </div>


      {/* backdrop */}
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }} onClick={onClose} />

      {/* drawer panel */}
      <div className="custom-scrollbar" style={{
        position: "relative",
        width: "min(540px, 100vw)",
        height: "100%",
        background: "var(--ui-card, #0f172a)",
        borderLeft: "1px solid var(--ui-border, rgba(255,255,255,0.1))",
        display: "flex",
        flexDirection: "column",
        boxShadow: "-30px 0 80px rgba(0,0,0,0.6)",
        overflowY: "auto",
        zIndex: 10001,
      }}>
        {/* header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid var(--ui-border, rgba(255,255,255,0.08))", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "var(--ui-card, #0f172a)", zIndex: 20 }}>
          <div>
            <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--ui-accent, #38bdf8)", marginBottom: 4 }}>
              {t("cables", "tabLabel", "Kable")} {cable.index_number != null ? `#${cable.index_number}` : ""}
            </p>
            <h2 style={{ fontSize: 20, fontWeight: 900, margin: 0, color: "var(--ui-text, #fff)", wordBreak: "break-word" }}>{cable.name}</h2>
          </div>
          <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid var(--ui-border, rgba(255,255,255,0.1))", background: "transparent", color: "var(--ui-muted, #888)", fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>


        {/* body */}
        <div style={{ padding: "20px 24px 32px", display: "flex", flexDirection: "column", gap: 24 }}>

          {/* VISIBLE DATA MATRIX (instead of QR) */}
          <div style={{ display: "flex", justifyContent: "center", padding: "10px", background: "rgba(255,255,255,0.05)", borderRadius: "16px", border: "1px solid rgba(255,255,255,0.1)" }}>
             {dataMatrixBase64 ? (
               <img src={dataMatrixBase64} alt="DataMatrix" style={{ width: 140, height: 140, imageRendering: 'pixelated' }} />
             ) : (
               <div style={{ width: 140, height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 12 }}>Generowanie...</div>
             )}
          </div>


          {/* printer type selector */}
          <div style={{ padding: "12px 16px", background: "rgba(255,255,255,0.03)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)" }}>
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
                    borderColor: qrPrinterType === p.id ? "#3b82f6" : "rgba(255,255,255,0.1)",
                    background: qrPrinterType === p.id ? "rgba(59,130,246,0.15)" : "transparent",
                    color: qrPrinterType === p.id ? "#60a5fa" : "#888",
                    cursor: "pointer",
                    transition: "all 0.2s"
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* status badge + quick done button */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ padding: "4px 14px", borderRadius: 99, fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", border: "1px solid", ...(editStatus === "done" ? { background: "rgba(34,197,94,0.15)", color: "#86efac", borderColor: "rgba(34,197,94,0.3)" } : editStatus === "in_progress" ? { background: "rgba(59,130,246,0.15)", color: "#93c5fd", borderColor: "rgba(59,130,246,0.3)" } : { background: "rgba(234,179,8,0.15)", color: "#fde047", borderColor: "rgba(234,179,8,0.3)" }) }}>
              {t("cables", `status_${editStatus}`, editStatus)}
            </span>
            {isMod ? (
              editStatus !== "done" && (
                <button
                  onClick={handleMarkDone}
                  disabled={saving}
                  style={{ padding: "8px 20px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#22c55e,#16a34a)", color: "#fff", fontWeight: 800, fontSize: 13, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}
                >
                  ✓ {t("cables", "markDone", "Mark as done")}
                </button>
              )
            ) : (
              cable.status !== "done" && (
                <button
                  onClick={async () => {
                    if (cable.status === "pending_approval") {
                      setShowCancelConfirm(true);
                      return;
                    }
                    const next = "pending_approval";
                    try {
                      setSaving(true);
                      const updated = await apiPatch<Cable>("/api/cables", { id: cable.id, status: next }, token);
                      onUpdated(updated);

                      // Show logistics notification only when submitting (not cancelling)
                      if (allCables.length > 0) {
                        const myDest = cable.cable_routes?.point_b_label;
                        const myType = cable.cable_type;

                        // Priority 1: same trommel, same destination, not done, not this cable
                        const sameTrommelCandidate = allCables.find(c =>
                          c.id !== cable.id &&
                          c.trommel_id === cable.trommel_id &&
                          cable.trommel_id != null &&
                          c.status !== 'done' &&
                          c.status !== 'pending_approval' &&
                          c.cable_routes?.point_b_label === myDest
                        );

                        if (sameTrommelCandidate) {
                          setLogisticsNotification({ type: 'sameTrommel', cable: sameTrommelCandidate });
                        } else {
                          const sameTypeDiffTrommel = allCables.find(c =>
                            c.id !== cable.id &&
                            c.cable_routes?.point_b_label === myDest &&
                            c.cable_type === myType &&
                            myType != null &&
                            c.trommel_id !== cable.trommel_id &&
                            c.trommel_id != null &&
                            c.status !== 'done' &&
                            c.status !== 'pending_approval'
                          );

                          if (sameTypeDiffTrommel) {
                            const tr = trommels.find(t => t.id === sameTypeDiffTrommel.trommel_id);
                            setLogisticsNotification({
                              type: 'nearbySameType',
                              cable: sameTypeDiffTrommel,
                              trommelName: tr ? `${tr.index_number ? `#${tr.index_number} ` : ''}${tr.name}` : undefined
                            });
                          } else {
                            const diffType = allCables.find(c =>
                              c.id !== cable.id &&
                              c.cable_routes?.point_b_label === myDest &&
                              c.trommel_id != null &&
                              c.status !== 'done' &&
                              c.status !== 'pending_approval'
                            );

                            if (diffType) {
                              const tr = trommels.find(t => t.id === diffType.trommel_id);
                              setLogisticsNotification({
                                type: 'nearbyDiffType',
                                cable: diffType,
                                trommelName: tr ? `${tr.index_number ? `#${tr.index_number} ` : ''}${tr.name}` : undefined
                              });
                            }
                          }
                        }
                      }
                    } catch {} finally { setSaving(false); }
                  }}
                  disabled={saving}
                  style={{ padding: "8px 20px", borderRadius: 10, border: "none", background: cable.status === "pending_approval" ? "rgba(107,114,128,0.2)" : "rgba(234,179,8,0.2)", color: cable.status === "pending_approval" ? "#9ca3af" : "#facc15", fontWeight: 800, fontSize: 13, cursor: saving ? "not-allowed" : "pointer" }}
                >
                  {saving ? "..." : cable.status === "pending_approval" ? `↩ ${t("cables","cancelReport","Cofnij")}` : t("cables","reportApproval","Zgłoś")}
                </button>
              )
            )}
            <button
              onClick={handlePrint}
              disabled={printing}
              style={{ padding: "8px 20px", borderRadius: 10, border: "1px solid var(--ui-border, rgba(255,255,255,0.1))", background: qrPrinterType === "brother_csv" ? "rgba(59,130,246,0.1)" : "transparent", color: "var(--ui-accent, #38bdf8)", fontWeight: 800, fontSize: 13, cursor: printing ? "not-allowed" : "pointer" }}
            >
              {qrPrinterType === "brother_csv" ? "📥 Export CSV" : `🏷 ${t("cables", "printQr", "Print QR")}`}
            </button>
            {cable.trommel_id && (
              <button
                onClick={() => setShowShortCableForm(true)}
                style={{ padding: "8px 20px", borderRadius: 10, border: "1px solid rgba(244,63,94,0.3)", background: "rgba(244,63,94,0.1)", color: "#fb7185", fontWeight: 800, fontSize: 13, cursor: "pointer" }}
              >
                📏 {t("cables", "shortCableBtn", "Kabel za krótki")}
              </button>
            )}
          </div>
          {printMsg && <p style={{ fontSize: 12, color: printMsg.startsWith("⚠") ? "#f87171" : "#86efac", fontWeight: 700 }}>{printMsg}</p>}

          {/* Trommel info badge */}
          {cable.trommels && (
            <div 
              onClick={() => onSelectTrommel?.(cable.trommels!.id)}
              style={{ 
                padding: "16px", 
                borderRadius: "16px", 
                background: "rgba(251,191,36,0.05)", 
                border: "1px solid rgba(251,191,36,0.2)", 
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 14,
                transition: "all 0.2s"
              }}
              className="hover:bg-amber-500/10"
            >
              <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(251,191,36,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>📦</div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 10, fontWeight: 900, color: "#fbbf24", textTransform: "uppercase", letterSpacing: "0.1em" }}>{t("cables", "assignedTrommel", "PRZYPISANY BĘBEN")}</p>
                <p style={{ margin: 0, fontSize: 16, fontWeight: 900, color: "#fff" }}>
                  {cable.trommels.serial_number || cable.trommels.index_number ? `#${cable.trommels.serial_number || cable.trommels.index_number} ` : ""}
                  {cable.trommels.name}
                </p>
              </div>
              <div style={{ color: "#fbbf24", fontSize: 18 }}>→</div>
            </div>
          )}

          {/* Short Cable Form */}
          {showShortCableForm && (
            <div style={{ padding: "20px", borderRadius: 14, border: "1px solid rgba(244,63,94,0.3)", background: "rgba(244,63,94,0.05)", display: "flex", flexDirection: "column", gap: 12 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 900, color: "#fb7185" }}>{t("cables", "shortCableTitle", "Resztka kabla na bębnie")}</p>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "#888" }}>
                {t("cables", "shortCableEnterRemaining", "Ile metrów kabla faktycznie było na bębnie?")}
                <input 
                  type="number" 
                  value={remnantLength} 
                  onChange={e => setRemnantLength(e.target.value)}
                  placeholder="np. 80"
                  style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "#000", color: "#fff", fontSize: 15, fontWeight: 600 }}
                />
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <button 
                  onClick={handleShortCableSave}
                  disabled={!remnantLength || saving}
                  style={{ flex: 1, padding: "10px", borderRadius: 10, background: "#fb7185", color: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer" }}
                >
                  {saving ? "..." : t("common", "confirm", "Potwierdź")}
                </button>
                <button 
                  onClick={() => setShowShortCableForm(false)}
                  style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#888", fontWeight: 800, fontSize: 12, cursor: "pointer" }}
                >
                  {t("common", "cancel", "Anuluj")}
                </button>
              </div>
            </div>
          )}

          {/* Cancel Approval Confirmation */}
          {showCancelConfirm && (
            <div style={{ padding: "20px", borderRadius: 14, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.05)", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 22 }}>&#x21A9;</span>
                <div>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 900, color: "#f87171" }}>
                    {t("cables", "cancelReportConfirmTitle", "Na pewno?")}
                  </p>
                  <p style={{ margin: "3px 0 0", fontSize: 12, color: "#94a3b8", fontWeight: 500, lineHeight: 1.5 }}>
                    {t("cables", "cancelReportConfirmBody", "Czy chcesz cofnąć zgłoszenie tego kabla do zatwierdzenia?")}
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={async () => {
                    setShowCancelConfirm(false);
                    try {
                      setSaving(true);
                      const updated = await apiPatch<Cable>("/api/cables", { id: cable.id, status: "in_progress" }, token);
                      onUpdated(updated);
                      onClose();
                    } catch (e: any) { setSaveErr(e?.message || "Error"); }
                    finally { setSaving(false); }
                  }}
                  disabled={saving}
                  style={{ flex: 1, padding: "9px 14px", borderRadius: 9, border: "1px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.12)", color: "#f87171", fontWeight: 800, fontSize: 12, cursor: "pointer" }}
                >
                  {saving ? "..." : t("cables", "cancelReportConfirmYes", "Tak, cofnij zgłoszenie")}
                </button>
                <button
                  onClick={() => setShowCancelConfirm(false)}
                  style={{ flex: 1, padding: "9px 14px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "#94a3b8", fontWeight: 800, fontSize: 12, cursor: "pointer" }}
                >
                  {t("cables", "cancelReportConfirmNo", "Nie, zostaw")}
                </button>
              </div>
            </div>
          )}

          {/* Logistics Notification Banner */}
          {logisticsNotification && (
            <div style={{
              padding: "16px",
              borderRadius: 14,
              border: `1px solid ${logisticsNotification.type === 'sameTrommel' ? 'rgba(34,197,94,0.4)' : logisticsNotification.type === 'nearbySameType' ? 'rgba(234,179,8,0.4)' : 'rgba(59,130,246,0.4)'}`,
              background: logisticsNotification.type === 'sameTrommel' ? 'rgba(34,197,94,0.08)' : logisticsNotification.type === 'nearbySameType' ? 'rgba(234,179,8,0.08)' : 'rgba(59,130,246,0.08)',
              display: "flex",
              flexDirection: "column",
              gap: 10,
              animation: "fadeIn 0.3s ease"
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <p style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: logisticsNotification.type === 'sameTrommel' ? '#86efac' : logisticsNotification.type === 'nearbySameType' ? '#fde047' : '#93c5fd', margin: 0 }}>
                  {t("cables", "logisticsNotifyTitle", "💡 Logistics Tip")}
                </p>
                <button
                  onClick={() => setLogisticsNotification(null)}
                  style={{ width: 24, height: 24, borderRadius: 6, border: "none", background: "rgba(255,255,255,0.08)", color: "#888", fontSize: 13, cursor: "pointer", lineHeight: 1, flexShrink: 0 }}
                >✕</button>
              </div>

              <p style={{ fontSize: 12, color: "var(--ui-muted, #aaa)", fontWeight: 600, margin: 0, lineHeight: 1.5 }}>
                {logisticsNotification.type === 'sameTrommel'
                  ? t("cables", "logisticsNotifySameTrommel", "You can also lay this cable now — it's on the same drum:")
                  : logisticsNotification.type === 'nearbySameType'
                    ? t("cables", "logisticsNotifyNearbySameType", "While you're at it, there's a nearby cable of the same type on a different drum:")
                    : t("cables", "logisticsNotifyNearbyDiffType", "Nearby cable of a different type that could also be laid:")}
              </p>

              <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "10px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 900, color: "var(--ui-text, #fff)" }}>
                  {logisticsNotification.cable.index_number != null ? `${t("cables","logisticsNotifyIndexNumber","#")}${logisticsNotification.cable.index_number} ` : ""}
                  {logisticsNotification.cable.name}
                </p>
                {logisticsNotification.cable.cable_routes && (
                  <p style={{ margin: 0, fontSize: 11, color: "var(--ui-muted, #888)", fontWeight: 600 }}>
                    {t("cables", "logisticsNotifyRoute", "Route:")} {logisticsNotification.cable.cable_routes.point_a_label} → {logisticsNotification.cable.cable_routes.point_b_label}
                  </p>
                )}
                {logisticsNotification.cable.length != null && (
                  <p style={{ margin: 0, fontSize: 11, color: "var(--ui-muted, #888)", fontWeight: 600 }}>
                    {t("cables", "logisticsNotifyLength", "Length:")} {logisticsNotification.cable.length}m
                    {logisticsNotification.cable.cable_type ? ` · ${logisticsNotification.cable.cable_type}` : ""}
                  </p>
                )}
              </div>

              {logisticsNotification.trommelName && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "rgba(234,179,8,0.1)", borderRadius: 8, border: "1px solid rgba(234,179,8,0.2)" }}>
                  <span style={{ fontSize: 16 }}>🔄</span>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: "#fde047" }}>
                    {t("cables", "logisticsNotifyNeedTrommel", "Bring drum:")} {logisticsNotification.trommelName}
                  </p>
                </div>
              )}

              <button
                onClick={() => setLogisticsNotification(null)}
                style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "rgba(255,255,255,0.08)", color: "var(--ui-muted, #aaa)", fontWeight: 800, fontSize: 11, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.1em" }}
              >
                {t("cables", "logisticsNotifyDismiss", "Got it")}
              </button>
            </div>
          )}

          {/* edit fields */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--ui-muted, #888)" }}>
              {t("cables", "name", "Name")} *
              <input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                disabled={!isMod}
                style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid var(--ui-border, rgba(255,255,255,0.1))", background: "var(--ui-bg, #000)", color: "var(--ui-text, #fff)", fontSize: 15, fontWeight: 600, opacity: isMod ? 1 : 0.7 }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--ui-muted, #888)" }}>
              {t("cables", "length", "Length (m)")}
              <input
                type="number"
                min={0}
                value={editLength}
                onChange={e => setEditLength(e.target.value)}
                disabled={!isMod}
                style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid var(--ui-border, rgba(255,255,255,0.1))", background: "var(--ui-bg, #000)", color: "var(--ui-text, #fff)", fontSize: 15, fontWeight: 600, opacity: isMod ? 1 : 0.7 }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--ui-muted, #888)" }}>
              {t("cables", "cableType", "Typ kabla")}
              <input
                list="cable-drawer-types"
                value={editCableType}
                onChange={e => setEditCableType(e.target.value)}
                disabled={!isMod}
                placeholder="np. YKY 3x2.5, NHXMH 5x1.5..."
                style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid var(--ui-border, rgba(255,255,255,0.1))", background: "var(--ui-bg, #000)", color: "var(--ui-text, #fff)", fontSize: 15, fontWeight: 600, opacity: isMod ? 1 : 0.7 }}
              />
              <datalist id="cable-drawer-types">
                {cableTypes.map(ct => <option key={ct} value={ct} />)}
              </datalist>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--ui-muted, #888)" }}>
              {t("cables", "status", "Status")}
              <select
                value={editStatus}
                onChange={e => setEditStatus(e.target.value as CableStatus)}
                disabled={!isMod}
                style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid var(--ui-border, rgba(255,255,255,0.1))", background: "var(--ui-bg, #000)", color: "var(--ui-text, #fff)", fontSize: 14, fontWeight: 600, opacity: isMod ? 1 : 0.7 }}
              >
                <option value="pending">{t("cables", "status_pending", "Pending")}</option>
                <option value="in_progress">{t("cables", "status_in_progress", "In progress")}</option>
                <option value="done">{t("cables", "status_done", "Done")}</option>
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--ui-muted, #888)" }}>
              {t("cables", "route", "Route")}
              <div className="flex flex-col gap-2">
                <select
                  value={editRouteId}
                  onChange={e => setEditRouteId(e.target.value)}
                  disabled={!isMod}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid var(--ui-border, rgba(255,255,255,0.1))", background: "var(--ui-bg, #000)", color: "var(--ui-text, #fff)", fontSize: 14, fontWeight: 600, opacity: isMod ? 1 : 0.7 }}
                >
                  <option value="">— {t("cables", "noRoute", "No route")} —</option>
                  {routes.map(r => (
                    <option key={r.id} value={r.id}>{r.name || `${r.point_a_label} → ${r.point_b_label}`}</option>
                  ))}
                </select>
                {isMod && (
                  <button
                    onClick={() => onEditRoute?.(cable)}
                    className="flex items-center justify-center gap-2 px-4 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 transition-all text-xs font-black h-12 shadow-lg shadow-emerald-500/20 w-full"
                    title={t("cables", "editRouteOnMap", "Edytuj trasę na mapie")}
                  >
                    <span>🗺</span>
                    <span>{t("cables", "editRouteOnMap", "Edytuj trasę na mapie")}</span>
                  </button>
                )}
              </div>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--ui-muted, #888)" }}>
              {t("cables", "trommel", "Trommel")}
              <select
                value={editTrommelId}
                onChange={e => setEditTrommelId(e.target.value)}
                disabled={!isMod}
                style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid var(--ui-border, rgba(255,255,255,0.1))", background: "var(--ui-bg, #000)", color: "var(--ui-text, #fff)", fontSize: 14, fontWeight: 600, opacity: isMod ? 1 : 0.7 }}
              >
                <option value="">— {t("cables", "noTrommel", "No trommel")} —</option>
                {Object.entries(
                  trommels
                    .filter(tr => {
                      if (tr.is_archived && tr.id !== editTrommelId) return false;
                      if (!editCableType) return true;
                      return normalizeCableType(tr.cable_type) === normalizeCableType(editCableType);
                    })
                    .reduce<Record<string, Trommel[]>>((acc, tr) => {
                      const type = tr.cable_type || t("cables", "noCategory", "Bez typu");
                      if (!acc[type]) acc[type] = [];
                      acc[type].push(tr);
                      return acc;
                    }, {})
                )
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([type, group]) => (
                  <optgroup key={type} label={type.toUpperCase()}>
                    {group
                      .sort((a, b) => {
                        const isABest = a.id === bestId ? -1 : 1;
                        const isBBest = b.id === bestId ? -1 : 1;
                        if (isABest !== isBBest) return isABest - isBBest;
                        return a.name.localeCompare(b.name);
                      })
                      .map(tr => {
                        const rem = tr.remaining_length;
                        const full = rem != null && rem <= 0;
                        const low = rem != null && rem > 0 && tr.total_length != null && rem < tr.total_length * 0.2;
                        const isBest = tr.id === bestId;
                        const suffix = tr.remnant_length ? ` [${tr.remnant_length}m ${t("cables", "remnants", "Resztki")}]` : rem != null ? ` [${Math.max(0, rem)}m]` : tr.total_length ? ` [${tr.total_length}m]` : "";
                        return (
                          <option key={tr.id} value={tr.id} disabled={full} style={{ fontWeight: isBest ? 900 : 400, color: isBest ? "#38bdf8" : "inherit" }}>
                            {isBest ? "⭐ " : ""}{full ? "⛔" : low ? "⚠️" : "✓"} {tr.index_number ? `#${tr.index_number} ` : ""}{tr.name}{suffix} {isBest ? `— ${t("cables", "recommended", "REKOMENDOWANY")}` : ""}
                          </option>
                        );
                      })}
                  </optgroup>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--ui-muted, #888)" }}>
              {t("cables", "category", "Rozdzielnia (kategoria)")}
              <select
                value={editCategoryId}
                onChange={e => setEditCategoryId(e.target.value)}
                disabled={!isMod}
                style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid var(--ui-border, rgba(255,255,255,0.1))", background: "var(--ui-bg, #000)", color: "var(--ui-text, #fff)", fontSize: 14, fontWeight: 600, opacity: isMod ? 1 : 0.7 }}
              >
                <option value="">— {t("cables", "noCategory", "Bez kategorii")} —</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </label>

            {isMod && (
              <label className="flex items-center gap-3 p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl cursor-pointer hover:bg-amber-500/10 transition-all group">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg transition-all ${isVerified ? "bg-amber-500 text-white" : "bg-white/5 text-ui-muted"}`}>
                  🛡️
                </div>
                <div className="flex-grow">
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-500/60 mb-0.5">{t("cables", "controlTab", "Kontrola")}</p>
                  <p className="text-sm font-black text-ui-text">{t("cables", "verified", "Zweryfikowano")}</p>
                </div>
                <div className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={isVerified} 
                    onChange={e => setIsVerified(e.target.checked)} 
                    className="sr-only peer" 
                  />
                  <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                </div>
              </label>
            )}
          </div>

          {saveErr && <p style={{ fontSize: 12, color: "#f87171", fontWeight: 700 }}>{saveErr}</p>}

          {/* save button */}
          {isMod && (
            <button
              onClick={handleSave}
              disabled={saving || !editName.trim()}
              style={{ padding: "14px", borderRadius: 12, border: "none", background: saving ? "rgba(255,255,255,0.1)" : "linear-gradient(135deg,#3b82f6,#2dd4bf)", color: "#fff", fontWeight: 900, fontSize: 15, cursor: saving || !editName.trim() ? "not-allowed" : "pointer", opacity: saving || !editName.trim() ? 0.6 : 1 }}
            >
              {saving ? t("common", "savingChanges", "Saving...") : t("common", "saveChanges", "Save changes")}
            </button>
          )}

          {/* history timeline */}
          <div>
            <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--ui-muted, #888)", marginBottom: 14 }}>
              {t("cables", "historyTitle", "History")}
            </p>
            {historyLoading ? (
              <p style={{ fontSize: 13, color: "var(--ui-muted, #888)" }}>{t("common", "loading", "Loading...")}</p>
            ) : history.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--ui-muted, #888)" }}>{t("cables", "noHistory", "No history yet")}</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 0, borderLeft: "2px solid var(--ui-border, rgba(255,255,255,0.08))", paddingLeft: 16 }}>
                {history.map((entry, i) => (
                  <div key={entry.id} style={{ position: "relative", paddingBottom: i < history.length - 1 ? 20 : 0 }}>
                    <div style={{ position: "absolute", left: -21, top: 4, width: 8, height: 8, borderRadius: "50%", background: entry.action === "created" ? "#22c55e" : entry.action === "status_changed" ? "#38bdf8" : entry.action === "deleted" ? "#ef4444" : "#a78bfa", border: "2px solid var(--ui-bg, #000)" }} />
                    <p style={{ fontSize: 13, fontWeight: 700, color: "var(--ui-text, #fff)", marginBottom: 2 }}>{actionLabel(entry)}</p>
                    <p style={{ fontSize: 11, color: "var(--ui-muted, #888)", fontWeight: 600 }}>
                      {entry.profiles?.full_name || t("common", "unknownUser", "Unknown")} · {formatDate(entry.created_at)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* delete */}
          {isMod && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              style={{ marginTop: 8, padding: "12px", borderRadius: 10, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)", color: "#f87171", fontWeight: 800, fontSize: 13, cursor: deleting ? "not-allowed" : "pointer" }}
            >
              {deleting ? "..." : `🗑 ${t("common", "delete", "Delete")}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
