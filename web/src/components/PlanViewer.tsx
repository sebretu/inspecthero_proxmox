"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, getToken, getApiUrl } from "@/lib/apiClient";
import { supabase } from "@/lib/supabase";
import { usePlanPdfUrl } from "@/hooks/usePlanPdfUrl";
import { useLanguage } from "@/contexts/LanguageContext";

type Meta = {
  tileSize: number;
  minZoom: number;
  maxZoom: number;
  gridW: number;
  gridH: number;
  format?: string;
};

const MapLoader = () => {
  const { t } = useLanguage();
  return (
    <div
      style={{
        width: "100%",
        height: "calc(100vh - 120px)",
        display: "grid",
        placeItems: "center",
        opacity: 0.75,
      }}
    >
      {t("common", "loading", "Ładowanie...")}
    </div>
  );
};

// Leaflet / PlanMap ładowany WYŁĄCZNIE w przeglądarce
const PlanMap = dynamic(() => import("./PlanMap"), {
  ssr: false,
  loading: () => <MapLoader />,
});

export default function PlanViewer({
  planId,
  fullHeight = false,
  focusPoint,
  focusTaskId,
  focusFehlerId,
  focusRevisionId,
  allowCreate,
  currentUserId,
  currentUserRole,
  isQuestion,
  showCompleted,
  revisions,
  fehlers,
  aufmassMarkers,
  hideTasks,
  onMapClick,
  onMarkerDragEnd,
  onMarkerDelete,
}: {
  planId: string;
  fullHeight?: boolean;
  focusPoint?: { x_norm: number; y_norm: number } | null;
  focusTaskId?: string | null;
  focusFehlerId?: string | null;
  focusRevisionId?: string | null;
  allowCreate?: boolean;
  currentUserId?: string | null;
  currentUserRole?: string | null;
  isQuestion?: boolean;
  showCompleted?: boolean;
  revisions?: any[];
  fehlers?: any[];
  aufmassMarkers?: any[];
  hideTasks?: boolean;
  onMapClick?: (x_norm: number, y_norm: number) => void;
  onMarkerDragEnd?: (id: string, x: number, y: number) => void;
  onMarkerDelete?: (id: string) => void;
}) {
  const { t } = useLanguage();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [metaStatus, setMetaStatus] = useState<
    "LOADING" | "PROCESSING" | "READY" | "ERROR"
  >("LOADING");
  const [metaErr, setMetaErr] = useState<string | null>(null);
  const [viewerProfile, setViewerProfile] = useState<{ id: string; role: string | null } | null>(null);
  const [planProjectId, setPlanProjectId] = useState<string | null>(null);
  const [planProjectErr, setPlanProjectErr] = useState<string | null>(null);
  const [plan, setPlan] = useState<any | null>(null);
  const router = useRouter();

  // --- polling meta.json ---
  useEffect(() => {
    let alive = true;
    let timer: any = null;

    setMeta(null);
    setMetaErr(null);
    setMetaStatus("LOADING");

    const tick = async () => {
      try {
        const token = await getToken();
        const headers: HeadersInit = {};
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }

        const r = await fetch(getApiUrl(`/api/tiles/${planId}/meta`), {
          cache: "no-store",
          headers,
        });

        // tiles jeszcze się generują → NORMALNY STAN
        if (r.status === 404) {
          if (!alive) return;
          setMetaStatus("PROCESSING");
          timer = setTimeout(tick, 1200);
          return;
        }

        if (!r.ok) {
          throw new Error(`meta.json fetch failed: ${r.status}`);
        }

        const j = (await r.json()) as Meta;

        if (
          typeof j.tileSize !== "number" ||
          typeof j.minZoom !== "number" ||
          typeof j.maxZoom !== "number" ||
          typeof j.gridW !== "number" ||
          typeof j.gridH !== "number"
        ) {
          throw new Error("meta.json ma zły format");
        }

        if (!alive) return;
        setMeta(j);
        setMetaStatus("READY");
      } catch (e: any) {
        if (!alive) return;
        setMetaStatus("ERROR");
        setMetaErr(e?.message || "meta load error");
      }
    };

    tick();

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [planId]);

  useEffect(() => {
    let alive = true;
    setPlan(null);
    setPlanProjectId(null);
    setPlanProjectErr(null);

    apiGet<any>(`/api/plan?id=${encodeURIComponent(planId)}`)
      .then((p) => {
        if (!alive) return;
        setPlan(p);
        setPlanProjectId(p?.project_id || null);
      })
      .catch((err: any) => {
        if (!alive) return;
        // Redirect if plan doesn't exist (e.g. was deleted)
        if (err?.message === "Plan not found" || err?.message?.includes("Plan not found")) {
          router.push("/");
          return;
        }

        // Redirect if auth failed
        if (
          err?.message === "Missing Bearer token" ||
          err?.message?.includes("AUTH_INVALID") ||
          err?.message?.includes("PROFILE_ERROR")
        ) {
          router.push("/auth/login");
          return;
        }

        setPlanProjectErr(err?.message || "Nie udało się pobrać projektu planu");
      });

    return () => {
      alive = false;
    };
  }, [planId, router]);

  useEffect(() => {
    if (currentUserId && currentUserRole) {
      setViewerProfile({ id: currentUserId, role: currentUserRole });
      return;
    }

    let alive = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!alive) return;

      if (session?.user?.id) {
        // fetch user role explicitly on mount to ensure freshness
        let j: any;
        try {
          j = await apiGet<any>('/api/me');
        } catch (err) {
          // ignore error
        }
        setViewerProfile(j.profile || null);

      } else {
        setViewerProfile(null);
      }
    });

    return () => {
      alive = false;
      subscription?.unsubscribe();
    };
  }, [currentUserId, currentUserRole]);

  const { url: pdfUrl, status: pdfUrlStatus, error: pdfUrlError, reload: reloadPdfUrl } = usePlanPdfUrl(planId);
  const isPdfUrlLoading = pdfUrlStatus === "idle" || pdfUrlStatus === "loading";

  const renderPdfObject = () => {
    if (pdfUrl) {
      return (
        <object
          data={`${pdfUrl}#view=FitH`}
          type="application/pdf"
          style={{ width: "100%", height: "100%", border: 0 }}
        >
          <div style={{ padding: 12 }}>
            {t("common", "pdfEmbedError", "Ten browser nie potrafi osadzić PDF.")}
            <div style={{ marginTop: 8 }}>
              <a href={pdfUrl} target="_blank" rel="noreferrer">
                {t("common", "openPdfInNewTab", "Otwórz PDF w nowej karcie")}
              </a>
            </div>
          </div>
        </object>
      );
    }

    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
          fontSize: 14,
        }}
      >
        {isPdfUrlLoading ? (
          <>{t("common", "loadingPdfLink", "Ładuję autoryzowany link do PDF...")}</>
        ) : (
          <>
            <div>{t("common", "pdfLoadError", "Nie udało się pobrać pliku PDF.")}</div>
            {pdfUrlError ? <div style={{ marginTop: 4, fontSize: 12 }}>{pdfUrlError}</div> : null}
            <button
              type="button"
              style={{ marginTop: 10 }}
              onClick={reloadPdfUrl}
              disabled={isPdfUrlLoading}
            >
              {t("common", "tryAgain", "Spróbuj ponownie")}
            </button>
          </>
        )}
      </div>
    );
  };

  const renderPdfFrame = () => {
    if (pdfUrl) {
      return (
        <iframe
          title="Plan PDF"
          src={`${pdfUrl}#view=FitH`}
          style={{ width: "100%", height: "100%", border: 0 }}
        />
      );
    }

    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
          fontSize: 14,
        }}
      >
        {isPdfUrlLoading ? (
          <>{t("common", "loadingPdfLink", "Ładuję autoryzowany link do PDF...")}</>
        ) : (
          <>
            <div>{t("common", "pdfLoadError", "Nie udało się pobrać pliku PDF.")}</div>
            {pdfUrlError ? <div style={{ marginTop: 4, fontSize: 12 }}>{pdfUrlError}</div> : null}
            <button
              type="button"
              style={{ marginTop: 10 }}
              onClick={reloadPdfUrl}
              disabled={isPdfUrlLoading}
            >
              {t("common", "tryAgain", "Spróbuj ponownie")}
            </button>
          </>
        )}
      </div>
    );
  };

  const effectiveUserId = currentUserId ?? viewerProfile?.id ?? null;
  const effectiveUserRole = currentUserRole ?? viewerProfile?.role ?? null;
  const allowCreateResolved = typeof allowCreate === "boolean" ? allowCreate : !!effectiveUserId;

  // ------------------------------------------------------------------
  // 1) META JESZCZE NIE MA → POKAZUJ PDF (ZERO LEAFLET, ZERO SSR PROBLEMÓW)
  // ------------------------------------------------------------------
  const viewerHeight = fullHeight ? "100vh" : "calc(100vh - 120px)";
  const pdfHeight = fullHeight ? "calc(100vh - 72px)" : "60vh";

  if (metaStatus === "LOADING" || metaStatus === "PROCESSING") {
    return (
      <div
        style={{
          width: "100%",
          height: viewerHeight,
          display: "grid",
          gridTemplateRows: "auto 1fr",
        }}
      >
        <div style={{ padding: "10px 12px", fontSize: 12, opacity: 0.85 }}>
          <div style={{ fontWeight: 800 }}>{t("common", "planProcessing", "Plan się przetwarza...")}</div>
          <div style={{ marginTop: 4 }}>
            {t("common", "showingPdfDesc", "Pokazuję PDF. Gdy tylko pojawi się plik konfiguracyjny, włączę zoom i interaktywną mapę.")}
          </div>
          <div style={{ marginTop: 6, fontFamily: "monospace" }}>
            planId: {planId}
          </div>
        </div>

        <div style={{ borderTop: "1px solid rgba(0,0,0,0.08)" }}>
          {renderPdfObject()}
        </div>
      </div>
    );
  }

  // -----------------------
  // 2) META ERROR
  // -----------------------
  if (metaStatus === "ERROR") {
    return (
      <div style={{ padding: 12 }}>
        <div style={{ color: "crimson", fontWeight: 700 }}>Błąd</div>
        <div style={{ marginTop: 6, fontFamily: "monospace" }}>{metaErr}</div>

        <div style={{ marginTop: 12, height: pdfHeight }}>
          {renderPdfFrame()}
        </div>
      </div>
    );
  }

  // -----------------------
  // 3) READY → LEAFLET
  // -----------------------
  return (
    <PlanMap
      planId={planId}
      projectId={planProjectId}
      meta={meta!}
      fullHeight={fullHeight}
      focusPoint={focusPoint}
      focusTaskId={focusTaskId}
      focusFehlerId={focusFehlerId}
      focusRevisionId={focusRevisionId}
      allowCreate={allowCreateResolved}
      currentUserId={effectiveUserId}
      currentUserRole={effectiveUserRole}
      projectLoadError={planProjectErr}
      isQuestion={isQuestion}
      showCompleted={showCompleted}
      revisions={revisions}
      fehlers={fehlers}
      aufmassMarkers={aufmassMarkers}
      hideTasks={hideTasks}
      customMinZoom={plan?.min_zoom}
      customMagnification={plan?.magnification}
      onMapClick={onMapClick}
      onMarkerDragEnd={onMarkerDragEnd}
      onMarkerDelete={onMarkerDelete}
    />
  );
}
