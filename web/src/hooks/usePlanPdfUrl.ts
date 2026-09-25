import { useCallback, useEffect, useState } from "react";
import { apiGet } from "@/lib/apiClient";

type PdfUrlResponse = {
  signedUrl: string;
};

type Status = "idle" | "loading" | "ready" | "error";

export function usePlanPdfUrl(planId: string | null | undefined) {
  const [status, setStatus] = useState<Status>("idle");
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!planId) {
      setStatus("error");
      setUrl(null);
      setError("Brak identyfikatora planu");
      return;
    }

    setStatus("loading");
    setError(null);

    try {
      const data = await apiGet<PdfUrlResponse>(`/api/plans/pdf-url?id=${encodeURIComponent(planId)}`);
      if (data?.signedUrl) {
        setUrl(data.signedUrl);
        setStatus("ready");
      } else {
        setUrl(null);
        setStatus("error");
        setError("Brak wygenerowanego linku PDF");
      }
    } catch (err: any) {
      setUrl(null);
      setStatus("error");
      setError(err?.message || "Nie udało się pobrać linku do PDF");
    }
  }, [planId]);

  useEffect(() => {
    load();
  }, [load]);

  return {
    url,
    status,
    error,
    reload: load,
  };
}
