"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

// ✅ Leaflet nie może iść przez SSR
const PlanViewer = dynamic(() => import("@/components/PlanViewer"), { ssr: false });

type ApiOk<T> = { ok: true; data: T };
type ApiErr = { ok: false; error: { code: string; message: string; meta?: any } };

type Task = {
  id: string;
  project_id: string;
  plan_id: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  x_norm?: number | null;
  y_norm?: number | null;
};

async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(path, { cache: "no-store" });
  const j = (await r.json()) as ApiOk<T> | ApiErr;
  if (!("ok" in j) || !j.ok) throw new Error((j as any)?.error?.message || "api error");
  return (j as any).data as T;
}

export default function TaskClient({ id }: { id: string }) {
  const [task, setTask] = useState<Task | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setErr(null);

    (async () => {
      const t = await apiGet<Task>(`/api/task?id=${encodeURIComponent(id)}`);
      if (mounted) setTask(t);
    })().catch((e) => {
      if (mounted) setErr(String(e?.message || e));
    });

    return () => {
      mounted = false;
    };
  }, [id]);

  return (
    <main style={{ padding: 24 }}>
      <div style={{ marginBottom: 12 }}>
        <Link href="/" style={{ textDecoration: "none" }}>
          ← Back
        </Link>
      </div>

      <h1 style={{ marginBottom: 12 }}>Task detail</h1>

      {err && <div style={{ color: "crimson", marginBottom: 12 }}>{err}</div>}
      {!task && !err && <div>Loading…</div>}

      {task && (
        <>
          <div style={{ marginBottom: 12 }}>
            <div>
              <b>Title:</b> {task.title}
            </div>
            <div>
              <b>Status:</b> {task.status}
            </div>
            <div>
              <b>Priority:</b> {task.priority}
            </div>
            <div>
              <b>Due:</b> {task.due_date ?? "-"}
            </div>
          </div>

          {task.plan_id ? (
            <div style={{ marginTop: 16 }}>
              <h2 style={{ marginBottom: 8 }}>Plan</h2>
              <PlanViewer planId={task.plan_id} />
            </div>
          ) : (
            <div style={{ marginTop: 16, opacity: 0.7 }}>No plan attached</div>
          )}
        </>
      )}
    </main>
  );
}
