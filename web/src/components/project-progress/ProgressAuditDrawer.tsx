"use client";
import React, { useEffect, useState } from "react";
import { X, History, Clock, ArrowRight, User } from "lucide-react";
import { apiGet } from "@/lib/apiClient";
import { useProgressI18n } from "@/lib/project-progress/progressI18n";
import type { ProgressHistoryDb } from "@repo/shared";

interface ProgressAuditDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  nodeId?: string | null;
  nodeName?: string | null;
}

export function ProgressAuditDrawer({
  isOpen,
  onClose,
  projectId,
  nodeId,
  nodeName,
}: ProgressAuditDrawerProps) {
  const { p, langKey } = useProgressI18n();
  const [logs, setLogs] = useState<ProgressHistoryDb[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !projectId || !nodeId) {
      setLogs([]);
      return;
    }

    setLoading(true);
    setError(null);

    apiGet<ProgressHistoryDb[]>(`/api/projects/${projectId}/progress/nodes/${nodeId}`)
      .then((data) => setLogs(data || []))
      .catch((err) => setError(err?.message || p.loadingAudit))
      .finally(() => setLoading(false));
  }, [isOpen, projectId, nodeId]);

  if (!isOpen) return null;

  const formatAction = (action: string) => {
    switch (action) {
      case "CREATE":
        return { label: p.actionNodeCreated, color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" };
      case "UPDATE_WEIGHT":
        return { label: p.actionWeightUpdate, color: "text-amber-400 bg-amber-500/10 border-amber-500/20" };
      case "UPDATE_PROGRESS":
        return { label: p.actionProgressUpdate, color: "text-sky-400 bg-sky-500/10 border-sky-500/20" };
      case "TOGGLE_COMPLETE":
        return { label: p.actionProgressUpdate, color: "text-purple-400 bg-purple-500/10 border-purple-500/20" };
      case "UPDATE_INFO":
        return { label: p.actionDataEdit, color: "text-blue-400 bg-blue-500/10 border-blue-500/20" };
      case "DELETE":
        return { label: p.actionNodeDeleted, color: "text-red-400 bg-red-500/10 border-red-500/20" };
      default:
        return { label: action, color: "text-ui-muted bg-white/5 border-ui-border" };
    }
  };

  const locale = langKey === "pl" ? "pl-PL" : langKey === "en" ? "en-GB" : "de-DE";

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs animate-fade-in">
      <div className="w-full max-w-md h-full bg-ui-card border-l border-ui-border flex flex-col shadow-2xl p-6 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-ui-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-ui-accent/15 border border-ui-accent/30 flex items-center justify-center text-ui-accent">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-ui-text">{p.auditTitle}</h3>
              <p className="text-xs text-ui-muted truncate max-w-[240px]">
                {nodeName || p.auditSubtitle}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-ui-muted hover:text-ui-text hover:bg-white/5 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto py-4 space-y-3 pr-1">
          {loading && (
            <div className="text-center py-12 text-sm text-ui-muted">
              {p.loadingAudit}
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-xl text-red-400 text-sm">
              {error}
            </div>
          )}

          {!loading && !error && logs.length === 0 && (
            <div className="text-center py-12 text-ui-muted text-sm">
              {p.noAuditLogs}
            </div>
          )}

          {!loading &&
            logs.map((log) => {
              const actionMeta = formatAction(log.action);
              const dateStr = new Date(log.created_at).toLocaleString(locale, {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <div
                  key={log.id}
                  className="p-3.5 bg-ui-bg/70 border border-ui-border rounded-xl space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${actionMeta.color}`}
                    >
                      {actionMeta.label}
                    </span>
                    <span className="text-[11px] text-ui-muted flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {dateStr}
                    </span>
                  </div>

                  {/* Changes value breakdown */}
                  {(log.old_progress !== null || log.new_progress !== null) && (
                    <div className="flex items-center gap-2 text-xs font-semibold text-ui-text">
                      <span className="text-ui-muted">{p.progressLabel}:</span>
                      <span>{log.old_progress ?? 0}%</span>
                      <ArrowRight className="w-3.5 h-3.5 text-ui-accent" />
                      <span className="text-ui-accent">{log.new_progress}%</span>
                    </div>
                  )}

                  {(log.old_weight !== null || log.new_weight !== null) && (
                    <div className="flex items-center gap-2 text-xs font-semibold text-ui-text">
                      <span className="text-ui-muted">{p.weight}:</span>
                      <span>{log.old_weight ?? 0}%</span>
                      <ArrowRight className="w-3.5 h-3.5 text-ui-accent" />
                      <span className="text-ui-accent">{log.new_weight}%</span>
                    </div>
                  )}

                  {log.profiles?.full_name && (
                    <div className="text-[11px] text-ui-muted flex items-center gap-1.5 pt-1 border-t border-ui-border/50">
                      <User className="w-3 h-3" />
                      <span>{log.profiles.full_name}</span>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
