"use client";

import { useEffect } from "react";
import TaskDrawer from "@/components/TaskDrawer";

export default function TaskClient({ taskId }: { taskId: string }) {
  // UX: po wejściu w edycję – przewiń na górę
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as any });
  }, []);

  // DEV: na razie changedBy stałe (docelowo z sesji)
  const CHANGED_BY = "44444444-4444-4444-4444-444444444444";

  return (
    <TaskDrawer
      open={true}
      taskId={taskId}
      onClose={() => window.history.back()}
      uploadedBy={CHANGED_BY}
    />
  );
}
