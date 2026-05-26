"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiGet, apiPost, apiPatch, apiDelete, getToken } from "@/lib/apiClient";
import Head from "next/head";

interface Project {
    id: string;
    name: string;
    companies?: { name: string } | null;
}

interface Material {
    id: string;
    name: string;
    display_name?: string | null;
    unit: string;
    category?: string | null;
    article_number?: string | null;
}

interface CartItem {
    id: string; // internal temp id
    materialId?: string;
    name: string;
    unit: string;
    quantity: number | "";
    category?: string;
    article_number?: string | null;
}

export default function MaterialsClient() {
    const router = useRouter();
    const { t } = useLanguage();

    const [projects, setProjects] = useState<Project[]>([]);
    const [projectId, setProjectId] = useState<string>("");
    const [materials, setMaterials] = useState<Material[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const [totalResults, setTotalResults] = useState(0);
    const itemsPerPage = 200;
    const [cart, setCart] = useState<CartItem[]>([]);

    // Custom material form state
    const [showCustomForm, setShowCustomForm] = useState(false);
    const [customName, setCustomName] = useState("");
    const [customUnit, setCustomUnit] = useState("st.");
    const [customQty, setCustomQty] = useState<number | "">("");
    const [customArticleNumber, setCustomArticleNumber] = useState("");

    // Loading & Error states
    const [isLoading, setIsLoading] = useState(true);
    const [isSearching, setIsSearching] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // My orders history
    const [myOrders, setMyOrders] = useState<any[]>([]);
    const [cartOrderId, setCartOrderId] = useState<string | null>(null);

    useEffect(() => {
        loadInitialData();
    }, []);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery]);

    useEffect(() => {
        if (projectId) {
            loadCart(projectId);
        } else {
            setCart([]);
            setCartOrderId(null);
        }
    }, [projectId]);

    useEffect(() => {
        if (searchQuery.trim().length >= 2) {
            searchMaterials(searchQuery, currentPage);
        } else {
            setMaterials([]);
            setTotalResults(0);
        }
    }, [searchQuery, currentPage]);

    async function loadCart(pId: string) {
        try {
            const token = await getToken();
            if (!token) return;

            // Fetch the current cart order for this project
            // apiGet already returns the .data property (which is an array of orders)
            const orders = await apiGet<any[]>(`/api/orders?projectId=${pId}&status=CART`, token);

            if (orders && orders.length > 0) {
                const cartOrder = orders[0];
                setCartOrderId(cartOrder.id);
                // Map DB items to UI CartItem
                const items = (cartOrder.items || []).map((it: any) => ({
                    id: it.id,
                    materialId: it.material_id,
                    name: it.material ? (it.material.display_name || it.material.name) : it.custom_name,
                    unit: it.material ? it.material.unit : it.custom_unit,
                    quantity: it.quantity,
                    article_number: it.material?.article_number,
                    category: it.material?.category,
                    taskId: it.task_id
                }));
                setCart(items);
            } else {
                setCartOrderId(null);
                setCart([]);
            }
        } catch (err) {
            console.error("Failed to load cart:", err);
        }
    }

    async function loadInitialData() {
        try {
            const token = await getToken();
            if (!token) {
                router.replace("/auth/login");
                return;
            }

            const projs: Project[] = await apiGet("/api/projects", token);
            setProjects(projs);

            // Auto-select project: use localStorage saved, or first available
            const saved = localStorage.getItem("materials_project_id");
            const savedValid = saved && projs.some((p: Project) => p.id === saved);
            const autoId = savedValid ? saved : (projs.length > 0 ? projs[0].id : "");
            if (autoId) {
                setProjectId(autoId);
                localStorage.setItem("materials_project_id", autoId);
            }

            // Load user's own orders
            await loadMyOrders(token);
        } catch (err: any) {
            setError("Failed to load projects: " + err.message);
        } finally {
            setIsLoading(false);
        }
    }

    async function loadMyOrders(tok?: string | null) {
        try {
            const token = tok ?? await getToken();
            if (!token) return;
            // apiGet already returns the .data property
            const ords = await apiGet<any[]>("/api/orders", token);
            setMyOrders(ords || []);
        } catch {
            // silently ignore
        }
    }

    async function searchMaterials(queryStr: string, page: number = 1) {
        try {
            setIsSearching(true);
            const token = await getToken();
            let url = `/api/materials?page=${page}&limit=${itemsPerPage}&favoritesOnly=true`;
            if (queryStr.trim().length >= 2) {
                url += `&search=${encodeURIComponent(queryStr)}`;
            }

            const response = await apiGet(url, token) as any;
            // API returns { ok: true, data: { items: [...], total: N } }
            const payload = response?.data ?? response;
            if (payload && Array.isArray(payload.items)) {
                setMaterials(payload.items);
                setTotalResults(payload.total ?? payload.items.length);
            } else {
                const mats = Array.isArray(payload) ? payload : [];
                setMaterials(mats);
                setTotalResults(mats.length);
            }
        } catch (err: any) {
            console.error("Search error:", err);
        } finally {
            setIsSearching(false);
        }
    }

    const totalPages = Math.ceil(totalResults / itemsPerPage);

    const renderPagination = () => {
        if (totalPages <= 1) return null;
        const pages = [];
        const maxVisible = 5;
        let start = Math.max(1, currentPage - 2);
        let end = Math.min(totalPages, start + maxVisible - 1);
        if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1);

        for (let i = start; i <= end; i++) pages.push(i);

        return (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "8px", marginTop: "16px", padding: "8px" }}>
                <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    style={{ padding: "6px 10px", borderRadius: "var(--radius)", border: "1px solid var(--border)", background: "var(--home-bg)", cursor: "pointer", opacity: currentPage === 1 ? 0.4 : 1 }}
                >
                    &laquo;
                </button>
                {start > 1 && (
                    <>
                        <button onClick={() => setCurrentPage(1)} style={{ padding: "6px 10px", borderRadius: "var(--radius)", border: "1px solid var(--border)", background: "var(--home-bg)", cursor: "pointer" }}>1</button>
                        {start > 2 && <span style={{ color: "var(--home-muted)" }}>...</span>}
                    </>
                )}
                {pages.map(p => (
                    <button
                        key={p}
                        onClick={() => setCurrentPage(p)}
                        style={{
                            padding: "6px 10px",
                            borderRadius: "var(--radius)",
                            border: p === currentPage ? "1px solid var(--primary)" : "1px solid var(--border)",
                            background: p === currentPage ? "var(--primary)" : "var(--home-bg)",
                            color: p === currentPage ? "#fff" : "inherit",
                            cursor: "pointer"
                        }}
                    >
                        {p}
                    </button>
                ))}
                {end < totalPages && (
                    <>
                        {end < totalPages - 1 && <span style={{ color: "var(--home-muted)" }}>...</span>}
                        <button onClick={() => setCurrentPage(totalPages)} style={{ padding: "6px 10px", borderRadius: "var(--radius)", border: "1px solid var(--border)", background: "var(--home-bg)", cursor: "pointer" }}>{totalPages}</button>
                    </>
                )}
                <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    style={{ padding: "6px 10px", borderRadius: "var(--radius)", border: "1px solid var(--border)", background: "var(--home-bg)", cursor: "pointer", opacity: currentPage === totalPages ? 0.4 : 1 }}
                >
                    &raquo;
                </button>
            </div>
        );
    };

    async function handleAddCatalogItem(mat: Material) {
        if (!projectId) {
            setError("Wybierz projekt przed dodaniem do koszyka");
            return;
        }

        try {
            const token = await getToken();
            let currentOrderId = cartOrderId;

            // 1. Ensure CART order exists
            if (!currentOrderId) {
                const newOrder = await apiPost<any>("/api/orders", {
                    projectId,
                    status: "CART",
                    items: [{ materialId: mat.id, quantity: 1 }]
                }, token!);
                setCartOrderId(newOrder.data.id);
                await loadCart(projectId);
                return;
            }

            // 2. Check if already in cart
            const existing = cart.find(item => item.materialId === mat.id);
            if (existing) {
                await apiPatch("/api/order-items", {
                    itemId: existing.id,
                    quantity: (Number(existing.quantity) || 0) + 1
                }, token!);
            } else {
                await apiPost("/api/order-items", {
                    orderId: currentOrderId,
                    materialId: mat.id,
                    quantity: 1
                }, token!);
            }

            await loadCart(projectId);
            setSearchQuery("");
            setMaterials([]);
        } catch (err: any) {
            setError("Błąd przy dodawaniu do koszyka: " + err.message);
        }
    }

    async function handleAddCustomItem() {
        if (!customName.trim() || !customUnit.trim() || !customQty || customQty <= 0) {
            alert(t("common", "error", "Błąd") + ": Wypełnij wszystkie pola");
            return;
        }
        if (!projectId) {
            setError("Wybierz projekt przed dodaniem do koszyka");
            return;
        }

        try {
            const token = await getToken();
            let currentOrderId = cartOrderId;

            // 1. Ensure CART order exists
            if (!currentOrderId) {
                const newOrder = await apiPost<any>("/api/orders", {
                    projectId,
                    status: "CART",
                    items: [{ customName: customName.trim(), customUnit: customUnit.trim(), quantity: Number(customQty) }]
                }, token!);
                setCartOrderId(newOrder.data.id);
            } else {
                await apiPost("/api/order-items", {
                    orderId: currentOrderId,
                    customName: customName.trim(),
                    customUnit: customUnit.trim(),
                    quantity: Number(customQty)
                }, token!);
            }

            await loadCart(projectId);
            setCustomName("");
            setCustomQty("");
            setCustomArticleNumber("");
            setShowCustomForm(false);
        } catch (err: any) {
            setError("Błąd przy dodawaniu do koszyka: " + err.message);
        }
    }

    async function handleRemoveItem(id: string) {
        try {
            const token = await getToken();
            await apiDelete(`/api/order-items?id=${id}`, token!);
            await loadCart(projectId);
        } catch (err: any) {
            setError("Błąd przy usuwaniu: " + err.message);
        }
    }

    // New helper for updating quantity
    async function handleUpdateQty(id: string, newQty: number) {
        if (newQty < 0) return;
        try {
            const token = await getToken();
            if (newQty === 0) {
                await handleRemoveItem(id);
            } else {
                await apiPatch("/api/order-items", { itemId: id, quantity: newQty }, token!);
                await loadCart(projectId);
            }
        } catch (err: any) {
            setError("Błąd przy aktualizacji ilości: " + err.message);
        }
    }

    async function handleSubmitOrder() {
        if (!projectId) {
            setError(t("common", "error", "Błąd") + ": Wybierz projekt");
            return;
        }
        if (cart.length === 0) {
            setError(t("common", "error", "Błąd") + ": Koszyk jest pusty");
            return;
        }

        // Validate that all custom items have a non-empty name
        const emptyItems = cart.filter(item => !item.materialId && !item.name.trim());
        if (emptyItems.length > 0) {
            setError("Uzupełnij nazwy wszystkich pozycji w koszyku przed wysłaniem.");
            return;
        }

        const missingQty = cart.filter(item => item.quantity === "" || item.quantity <= 0);
        if (missingQty.length > 0) {
            setError("Wprowadź prawidłową ilość dla wszystkich materiałów.");
            return;
        }

        try {
            setIsSubmitting(true);
            const token = await getToken();

            // Submit the CART order by changing its status to PENDING
            await apiPatch("/api/orders", {
                orderId: cartOrderId,
                status: "PENDING"
            }, token!);

            setSuccess(t("materials", "orderSubmitted", "Zapotrzebowanie zostało wysłane pomyślnie."));
            setCart([]);
            setCartOrderId(null);
            loadMyOrders(token);

            setTimeout(() => setSuccess(null), 5000);
        } catch (err: any) {
            setError("Błąd wysyłania: " + err.message);
        } finally {
            setIsSubmitting(false);
        }
    }

    if (isLoading) {
        return (
            <div style={{ padding: 48, textAlign: "center" }}>{t("common", "loading", "Ładowanie...")}</div>
        );
    }

    // Use translations if available, fallback to simple Polish for now
    const title = t("materials", "title", "Zapotrzebowanie");
    const subtitle = t("materials", "subtitle", "Zamów potrzebne materiały na budowę");
    const projectLabel = t("materials", "projectLabel", "Projekt");
    const searchLabel = t("materials", "searchLabel", "Szukaj materiału");
    const searchPlaceholder = t("materials", "searchPlaceholder", "Np. kabel, gniazdko...");
    const addCustomBtn = t("materials", "addCustomBtn", "Szukanego materiału nie ma na liście");
    const cartTitle = t("materials", "cartTitle", "Twój koszyk zapotrzebowań");
    const emptyCart = t("materials", "emptyCart", "Koszyk jest pusty. Dodaj materiały powyżej.");
    const submitBtn = t("materials", "submitBtn", "Wyślij zapotrzebowanie");

    return (
        <>
            <Head>
                <title>{title} | InspectHero</title>
            </Head>

            <main className="home-main">
                <section className="home-task-panel">
                    <div className="home-section-header">
                        <div>
                            <div className="home-hero-kicker">{t("nav", "materials", "Zapotrzebowania")}</div>
                            <h2>{title}</h2>
                            <p>{subtitle}</p>
                        </div>
                    </div>

                    {error && <div className="home-card-error" style={{ marginBottom: 24 }}>{error}</div>}
                    {success && (
                        <div style={{ padding: 16, background: "var(--success)", color: "#fff", borderRadius: "var(--radius)", marginBottom: 24 }}>
                            {success}
                        </div>
                    )}

                    <div className="home-filters" style={{ marginBottom: 24 }}>
                        {/* Project Selection */}
                        <label>
                            {projectLabel}
                            <select
                                value={projectId}
                                onChange={(e) => {
                                    setProjectId(e.target.value);
                                    localStorage.setItem("materials_project_id", e.target.value);
                                }}
                                disabled={projects.length === 0}
                            >
                                <option value="" disabled>-- {t("materials", "projectLabel", "Wybierz projekt")} --</option>
                                {projects.map(p => (
                                    <option key={p.id} value={p.id}>{p.companies?.name ? `[${p.companies.name.toUpperCase()}] ` : ""}{p.name}</option>
                                ))}
                            </select>
                        </label>

                        {/* Material Search */}
                        <label>
                            {searchLabel}
                            <input
                                type="text"
                                placeholder={searchPlaceholder}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                style={{ backgroundColor: "#ffffff", color: "#000000" }}
                            />
                        </label>
                    </div>

                    <div style={{ position: "relative" }}>
                        {(searchQuery.length >= 2 || (searchQuery.length === 0 && materials.length > 0)) && (
                            <div style={{ marginTop: 24 }}>
                                {isSearching ? (
                                    <div style={{ padding: 12, color: "var(--home-muted)", textAlign: "center" }}>{t("common", "loading", "Szukanie...")}</div>
                                ) : materials.length > 0 ? (
                                    <div style={{ marginBottom: 32 }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
                                            <h3 style={{ margin: 0, fontSize: 16, color: "var(--home-muted)", whiteSpace: "nowrap" }}>
                                                {t("materials", "resultsCount", "Wyniki wyszukiwania")}: {totalResults}
                                            </h3>
                                            {searchQuery && (
                                                <button
                                                    onClick={() => setSearchQuery("")}
                                                    style={{ background: "none", border: "none", color: "var(--primary)", cursor: "pointer", padding: 0, fontSize: 13, fontWeight: 500 }}
                                                >
                                                    {t("common", "clear", "Wyczyść filtry")}
                                                </button>
                                            )}
                                        </div>

                                        {(() => {
                                            const grouped: Record<string, Material[]> = {};
                                            materials.forEach(m => {
                                                const cat = m.category || t("adminMaterials", "noCategory", "Inne");
                                                if (!grouped[cat]) grouped[cat] = [];
                                                grouped[cat].push(m);
                                            });

                                            const sortedCategories = Object.keys(grouped).sort((a, b) => {
                                                if (a.includes("---") || a === "Inne") return 1;
                                                if (b.includes("---") || b === "Inne") return -1;
                                                return a.localeCompare(b);
                                            });

                                            return sortedCategories.map(cat => (
                                                <div key={cat} style={{ marginBottom: 24 }}>
                                                    <h4 style={{
                                                        margin: "0 0 12px 0",
                                                        fontSize: 14,
                                                        color: "var(--home-foreground)",
                                                        background: "var(--home-bg-secondary)",
                                                        padding: "8px 12px",
                                                        borderRadius: "var(--radius)",
                                                        borderLeft: "3px solid var(--primary)",
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: "8px"
                                                    }}>
                                                        {cat}
                                                        <span style={{ fontSize: 11, color: "var(--home-muted)", fontWeight: "normal", background: "var(--home-bg)", padding: "1px 6px", borderRadius: "100px" }}>
                                                            {grouped[cat].length}
                                                        </span>
                                                    </h4>
                                                    <div className="table-container">
                                                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                                                            <thead>
                                                                <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--home-muted)" }}>
                                                                    <th style={{ padding: "8px 12px", fontWeight: 500, textAlign: "left" }}>{t("adminMaterials", "colName", "Nazwa")}</th>
                                                                    <th style={{ padding: "8px 12px", fontWeight: 500, textAlign: "left", width: 120 }}>{t("adminMaterials", "colArticleNumber", "Art. nr")}</th>
                                                                    <th style={{ padding: "8px 12px", fontWeight: 500, textAlign: "center", width: 60 }}>{t("adminMaterials", "colUnit", "J.")}</th>
                                                                    <th style={{ padding: "8px 12px", width: 60 }}></th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {grouped[cat].map(mat => (
                                                                    <tr key={mat.id} style={{ borderBottom: "1px solid var(--border)" }} className="hover-bg-secondary">
                                                                        <td style={{ padding: "10px 12px" }}>
                                                                            <div style={{ fontWeight: 500, color: "#ffffff" }}>{mat.display_name || mat.name}</div>
                                                                        </td>
                                                                        <td style={{ padding: "10px 12px" }}>
                                                                            {mat.article_number ? (
                                                                                <span style={{ fontSize: 12, fontWeight: "bold", color: "#ef4444" }}>{mat.article_number}</span>
                                                                            ) : (
                                                                                <span style={{ color: "#cbd5e1" }}>—</span>
                                                                            )}
                                                                        </td>
                                                                        <td style={{ padding: "10px 12px", textAlign: "center", color: "var(--home-muted)" }}>
                                                                            {mat.unit}
                                                                        </td>
                                                                        <td style={{ padding: "10px 12px", textAlign: "right" }}>
                                                                            <button
                                                                                onClick={() => handleAddCatalogItem(mat)}
                                                                                style={{
                                                                                    background: "var(--primary)",
                                                                                    color: "#fff",
                                                                                    border: "none",
                                                                                    padding: "4px 10px",
                                                                                    borderRadius: "var(--radius)",
                                                                                    fontSize: 12,
                                                                                    cursor: "pointer",
                                                                                    fontWeight: 600
                                                                                }}
                                                                            >
                                                                                + {t("materials", "addBtn", "Dodaj")}
                                                                            </button>
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            ));
                                        })()}
                                        {renderPagination()}
                                    </div>
                                ) : searchQuery.length >= 2 ? (
                                    <div style={{ padding: 24, textAlign: "center", color: "var(--home-muted)", background: "var(--home-bg-secondary)", borderRadius: "var(--radius)", border: "1px dashed var(--border)", marginTop: 16 }}>
                                        {t("adminMaterials", "emptyList", "Brak wyników w bazie.")}
                                    </div>
                                ) : null}
                            </div>
                        )}

                        {!showCustomForm && (
                            <button
                                onClick={() => setShowCustomForm(true)}
                                style={{
                                    background: "var(--home-bg-secondary)",
                                    border: "1px dashed var(--border)",
                                    color: "var(--home-foreground)",
                                    cursor: "pointer",
                                    fontWeight: 500,
                                    fontSize: 14,
                                    marginTop: 16,
                                    padding: "12px",
                                    width: "100%",
                                    borderRadius: "var(--radius)",
                                    display: "flex",
                                    justifyContent: "center",
                                    alignItems: "center",
                                    gap: 8,
                                    transition: "background 0.2s"
                                }}
                                className="hover-bg-secondary"
                            >
                                <span style={{ fontSize: 18, fontWeight: 300, color: "var(--primary)" }}>+</span> {addCustomBtn}
                            </button>
                        )}

                        {showCustomForm && (
                            <div style={{ marginTop: 16, padding: 16, borderRadius: "var(--radius)", background: "var(--home-bg-secondary)", border: "1px dashed var(--border)" }}>
                                <h4 style={{ margin: "0 0 12px 0", color: "var(--home-foreground)", fontSize: 14 }}>{t("adminMaterials", "addMaterialTitle", "Dodaj pozycję ręcznie")}</h4>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, alignItems: "end" }}>
                                    <div>
                                        <label style={{ display: "block", fontSize: 12, color: "var(--home-muted)", marginBottom: 4 }}>{t("adminMaterials", "materialNameLabel", "Nazwa materiału")}</label>
                                        <input type="text" className="upload-input" value={customName} onChange={e => setCustomName(e.target.value)} placeholder={t("adminMaterials", "materialNamePlaceholder", "Np. Przełącznik typ X")} style={{ backgroundColor: "#ffffff", color: "#000000" }} />
                                    </div>
                                    <div>
                                        <label style={{ display: "block", fontSize: 12, color: "var(--home-muted)", marginBottom: 4 }}>{t("adminMaterials", "unitLabel", "Jednostka")}</label>
                                        <input type="text" className="upload-input" value={customUnit} onChange={e => setCustomUnit(e.target.value)} placeholder={t("adminMaterials", "unitPlaceholder", "st., mb")} />
                                    </div>
                                    <div>
                                        <label style={{ display: "block", fontSize: 12, color: "var(--home-muted)", marginBottom: 4 }}>{t("materials", "quantityCol", "Ilość")}</label>
                                        <input type="number" min="0.01" step="1" className="upload-input" value={customQty} onChange={e => setCustomQty(e.target.value ? Number(e.target.value) : "")} placeholder="0" />
                                    </div>
                                    <div style={{ gridColumn: "1 / -1", marginTop: 12 }}>
                                        <label style={{ display: "block", fontSize: 12, color: "var(--home-muted)", marginBottom: 4 }}>{t("adminMaterials", "articleNumberLabel", "Numer artykułu")}</label>
                                        <input type="text" className="upload-input" value={customArticleNumber} onChange={e => setCustomArticleNumber(e.target.value)} placeholder={t("adminMaterials", "articleNumberPlaceholder", "Np. 123456")} />
                                    </div>
                                </div>
                                <div style={{ display: "flex", gap: 12, marginTop: 16, justifyContent: "flex-end" }}>
                                    <button onClick={() => setShowCustomForm(false)} style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--home-foreground)", padding: "6px 16px", borderRadius: "var(--radius)", cursor: "pointer" }}>{t("common", "cancel", "Anuluj")}</button>
                                    <button onClick={handleAddCustomItem} style={{ background: "var(--primary)", border: "none", color: "#fff", padding: "6px 16px", borderRadius: "var(--radius)", cursor: "pointer", fontWeight: 600 }}>{t("materials", "addToCart", "Dodaj do koszyka")}</button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Cart */}
                    <div style={{ marginTop: 24 }}>
                        <h3 style={{ margin: "0 0 16px 0", fontSize: 18, color: "var(--home-foreground)" }}>{cartTitle}</h3>

                        {cart.length === 0 ? (
                            <div style={{ padding: 32, textAlign: "center", color: "var(--home-muted)", background: "var(--home-bg-secondary)", borderRadius: "var(--radius)", border: "1px dashed var(--border)" }}>
                                {emptyCart}
                            </div>
                        ) : (
                            <div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                                    {/* Header row — visible only on wider screens */}
                                    <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--border)", color: "var(--home-muted)", fontSize: 13, fontWeight: 500, padding: "8px 0" }}>
                                        <div style={{ flex: 1 }}>{t("materials", "materialCol", "Materiał")}</div>
                                        <div style={{ whiteSpace: "nowrap", paddingRight: 8 }}>{t("materials", "quantityCol", "Menge / Ilość")}</div>
                                        <div style={{ width: 36 }}></div>
                                    </div>
                                    {cart.map(item => (
                                        <div key={item.id} style={{ borderBottom: "1px solid var(--border)", padding: "10px 0" }}>
                                            {/* Name row — full width, wraps freely */}
                                            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--home-foreground)", marginBottom: 6, wordBreak: "break-word", overflowWrap: "break-word" }}>
                                                {item.materialId ? (
                                                    <>
                                                        {item.category && <span style={{ fontWeight: 500 }}>{item.category} — </span>}
                                                        {item.name}
                                                        {item.article_number && (
                                                            <div style={{ fontSize: 12, color: "#ef4444", fontWeight: "bold", marginTop: 2 }}>Art. nr: {item.article_number}</div>
                                                        )}
                                                    </>
                                                ) : (
                                                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                                        <textarea
                                                            value={item.name}
                                                            onChange={e => setCart(prev => prev.map(ci =>
                                                                ci.id === item.id ? { ...ci, name: e.target.value } : ci
                                                            ))}
                                                            rows={2}
                                                            style={{
                                                                border: "1px solid var(--border)",
                                                                borderRadius: "var(--radius)",
                                                                padding: "6px 8px",
                                                                fontSize: 13,
                                                                background: "#ffffff",
                                                                color: "#000000",
                                                                width: "100%",
                                                                resize: "vertical"
                                                            }}
                                                            placeholder={t("adminMaterials", "materialNamePlaceholder", "Nazwa materiału")}
                                                        />
                                                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                            <input
                                                                type="text"
                                                                value={item.unit}
                                                                onChange={e => setCart(prev => prev.map(ci =>
                                                                    ci.id === item.id ? { ...ci, unit: e.target.value } : ci
                                                                ))}
                                                                style={{
                                                                    border: "1px solid var(--border)",
                                                                    borderRadius: "var(--radius)",
                                                                    padding: "4px 8px",
                                                                    fontSize: 12,
                                                                    background: "#ffffff",
                                                                    color: "#000000",
                                                                    width: 72
                                                                }}
                                                                placeholder={t("adminMaterials", "unitPlaceholder", "Jedn.")}
                                                            />
                                                            <span style={{ fontSize: 11, background: "var(--border)", padding: "2px 6px", borderRadius: 4, color: "#000000" }}>
                                                                {t("materials", "customBadge", "Ręcznie")}
                                                            </span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            {/* Controls row — quantity + delete */}
                                            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                                                <input
                                                    type="number"
                                                    value={item.quantity}
                                                    onChange={(e) => handleUpdateQty(item.id, Number(e.target.value))}
                                                    style={{
                                                        width: "60px",
                                                        padding: "4px 8px",
                                                        borderRadius: "var(--radius)",
                                                        border: "1px solid var(--border)",
                                                        background: "var(--home-bg)",
                                                        color: "var(--home-foreground)",
                                                        fontWeight: 600,
                                                        textAlign: "center"
                                                    }}
                                                />
                                                <span style={{ color: "var(--home-muted)", fontSize: 13, minWidth: 28 }}>{item.unit}</span>
                                                <button
                                                    onClick={() => handleRemoveItem(item.id)}
                                                    style={{ background: "transparent", border: "none", color: "var(--danger)", cursor: "pointer", padding: 4 }}
                                                    title={t("common", "delete", "Usuń")}
                                                >
                                                    ✖️
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Add extra custom item directly in cart */}
                                <div style={{ marginTop: 16 }}>
                                    <button
                                        onClick={() => {
                                            setCart(prev => [...prev, {
                                                id: Math.random().toString(36).substr(2, 9),
                                                name: "",
                                                unit: "szt.",
                                                quantity: ""
                                            }]);
                                        }}
                                        style={{
                                            background: "transparent",
                                            border: "1px dashed var(--border)",
                                            color: "var(--home-muted)",
                                            cursor: "pointer",
                                            fontSize: 13,
                                            padding: "8px 16px",
                                            borderRadius: "var(--radius)",
                                            width: "100%",
                                            textAlign: "center",
                                            transition: "background 0.2s"
                                        }}
                                        className="hover-bg-secondary"
                                    >
                                        + {t("materials", "addCustomBtn", "Dodaj pozycję do listy")}
                                    </button>
                                </div>

                                <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
                                    <button
                                        onClick={handleSubmitOrder}
                                        disabled={isSubmitting || !projectId}
                                        style={{
                                            background: "var(--primary)",
                                            color: "#fff",
                                            border: "none",
                                            padding: "12px 24px",
                                            borderRadius: "var(--radius)",
                                            fontSize: 16,
                                            fontWeight: 600,
                                            cursor: isSubmitting || !projectId ? "not-allowed" : "pointer",
                                            opacity: isSubmitting || !projectId ? 0.7 : 1
                                        }}
                                    >
                                        {isSubmitting ? t("common", "loading", "Wysyłanie...") : submitBtn}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* My Orders History */}
                    <div style={{ marginTop: 24 }}>
                        <h3 style={{ margin: "0 0 16px 0", fontSize: 18, color: "var(--home-foreground)" }}>
                            {t("materials", "myRequestsTab", "Moje wysłane zapotrzebowania")}
                        </h3>

                        {myOrders.length === 0 ? (
                            <div style={{ padding: 32, textAlign: "center", color: "var(--home-muted)", background: "var(--home-bg-secondary)", borderRadius: "var(--radius)", border: "1px dashed var(--border)" }}>
                                {t("materials", "noOrdersYet", "Nie wysłałeś jeszcze żadnych zapotrzebowań.")}
                            </div>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                                {myOrders.map(order => {
                                    const statusColors: Record<string, { bg: string; color: string; label: string }> = {
                                        PENDING: { bg: "#fef08a", color: "#854d0e", label: t("materials", "statusPending", "Oczekuje") },
                                        APPROVED: { bg: "#bbf7d0", color: "#166534", label: t("materials", "statusApproved", "Zatwierdzone") },
                                        REJECTED: { bg: "#fecaca", color: "#991b1b", label: t("materials", "statusRejected", "Odrzucone") },
                                        DELIVERED: { bg: "#e0e7ff", color: "#3730a3", label: t("materials", "statusDelivered", "Dostarczone") },
                                    };
                                    const sc = statusColors[order.status] ?? { bg: "#e5e7eb", color: "#374151", label: order.status };

                                    return (
                                        <div key={order.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
                                            {/* Order header */}
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", background: "var(--home-bg-secondary)", borderBottom: "1px solid var(--border)" }}>
                                                <div>
                                                    <div style={{ fontWeight: 600, fontSize: 14, color: "var(--home-foreground)" }}>
                                                        {new Date(order.created_at).toLocaleDateString("pl-PL", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                                                    </div>
                                                    {order.project && (
                                                        <div style={{ fontSize: 12, color: "var(--home-muted)", marginTop: 2 }}>{order.project.name}</div>
                                                    )}
                                                </div>
                                                <span style={{ padding: "4px 12px", borderRadius: 12, fontSize: 12, fontWeight: 700, background: sc.bg, color: sc.color }}>
                                                    {sc.label}
                                                </span>
                                            </div>

                                            {/* Items list — read-only */}
                                            <div className="table-container" style={{ padding: "12px 16px" }}>
                                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, color: "var(--home-foreground)" }}>
                                                    <tbody>
                                                        {(order.items || []).map((item: any) => (
                                                            <tr key={item.id} style={{ borderBottom: "1px solid var(--border)" }}>
                                                                <td style={{ padding: "8px 0", fontWeight: 500 }}>
                                                                    <div style={{ display: "flex", flexDirection: "column" }}>
                                                                        <span>{item.material ? item.material.name : item.custom_name}</span>
                                                                        {item.material?.article_number && (
                                                                            <span style={{ fontSize: 11, color: "#ef4444", fontWeight: "bold" }}>Art. nr: {item.material.article_number}</span>
                                                                        )}
                                                                    </div>
                                                                    {!item.material && (
                                                                        <span style={{ marginLeft: 8, fontSize: 11, background: "var(--border)", padding: "2px 6px", borderRadius: 4, color: "var(--home-muted)" }}>
                                                                            {t("materials", "customBadge", "Ręcznie")}
                                                                        </span>
                                                                    )}
                                                                </td>
                                                                <td style={{ padding: "8px 0", textAlign: "right", color: "var(--home-muted)", whiteSpace: "nowrap" }}>
                                                                    <strong style={{ color: "var(--home-foreground)" }}>{item.quantity}</strong> {item.material ? item.material.unit : item.custom_unit}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </section>
            </main>
        </>
    );
}
