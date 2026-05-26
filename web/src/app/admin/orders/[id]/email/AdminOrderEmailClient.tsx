"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiGet, getToken, apiPost, apiDelete, getApiUrl } from "@/lib/apiClient";
import Head from "next/head";

export default function AdminOrderEmailClient({ orderId }: { orderId: string }) {
    const router = useRouter();
    const { t } = useLanguage();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [order, setOrder] = useState<any>(null);

    const [emailTo, setEmailTo] = useState("");
    const [selectedBuilding, setSelectedBuilding] = useState("");
    const [emailSubject, setEmailSubject] = useState("Baumaterialien Bestellung");
    const [emailContent, setEmailContent] = useState("");
    const [isSending, setIsSending] = useState(false);

    const [savedEmails, setSavedEmails] = useState<{ id: string; email: string }[]>([]);
    const [savedBuildings, setSavedBuildings] = useState<{ id: string; name: string }[]>([]);

    useEffect(() => {
        loadData();
    }, [orderId]);

    async function loadData() {
        try {
            setLoading(true);
            const token = await getToken();
            if (!token) {
                router.replace("/auth/login");
                return;
            }

            // Fetch order
            const resp = await fetch(`/api/orders`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const { data, ok, error } = await resp.json();
            if (!ok) throw new Error(error?.message || "Error fetching logic");

            const foundOrder = (data || []).find((o: any) => String(o.id) === String(orderId));
            if (!foundOrder) {
                throw new Error(t("email", "alertOrderNotFound", "Nie znaleziono zamówienia") + " (" + orderId + ").");
            }
            setOrder(foundOrder);

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

            generateTemplate(foundOrder, "");
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    async function handleSaveEmail() {
        if (!emailTo.trim()) return;
        try {
            const token = await getToken();
            const res: any = await apiPost("/api/saved-emails", { email: emailTo.trim() }, token!);
            console.log("save email response:", res);
            const newEmail = res?.data ? (Array.isArray(res.data) ? res.data[0] : res.data) : (Array.isArray(res) ? res[0] : res);
            if (newEmail && newEmail.id) {
                setSavedEmails(prev => {
                    if (prev.find(e => e.email === newEmail.email)) return prev;
                    return [newEmail, ...prev];
                });
            }
        } catch (e: any) { alert("Error saving email: " + e.message); }
    }

    async function handleDeleteEmail(id: string) {
        if (!confirm(t("common", "deleteConfirm", "Na pewno usunąć?"))) return;
        try {
            const token = await getToken();
            await apiDelete(`/api/saved-emails?id=${id}`, token!);
            setSavedEmails(prev => prev.filter(e => e.id !== id));
            if (savedEmails.find(e => e.id === id)?.email === emailTo) setEmailTo("");
        } catch (e: any) { alert("Error deleting: " + e.message); }
    }

    async function handleSaveBuilding() {
        if (!selectedBuilding.trim()) return;
        try {
            const token = await getToken();
            const res: any = await apiPost("/api/saved-buildings", { name: selectedBuilding.trim() }, token!);
            console.log("save building response:", res);
            const newBuilding = res?.data ? (Array.isArray(res.data) ? res.data[0] : res.data) : (Array.isArray(res) ? res[0] : res);
            if (newBuilding && newBuilding.id) {
                setSavedBuildings(prev => {
                    if (prev.find(b => b.name === newBuilding.name)) return prev;
                    return [newBuilding, ...prev];
                });
            }
            // re-generate template with the saved/added building
            generateTemplate(order, selectedBuilding.trim());
        } catch (e: any) { alert("Error saving building: " + e.message); }
    }

    async function handleDeleteBuilding(id: string) {
        if (!confirm(t("common", "deleteConfirm", "Na pewno usunąć?"))) return;
        try {
            const token = await getToken();
            await apiDelete(`/api/saved-buildings?id=${id}`, token!);
            setSavedBuildings(prev => prev.filter(b => b.id !== id));
            if (savedBuildings.find(b => b.id === id)?.name === selectedBuilding) {
                setSelectedBuilding("");
                generateTemplate(order, "");
            }
        } catch (e: any) { alert("Error deleting: " + e.message); }
    }



    function generateTemplate(o: any, buildingName: string) {
        if (!o) return;
        let lines: string[] = [];

        lines.push("Guten Tag,");
        lines.push("");

        if (buildingName) {
            lines.push(`hiermit möchte ich folgendes Material für die Baustelle ${buildingName} bestellen:`);
        } else {
            lines.push("hiermit möchte ich folgendes Material bestellen:");
        }

        lines.push("");

        const items = o.items || [];
        items.forEach((item: any) => {
            const mat = item.material;
            const category = mat?.category;
            // Always use wholesale name for the actual order
            const wholesaleName = mat ? mat.name : item.custom_name;
            const unit = mat ? mat.unit : item.custom_unit;
            const qty = item.quantity;
            const articleNumber = mat?.article_number;

            // Build the formal line
            let itemLine = category ? `${category} — ${wholesaleName}` : wholesaleName;
            if (articleNumber) {
                itemLine += ` (Art. nr: ${articleNumber})`;
            }

            lines.push(`- ${itemLine} – ${qty} ${unit}`);
        });

        lines.push("");
        lines.push("Falls etwas nicht vorrätig ist, bitte ich um Rückmeldung.");
        lines.push("Bei Rückfragen stehe ich Ihnen gerne zur Verfügung.");
        lines.push("");
        lines.push("Mit freundlichen Grüßen,");
        lines.push("Marcin Slapinski");

        setEmailContent(lines.join("\n"));
    }

    async function handleSend() {
        if (!emailTo) {
            alert(t("email", "alertNoEmail", "Proszę podać adres e-mail."));
            return;
        }

        try {
            setIsSending(true);
            const token = await getToken();
            const htmlContent = emailContent.replace(/\n/g, "<br />");

            const res = await fetch(getApiUrl("/api/send-email"), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    to: emailTo,
                    subject: emailSubject,
                    html: htmlContent
                })
            });

            const data = await res.json();
            if (!data.ok) {
                throw new Error(data.error?.message || t("email", "alertError", "Błąd wysyłki."));
            }

            alert(t("email", "alertSuccess", "E-mail został pomyślnie wysłany ze strony!"));
            router.push("/to-approve");
        } catch (err: any) {
            alert(err.message || t("email", "alertError", "Błąd wysyłki."));
        } finally {
            setIsSending(false);
        }
    }

    if (loading) {
        return <div style={{ padding: 48, textAlign: "center" }}>{t("common", "loading", "Ładowanie...")}</div>;
    }

    return (
        <>
            <Head>
                <title>{t("email", "title", "Wyślij formalny e-mail")} | InspectHero</title>
            </Head>

            <main className="home-main">
                <section className="home-task-panel">
                    <button
                        onClick={() => router.push("/to-approve")}
                        style={{ background: "transparent", border: "none", color: "var(--primary)", cursor: "pointer", fontWeight: 600, padding: 0, marginBottom: 16 }}
                    >
                        &larr; {t("email", "backToList", "Wróć do listy")}
                    </button>

                    <div className="home-section-header">
                        <div>
                            <div className="home-hero-kicker">{t("email", "kickerAdmin", "Admin")}</div>
                            <h2>{t("email", "title", "Wyślij formalny e-mail")}</h2>
                            <p>{t("email", "description", "Wygenerowana wiadomość w języku niemieckim (zamówienie materiałów).")}</p>
                        </div>
                    </div>

                    {error && <div className="home-card-error" style={{ marginBottom: 24 }}>{error}</div>}

                    <div className="upload-card" style={{ marginBottom: 32 }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                            {/* EMAIL SELECTION */}
                            <div>
                                <label className="upload-label">{t("email", "recipientLabel", "Adres e-mail hurtowni (Odbiorca)")}</label>
                                <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "8px" }}>
                                    <select
                                        className="upload-input"
                                        value={emailTo}
                                        onChange={e => setEmailTo(e.target.value)}
                                        style={{ flex: 1, margin: 0 }}
                                    >
                                        <option value="">-- {t("email", "selectEmail", "Wybierz zapisany e-mail")} --</option>
                                        {savedEmails.map(s => (
                                            <option key={s.id} value={s.email}>{s.email}</option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={() => {
                                            const idToDelete = savedEmails.find(e => e.email === emailTo)?.id;
                                            if (idToDelete) handleDeleteEmail(idToDelete);
                                        }}
                                        disabled={!savedEmails.find(e => e.email === emailTo)}
                                        style={{ background: "transparent", border: "1px solid var(--danger)", color: "var(--danger)", padding: "10px 12px", borderRadius: "8px", cursor: savedEmails.find(e => e.email === emailTo) ? "pointer" : "not-allowed", opacity: savedEmails.find(e => e.email === emailTo) ? 1 : 0.5 }}
                                    >
                                        🗑
                                    </button>
                                </div>
                                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                    <input
                                        type="email"
                                        className="upload-input"
                                        value={emailTo}
                                        onChange={e => setEmailTo(e.target.value)}
                                        placeholder="hurtownia@example.com"
                                        style={{ flex: 1, margin: 0 }}
                                    />
                                    <button
                                        onClick={handleSaveEmail}
                                        disabled={!emailTo || !!savedEmails.find(e => e.email === emailTo)}
                                        style={{ background: "var(--primary)", color: "#fff", border: "none", padding: "10px 12px", borderRadius: "8px", cursor: (!emailTo || !!savedEmails.find(e => e.email === emailTo)) ? "not-allowed" : "pointer", opacity: (!emailTo || !!savedEmails.find(e => e.email === emailTo)) ? 0.5 : 1, whiteSpace: "nowrap" }}
                                    >
                                        + {t("email", "saveEmailBtn", "Zapisz")}
                                    </button>
                                </div>
                            </div>

                            {/* BUILDING SELECTION */}
                            <div>
                                <label className="upload-label">{t("email", "buildingLabel", "Budowa (opcjonalnie)")}</label>
                                <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "8px" }}>
                                    <select
                                        className="upload-input"
                                        value={selectedBuilding}
                                        onChange={e => {
                                            setSelectedBuilding(e.target.value);
                                            generateTemplate(order, e.target.value);
                                        }}
                                        style={{ flex: 1, margin: 0 }}
                                    >
                                        <option value="">-- {t("email", "selectBuilding", "Wybierz zapisaną budowę")} --</option>
                                        {savedBuildings.map(s => (
                                            <option key={s.id} value={s.name}>{s.name}</option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={() => {
                                            const idToDelete = savedBuildings.find(b => b.name === selectedBuilding)?.id;
                                            if (idToDelete) handleDeleteBuilding(idToDelete);
                                        }}
                                        disabled={!savedBuildings.find(b => b.name === selectedBuilding)}
                                        style={{ background: "transparent", border: "1px solid var(--danger)", color: "var(--danger)", padding: "10px 12px", borderRadius: "8px", cursor: savedBuildings.find(b => b.name === selectedBuilding) ? "pointer" : "not-allowed", opacity: savedBuildings.find(b => b.name === selectedBuilding) ? 1 : 0.5 }}
                                    >
                                        🗑
                                    </button>
                                </div>
                                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                    <input
                                        type="text"
                                        className="upload-input"
                                        value={selectedBuilding}
                                        onChange={e => {
                                            setSelectedBuilding(e.target.value);
                                            generateTemplate(order, e.target.value);
                                        }}
                                        placeholder={t("email", "buildingPlaceholder", "Wpisz nową nazwę budowy")}
                                        style={{ flex: 1, margin: 0 }}
                                    />
                                    <button
                                        onClick={handleSaveBuilding}
                                        disabled={!selectedBuilding || !!savedBuildings.find(b => b.name === selectedBuilding)}
                                        style={{ background: "var(--primary)", color: "#fff", border: "none", padding: "10px 12px", borderRadius: "8px", cursor: (!selectedBuilding || !!savedBuildings.find(b => b.name === selectedBuilding)) ? "not-allowed" : "pointer", opacity: (!selectedBuilding || !!savedBuildings.find(b => b.name === selectedBuilding)) ? 0.5 : 1, whiteSpace: "nowrap" }}
                                    >
                                        + {t("email", "saveBuildingBtn", "Zapisz")}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="upload-label">{t("email", "subjectLabel", "Temat")}</label>
                                <input
                                    type="text"
                                    className="upload-input"
                                    value={emailSubject}
                                    onChange={e => setEmailSubject(e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="upload-label">{t("email", "contentLabel", "Treść wiadomości")}</label>
                                <textarea
                                    className="upload-input"
                                    value={emailContent}
                                    onChange={e => setEmailContent(e.target.value)}
                                    rows={15}
                                    style={{ resize: "vertical", fontFamily: "monospace", fontSize: "14px" }}
                                />
                            </div>
                        </div>

                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
                            <button
                                onClick={handleSend}
                                disabled={isSending}
                                style={{
                                    background: isSending ? "#94a3b8" : "var(--primary)", color: "#fff", border: "none",
                                    padding: "12px 24px", borderRadius: "var(--radius)",
                                    fontWeight: 600, cursor: isSending ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 8
                                }}
                            >
                                {isSending ? t("email", "sendingButton", "Wysyłanie...") : t("email", "sendButton", "✉️ Wyślij e-mail ze strony")}
                            </button>
                        </div>
                    </div>
                </section>
            </main>
        </>
    );
}
