"use client";

import { useState, useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiGet, getToken, apiPost, apiDelete, apiPatch } from "@/lib/apiClient";

interface Trommel {
  id: string;
  name: string;
  index_number?: number | null;
  serial_number?: string | null;
  company_name?: string | null;
  cable_type?: string | null;
  diameter?: number | null;
  photo_url?: string | null;
  pickup_requested_at?: string | null;
  pickup_requested_email_sent?: boolean;
  picked_up_at?: string | null;
  pickup_email_sent?: boolean;
}

interface BulkTrommelReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTrommels: Trommel[];
  onSuccess: () => void;
}

export default function BulkTrommelReportModal({
  isOpen,
  onClose,
  selectedTrommels,
  onSuccess
}: BulkTrommelReportModalProps) {
  const { t } = useLanguage();

  const [loading, setLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [reportType, setReportType] = useState<"request" | "confirmation">("request");
  const [emailTo, setEmailTo] = useState("m.slapinski@etecprojekt.de");
  const [selectedBuilding, setSelectedBuilding] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailContent, setEmailContent] = useState("");

  const [savedEmails, setSavedEmails] = useState<{ id: string; email: string }[]>([]);
  const [savedBuildings, setSavedBuildings] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, selectedTrommels, reportType]);

  async function loadData() {
    try {
      setLoading(true);
      const token = await getToken();
      if (!token) return;

      // Fetch saved emails
      try {
        const emailsData: any = await apiGet("/api/saved-emails", token);
        setSavedEmails(emailsData || []);
      } catch (e) { console.error(e); }

      // Fetch saved buildings
      try {
        const buildingsData: any = await apiGet("/api/saved-buildings", token);
        setSavedBuildings(buildingsData || []);
      } catch (e) { console.error(e); }

      if (reportType === "request") {
        setEmailSubject(t("cables", "bulkPickupEmailSubject", "Zbiorcze zgłoszenie odbioru bębnów"));
      } else {
        setEmailSubject(t("cables", "bulkConfirmedPickupEmailSubject", "Zbiorcze potwierdzenie odbioru bębnów"));
      }

      generateTemplate(selectedBuilding);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function generateTemplate(buildingName: string) {
    let lines: string[] = [];

    lines.push(t("cables", "pickupEmailGreeting", "Dzień dobry / Guten Tag,"));
    lines.push("");

    if (reportType === "request") {
      if (buildingName) {
        lines.push(t("cables", "pickupEmailIntro", "Proszę o zaplanowanie odbioru następujących pustych bębnów z budowy {building}:").replace("{building}", buildingName));
      } else {
        lines.push(t("cables", "pickupEmailIntroNoBuilding", "Proszę o zaplanowanie odbioru następujących pustych bębnów z budowy:"));
      }
    } else {
      lines.push(t("cables", "bulkConfirmedPickupEmailBody", "Informujemy, że następujące bębny zostały odebrane z budowy:"));
      if (buildingName) {
        lines[lines.length-1] = lines[lines.length-1] + " " + buildingName;
      }
    }

    lines.push("");

    selectedTrommels.forEach(tr => {
      let info = `- ${tr.name}`;
      if (tr.index_number) info += ` (#${tr.index_number})`;
      if (tr.serial_number) info += `, Nr: ${tr.serial_number}`;
      if (tr.company_name) info += `, Firma: ${tr.company_name}`;
      if (tr.cable_type) info += `, Typ: ${tr.cable_type}`;
      lines.push(info);
    });

    lines.push("");
    lines.push(t("cables", "automatedEmailNote", "Wiadomość wygenerowana automatycznie przez InspectHero."));
    lines.push(t("cables", "pickupEmailFooter", "Pozdrawiam / Mit freundlichen Grüßen"));

    setEmailContent(lines.join("\n"));
  }

  async function handleSaveEmail() {
    if (!emailTo.trim()) return;
    try {
      const token = await getToken();
      const res: any = await apiPost("/api/saved-emails", { email: emailTo.trim() }, token!);
      const newEmail = res?.data ? (Array.isArray(res.data) ? res.data[0] : res.data) : (Array.isArray(res) ? res[0] : res);
      if (newEmail && newEmail.id) {
        setSavedEmails(prev => prev.find(e => e.email === newEmail.email) ? prev : [newEmail, ...prev]);
      }
    } catch (e: any) { alert("Error saving email: " + e.message); }
  }

  async function handleSaveBuilding() {
    if (!selectedBuilding.trim()) return;
    try {
      const token = await getToken();
      const res: any = await apiPost("/api/saved-buildings", { name: selectedBuilding.trim() }, token!);
      const newBuilding = res?.data ? (Array.isArray(res.data) ? res.data[0] : res.data) : (Array.isArray(res) ? res[0] : res);
      if (newBuilding && newBuilding.id) {
        setSavedBuildings(prev => prev.find(b => b.name === newBuilding.name) ? prev : [newBuilding, ...prev]);
      }
      generateTemplate(selectedBuilding.trim());
    } catch (e: any) { alert("Error saving building: " + e.message); }
  }

  async function handleSend() {
    if (!emailTo) {
      alert(t("email", "alertNoEmail", "Proszę podać adres e-mail."));
      return;
    }

    try {
      setIsSending(true);
      const token = await getToken();
      
      // Generate rich HTML for the actual email, but use emailContent for the text part
      let itemsHtml = "";
      for (const tr of selectedTrommels) {
        itemsHtml += `
          <div style="margin-bottom: 20px; padding: 15px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
            <div style="display: flex; gap: 15px; flex-wrap: wrap;">
              <div style="flex: 1; min-width: 250px;">
                <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                  <tr><td style="padding: 6px 0; color: #64748b; width: 120px;">${t("cables", "serialNumber", "Nr bębna")}:</td><td style="padding: 6px 0; font-weight: 600; color: #1e293b;">${tr.serial_number || "-"}</td></tr>
                  <tr><td style="padding: 6px 0; color: #64748b;">${t("cables", "companyName", "Firma")}:</td><td style="padding: 6px 0; font-weight: 600; color: #1e293b;">${tr.company_name || "-"}</td></tr>
                  <tr><td style="padding: 6px 0; color: #64748b;">${t("cables", "cableType", "Typ kabla")}:</td><td style="padding: 6px 0; font-weight: 600; color: #1e293b;">${tr.cable_type || "-"}</td></tr>
                  <tr><td style="padding: 6px 0; color: #64748b;">${t("cables", "diameter", "Średnica")}:</td><td style="padding: 6px 0; font-weight: 600; color: #1e293b;">${tr.diameter ? tr.diameter + " cm" : "-"}</td></tr>
                </table>
              </div>
              ${tr.photo_url ? `
                <div style="flex-shrink: 0;">
                  <img src="${tr.photo_url}" style="width: 150px; height: 100px; object-fit: cover; border-radius: 8px; border: 1px solid #e2e8f0;" alt="Trommel Photo" />
                </div>
              ` : ""}
            </div>
          </div>
        `;
      }

      const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #334155; background-color: #f8fafc; padding: 40px 10px;">
          <div style="max-width: 650px; margin: 0 auto; background: #ffffff; padding: 30px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
              <h2 style="color: ${reportType === "request" ? "#0284c7" : "#10b981"}; margin: 0 0 10px 0; font-size: 24px; font-weight: 800;">${emailSubject}</h2>
              <p style="color: #64748b; font-size: 16px; margin: 0;">${t("cables", "logisticSystem", "System logistyczny InspectHero")}</p>
            </div>
            <div style="font-size: 16px; line-height: 1.6; margin-bottom: 25px; color: #475569; white-space: pre-wrap;">
              ${emailContent.split("\n\n")[0]}<br><br>
              ${emailContent.split("\n\n")[1]}
            </div>
            ${itemsHtml}
            <div style="margin-top: 35px; padding-top: 20px; border-top: 1px solid #f1f5f9; text-align: center;">
              <p style="font-size: 12px; color: #94a3b8; margin: 0;">${t("cables", "emailFooterSystem", "Wysłano z systemu InspectHero")}</p>
              <p style="font-size: 10px; color: #94a3b8; margin: 4px 0;">${t("cables", "automatedEmailNote", "Wiadomość wygenerowana automatycznie")}</p>
            </div>
          </div>
        </div>
      `;

      const res = await apiPost("/api/send-email", { to: emailTo, subject: emailSubject, html }, token);
      
      // Update statuses
      await Promise.all(selectedTrommels.map(tr => {
        const updateData: any = { 
          id: tr.id, 
          status: reportType === "request" ? "pickup_requested" : "picked_up" 
        };
        
        if (reportType === "confirmation") {
          updateData.picked_up_at = new Date().toISOString();
          updateData.pickup_email_sent = true;
        } else if (reportType === "request") {
          updateData.pickup_requested_at = new Date().toISOString();
          updateData.pickup_requested_email_sent = true;
        }

        return apiPatch("/api/trommels", updateData, token);
      }));

      onSuccess();
      onClose();
      alert(t("email", "alertSuccess", "E-mail został pomyślnie wysłany ze strony!"));
    } catch (err: any) {
      alert(err.message || t("email", "alertError", "Błąd wysyłki."));
    } finally {
      setIsSending(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h3>{t("email", "title", "Wyślij formalny e-mail")}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {loading ? (
            <div style={{ textAlign: "center", padding: "40px" }}>{t("common", "loading", "Ładowanie...")}</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Report Type Selector */}
              <div style={{ background: "#f1f5f9", padding: "4px", borderRadius: "12px", display: "flex", gap: "4px" }}>
                <button 
                  onClick={() => setReportType("request")}
                  style={{ 
                    flex: 1, padding: "10px", borderRadius: "8px", border: "none", fontSize: "13px", fontWeight: 700,
                    background: reportType === "request" ? "#0284c7" : "transparent",
                    color: reportType === "request" ? "white" : "#64748b",
                    transition: "all 0.2s", cursor: "pointer"
                  }}
                >
                  🚀 {t("cables", "reportForPickup", "Zgłoś do odbioru")}
                </button>
                <button 
                  onClick={() => setReportType("confirmation")}
                  style={{ 
                    flex: 1, padding: "10px", borderRadius: "8px", border: "none", fontSize: "13px", fontWeight: 700,
                    background: reportType === "confirmation" ? "#10b981" : "transparent",
                    color: reportType === "confirmation" ? "white" : "#64748b",
                    transition: "all 0.2s", cursor: "pointer"
                  }}
                >
                  ✅ {t("cables", "markAsPickedUp", "Oznacz jako odebrany")}
                </button>
              </div>

              {/* Recipient */}
              <div>
                <label className="upload-label">{t("email", "recipientLabel", "Adres e-mail (Odbiorca)")}</label>
                <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                  <select 
                    className="upload-input" 
                    value={emailTo} 
                    onChange={e => setEmailTo(e.target.value)}
                    style={{ flex: 1, margin: 0 }}
                  >
                    <option value="">-- {t("email", "selectEmail", "Wybierz zapisany e-mail")} --</option>
                    {savedEmails.map(s => <option key={s.id} value={s.email}>{s.email}</option>)}
                  </select>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input 
                    type="email" 
                    className="upload-input" 
                    value={emailTo} 
                    onChange={e => setEmailTo(e.target.value)} 
                    placeholder="logistyka@firma.de"
                    style={{ flex: 1, margin: 0 }}
                  />
                  <button 
                    onClick={handleSaveEmail} 
                    className="home-button-primary" 
                    style={{ padding: "0 15px", height: "40px" }}
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Building */}
              <div>
                <label className="upload-label">{t("email", "buildingLabel", "Budowa (opcjonalnie)")}</label>
                <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                  <select 
                    className="upload-input" 
                    value={selectedBuilding} 
                    onChange={e => { setSelectedBuilding(e.target.value); generateTemplate(e.target.value); }}
                    style={{ flex: 1, margin: 0 }}
                  >
                    <option value="">-- {t("email", "selectBuilding", "Wybierz zapisaną budowę")} --</option>
                    {savedBuildings.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                  </select>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input 
                    type="text" 
                    className="upload-input" 
                    value={selectedBuilding} 
                    onChange={e => { setSelectedBuilding(e.target.value); generateTemplate(e.target.value); }}
                    placeholder={t("email", "buildingPlaceholder", "Wpisz nazwę budowy")}
                    style={{ flex: 1, margin: 0 }}
                  />
                  <button 
                    onClick={handleSaveBuilding} 
                    className="home-button-primary" 
                    style={{ padding: "0 15px", height: "40px" }}
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Subject */}
              <div>
                <label className="upload-label">{t("email", "subjectLabel", "Temat")}</label>
                <input 
                  type="text" 
                  className="upload-input" 
                  value={emailSubject} 
                  onChange={e => setEmailSubject(e.target.value)} 
                  style={{ width: "100%", margin: 0 }}
                />
              </div>

              {/* Content */}
              <div>
                <label className="upload-label">{t("email", "contentLabel", "Treść wiadomości")}</label>
                <textarea 
                  className="upload-input" 
                  value={emailContent} 
                  onChange={e => setEmailContent(e.target.value)} 
                  rows={10}
                  style={{ width: "100%", margin: 0, resize: "vertical", fontFamily: "monospace", fontSize: "14px" }}
                />
              </div>

              <div style={{ fontSize: "13px", color: "#64748b", background: "#f8fafc", padding: "10px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                💡 {t("email", "description", "Do wiadomości zostaną dołączone zdjęcia i szczegóły techniczne wybranych bębnów.")}
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="home-button-secondary" onClick={onClose}>{t("common", "cancel", "Anuluj")}</button>
          <button 
            className="home-button-primary" 
            onClick={handleSend} 
            disabled={isSending || loading}
            style={{ minWidth: "150px" }}
          >
            {isSending ? t("email", "sendingButton", "Wysyłanie...") : t("email", "sendButton", "✉️ Wyślij e-mail")}
          </button>
        </div>
      </div>

      <style jsx>{`
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(8px);
          display: grid;
          place-items: start center;
          z-index: 10000;
          overflow-y: auto;
          padding: 20px;
          padding-top: env(safe-area-inset-top, 40px);
        }
        .modal-content {
          background: #ffffff;
          border-radius: 20px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
          display: flex;
          flex-direction: column;
          max-width: 700px;
          width: 100%;
          max-height: calc(100vh - 100px);
          position: relative;
          margin-bottom: 40px;
          overflow: hidden;
        }
        .modal-header {
          padding: 20px 24px;
          border-bottom: 1px solid #f1f5f9;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-shrink: 0;
          background: #ffffff;
          position: sticky;
          top: 0;
          z-index: 10;
        }
        .modal-body {
          padding: 20px;
          overflow-y: auto;
          flex: 1;
        }
        .modal-footer {
          padding: 20px;
          border-top: 1px solid #f1f5f9;
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          flex-shrink: 0;
        }
        .modal-header h3 {
          margin: 0;
          font-size: 1.25rem;
          color: #1e293b;
          font-weight: 700;
        }
        .modal-close {
          background: #f1f5f9;
          border: none;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #64748b;
          transition: all 0.2s;
        }
        .modal-close:hover {
          background: #e2e8f0;
          color: #0f172a;
        }
        .upload-label {
          display: block;
          font-size: 14px;
          font-weight: 600;
          color: #475569;
          margin-bottom: 8px;
        }
        .upload-input {
          padding: 10px 12px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          background: #ffffff;
          font-size: 14px;
          color: #1e293b;
          transition: border-color 0.2s;
        }
        .upload-input:focus {
          outline: none;
          border-color: var(--primary);
        }
        .home-button-primary {
          background: var(--primary);
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.2s;
        }
        .home-button-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .home-button-secondary {
          background: #f1f5f9;
          color: #475569;
          border: none;
          padding: 10px 20px;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
