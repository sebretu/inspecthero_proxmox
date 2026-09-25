"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiDelete, apiGet, apiPost, apiPatch } from "@/lib/apiClient";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "@/contexts/LanguageContext";
import { motion, AnimatePresence } from "framer-motion";

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
}

type Company = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
};

type User = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  company_id: string | null;
};

type Project = {
  id: string;
  name: string;
  company_id: string | null;
  is_archived: boolean;
};

export default function CompaniesPage() {
  const router = useRouter();
  const { t } = useLanguage();
  
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [sessionChecked, setSessionChecked] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanySlug, setNewCompanySlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [newCompanyActive, setNewCompanyActive] = useState(true);
  const [companySaving, setCompanySaving] = useState(false);
  const [companyError, setCompanyError] = useState<string | null>(null);
  const [deleteCompanyLoading, setDeleteCompanyLoading] = useState(false);
  const [roleChecked, setRoleChecked] = useState(false);
  const [newCompanyProjectIds, setNewCompanyProjectIds] = useState<string[]>([]);

  // Editing names states
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [editingCompanyName, setEditingCompanyName] = useState("");
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectName, setEditingProjectName] = useState("");

  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectSubprojects, setNewProjectSubprojects] = useState("");
  const [projectCreationError, setProjectCreationError] = useState<string | null>(null);

  const isAdmin = (currentUserRole || "").toUpperCase() === "ADMIN";

  async function handleRenameCompany(companyId: string) {
    if (!editingCompanyName.trim()) return;
    try {
      await apiPatch("/api/companies", { id: companyId, name: editingCompanyName.trim() });
      setEditingCompanyId(null);
      await loadData();
    } catch (err: any) {
      alert(err.message || "Error renaming company");
    }
  }

  async function handleRenameProject(projectId: string) {
    if (!editingProjectName.trim()) return;
    try {
      await apiPatch("/api/projects", { id: projectId, name: editingProjectName.trim() });
      setEditingProjectId(null);
      await loadData();
    } catch (err: any) {
      alert(err.message || "Error renaming project");
    }
  }

  async function handleCreateNewProject() {
    if (!selectedCompanyId || !newProjectName.trim()) return;
    try {
      setProjectCreationError(null);
      await apiPost("/api/projects", {
        name: newProjectName.trim(),
        company_id: selectedCompanyId,
        subprojects: newProjectSubprojects.trim() || undefined,
      });
      setNewProjectName("");
      setNewProjectSubprojects("");
      setIsCreatingProject(false);
      await loadData();
    } catch (err: any) {
      setProjectCreationError(err.message || "Error creating project");
    }
  }

  const handleAuthRedirect = useCallback(
    (message: string) => {
      const normalized = message.toLowerCase();
      if (
        normalized.includes("bearer token") ||
        normalized.includes("auth_required") ||
        normalized.includes("auth invalid")
      ) {
        router.replace("/auth/login");
        return true;
      }
      return false;
    },
    [router]
  );

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [companiesData, usersData, projectsData] = await Promise.all([
        apiGet<Company[]>("/api/companies"),
        apiGet<User[]>("/api/users"),
        apiGet<any>("/api/projects"),
      ]);
      setCompanies(companiesData || []);
      setUsers(usersData || []);
      const pList = projectsData?.data ?? projectsData;
      setProjects(Array.isArray(pList) ? pList : []);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error loading data";
      if (handleAuthRedirect(message)) return;
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [handleAuthRedirect]);

  useEffect(() => {
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        if (!data?.session) {
          router.replace("/auth/login");
          return;
        }
        setCurrentUserId(data.session.user.id);
        setSessionChecked(true);
      })
      .catch(() => {
        if (!active) return;
        router.replace("/auth/login");
      });
    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    if (!sessionChecked || !roleChecked) return;
    if (!isAdmin) return;
    loadData();
  }, [sessionChecked, roleChecked, isAdmin, loadData]);

  useEffect(() => {
    if (!currentUserId) return;
    let active = true;
    setRoleChecked(false);
    (async () => {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", currentUserId)
          .single();

        if (!active) return;
        setCurrentUserRole(data?.role || "USER");
      } catch (err) {
        if (!active) return;
        setCurrentUserRole("USER");
      } finally {
        if (!active) return;
        setRoleChecked(true);
      }
    })();

    return () => {
      active = false;
    };
  }, [currentUserId]);

  useEffect(() => {
    if (slugEdited) return;
    setNewCompanySlug(slugify(newCompanyName));
  }, [newCompanyName, slugEdited]);

  async function handleCreateCompany(e: React.FormEvent) {
    e.preventDefault();
    if (!isAdmin) return;

    const trimmedName = newCompanyName.trim();
    if (!trimmedName) {
      setCompanyError(t("companies", "nameRequired", "Company name is required."));
      return;
    }

    try {
      setCompanySaving(true);
      setCompanyError(null);
      const payload: Record<string, any> = {
        name: trimmedName,
        is_active: newCompanyActive,
      };
      if (newCompanySlug.trim()) {
        payload.slug = newCompanySlug.trim();
      }

      const created = await apiPost<Company>("/api/companies", payload);

      // Assign selected projects to the newly created company
      if (newCompanyProjectIds.length > 0) {
        await Promise.all(
          newCompanyProjectIds.map((projId) =>
            apiPatch("/api/projects", { id: projId, company_id: created.id })
          )
        );
      }

      await loadData();
      setSelectedCompanyId(created.id);
      setNewCompanyName("");
      setNewCompanySlug("");
      setSlugEdited(false);
      setNewCompanyActive(true);
      setNewCompanyProjectIds([]);
    } catch (err) {
      const fallback = t("companies", "createError", "Failed to create company.");
      const message = err instanceof Error ? err.message : fallback;
      if (handleAuthRedirect(message)) return;
      setCompanyError(message);
    } finally {
      setCompanySaving(false);
    }
  }

  async function handleDeleteCompany(company: Company) {
    if (!isAdmin) return;
    const confirmMessage = t("companies", "deleteConfirm", "Delete company {name}? Members will be detached.").replace(
      "{name}",
      company.name
    );
    if (!confirm(confirmMessage)) return;

    try {
      setDeleteCompanyLoading(true);
      setCompanyError(null);
      await apiDelete(`/api/companies?id=${encodeURIComponent(company.id)}`);
      await loadData();
      setSelectedCompanyId((prev) => (prev === company.id ? null : prev));
    } catch (err) {
      const fallback = t("companies", "deleteError", "Failed to delete company.");
      const message = err instanceof Error ? err.message : fallback;
      if (handleAuthRedirect(message)) return;
      setCompanyError(message);
    } finally {
      setDeleteCompanyLoading(false);
    }
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCompanyId || !selectedUserId) {
      alert(t("companies", "chooseUserAndCompany", "Select a company and user first."));
      return;
    }

    try {
      await apiPost(`/api/companies/${selectedCompanyId}/members`, {
        user_id: selectedUserId,
      });

      await loadData();
      setShowAddUserModal(false);
      setSelectedUserId("");
    } catch (err) {
      const fallback = t("companies", "addUserError", "Failed to add user.");
      const message = err instanceof Error ? err.message : fallback;
      if (handleAuthRedirect(message)) return;
      alert(message);
    }
  }

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId);
  const companyMembers = selectedCompany
    ? users.filter((u) => u.company_id === selectedCompanyId)
    : [];
  const availableUsers = users.filter(
    (u) => u.company_id !== selectedCompanyId && !u.email.includes("deleted+")
  );

  if (!sessionChecked || !roleChecked) {
    return (
      <div className="min-h-screen bg-ui-bg flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-ui-border border-t-ui-accent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-ui-bg flex items-center justify-center p-6 text-center">
        <div className="bg-ui-card backdrop-blur-3xl border border-ui-border p-12 rounded-xl shadow-2xl max-w-md">
          <div className="text-6xl mb-6">🔒</div>
          <h1 className="text-2xl font-black text-ui-text uppercase tracking-tight mb-4">
            {t("access", "adminOnlyTitle", "Access restricted")}
          </h1>
          <p className="text-ui-muted font-bold">
            {t("access", "adminOnlyBody", "Only administrators can view this page.")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      className="min-h-screen bg-transparent text-ui-text selection:bg-ui-accent/30 overflow-x-hidden pb-20"
    >
      {/* Ambient Background Glows */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-ui-accent/5 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-ui-accent/5 blur-[120px] rounded-full"></div>
        <div className="absolute inset-0 opacity-[0.02]" style={{ backgroundImage: "radial-gradient(var(--ui-muted) 1px, transparent 0)", backgroundSize: "40px 40px" }}></div>
      </div>

      <div className="relative z-10 container mx-auto px-6 py-12 max-w-[1400px]">
        {/* Header Card */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-12 gap-8 bg-ui-card backdrop-blur-3xl border border-ui-border p-10 lg:p-14 rounded-xl shadow-2xl shadow-black/50">
          <div>
            <h1 className="text-4xl lg:text-5xl font-black tracking-tighter text-ui-text uppercase leading-none">
              🏢 {t("companies", "title", "COMPANIES")}
            </h1>
            <p className="text-ui-muted text-xs mt-4 uppercase font-bold tracking-[0.3em]">
              {t("companies", "subtitle", "MANAGE ORGANIZATIONS AND MEMBERSHIP")}
            </p>
          </div>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setSelectedCompanyId(null)}
            className="px-8 py-4 rounded-xl bg-ui-accent text-ui-bg text-xs font-black uppercase tracking-widest shadow-xl shadow-ui-accent/20"
          >
            {t("companies", "createTitle", "ADD COMPANY")}
          </motion.button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 p-6 rounded-xl text-red-400 text-xs font-bold uppercase tracking-widest mb-8 flex items-center gap-4 animate-pulse">
            <span>⚠️</span> {error}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
          {/* Left Side: Company List & Create Form */}
          <div className="xl:col-span-4 space-y-8">
            {/* Create Company Form (only if no company selected or forced) */}
            {!selectedCompanyId && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-ui-card backdrop-blur-3xl border border-ui-border rounded-xl p-10 space-y-8 shadow-2xl"
              >
                <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-ui-accent mb-2">
                  {t("companies", "createTitle", "ADD COMPANY")}
                </h2>
                
                {companyError && (
                  <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-lg text-amber-500 text-[10px] font-bold uppercase">
                    {companyError}
                  </div>
                )}

                <form onSubmit={handleCreateCompany} className="space-y-6">
                  <div className="space-y-3">
                    <label className="text-[9px] font-black text-ui-muted uppercase tracking-widest ml-1">
                      {t("companies", "nameLabel", "COMPANY NAME")}
                    </label>
                    <input
                      type="text"
                      value={newCompanyName}
                      onChange={(e) => setNewCompanyName(e.target.value)}
                      placeholder={t("companies", "namePlaceholder", "e.g. Elektro Sp. z o.o.")}
                      className="w-full bg-black/40 border border-ui-border rounded-xl px-6 py-4 text-xs font-bold text-ui-text outline-none focus:border-ui-accent/50 transition-all"
                      required
                    />
                  </div>

                  <div className="space-y-3">
                    <label className="text-[9px] font-black text-ui-muted uppercase tracking-widest ml-1">
                      {t("companies", "slug", "URL SLUG")}
                    </label>
                    <input
                      type="text"
                      value={newCompanySlug}
                      onChange={(e) => {
                        setSlugEdited(true);
                        setNewCompanySlug(e.target.value);
                      }}
                      placeholder={t("companies", "slugPlaceholder", "e.g. elektro-sp")}
                      className="w-full bg-black/40 border border-ui-border rounded-xl px-6 py-4 text-xs font-bold text-ui-text outline-none focus:border-ui-accent/50 transition-all"
                    />
                  </div>

                  <div className="flex items-center gap-4 px-2">
                    <input
                      id="active-check"
                      type="checkbox"
                      checked={newCompanyActive}
                      onChange={(e) => setNewCompanyActive(e.target.checked)}
                      className="w-5 h-5 rounded-lg border-ui-border bg-black/40 text-ui-accent focus:ring-ui-accent/30"
                    />
                    <label htmlFor="active-check" className="text-[10px] font-black text-ui-text uppercase tracking-widest cursor-pointer">
                      {t("companies", "active", "ACTIVE")}
                    </label>
                  </div>

                  {/* Project Selector in Create Form */}
                  <div className="space-y-3">
                    <label className="text-[9px] font-black text-ui-muted uppercase tracking-widest ml-1">
                      {t("companies", "assignProjectsLabel", "ASSIGN PROJECTS TO COMPANY")}
                    </label>
                    <div className="bg-black/20 border border-ui-border/50 rounded-xl p-4 max-h-48 overflow-y-auto no-scrollbar space-y-3">
                      {projects.map((p) => {
                        const currentCompany = companies.find(c => c.id === p.company_id);
                        return (
                          <label key={p.id} className="flex items-center gap-3 cursor-pointer group">
                            <input
                              type="checkbox"
                              checked={newCompanyProjectIds.includes(p.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setNewCompanyProjectIds([...newCompanyProjectIds, p.id]);
                                } else {
                                  setNewCompanyProjectIds(newCompanyProjectIds.filter(id => id !== p.id));
                                }
                              }}
                              className="w-4 h-4 rounded border-ui-border bg-black/40 text-ui-accent focus:ring-ui-accent/30 cursor-pointer"
                            />
                            <div className="flex flex-col min-w-0">
                              <span className="text-[10px] font-bold text-ui-text uppercase tracking-tight truncate group-hover:text-ui-accent transition-colors">
                                {p.name}
                              </span>
                              {currentCompany && (
                                <span className="text-[8px] font-bold text-ui-muted uppercase tracking-widest mt-0.5">
                                  🏢 {currentCompany.name}
                                </span>
                              )}
                            </div>
                          </label>
                        );
                      })}
                      {projects.length === 0 && (
                        <div className="text-[9px] font-bold text-ui-muted uppercase tracking-widest text-center py-4">
                          {t("companies", "noProjectsAvailable", "NO PROJECTS AVAILABLE")}
                        </div>
                      )}
                    </div>
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="submit"
                    disabled={companySaving || !newCompanyName.trim()}
                    className="w-full bg-ui-accent text-ui-bg py-5 rounded-xl text-[11px] font-black uppercase tracking-[0.2em] shadow-xl shadow-ui-accent/20 disabled:opacity-50 transition-all"
                  >
                    {companySaving ? "..." : t("companies", "createButton", "ADD COMPANY")}
                  </motion.button>
                </form>
              </motion.div>
            )}

            {/* Company List */}
            <div className="space-y-4">
              <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-ui-muted px-4">
                {t("companies", "companyList", "REGISTERED ORGANIZATIONS")}
              </h2>
              
              <div className="space-y-3">
                {companies.map((company) => (
                  <motion.button
                    key={company.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setSelectedCompanyId(company.id)}
                    className={`w-full text-left p-6 rounded-xl border transition-all ${
                      selectedCompanyId === company.id
                        ? "bg-ui-accent/10 border-ui-accent shadow-xl shadow-ui-accent/5"
                        : "bg-ui-card border-ui-border hover:border-ui-accent/30"
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="font-black text-ui-text uppercase tracking-tight text-sm">
                        {company.name}
                      </div>
                      <div className={`text-[8px] font-black px-2 py-0.5 rounded-md uppercase ${
                        company.is_active ? "bg-green-500/20 text-green-400" : "bg-slate-800 text-slate-500"
                      }`}>
                        {company.is_active ? t("companies", "active", "ACTIVE") : t("companies", "inactive", "INACTIVE")}
                      </div>
                    </div>
                    <div className="mt-2 text-[9px] font-bold text-ui-muted uppercase tracking-widest">
                      ID: {company.id.slice(0, 8)}...
                    </div>
                  </motion.button>
                ))}

                {companies.length === 0 && (
                  <div className="p-10 text-center bg-ui-card border border-ui-border rounded-xl text-ui-muted font-bold uppercase text-xs">
                    {t("companies", "noCompanies", "No companies found")}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Side: Company Details & Members */}
          <div className="xl:col-span-8">
            <AnimatePresence mode="wait">
              {selectedCompany ? (
                <motion.div
                  key={selectedCompany.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-8"
                >
                  {/* Detailed Info Card */}
                  <div className="bg-ui-card backdrop-blur-3xl border border-ui-border rounded-xl p-10 lg:p-14 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-10 opacity-10 text-8xl pointer-events-none">🏢</div>
                    
                    <div className="relative z-10">
                      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
                        <div>
                          <div className="text-[10px] font-black text-ui-accent uppercase tracking-[0.4em] mb-4">
                            {t("companies", "details", "ORGANIZATION DETAILS")}
                          </div>
                          {editingCompanyId === selectedCompany.id ? (
                            <div className="flex items-center gap-4 mt-2">
                              <input
                                type="text"
                                value={editingCompanyName}
                                onChange={(e) => setEditingCompanyName(e.target.value)}
                                className="bg-black/40 border border-ui-border rounded-lg px-4 py-2 text-sm font-bold text-ui-text outline-none focus:border-ui-accent/50 transition-all"
                                autoFocus
                              />
                              <button
                                onClick={() => handleRenameCompany(selectedCompany.id)}
                                className="px-4 py-2 rounded-lg bg-ui-accent text-ui-bg text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] transition-all"
                              >
                                {t("common", "save", "SAVE")}
                              </button>
                              <button
                                onClick={() => setEditingCompanyId(null)}
                                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition-all"
                              >
                                {t("common", "cancel", "CANCEL")}
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3">
                              <h2 className="text-4xl font-black text-ui-text uppercase tracking-tighter leading-none">
                                {selectedCompany.name}
                              </h2>
                              {isAdmin && (
                                <button
                                  onClick={() => {
                                    setEditingCompanyId(selectedCompany.id);
                                    setEditingCompanyName(selectedCompany.name);
                                  }}
                                  className="text-lg hover:scale-110 active:scale-95 transition-all text-ui-muted hover:text-ui-accent p-1"
                                  title="Edit Name"
                                >
                                  ✏️
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleDeleteCompany(selectedCompany)}
                          disabled={deleteCompanyLoading}
                          className="px-8 py-3 rounded-lg border border-red-500/30 text-red-500 text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all disabled:opacity-50"
                        >
                          {deleteCompanyLoading ? t("companies", "deleting", "DELETING...") : t("companies", "deleteButton", "DELETE COMPANY")}
                        </motion.button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-8 border-y border-ui-border/50">
                        <div className="space-y-1">
                          <div className="text-[9px] font-black text-ui-muted uppercase tracking-widest">
                            {t("companies", "slug", "URL SLUG")}
                          </div>
                          <div className="font-mono text-xs text-ui-accent font-bold">/{selectedCompany.slug}</div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-[9px] font-black text-ui-muted uppercase tracking-widest">
                            {t("companies", "status", "CURRENT STATUS")}
                          </div>
                          <div className={`text-xs font-black uppercase ${selectedCompany.is_active ? "text-green-400" : "text-slate-500"}`}>
                            {selectedCompany.is_active ? `✅ ${t("companies", "active", "ACTIVE")}` : `⏸️ ${t("companies", "inactive", "INACTIVE")}`}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Projects Card */}
                  <div className="bg-ui-card backdrop-blur-3xl border border-ui-border rounded-xl p-10 lg:p-14 shadow-2xl">
                    <div className="flex justify-between items-center mb-10">
                      <div>
                        <h3 className="text-2xl font-black text-ui-text uppercase tracking-tight">
                          {t("companies", "projects", "PROJEKTE ({count})").replace("{count}", String(projects.filter(p => p.company_id === selectedCompanyId).length))}
                        </h3>
                        <p className="text-ui-muted text-[10px] font-bold uppercase tracking-widest mt-1">
                          {t("companies", "projectsSubtitle", "Assigned projects for this organization")}
                        </p>
                      </div>
                      {isAdmin && (
                        <button
                          onClick={() => setIsCreatingProject(!isCreatingProject)}
                          className="px-4 py-2 rounded-lg bg-ui-accent text-ui-bg text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg shadow-ui-accent/10"
                        >
                          {isCreatingProject ? t("common", "close", "CLOSE") : `＋ ${t("companies", "newProject", "NEW PROJECT")}`}
                        </button>
                      )}
                    </div>

                    {isCreatingProject && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="mb-8 p-6 bg-black/40 border border-ui-border rounded-xl space-y-4"
                      >
                        <div className="flex justify-between items-center">
                          <h4 className="text-[10px] font-black text-ui-accent uppercase tracking-widest">
                            {t("companies", "createNewProject", "CREATE NEW PROJECT")}
                          </h4>
                          <button
                            onClick={() => {
                              setIsCreatingProject(false);
                              setNewProjectName("");
                              setProjectCreationError(null);
                            }}
                            className="text-xs text-ui-muted hover:text-ui-text transition-colors"
                          >
                            ✕
                          </button>
                        </div>
                        {projectCreationError && (
                          <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-lg text-amber-500 text-[10px] font-bold uppercase">
                            {projectCreationError}
                          </div>
                        )}
                        <div className="space-y-3">
                          <div className="flex flex-col sm:flex-row gap-3">
                            <input
                              type="text"
                              value={newProjectName}
                              onChange={(e) => setNewProjectName(e.target.value)}
                              placeholder={t("companies", "projectNamePlaceholder", "Nazwa projektu (np. Gewerbepark Duisburg)")}
                              className="flex-1 bg-black/40 border border-ui-border rounded-lg px-4 py-2.5 text-xs font-bold text-ui-text outline-none focus:border-ui-accent/50 transition-all placeholder:text-ui-muted/50"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleCreateNewProject();
                                }
                              }}
                            />
                            <button
                              onClick={handleCreateNewProject}
                              disabled={!newProjectName.trim()}
                              className="px-6 py-2.5 rounded-lg bg-ui-accent text-ui-bg text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 transition-all whitespace-nowrap"
                            >
                              {t("companies", "createProjectButton", "CREATE & ASSIGN")}
                            </button>
                          </div>

                          <div>
                            <input
                              type="text"
                              value={newProjectSubprojects}
                              onChange={(e) => setNewProjectSubprojects(e.target.value)}
                              placeholder="Opcjonalne podprojekty / Mieter-Ausbau po przecinku (np. Grundfos (Główny), Grundfos EG, Grundfos 1.OG)"
                              className="w-full bg-black/30 border border-ui-border/70 rounded-lg px-3.5 py-2 text-xs text-ui-text outline-none focus:border-ui-accent/50 transition-all placeholder:text-ui-muted/50"
                            />
                            <span className="text-[10px] text-ui-muted mt-1 block">
                              Oddziel podprojekty przecinkami. Domyślny zakres "General" zostanie utworzony automatycznie.
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {projects.filter(p => p.company_id === selectedCompanyId).length === 0 ? (
                      <div className="py-12 text-center border-2 border-dashed border-ui-border rounded-xl text-ui-muted font-bold uppercase text-xs">
                        {t("companies", "noProjects", "No projects assigned to this company")}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {projects.filter(p => p.company_id === selectedCompanyId).map((proj) => (
                          <div
                            key={proj.id}
                            className="p-5 rounded-xl bg-black/20 border border-ui-border/50 hover:border-ui-accent/30 transition-all flex items-center gap-5"
                          >
                            <div className="w-10 h-10 rounded-lg bg-ui-accent/20 flex items-center justify-center text-lg shadow-lg border border-ui-accent/20">
                              📁
                            </div>
                            <div className="flex-1 min-w-0">
                              {editingProjectId === proj.id ? (
                                <div className="flex items-center gap-3">
                                  <input
                                    type="text"
                                    value={editingProjectName}
                                    onChange={(e) => setEditingProjectName(e.target.value)}
                                    className="bg-black/40 border border-ui-border rounded-lg px-3 py-1 text-xs font-bold text-ui-text outline-none focus:border-ui-accent/50 transition-all max-w-[200px]"
                                    autoFocus
                                  />
                                  <button
                                    onClick={() => handleRenameProject(proj.id)}
                                    className="px-3 py-1 rounded bg-ui-accent text-ui-bg text-[9px] font-black uppercase tracking-widest hover:scale-[1.02] transition-all"
                                  >
                                    {t("common", "save", "SAVE")}
                                  </button>
                                  <button
                                    onClick={() => setEditingProjectId(null)}
                                    className="px-3 py-1 rounded bg-slate-800 text-slate-300 text-[9px] font-black uppercase tracking-widest hover:bg-slate-700 transition-all"
                                  >
                                    {t("common", "cancel", "CANCEL")}
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <div className="font-black text-ui-text uppercase tracking-tight truncate text-sm">
                                    {proj.name}
                                  </div>
                                  {isAdmin && (
                                    <button
                                      onClick={() => {
                                        setEditingProjectId(proj.id);
                                        setEditingProjectName(proj.name);
                                      }}
                                      className="text-xs text-ui-muted hover:text-ui-accent transition-colors p-1"
                                      title="Edit Name"
                                    >
                                      ✏️
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                            <select
                              value={proj.company_id || ""}
                              onChange={async (e) => {
                                const newCompanyId = e.target.value;
                                try {
                                  await apiPatch("/api/projects", { id: proj.id, company_id: newCompanyId });
                                  await loadData();
                                } catch (err: any) {
                                  alert(err.message || "Error");
                                }
                              }}
                              className="bg-black/40 border border-ui-border rounded-lg px-3 py-2 text-[10px] font-bold text-ui-text outline-none appearance-none cursor-pointer"
                            >
                              {companies.map(c => (
                                <option key={c.id} value={c.id} className="bg-ui-bg">{c.name}</option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Unassigned projects */}
                    {projects.filter(p => !p.company_id || !companies.find(c => c.id === p.company_id)).length > 0 && (
                      <div className="mt-8 pt-8 border-t border-ui-border/50">
                        <h4 className="text-[10px] font-black text-ui-muted uppercase tracking-widest mb-4">
                          {t("companies", "unassignedProjects", "UNASSIGNED PROJECTS")}
                        </h4>
                        <div className="space-y-3">
                          {projects.filter(p => !p.company_id || !companies.find(c => c.id === p.company_id)).map(proj => (
                            <div key={proj.id} className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 flex items-center gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="font-black text-ui-text uppercase tracking-tight truncate text-xs">{proj.name}</div>
                              </div>
                              <button
                                onClick={async () => {
                                  try {
                                    await apiPatch("/api/projects", { id: proj.id, company_id: selectedCompanyId });
                                    await loadData();
                                  } catch (err: any) { alert(err.message || "Error"); }
                                }}
                                className="px-4 py-2 rounded-lg bg-ui-accent/10 border border-ui-accent/30 text-ui-accent text-[9px] font-black uppercase tracking-widest hover:bg-ui-accent hover:text-ui-bg transition-all whitespace-nowrap"
                              >
                                {t("companies", "assignHere", "ASSIGN HERE")}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Members Card */}
                  <div className="bg-ui-card backdrop-blur-3xl border border-ui-border rounded-xl p-10 lg:p-14 shadow-2xl">
                    <div className="flex justify-between items-center mb-10">
                      <div>
                        <h3 className="text-2xl font-black text-ui-text uppercase tracking-tight">
                          {t("companies", "members", "MEMBERS ({count})").replace("{count}", String(companyMembers.length))}
                        </h3>
                        <p className="text-ui-muted text-[10px] font-bold uppercase tracking-widest mt-1">
                          {t("companies", "usersAssignedDesc", "USERS ASSIGNED TO THIS ORGANIZATION")}
                        </p>
                      </div>
                      
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setShowAddUserModal(true)}
                        className="px-6 py-3 rounded-lg bg-ui-accent/10 border border-ui-accent/30 text-ui-accent text-[10px] font-black uppercase tracking-widest hover:bg-ui-accent hover:text-ui-bg transition-all"
                      >
                        {t("companies", "addUser", "＋ ADD USER")}
                      </motion.button>
                    </div>

                    {companyMembers.length === 0 ? (
                      <div className="py-20 text-center border-2 border-dashed border-ui-border rounded-xl text-ui-muted font-bold uppercase text-xs">
                        {t("companies", "noMembers", "No members in this company")}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {companyMembers.map((user) => (
                          <motion.div
                            key={user.id}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="p-6 rounded-xl bg-black/20 border border-ui-border/50 hover:border-ui-accent/30 transition-all flex items-center gap-5"
                          >
                            <div className="w-12 h-12 rounded-full bg-ui-accent/20 flex items-center justify-center text-xl shadow-lg border border-ui-accent/20">
                              👤
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-black text-ui-text uppercase tracking-tight truncate">
                                {user.full_name}
                              </div>
                              <div className="text-[10px] font-bold text-ui-muted truncate lowercase">
                                {user.email}
                              </div>
                              <div className="mt-2 flex">
                                <span className={`text-[8px] font-black px-2 py-0.5 rounded-md uppercase ${
                                  user.role === "ADMIN" ? "bg-amber-500/20 text-amber-500" : "bg-ui-accent/10 text-ui-accent"
                                }`}>
                                  {user.role}
                                </span>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-20 bg-ui-card backdrop-blur-3xl border border-ui-border border-dashed rounded-xl opacity-60">
                  <div className="text-8xl mb-10">🏢</div>
                  <h2 className="text-3xl font-black text-ui-text uppercase tracking-tighter mb-4">
                    {t("companies", "selectCompany", "SELECT ORGANIZATION")}
                  </h2>
                  <p className="text-ui-muted font-bold max-w-sm">
                    {t("companies", "chooseCompanyDesc", "CHOOSE A COMPANY FROM THE LIST TO MANAGE ITS PROFILE AND TEAM MEMBERS.")}
                  </p>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Add User Modal */}
      <AnimatePresence>
        {showAddUserModal && selectedCompanyId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddUserModal(false)}
              className="absolute inset-0 bg-ui-bg/80 backdrop-blur-xl"
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-ui-card border border-ui-border rounded-xl p-12 shadow-2xl shadow-black/50"
            >
              <h2 className="text-2xl font-black text-ui-text uppercase tracking-tight mb-8">
                {t("companies", "addUserModalTitle", "ADD USER TO COMPANY")}
              </h2>
              
              <form onSubmit={handleAddUser} className="space-y-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-ui-muted uppercase tracking-widest ml-1">
                    {t("companies", "userLabel", "SELECT USER")}
                  </label>
                  <div className="relative">
                    <select
                      value={selectedUserId}
                      onChange={(e) => setSelectedUserId(e.target.value)}
                      className="w-full bg-black/40 border border-ui-border rounded-xl px-6 py-4 text-xs font-bold text-ui-text outline-none appearance-none cursor-pointer focus:border-ui-accent/50 transition-all"
                      required
                    >
                      <option value="" className="bg-ui-bg">{t("companies", "selectUserPlaceholder", "-- SELECT USER --")}</option>
                      {availableUsers.map((u) => (
                        <option key={u.id} value={u.id} className="bg-ui-bg">
                          {u.full_name} ({u.email})
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-ui-muted">▼</div>
                  </div>
                </div>

                <div className="flex gap-4">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    type="submit"
                    className="flex-1 bg-ui-accent text-ui-bg py-4 rounded-xl text-[11px] font-black uppercase tracking-widest shadow-xl shadow-ui-accent/20"
                  >
                    {t("companies", "addUserSubmit", "ADD MEMBER")}
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    type="button"
                    onClick={() => setShowAddUserModal(false)}
                    className="flex-1 bg-slate-800 text-slate-300 py-4 rounded-xl text-[11px] font-black uppercase tracking-widest"
                  >
                    {t("common", "cancel", "CANCEL")}
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
