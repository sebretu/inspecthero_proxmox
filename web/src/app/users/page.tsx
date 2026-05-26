"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/apiClient";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "@/contexts/LanguageContext";
import { motion, AnimatePresence } from "framer-motion";

type User = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  company_id: string | null;
  is_active: boolean;
  created_at: string;
  project_ids?: string[];
  has_vde_access: boolean;
};

type Company = {
  id: string;
  name: string;
};

type Project = {
  id: string;
  name: string;
  company_id?: string | null;
};

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Invitation State
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteCompanyId, setInviteCompanyId] = useState("");
  const [inviteRole, setInviteRole] = useState("USER");
  const [inviteProjectIds, setInviteProjectIds] = useState<string[]>([]);
  const [inviteProjectRole, setInviteProjectRole] = useState("USER");
  const [invitePassword, setInvitePassword] = useState("");
  const [invitePasswordConfirm, setInvitePasswordConfirm] = useState("");
  const [inviteHasVdeAccess, setInviteHasVdeAccess] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSaving, setInviteSaving] = useState(false);

  // Edit State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("USER");
  const [editCompanyId, setEditCompanyId] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [editProjectIds, setEditProjectIds] = useState<string[]>([]);
  const [editPassword, setEditPassword] = useState("");
  const [editPasswordConfirm, setEditPasswordConfirm] = useState("");
  const [editHasVdeAccess, setEditHasVdeAccess] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [confirmingEmail, setConfirmingEmail] = useState(false);

  const [sessionChecked, setSessionChecked] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [roleChecked, setRoleChecked] = useState(false);
  const { t } = useLanguage();
  const isAdmin = (currentUserRole || "").toUpperCase() === "ADMIN";

  const handleAuthRedirect = useCallback(
    (message: string) => {
      const normalized = message.toLowerCase();
      if (normalized.includes("bearer token") || normalized.includes("auth_required") || normalized.includes("auth invalid")) {
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
      const [usersData, companiesData, projectsData] = await Promise.all([
        apiGet<User[]>("/api/users"),
        apiGet<Company[]>("/api/companies"),
        apiGet<Project[]>("/api/projects"),
      ]);
      setUsers(usersData || []);
      setCompanies(companiesData || []);
      setProjects(projectsData || []);
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
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (!data?.session) {
        router.replace("/auth/login");
        return;
      }
      setCurrentUserId(data.session.user.id);
      setSessionChecked(true);
    }).catch(() => {
      if (!active) return;
      router.replace("/auth/login");
    });
    return () => { active = false; };
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
        const { data } = await supabase.from("profiles").select("role").eq("id", currentUserId).single();
        if (!active) return;
        setCurrentUserRole(data?.role || "USER");
      } catch {
        if (!active) return;
        setCurrentUserRole("USER");
      } finally {
        if (!active) return;
        setRoleChecked(true);
      }
    })();
    return () => { active = false; };
  }, [currentUserId]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail || !inviteName) { setInviteError(t("users", "inviteErrorMissingFields", "Email and full name are required.")); return; }
    if (invitePassword !== invitePasswordConfirm) { setInviteError(t("users", "inviteErrorPasswordsMismatch", "Passwords must match.")); return; }
    if (invitePassword.length < 8) { setInviteError(t("users", "inviteErrorPasswordLength", "Password must be at least 8 characters.")); return; }

    try {
      setInviteSaving(true);
      setInviteError(null);
      await apiPost<User>("/api/users", {
        email: inviteEmail,
        full_name: inviteName,
        company_id: inviteCompanyId || null,
        role: inviteRole,
        password: invitePassword,
        project_ids: inviteProjectIds,
        project_role: inviteProjectRole,
        has_vde_access: inviteHasVdeAccess,
      });
      await loadData();
      setShowInviteModal(false);
      setInviteEmail(""); setInviteName(""); setInviteCompanyId(""); setInviteRole("USER");
      setInviteProjectIds([]); setInviteProjectRole("USER"); setInvitePassword(""); setInvitePasswordConfirm("");
      setInviteHasVdeAccess(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("users", "inviteErrorGeneric", "Failed to send invitation.");
      if (handleAuthRedirect(message)) return;
      setInviteError(message);
    } finally { setInviteSaving(false); }
  }

  function openEditModal(user: User) {
    setEditUser(user);
    setEditName(user.full_name);
    setEditRole(user.role);
    setEditCompanyId(user.company_id || "");
    setEditProjectIds(user.project_ids || []);
    setEditActive(user.is_active);
    setEditHasVdeAccess(user.has_vde_access || false);
    setEditPassword("");
    setEditPasswordConfirm("");
    setEditError(null);
    setEditModalOpen(true);
  }

  function closeEditModal() { setEditModalOpen(false); setEditUser(null); setEditPassword(""); setEditPasswordConfirm(""); setConfirmingEmail(false); }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editUser) return;
    if (editPassword || editPasswordConfirm) {
      if (editPassword !== editPasswordConfirm) { setEditError(t("users", "editErrorPasswordsMismatch", "Passwords must match.")); return; }
      if (editPassword.length < 8) { setEditError(t("users", "editErrorPasswordLength", "Password must be at least 8 characters.")); return; }
    }

    try {
      setEditSaving(true);
      setEditError(null);
      const updated = await apiPatch<User>("/api/users", {
        id: editUser.id,
        full_name: editName,
        role: editRole,
        company_id: editCompanyId || null,
        project_ids: editProjectIds,
        is_active: editActive,
        password: editPassword || undefined,
        has_vde_access: editHasVdeAccess,
      });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      closeEditModal();
    } catch (err) {
      const message = err instanceof Error ? err.message : t("users", "editErrorGeneric", "Error updating user.");
      if (handleAuthRedirect(message)) return;
      setEditError(message);
    } finally { setEditSaving(false); }
  }

  async function handleConfirmEmail() {
    if (!editUser) return;
    try {
      setConfirmingEmail(true); setEditError(null);
      const updated = await apiPatch<User>("/api/users", { id: editUser.id, confirm_email: true });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setEditUser(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("users", "confirmEmailError", "Failed to confirm email.");
      if (handleAuthRedirect(message)) return;
      setEditError(message);
    } finally { setConfirmingEmail(false); }
  }

  async function handleDeleteUser(user: User) {
    if (!isAdmin || user.id === currentUserId) return;
    if (!confirm(t("users", "deleteConfirm", "Delete user {name}?").replace("{name}", user.full_name))) return;
    try {
      setDeletingUserId(user.id); setDeleteError(null);
      await apiDelete(`/api/users?id=${encodeURIComponent(user.id)}`);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
    } catch (err) {
      const message = err instanceof Error ? err.message : t("users", "deleteError", "Failed to delete user.");
      if (handleAuthRedirect(message)) return;
      setDeleteError(message);
    } finally { setDeletingUserId(null); }
  }

  const filteredUsers = users.filter((u) => u.full_name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()));
  const getCompanyName = (companyId: string | null) => companyId ? companies.find((c) => c.id === companyId)?.name || "Unknown" : "-";

  if (!sessionChecked || !roleChecked) {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-slate-800 border-t-cyan-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-10 text-center">
        <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center text-4xl mb-8 border border-red-500/20 shadow-2xl shadow-red-500/10">🚫</div>
        <h1 className="text-3xl font-black text-white uppercase tracking-tighter mb-4">{t("access", "adminOnlyTitle", "Access restricted")}</h1>
        <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">{t("access", "adminOnlyBody", "Only administrators can view this page.")}</p>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      className="min-h-screen bg-ui-bg text-ui-text selection:bg-ui-accent/30 overflow-x-hidden pb-20"
    >
      {/* Ambient Background Glows */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-ui-accent/5 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-ui-accent/5 blur-[120px] rounded-full"></div>
        <div className="absolute inset-0 opacity-[0.02]" style={{ backgroundImage: "radial-gradient(var(--ui-text) 1px, transparent 0)", backgroundSize: "40px 40px" }}></div>
      </div>

      <div className="relative z-10 container mx-auto px-6 py-12 max-w-[1600px]">
        {/* Header Card */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-12 gap-8 bg-ui-card backdrop-blur-3xl border border-ui-border p-10 lg:p-14 rounded-lg shadow-2xl shadow-black/50">
          <div>
            <h1 className="text-4xl lg:text-5xl font-black tracking-tighter text-ui-text uppercase leading-none">
              {t("users", "title", "BENUTZERMANAGEMENT")}
            </h1>
            <p className="text-ui-muted text-[10px] mt-4 uppercase font-bold tracking-[0.3em]">
              {t("users", "subtitle", "Verwaltung von Systembenutzern und Berechtigungen")}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
            <div className="relative flex-1 sm:w-80">
              <input
                type="text"
                placeholder={t("users", "searchPlaceholder", "Benutzer suchen...")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-black/40 border border-ui-border rounded-lg px-12 py-4 text-xs font-bold text-ui-text outline-none focus:border-ui-accent/50 transition-all"
              />
              <span className="absolute left-5 top-1/2 -translate-y-1/2 text-ui-muted">🔍</span>
            </div>
            <button
              onClick={() => setShowInviteModal(true)}
              className="bg-ui-accent text-slate-950 px-8 py-4 rounded-lg text-[10px] font-black uppercase tracking-[0.2em] hover:scale-[1.02] transition-all shadow-[0_0_20px_var(--ui-glow)] whitespace-nowrap"
            >
              ➕ {t("users", "invite", "BENUTZER EINLADEN")}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 p-6 rounded-lg text-red-400 text-xs font-bold uppercase tracking-widest mb-8 flex items-center gap-4 animate-pulse">
            <span>⚠️</span> {error}
          </div>
        )}

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-ui-card backdrop-blur-3xl border border-ui-border rounded-lg overflow-hidden shadow-2xl"
        >
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-black/20 border-b border-ui-border/50">
                  <th className="px-10 py-8 text-[10px] font-black text-ui-muted uppercase tracking-[0.3em]">{t("users", "name", "NAME")}</th>
                  <th className="px-10 py-8 text-[10px] font-black text-ui-muted uppercase tracking-[0.3em]">{t("users", "email", "EMAIL")}</th>
                  <th className="px-10 py-8 text-[10px] font-black text-ui-muted uppercase tracking-[0.3em] text-center">{t("users", "role", "ROLLE")}</th>
                  <th className="px-10 py-8 text-[10px] font-black text-ui-muted uppercase tracking-[0.3em]">{t("users", "company", "FIRMA")}</th>
                  <th className="px-10 py-8 text-[10px] font-black text-ui-muted uppercase tracking-[0.3em] text-center">{t("users", "status", "STATUS")}</th>
                  <th className="px-10 py-8 text-[10px] font-black text-ui-muted uppercase tracking-[0.3em] text-right">{t("users", "actions", "AKTIONEN")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ui-border/30">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-10 py-32 text-center">
                      <div className="w-20 h-20 bg-ui-card rounded-full flex items-center justify-center text-4xl mx-auto mb-6 opacity-20">👥</div>
                      <p className="text-[10px] font-black uppercase tracking-[0.4em] text-ui-muted">{t("users", "noUsers", "KEINE BENUTZER GEFUNDEN")}</p>
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <motion.tr 
                      key={user.id} 
                      layout
                      className="group hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-10 py-8 font-black text-ui-text uppercase tracking-tight text-xs">
                        {user.full_name}
                        {user.id === currentUserId && <span className="ml-3 px-2 py-0.5 rounded bg-ui-accent/20 text-ui-accent text-[8px] tracking-widest border border-ui-accent/20">ICH</span>}
                      </td>
                      <td className="px-10 py-8 font-mono text-[11px] text-ui-muted lowercase">{user.email}</td>
                      <td className="px-10 py-8 text-center">
                        <span className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border shadow-lg ${
                          user.role === "ADMIN" 
                          ? "bg-amber-500/10 text-amber-500 border-amber-500/30 shadow-amber-500/5" 
                          : "bg-ui-card text-ui-muted border-ui-border"
                        }`}>
                          {user.role}
                        </span>
                        {user.has_vde_access && (
                          <div className="mt-2 flex justify-center">
                            <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 text-[8px] tracking-widest border border-cyan-500/20 font-black uppercase">E-Check</span>
                          </div>
                        )}
                      </td>
                      <td className="px-10 py-8">
                        <div className="font-bold text-ui-muted uppercase text-[10px] tracking-wider">{getCompanyName(user.company_id)}</div>
                        {(user.project_ids || []).length > 0 && (
                          <div className="text-[8px] font-bold text-ui-accent/60 uppercase tracking-wider mt-1">
                            {(user.project_ids || []).length} {t("users", "projectsAssigned", "Projekte")}
                          </div>
                        )}
                      </td>
                      <td className="px-10 py-8 text-center">
                        <div className="flex items-center justify-center gap-3">
                          <div className={`w-2 h-2 rounded-full ${user.is_active ? "bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]" : "bg-ui-muted/30"}`} />
                          <span className={`text-[10px] font-black uppercase tracking-widest ${user.is_active ? "text-green-500/80" : "text-ui-muted/50"}`}>
                            {user.is_active ? t("users", "active", "AKTIV") : t("users", "inactive", "INAKTIV")}
                          </span>
                        </div>
                      </td>
                      <td className="px-10 py-8 text-right">
                        <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => openEditModal(user)}
                            className="p-3 bg-ui-card text-ui-muted rounded-lg hover:bg-ui-accent/10 hover:text-ui-accent border border-ui-border transition-all shadow-xl"
                            title={t("users", "edit", "Bearbeiten")}
                          >
                            ✏️
                          </button>
                          {isAdmin && user.id !== currentUserId && (
                            <button
                              disabled={deletingUserId === user.id}
                              onClick={() => handleDeleteUser(user)}
                              className="p-3 bg-red-500/10 text-red-500/70 rounded-lg hover:bg-red-500 hover:text-white border border-red-500/20 transition-all shadow-xl"
                              title={t("common", "delete", "Löschen")}
                            >
                              {deletingUserId === user.id ? "..." : "🗑️"}
                            </button>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>

      {/* Invite Modal */}
      <AnimatePresence>
        {showInviteModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowInviteModal(false)}
              className="absolute inset-0 bg-[#020617]/90 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-ui-bg border border-ui-border rounded-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            >
              <div className="p-10 lg:p-14 overflow-y-auto no-scrollbar">
                <div className="flex justify-between items-center mb-10">
                  <div>
                    <h2 className="text-3xl font-black text-ui-text uppercase tracking-tighter">{t("users", "inviteTitle", "BENUTZER EINLADEN")}</h2>
                    <p className="text-ui-muted text-[10px] font-bold uppercase tracking-widest mt-2">Einladungsdetails und Berechtigungen festlegen</p>
                  </div>
                  <button onClick={() => setShowInviteModal(false)} className="w-12 h-12 flex items-center justify-center rounded-lg bg-ui-card text-ui-muted hover:text-ui-text transition-colors">✕</button>
                </div>

                {inviteError && (
                  <div className="bg-red-500/10 border border-red-500/30 p-6 rounded-lg text-red-400 text-[10px] font-bold uppercase tracking-widest mb-8 animate-pulse">
                    ⚠️ {inviteError}
                  </div>
                )}

                <form onSubmit={handleInvite} className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <label className="text-[9px] font-black text-ui-muted uppercase tracking-[0.3em] ml-1">{t("users", "fullName", "NAME")}</label>
                    <input
                      type="text"
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      className="w-full bg-black/40 border border-ui-border rounded-lg px-6 py-4 text-xs font-bold text-ui-text outline-none focus:border-ui-accent/50 transition-all"
                      required
                    />
                  </div>

                  <div className="space-y-3">
                    <label className="text-[9px] font-black text-ui-muted uppercase tracking-[0.3em] ml-1">{t("users", "email", "EMAIL")}</label>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="w-full bg-black/40 border border-ui-border rounded-lg px-6 py-4 text-xs font-bold text-ui-text outline-none focus:border-ui-accent/50 transition-all"
                      required
                    />
                  </div>

                  <div className="space-y-3">
                    <label className="text-[9px] font-black text-ui-muted uppercase tracking-[0.3em] ml-1">{t("users", "passwordLabel", "PASSWORT")}</label>
                    <input
                      type="password"
                      value={invitePassword}
                      onChange={(e) => setInvitePassword(e.target.value)}
                      className="w-full bg-black/40 border border-ui-border rounded-lg px-6 py-4 text-xs font-bold text-ui-text outline-none focus:border-ui-accent/50 transition-all"
                      required
                    />
                  </div>

                  <div className="space-y-3">
                    <label className="text-[9px] font-black text-ui-muted uppercase tracking-[0.3em] ml-1">{t("users", "passwordConfirmLabel", "PASSWORT BESTÄTIGEN")}</label>
                    <input
                      type="password"
                      value={invitePasswordConfirm}
                      onChange={(e) => setInvitePasswordConfirm(e.target.value)}
                      className="w-full bg-black/40 border border-ui-border rounded-lg px-6 py-4 text-xs font-bold text-ui-text outline-none focus:border-ui-accent/50 transition-all"
                      required
                    />
                  </div>

                  <div className="space-y-3">
                    <label className="text-[9px] font-black text-ui-muted uppercase tracking-[0.3em] ml-1">{t("users", "role", "SYSTEM-ROLLE")}</label>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      className="w-full bg-black/40 border border-ui-border rounded-lg px-6 py-4 text-xs font-bold text-ui-text outline-none appearance-none cursor-pointer"
                    >
                      <option value="USER" className="bg-slate-900">USER</option>
                      <option value="MODERATOR" className="bg-slate-900">MODERATOR</option>
                      <option value="ADMIN" className="bg-slate-900">ADMIN</option>
                    </select>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[9px] font-black text-ui-muted uppercase tracking-[0.3em] ml-1">{t("users", "company", "FIRMA")}</label>
                    <select
                      value={inviteCompanyId}
                      onChange={(e) => setInviteCompanyId(e.target.value)}
                      className="w-full bg-black/40 border border-ui-border rounded-lg px-6 py-4 text-xs font-bold text-ui-text outline-none appearance-none cursor-pointer"
                    >
                      <option value="" className="bg-slate-900">-- KEINE FIRMA --</option>
                      {companies.map((c) => <option key={c.id} value={c.id} className="bg-slate-900">{c.name}</option>)}
                    </select>
                  </div>

                  <div className="col-span-full">
                    <label className={`flex items-center gap-4 p-6 rounded-lg border transition-all cursor-pointer group ${inviteHasVdeAccess ? "bg-cyan-500/10 border-cyan-500/30" : "bg-black/20 border-ui-border"}`}>
                      <input type="checkbox" checked={inviteHasVdeAccess} onChange={(e) => setInviteHasVdeAccess(e.target.checked)} className="w-6 h-6 rounded-lg border-2 border-slate-700 bg-black/40 checked:bg-cyan-500 checked:border-cyan-400 transition-all appearance-none cursor-pointer" />
                      <div>
                        <span className={`text-[10px] font-black uppercase tracking-widest ${inviteHasVdeAccess ? "text-cyan-400" : "text-ui-muted"}`}>Dostęp do E-Check / VDE</span>
                        <p className="text-[8px] font-bold text-ui-muted/50 uppercase tracking-[0.2em] mt-1">Ermöglicht dem Benutzer den Zugriff auf den E-Check Generator</p>
                      </div>
                    </label>
                  </div>

                  <div className="col-span-full space-y-4">
                    <div className="flex justify-between items-center px-1">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em]">{t("users", "projects", "PROJEKT-ZUGRIFF")}</label>
                      <div className="flex gap-4">
                        <button type="button" onClick={() => setInviteProjectIds(projects.map(p => p.id))} className="text-[8px] font-black text-cyan-500 uppercase tracking-widest">{t("common", "selectAll", "ALLE")}</button>
                        <button type="button" onClick={() => setInviteProjectIds([])} className="text-[8px] font-black text-slate-600 uppercase tracking-widest">{t("common", "clearAll", "KEINE")}</button>
                      </div>
                    </div>
                    <div className="bg-black/20 p-6 rounded-lg border border-slate-800/50 max-h-72 overflow-y-auto no-scrollbar space-y-4">
                      {companies.map((company) => {
                        const companyProjects = projects.filter(p => p.company_id === company.id);
                        if (companyProjects.length === 0) return null;
                        const allSelected = companyProjects.every(p => inviteProjectIds.includes(p.id));
                        return (
                          <div key={company.id}>
                            <div className="flex justify-between items-center mb-2 px-1">
                              <span className="text-[9px] font-black text-ui-accent uppercase tracking-widest">🏢 {company.name}</span>
                              <button type="button" onClick={() => {
                                if (allSelected) setInviteProjectIds(inviteProjectIds.filter(id => !companyProjects.find(p => p.id === id)));
                                else setInviteProjectIds([...new Set([...inviteProjectIds, ...companyProjects.map(p => p.id)])]);
                              }} className="text-[8px] font-black text-cyan-500/60 uppercase tracking-widest">{allSelected ? t("common", "clearAll", "KEINE") : t("common", "selectAll", "ALLE")}</button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {companyProjects.map((p) => (
                                <label key={p.id} className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer group ${inviteProjectIds.includes(p.id) ? "bg-cyan-500/10 border-cyan-500/30" : "bg-transparent border-slate-800 hover:border-slate-700"}`}>
                                  <input type="checkbox" checked={inviteProjectIds.includes(p.id)} onChange={(e) => e.target.checked ? setInviteProjectIds([...inviteProjectIds, p.id]) : setInviteProjectIds(inviteProjectIds.filter(id => id !== p.id))} className="w-4 h-4 rounded border-2 border-slate-700 bg-black/40 checked:bg-cyan-500 checked:border-cyan-400 transition-all appearance-none cursor-pointer shrink-0" />
                                  <span className={`text-[10px] font-black uppercase tracking-tight truncate ${inviteProjectIds.includes(p.id) ? "text-cyan-400" : "text-slate-500 group-hover:text-slate-300"}`}>{p.name}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                      {projects.filter(p => !p.company_id || !companies.find(c => c.id === p.company_id)).length > 0 && (
                        <div>
                          <div className="flex justify-between items-center mb-2 px-1">
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{t("companies", "unassignedProjects", "OHNE FIRMA")}</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {projects.filter(p => !p.company_id || !companies.find(c => c.id === p.company_id)).map((p) => (
                              <label key={p.id} className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer group ${inviteProjectIds.includes(p.id) ? "bg-cyan-500/10 border-cyan-500/30" : "bg-transparent border-slate-800 hover:border-slate-700"}`}>
                                <input type="checkbox" checked={inviteProjectIds.includes(p.id)} onChange={(e) => e.target.checked ? setInviteProjectIds([...inviteProjectIds, p.id]) : setInviteProjectIds(inviteProjectIds.filter(id => id !== p.id))} className="w-4 h-4 rounded border-2 border-slate-700 bg-black/40 checked:bg-cyan-500 checked:border-cyan-400 transition-all appearance-none cursor-pointer shrink-0" />
                                <span className={`text-[10px] font-black uppercase tracking-tight truncate ${inviteProjectIds.includes(p.id) ? "text-cyan-400" : "text-slate-500 group-hover:text-slate-300"}`}>{p.name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {inviteProjectIds.length > 0 && (
                    <div className="col-span-full space-y-3">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em] ml-1">{t("users", "projectRole", "PROJEKT-ROLLE")}</label>
                      <select
                        value={inviteProjectRole}
                        onChange={(e) => setInviteProjectRole(e.target.value)}
                        className="w-full bg-black/40 border border-slate-700/50 rounded-lg px-6 py-4 text-xs font-bold text-white outline-none appearance-none cursor-pointer"
                      >
                        <option value="USER" className="bg-slate-900">{t("users", "projectRoleMember", "MITGLIED")}</option>
                        <option value="MODERATOR" className="bg-slate-900">{t("users", "projectRoleModerator", "MODERATOR")}</option>
                        <option value="ADMIN" className="bg-slate-900">{t("users", "projectRoleAdmin", "ADMINISTRATOR")}</option>
                      </select>
                    </div>
                  )}

                  <div className="col-span-full flex gap-4 pt-10">
                    <button
                      type="submit"
                      disabled={inviteSaving}
                      className="flex-1 bg-ui-accent text-slate-950 py-5 rounded-lg text-[11px] font-black uppercase tracking-[0.2em] shadow-xl shadow-[var(--ui-glow)] hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                    >
                      {inviteSaving ? "..." : t("users", "inviteSubmit", "BENUTZER EINLADEN")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowInviteModal(false)}
                      className="flex-1 bg-ui-card text-ui-muted py-5 rounded-lg text-[11px] font-black uppercase tracking-[0.2em] border border-ui-border hover:bg-white/5 hover:text-ui-text transition-all"
                    >
                      {t("common", "cancel", "ABBRECHEN")}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Modal */}
      <AnimatePresence>
        {editModalOpen && editUser && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={closeEditModal}
              className="absolute inset-0 bg-[#020617]/90 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-ui-bg border border-ui-border rounded-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            >
              <div className="p-10 lg:p-14 overflow-y-auto no-scrollbar">
                <div className="flex justify-between items-center mb-10">
                  <div>
                    <h2 className="text-3xl font-black text-ui-text uppercase tracking-tighter">{t("users", "editTitle", "BENUTZER BEARBEITEN")}</h2>
                    <p className="text-ui-muted text-[10px] font-bold uppercase tracking-widest mt-2">{editUser.email}</p>
                  </div>
                  <button onClick={closeEditModal} className="w-12 h-12 flex items-center justify-center rounded-lg bg-ui-card text-ui-muted hover:text-ui-text transition-colors">✕</button>
                </div>

                {editError && (
                  <div className="bg-red-500/10 border border-red-500/30 p-6 rounded-lg text-red-400 text-[10px] font-bold uppercase tracking-widest mb-8 animate-pulse">
                    ⚠️ {editError}
                  </div>
                )}

                <form onSubmit={handleEditSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <label className="text-[9px] font-black text-ui-muted uppercase tracking-[0.3em] ml-1">{t("users", "fullName", "NAME")}</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full bg-black/40 border border-ui-border rounded-lg px-6 py-4 text-xs font-bold text-ui-text outline-none focus:border-ui-accent/50 transition-all"
                      required
                    />
                  </div>

                  <div className="space-y-3">
                    <label className="text-[9px] font-black text-ui-muted uppercase tracking-[0.3em] ml-1">{t("users", "role", "SYSTEM-ROLLE")}</label>
                    <select
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value)}
                      className="w-full bg-black/40 border border-ui-border rounded-lg px-6 py-4 text-xs font-bold text-ui-text outline-none appearance-none cursor-pointer"
                    >
                      <option value="USER" className="bg-slate-900">USER</option>
                      <option value="MODERATOR" className="bg-slate-900">MODERATOR</option>
                      <option value="ADMIN" className="bg-slate-900">ADMIN</option>
                    </select>
                  </div>

                  <div className="col-span-full space-y-3">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em] ml-1">{t("users", "company", "FIRMA")}</label>
                    <select
                      value={editCompanyId}
                      onChange={(e) => setEditCompanyId(e.target.value)}
                      className="w-full bg-black/40 border border-slate-700/50 rounded-lg px-6 py-4 text-xs font-bold text-white outline-none appearance-none cursor-pointer"
                    >
                      <option value="" className="bg-slate-900">-- KEINE FIRMA --</option>
                      {companies.map((c) => <option key={c.id} value={c.id} className="bg-slate-900">{c.name}</option>)}
                    </select>
                  </div>

                  <div className="col-span-full">
                    <label className={`flex items-center gap-4 p-6 rounded-lg border transition-all cursor-pointer group ${editActive ? "bg-green-500/10 border-green-500/30" : "bg-black/20 border-ui-border"}`}>
                      <input type="checkbox" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} className="w-6 h-6 rounded-lg border-2 border-slate-700 bg-black/40 checked:bg-green-500 checked:border-green-400 transition-all appearance-none cursor-pointer" />
                      <div>
                        <span className={`text-[10px] font-black uppercase tracking-widest ${editActive ? "text-green-400" : "text-ui-muted"}`}>{t("users", "active", "BENUTZERKONTO AKTIVIERT")}</span>
                        <p className="text-[8px] font-bold text-ui-muted/50 uppercase tracking-[0.2em] mt-1">Inaktive Benutzer können sich nicht anmelden</p>
                      </div>
                    </label>
                  </div>

                  <div className="col-span-full">
                    <label className={`flex items-center gap-4 p-6 rounded-lg border transition-all cursor-pointer group ${editHasVdeAccess ? "bg-cyan-500/10 border-cyan-500/30" : "bg-black/20 border-ui-border"}`}>
                      <input type="checkbox" checked={editHasVdeAccess} onChange={(e) => setEditHasVdeAccess(e.target.checked)} className="w-6 h-6 rounded-lg border-2 border-slate-700 bg-black/40 checked:bg-cyan-500 checked:border-cyan-400 transition-all appearance-none cursor-pointer" />
                      <div>
                        <span className={`text-[10px] font-black uppercase tracking-widest ${editHasVdeAccess ? "text-cyan-400" : "text-ui-muted"}`}>Dostęp do E-Check / VDE</span>
                        <p className="text-[8px] font-bold text-ui-muted/50 uppercase tracking-[0.2em] mt-1">Ermöglicht dem Benutzer den Zugriff auf den E-Check Generator</p>
                      </div>
                    </label>
                  </div>

                  <div className="col-span-full space-y-4 pt-4 border-t border-slate-800/50">
                    <div className="flex justify-between items-center px-1">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em]">{t("users", "projects", "PROJEKT-ZUGRIFF")}</label>
                      <div className="flex gap-4">
                        <button type="button" onClick={() => setEditProjectIds(projects.map(p => p.id))} className="text-[8px] font-black text-cyan-500 uppercase tracking-widest">{t("common", "selectAll", "ALLE")}</button>
                        <button type="button" onClick={() => setEditProjectIds([])} className="text-[8px] font-black text-slate-600 uppercase tracking-widest">{t("common", "clearAll", "KEINE")}</button>
                      </div>
                    </div>
                    <div className="bg-black/20 p-6 rounded-lg border border-slate-800/50 max-h-72 overflow-y-auto no-scrollbar space-y-4">
                      {companies.map((company) => {
                        const companyProjects = projects.filter(p => p.company_id === company.id);
                        if (companyProjects.length === 0) return null;
                        const allSelected = companyProjects.every(p => editProjectIds.includes(p.id));
                        return (
                          <div key={company.id}>
                            <div className="flex justify-between items-center mb-2 px-1">
                              <span className="text-[9px] font-black text-ui-accent uppercase tracking-widest">🏢 {company.name}</span>
                              <button type="button" onClick={() => {
                                if (allSelected) setEditProjectIds(editProjectIds.filter(id => !companyProjects.find(p => p.id === id)));
                                else setEditProjectIds([...new Set([...editProjectIds, ...companyProjects.map(p => p.id)])]);
                              }} className="text-[8px] font-black text-cyan-500/60 uppercase tracking-widest">{allSelected ? t("common", "clearAll", "KEINE") : t("common", "selectAll", "ALLE")}</button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {companyProjects.map((p) => (
                                <label key={p.id} className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer group ${editProjectIds.includes(p.id) ? "bg-cyan-500/10 border-cyan-500/30" : "bg-transparent border-slate-800 hover:border-slate-700"}`}>
                                  <input type="checkbox" checked={editProjectIds.includes(p.id)} onChange={(e) => e.target.checked ? setEditProjectIds([...editProjectIds, p.id]) : setEditProjectIds(editProjectIds.filter(id => id !== p.id))} className="w-4 h-4 rounded border-2 border-slate-700 bg-black/40 checked:bg-cyan-500 checked:border-cyan-400 transition-all appearance-none cursor-pointer shrink-0" />
                                  <span className={`text-[10px] font-black uppercase tracking-tight truncate ${editProjectIds.includes(p.id) ? "text-cyan-400" : "text-slate-500 group-hover:text-slate-300"}`}>{p.name}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                      {projects.filter(p => !p.company_id || !companies.find(c => c.id === p.company_id)).length > 0 && (
                        <div>
                          <div className="flex justify-between items-center mb-2 px-1">
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{t("companies", "unassignedProjects", "OHNE FIRMA")}</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {projects.filter(p => !p.company_id || !companies.find(c => c.id === p.company_id)).map((p) => (
                              <label key={p.id} className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer group ${editProjectIds.includes(p.id) ? "bg-cyan-500/10 border-cyan-500/30" : "bg-transparent border-slate-800 hover:border-slate-700"}`}>
                                <input type="checkbox" checked={editProjectIds.includes(p.id)} onChange={(e) => e.target.checked ? setEditProjectIds([...editProjectIds, p.id]) : setEditProjectIds(editProjectIds.filter(id => id !== p.id))} className="w-4 h-4 rounded border-2 border-slate-700 bg-black/40 checked:bg-cyan-500 checked:border-cyan-400 transition-all appearance-none cursor-pointer shrink-0" />
                                <span className={`text-[10px] font-black uppercase tracking-tight truncate ${editProjectIds.includes(p.id) ? "text-cyan-400" : "text-slate-500 group-hover:text-slate-300"}`}>{p.name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3 pt-4 border-t border-slate-800/50 col-span-full md:col-span-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em] ml-1">{t("users", "editPassword", "NEUES PASSWORT")}</label>
                    <input
                      type="password"
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                      className="w-full bg-black/40 border border-slate-700/50 rounded-lg px-6 py-4 text-xs font-bold text-white outline-none focus:border-cyan-500/50 transition-all"
                      placeholder="Leer lassen, um beizubehalten"
                    />
                  </div>

                  <div className="space-y-3 pt-4 border-t border-slate-800/50 col-span-full md:col-span-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em] ml-1">{t("users", "passwordConfirmLabel", "BESTÄTIGEN")}</label>
                    <input
                      type="password"
                      value={editPasswordConfirm}
                      onChange={(e) => setEditPasswordConfirm(e.target.value)}
                      className="w-full bg-black/40 border border-slate-700/50 rounded-lg px-6 py-4 text-xs font-bold text-white outline-none focus:border-cyan-500/50 transition-all"
                    />
                  </div>

                  {isAdmin && !editUser.is_active && (
                    <div className="col-span-full p-8 rounded-lg bg-amber-500/5 border border-amber-500/20 flex flex-col md:flex-row items-center justify-between gap-6">
                      <div className="text-center md:text-left">
                        <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest">{t("users", "confirmEmailNote", "E-MAIL NICHT BESTÄTIGT")}</p>
                        <p className="text-[8px] font-bold text-slate-500 uppercase tracking-[0.2em] mt-1">Manuelle Freischaltung erforderlich oder Link erneut senden</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleConfirmEmail}
                        disabled={confirmingEmail}
                        className="px-8 py-3 bg-amber-500/20 text-amber-500 border border-amber-500/30 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-amber-500 hover:text-amber-950 transition-all disabled:opacity-50 shadow-xl shadow-amber-500/5"
                      >
                        {confirmingEmail ? "..." : t("users", "confirmEmailBtn", "MANUELL BESTÄTIGEN")}
                      </button>
                    </div>
                  )}

                  <div className="col-span-full flex gap-4 pt-10 border-t border-ui-border/50">
                    <button
                      type="submit"
                      disabled={editSaving}
                      className="flex-1 bg-ui-accent text-slate-950 py-5 rounded-lg text-[11px] font-black uppercase tracking-[0.2em] shadow-xl shadow-[var(--ui-glow)] hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                    >
                      {editSaving ? "..." : t("users", "editSubmit", "ÄNDERUNGEN SPEICHERN")}
                    </button>
                    <button
                      type="button"
                      onClick={closeEditModal}
                      className="flex-1 bg-ui-card text-ui-muted py-5 rounded-lg text-[11px] font-black uppercase tracking-[0.2em] border border-ui-border hover:bg-white/5 hover:text-ui-text transition-all"
                    >
                      {t("common", "cancel", "ABBRECHEN")}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Scrollbar Styling */}
      <style jsx global>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </motion.div>
  );
}
