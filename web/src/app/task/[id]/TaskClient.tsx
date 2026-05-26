"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TaskDrawer from "@/components/TaskDrawer";
import PlanViewer from "@/components/PlanViewer";
import { apiGet } from "@/lib/apiClient";
import { supabase } from "@/lib/supabase";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export default function TaskClient({ id }: { id: string }) {
  const router = useRouter();
  const [planId, setPlanId] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [focusPoint, setFocusPoint] = useState<{ x_norm: number; y_norm: number } | null>(null);
  const [currentUser, setCurrentUser] = useState<{ id: string; role: string | null } | null>(null);

  const okId = useMemo(() => (typeof id === "string" ? id.trim() : ""), [id]);

  // DEV: na razie na sztywno (tak jak wcześniej w mapie)
  const UPLOADED_BY = "44444444-4444-4444-4444-444444444444";

  // Jeśli route jest zła – pokaż czytelny komunikat zamiast pustego drawera
  if (!okId || !isUuid(okId)) {
    return (
      <div style={{ padding: 20, fontFamily: "system-ui", color: "#111827" }}>
        <div style={{ fontWeight: 900, fontSize: 16 }}>Task</div>
        <div style={{ marginTop: 8, opacity: 0.8 }}>Brak / nieprawidłowe ID w URL.</div>
        <div style={{ marginTop: 10, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 }}>
          id: {String(id)}
        </div>
        <button
          type="button"
          onClick={() => router.back()}
          style={{
            marginTop: 14,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.12)",
            background: "#111827",
            color: "#fff",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          ← Wróć
        </button>
      </div>
    );
  }

  useEffect(() => {
    let alive = true;

    async function loadPlan() {
      if (!okId || !isUuid(okId)) return;

      try {
        const task = await apiGet<{ plan_id?: string | null; x_norm?: number | null; y_norm?: number | null }>(
          `/api/task?id=${encodeURIComponent(okId)}`
        );
        if (!alive) return;
        setPlanId(task?.plan_id || null);
        if (typeof task?.x_norm === "number" && typeof task?.y_norm === "number") {
          setFocusPoint({ x_norm: task.x_norm, y_norm: task.y_norm });
        } else {
          setFocusPoint(null);
        }
      } catch (e: any) {
        if (!alive) return;
        setPlanError(e?.message || String(e));
      }
    }

    loadPlan();
    return () => {
      alive = false;
    };
  }, [okId]);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!active) return;
        // Get profile to check role
        const sessionUser = data.session?.user;
        if (!sessionUser) {
          setCurrentUser(null);
          return;
        }

        let j: any;
        try {
          j = await apiGet<any>('/api/me');
        } catch (err) {
          throw new Error("Profile load failed");
        }
        setCurrentUser(j.profile || null);

      } catch {
        if (!active) return;
        setCurrentUser(null);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0b0f1a" }}>
      {planId ? (
        <div style={{ position: "absolute", inset: 0 }}>
          <PlanViewer
            planId={planId}
            fullHeight={true}
            focusPoint={focusPoint}
            focusTaskId={okId}
            allowCreate={false}
            currentUserId={currentUser?.id || null}
            currentUserRole={currentUser?.role || null}
          />
        </div>
      ) : (
        <div style={{ padding: 16, color: "#e5e7eb", fontFamily: "system-ui" }}>
          {planError ? "Nie moge zaladowac planu." : "Plan nie jest przypisany do taska."}
        </div>
      )}

      <TaskDrawer
        open={true}
        taskId={okId}
        uploadedBy={UPLOADED_BY}
        currentUserId={currentUser?.id || null}
        currentUserRole={currentUser?.role || null}
        onClose={() => router.back()}
        showOverlay={false}
      />
    </div>
  );
}
