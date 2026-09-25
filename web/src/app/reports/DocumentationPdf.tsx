import React from "react";
import { Page, Text, View, Document, StyleSheet, Image, Font, Link, Svg, Line, Circle } from "@react-pdf/renderer";
import { PhotoDocumentation, PhotoDocPoint } from "@/types/documentation";

// ── Base dimensions & typography ──────────────────────────────────────────────
const A0_MIN_W = 3370; // min width
const A0_MIN_H = 2384; // min height
const PAD = 40;
const TOP_BOTTOM_EXTRA = 380; // pad(80) + header(140) + infogrid(110) + footer(50)

// Callout card size on large plan (100% larger thumbnails: 90 -> 180 pt)
const CARD_W = 620;
const CARD_H = 210;
const THUMB  = 180; // thumbnail square (100% larger)
const PIN_R  = 28;  // pin badge radius

Font.register({
  family: "Roboto",
  fonts: [
    {
      src: "https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-regular-webfont.ttf",
      fontWeight: "normal",
    },
    {
      src: "https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-bold-webfont.ttf",
      fontWeight: "bold",
    },
  ],
});

const ROBOTO = "Roboto";

const styles = StyleSheet.create({
  // ── Pin badge ────────────────────────────────────────────────────────────
  pinBadge: {
    position: "absolute",
    width: PIN_R * 2,
    height: PIN_R * 2,
    borderRadius: PIN_R,
    borderWidth: 4,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  pinBadgeText: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "bold",
  },
  // ── Callout card (thumbnail + title + desc + link) ─────────────────────
  calloutCard: {
    position: "absolute",
    backgroundColor: "#0f172af5",
    borderRadius: 12,
    borderWidth: 2.5,
    borderColor: "#334155",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    width: CARD_W,
    minHeight: CARD_H,
  },
  calloutThumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: 8,
    objectFit: "cover",
    marginRight: 16,
    flexShrink: 0,
    borderWidth: 2,
    borderColor: "#475569",
  },
  calloutTextWrap: {
    flex: 1,
    justifyContent: "center",
    paddingRight: 6,
  },
  calloutHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  calloutBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginRight: 8,
  },
  calloutBadgeText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "bold",
  },
  calloutTitle: {
    fontSize: 17,
    color: "#f8fafc",
    fontWeight: "bold",
    flex: 1,
    lineHeight: 1.25,
  },
  calloutDesc: {
    fontSize: 13.5,
    color: "#cbd5e1",
    lineHeight: 1.25,
    marginBottom: 6,
  },
  calloutLink: {
    fontSize: 14,
    color: "#38bdf8",
    fontWeight: "bold",
    textDecoration: "none",
  },
  // ── Large format table for Page 2 ──────────────────────────────────────
  sectionTitleLarge: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#0f172a",
    marginBottom: 14,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  tableLarge: {
    width: "100%",
    borderWidth: 2,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    overflow: "hidden",
    marginBottom: 30,
  },
  tableHeaderRowLarge: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderBottomWidth: 3,
    borderBottomColor: "#0284c7",
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  tableHeaderCellLarge: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#334155",
    textTransform: "uppercase",
  },
  tableRowLarge: {
    flexDirection: "row",
    borderBottomWidth: 1.5,
    borderBottomColor: "#e2e8f0",
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "flex-start",
  },
  tableRowAltLarge: {
    backgroundColor: "#f8fafc",
  },
  tableBadgeLarge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  tableBadgeTextLarge: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "bold",
  },
  tableTitleTextLarge: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#0f172a",
    marginBottom: 4,
  },
  tableDescTextLarge: {
    fontSize: 15,
    color: "#475569",
    lineHeight: 1.3,
  },
  tableCoordTextLarge: {
    fontSize: 14,
    color: "#64748b",
    fontFamily: ROBOTO,
  },
  tablePhotoCountBadgeLarge: {
    backgroundColor: "#e0f2fe",
    color: "#0369a1",
    fontSize: 13,
    fontWeight: "bold",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
});

interface DocumentationPdfProps {
  documentation: PhotoDocumentation;
  points: PhotoDocPoint[];
  mainImageBase64?: string | null;
  detailPhotosBase64?: Record<string, string>; // photo.id -> base64
  language?: string;
  imageAspectRatio?: number;
  baseUrl?: string;
}

// ── Calculate Point on Card Perimeter closest to target Pin ──────────────────
function getCardEdgePoint(
  cardLeft: number,
  cardTop: number,
  cardW: number,
  cardH: number,
  targetX: number,
  targetY: number
) {
  const cx = cardLeft + cardW / 2;
  const cy = cardTop + cardH / 2;
  const dx = targetX - cx;
  const dy = targetY - cy;

  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    return { x: cx, y: cy };
  }

  const halfW = cardW / 2;
  const halfH = cardH / 2;

  const scaleX = dx !== 0 ? Math.abs(halfW / dx) : Infinity;
  const scaleY = dy !== 0 ? Math.abs(halfH / dy) : Infinity;
  const scale = Math.min(scaleX, scaleY);

  return {
    x: cx + dx * scale,
    y: cy + dy * scale,
  };
}

// ── Collision Resolution Layout for Callout Cards ─────────────────────────────
interface PositionedCallout {
  pt: PhotoDocPoint;
  pinLeft: number;
  pinTop: number;
  cardLeft: number;
  cardTop: number;
  edgeX: number;
  edgeY: number;
  pinColor: string;
}

function computeNonOverlappingCallouts(
  points: PhotoDocPoint[],
  imgW: number,
  imgH: number,
  cardW: number,
  cardH: number,
  pinR: number
): PositionedCallout[] {
  const items = points.map((pt) => {
    const pinLeft = Math.max(pinR + 12, Math.min(imgW - pinR - 12, pt.x_norm * imgW));
    const pinTop  = Math.max(pinR + 12, Math.min(imgH - pinR - 12, pt.y_norm * imgH));

    const dxNorm = pt.x_norm > 0.5 ? -0.18 : 0.18;
    const dyNorm = pt.y_norm > 0.5 ? -0.12 : 0.12;
    const defCX = Math.max(0.08, Math.min(0.92, pt.x_norm + dxNorm));
    const defCY = Math.max(0.08, Math.min(0.92, pt.y_norm + dyNorm));

    const cXnorm = typeof pt.callout_x_norm === "number" ? pt.callout_x_norm : defCX;
    const cYnorm = typeof pt.callout_y_norm === "number" ? pt.callout_y_norm : defCY;

    const initialLeft = Math.max(16, Math.min(imgW - cardW - 16, cXnorm * imgW - cardW / 2));
    const initialTop  = Math.max(16, Math.min(imgH - cardH - 16, cYnorm * imgH - cardH / 2));

    return {
      pt,
      pinLeft,
      pinTop,
      cardLeft: initialLeft,
      cardTop: initialTop,
      edgeX: initialLeft + cardW / 2,
      edgeY: initialTop + cardH / 2,
      pinColor: pt.color || "#0284c7",
    };
  });

  // Iterative anti-overlap relaxation
  const PADDING = 16;
  for (let iter = 0; iter < 35; iter++) {
    let moved = false;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];

        const aRight = a.cardLeft + cardW;
        const aBottom = a.cardTop + cardH;
        const bRight = b.cardLeft + cardW;
        const bBottom = b.cardTop + cardH;

        const overlapX = Math.min(aRight, bRight) - Math.max(a.cardLeft, b.cardLeft);
        const overlapY = Math.min(aBottom, bBottom) - Math.max(a.cardTop, b.cardTop);

        if (overlapX > -PADDING && overlapY > -PADDING) {
          const shiftY = (overlapY + PADDING) / 2;
          const shiftX = (overlapX + PADDING) / 2;

          if (overlapY <= overlapX) {
            if (a.cardTop < b.cardTop) {
              a.cardTop -= shiftY;
              b.cardTop += shiftY;
            } else {
              a.cardTop += shiftY;
              b.cardTop -= shiftY;
            }
          } else {
            if (a.cardLeft < b.cardLeft) {
              a.cardLeft -= shiftX;
              b.cardLeft += shiftX;
            } else {
              a.cardLeft += shiftX;
              b.cardLeft += shiftX;
            }
          }
          moved = true;
        }
      }

      // Maintain clear distance between cards and pins
      for (let k = 0; k < items.length; k++) {
        const item = items[i];
        const pin = items[k];
        const clearance = pinR + 32;
        if (
          pin.pinLeft >= item.cardLeft - clearance &&
          pin.pinLeft <= item.cardLeft + cardW + clearance &&
          pin.pinTop >= item.cardTop - clearance &&
          pin.pinTop <= item.cardTop + cardH + clearance
        ) {
          if (item.cardTop + cardH / 2 < pin.pinTop) {
            item.cardTop -= 20;
          } else {
            item.cardTop += 20;
          }
          moved = true;
        }
      }

      items[i].cardLeft = Math.max(16, Math.min(imgW - cardW - 16, items[i].cardLeft));
      items[i].cardTop  = Math.max(16, Math.min(imgH - cardH - 16, items[i].cardTop));
    }
    if (!moved) break;
  }

  for (const item of items) {
    const edge = getCardEdgePoint(
      item.cardLeft,
      item.cardTop,
      cardW,
      cardH,
      item.pinLeft,
      item.pinTop
    );
    item.edgeX = edge.x;
    item.edgeY = edge.y;
  }

  return items;
}

export default function DocumentationPdf({
  documentation,
  points,
  mainImageBase64,
  detailPhotosBase64 = {},
  language = "de",
  imageAspectRatio,
  baseUrl,
}: DocumentationPdfProps) {
  const sortedPoints = [...(points || [])]
    .sort((a, b) => (a.point_number || 0) - (b.point_number || 0))
    .map((pt, idx) => {
      const expectedNum = idx + 1;
      let cleanTitle = pt.title || "";
      if (/^Punkt\s*#?\d+$/i.test(cleanTitle) || /^Point\s*#?\d+$/i.test(cleanTitle)) {
        cleanTitle = cleanTitle.replace(/\d+$/, String(expectedNum));
      }
      return {
        ...pt,
        point_number: expectedNum,
        title: cleanTitle,
      };
    });
  const mainImageSrc = mainImageBase64 || documentation.main_image_url;

  const isPl = language === "pl";
  const isEn = language === "en";
  const isSk = language === "sk";

  const t = {
    brandTitle: isPl ? "DOKUMENTACJA FOTOGRAFICZNA" : isEn ? "PHOTO DOCUMENTATION" : "FOTO-DOKUMENTATION",
    brandSub: isPl ? "RAPORT TECHNICZNY" : isEn ? "TECHNICAL REPORT" : "TECHNISCHER BERICHT",
    date: isPl ? "Data" : isEn ? "Date" : "Datum",
    pointsCount: isPl ? "Liczba punktów" : isEn ? "Points" : "Detailpunkte",
    doc: isPl ? "Dokument" : isEn ? "Document" : "Dokument",
    proj: isPl ? "Projekt" : isEn ? "Project" : "Projekt",
    loc: isPl ? "Lokalizacja" : isEn ? "Location" : "Standort",
    author: isPl ? "Ersteller / Autor" : isEn ? "Author" : "Ersteller",
    page2Title: isPl ? "ZESTAWIENIE PUNKTÓW DOKUMENTACJI" : isEn ? "DOCUMENTATION POINTS OVERVIEW" : "PUNKTEÜBERSICHT",
    colNum: isPl ? "Nr" : isEn ? "No." : "Nr.",
    colTitle: isPl ? "Nazwa punktu" : isEn ? "Point Title" : "Bezeichnung / Titel",
    colDesc: isPl ? "Opis / Szczegóły" : isEn ? "Description / Notes" : "Beschreibung / Anmerkungen",
    colPos: isPl ? "Pozycja" : isEn ? "Position" : "Position (X / Y)",
    colPhotos: isPl ? "Zdjęcia" : isEn ? "Photos" : "Fotos",
    noPhotos: isPl ? "Brak zdjęć" : isEn ? "No photos" : "Keine Fotos",
    hintTitle: isPl ? "Interaktywna nawigacja:" : isEn ? "Interactive Photo Navigation:" : "Interaktive Foto-Navigation:",
    hintText: isPl
      ? "Kliknij dowolną miniaturkę lub »Oryginał ↗«, aby otworzyć zdjęcie w pełnej rozdzielczości w przeglądarce."
      : isEn
      ? "Click on any photo thumbnail or »Original ↗« to open the full-resolution image in your browser."
      : "Klicken Sie auf ein beliebiges Detailfoto oder auf »Originalbild ↗«, um die hochauflösende Originalaufnahme im Browser zu öffnen.",
    clickToOpen: isPl ? "Oryginał ↗" : isEn ? "Original ↗" : "Originalbild ↗",
    pageOf: isPl ? "Strona" : isEn ? "Page" : isSk ? "Strana" : "Seite",
    of: isPl ? "z" : isEn ? "of" : isSk ? "z" : "von",
    owner: isPl ? "Właściciel: Marcin Slapinski" : isEn ? "Owner: Marcin Slapinski" : isSk ? "Vlastník: Marcin Slapinski" : "Inhaber: Marcin Slapinski",
  };

  const dateStr = new Date(documentation.created_at || Date.now()).toLocaleDateString(
    isPl ? "pl-PL" : isEn ? "en-US" : "de-DE",
    {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }
  );

  // ── DYNAMIC PAGE SIZING (MIN A0, MATCHES EXACT PHOTO ASPECT RATIO) ──────
  const ratio = imageAspectRatio && imageAspectRatio > 0.2 && imageAspectRatio < 5 ? imageAspectRatio : 16 / 10;

  let imgW = A0_MIN_W - PAD * 2; // 3290 pt
  let imgH = Math.round(imgW / ratio);

  let pageW = A0_MIN_W;
  let pageH = Math.max(A0_MIN_H, imgH + TOP_BOTTOM_EXTRA);

  if (ratio > 2.0) {
    imgH = A0_MIN_H - TOP_BOTTOM_EXTRA;
    imgW = Math.round(imgH * ratio);
    pageW = Math.max(A0_MIN_W, imgW + PAD * 2);
    pageH = A0_MIN_H;
  }

  // Large page layout styles
  const pageStyle = {
    padding: PAD,
    fontFamily: ROBOTO,
    fontSize: 16,
    color: "#1e293b",
    backgroundColor: "#ffffff",
  };

  const headerStyle = {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "flex-start" as const,
    paddingBottom: 16,
    marginBottom: 16,
    borderBottomWidth: 4,
    borderBottomColor: "#0284c7",
  };
  const brandTitleStyle = {
    fontSize: 40,
    fontWeight: "bold" as const,
    color: "#0f172a",
    textTransform: "uppercase" as const,
    letterSpacing: 1.5,
  };
  const brandSubStyle = {
    fontSize: 20,
    color: "#0284c7",
    fontWeight: "bold" as const,
    marginTop: 4,
  };
  const metaLabelStyle = {
    fontSize: 15,
    color: "#64748b",
    textTransform: "uppercase" as const,
  };
  const metaValueStyle = {
    fontSize: 20,
    fontWeight: "bold" as const,
    color: "#0f172a",
    marginBottom: 2,
  };
  const infoGridStyle = {
    flexDirection: "row" as const,
    backgroundColor: "#f8fafc",
    borderWidth: 2,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
  };
  const infoLabelStyle = {
    fontSize: 13,
    color: "#64748b",
    fontWeight: "bold" as const,
    textTransform: "uppercase" as const,
    marginBottom: 2,
  };
  const infoValueStyle = {
    fontSize: 18,
    fontWeight: "bold" as const,
    color: "#0f172a",
  };
  const hintBoxStyle = {
    backgroundColor: "#f0f9ff",
    borderWidth: 2,
    borderColor: "#38bdf8",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    maxWidth: 1000,
    marginLeft: 32,
  };
  const hintTitleStyle = {
    fontSize: 13,
    fontWeight: "bold" as const,
    color: "#0369a1",
    marginBottom: 2,
  };
  const hintTextStyle = {
    fontSize: 11.5,
    color: "#0c4a6e",
    lineHeight: 1.25,
  };

  const footerStyle = {
    position: "absolute" as const,
    bottom: 24,
    left: PAD,
    right: PAD,
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    borderTopWidth: 2,
    borderTopColor: "#cbd5e1",
    paddingTop: 8,
  };
  const footerTextStyle = {
    fontSize: 16,
    color: "#64748b",
    fontWeight: "bold" as const,
  };

  // Non-overlapping positioned callouts
  const positionedCallouts = computeNonOverlappingCallouts(
    sortedPoints,
    imgW,
    imgH,
    CARD_W,
    CARD_H,
    PIN_R
  );

  return (
    <Document>
      {/* ================================================================ */}
      {/* PAGE 1 — EXACT IMAGE PROPORTIONS (NO CROPPING)                   */}
      {/* ================================================================ */}
      <Page size={[pageW, pageH]} style={pageStyle}>
        {/* Header */}
        <View style={headerStyle}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View>
              <Text style={brandTitleStyle}>{t.brandTitle}</Text>
              <Text style={brandSubStyle}>el4u.de • {t.brandSub}</Text>
            </View>
            <View style={hintBoxStyle}>
              <Text style={hintTitleStyle}>💡 {t.hintTitle}</Text>
              <Text style={hintTextStyle}>{t.hintText}</Text>
            </View>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={metaLabelStyle}>{t.date}</Text>
            <Text style={metaValueStyle}>{dateStr}</Text>
            <Text style={metaLabelStyle}>{t.pointsCount}</Text>
            <Text style={metaValueStyle}>{sortedPoints.length}</Text>
          </View>
        </View>

        {/* Info row */}
        <View style={infoGridStyle}>
          <View style={{ flex: 1, paddingRight: 16 }}>
            <Text style={infoLabelStyle}>{t.doc}</Text>
            <Text style={infoValueStyle}>{documentation.title}</Text>
          </View>
          <View style={{ flex: 1, paddingRight: 16 }}>
            <Text style={infoLabelStyle}>{t.proj}</Text>
            <Text style={infoValueStyle}>{documentation.projects?.name || "Allgemein"}</Text>
          </View>
          <View style={{ flex: 1, paddingRight: 16 }}>
            <Text style={infoLabelStyle}>{t.loc}</Text>
            <Text style={infoValueStyle}>{documentation.location || "—"}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={infoLabelStyle}>{t.author}</Text>
            <Text style={infoValueStyle}>
              {documentation.author_name || "Admin"}
              {documentation.company_name ? ` · ${documentation.company_name}` : ""}
            </Text>
          </View>
        </View>

        {/* ── BIG IMAGE + OVERLAID CALLOUTS (EXACT 1:1 FIT) ── */}
        <View style={{ width: imgW, height: imgH }}>
          <View
            style={{
              position: "relative",
              width: imgW,
              height: imgH,
              backgroundColor: "#ffffff",
              borderWidth: 2,
              borderColor: "#cbd5e1",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            {/* Main background image without any cropping */}
            {mainImageSrc ? (
              <Image
                src={mainImageSrc}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: imgW,
                  height: imgH,
                  objectFit: "fill",
                }}
              />
            ) : (
              <Text
                style={{
                  position: "absolute",
                  top: imgH / 2 - 20,
                  left: imgW / 2 - 120,
                  color: "#64748b",
                  fontSize: 30,
                  fontWeight: "bold",
                }}
              >
                Kein Bild vorhanden
              </Text>
            )}

            {/* ── SVG LAYER: Connector lines from outer edge of card to pin ── */}
            <Svg
              width={imgW}
              height={imgH}
              style={{ position: "absolute", top: 0, left: 0 }}
            >
              {positionedCallouts.map(({ pt, pinLeft, pinTop, edgeX, edgeY, pinColor }) => {
                const hasPhoto = Array.isArray(pt.photos) && pt.photos.length > 0;
                return (
                  <React.Fragment key={`svg-${pt.id}`}>
                    {/* Shadow / contrast outline */}
                    <Line
                      x1={edgeX}
                      y1={edgeY}
                      x2={pinLeft}
                      y2={pinTop}
                      stroke="#000000"
                      strokeWidth={8}
                      strokeOpacity={0.35}
                    />
                    {/* Main leader line */}
                    <Line
                      x1={edgeX}
                      y1={edgeY}
                      x2={pinLeft}
                      y2={pinTop}
                      stroke={pinColor}
                      strokeWidth={5}
                      strokeDasharray={hasPhoto ? "14,8" : "8,6"}
                      strokeOpacity={1.0}
                    />
                    {/* Card edge connection dot */}
                    <Circle
                      cx={edgeX}
                      cy={edgeY}
                      r={5}
                      fill={pinColor}
                      stroke="#ffffff"
                      strokeWidth={2}
                    />
                    {/* Pin center dot */}
                    <Circle
                      cx={pinLeft}
                      cy={pinTop}
                      r={6}
                      fill={pinColor}
                      stroke="#ffffff"
                      strokeWidth={2}
                    />
                  </React.Fragment>
                );
              })}
            </Svg>

            {/* ── PER-POINT OVERLAY: Pins + Full Name Callout Cards ── */}
            {positionedCallouts.map(({ pt, pinLeft, pinTop, cardLeft, cardTop, pinColor }) => {
              const firstPhoto = Array.isArray(pt.photos) && pt.photos.length > 0 ? pt.photos[0] : null;
              const thumbSrc = firstPhoto ? (detailPhotosBase64[firstPhoto.id] || firstPhoto.url) : null;

              return (
                <React.Fragment key={pt.id}>
                  {/* Numbered pin */}
                  <View
                    style={[
                      styles.pinBadge,
                      {
                        left: pinLeft - PIN_R,
                        top: pinTop - PIN_R,
                        backgroundColor: pinColor,
                      },
                    ]}
                  >
                    <Text style={styles.pinBadgeText}>{pt.point_number}</Text>
                  </View>

                  {/* Thumbnail Card with Full Name */}
                  {thumbSrc ? (
                    <Link
                      src={
                        baseUrl
                          ? `${baseUrl}/api/view-photo?url=${encodeURIComponent(firstPhoto!.url)}&title=${encodeURIComponent(`Punkt #${pt.point_number}: ${(pt.title || "").replace(/^#?\d+\s*[-:]?\s*/, "").trim() || pt.title || documentation.title}`)}${pt.description ? `&desc=${encodeURIComponent(pt.description)}` : ""}`
                          : `/api/view-photo?url=${encodeURIComponent(firstPhoto!.url)}&title=${encodeURIComponent(`Punkt #${pt.point_number}: ${(pt.title || "").replace(/^#?\d+\s*[-:]?\s*/, "").trim() || pt.title || documentation.title}`)}${pt.description ? `&desc=${encodeURIComponent(pt.description)}` : ""}`
                      }
                      style={[styles.calloutCard, { left: cardLeft, top: cardTop }]}
                    >
                      <Image src={thumbSrc} style={styles.calloutThumb} />
                      <View style={styles.calloutTextWrap}>
                        <View style={styles.calloutHeaderRow}>
                          <View style={[styles.calloutBadge, { backgroundColor: pinColor }]}>
                            <Text style={styles.calloutBadgeText}>#{pt.point_number}</Text>
                          </View>
                          <Text style={styles.calloutTitle}>{pt.title}</Text>
                        </View>
                        {pt.description ? (
                          <Text style={styles.calloutDesc}>{pt.description}</Text>
                        ) : null}
                        <Text style={styles.calloutLink}>{t.clickToOpen}</Text>
                      </View>
                    </Link>
                  ) : (
                    /* Point without photo — compact clean card */
                    <View
                      style={[
                        styles.calloutCard,
                        { left: cardLeft, top: cardTop, width: 260, height: 70 },
                      ]}
                    >
                      <View
                        style={[
                          styles.pinBadge,
                          {
                            position: "relative",
                            left: 0,
                            top: 0,
                            width: 32,
                            height: 32,
                            borderRadius: 16,
                            backgroundColor: pinColor,
                            marginRight: 8,
                          },
                        ]}
                      >
                        <Text style={[styles.pinBadgeText, { fontSize: 14 }]}>{pt.point_number}</Text>
                      </View>
                      <View style={styles.calloutTextWrap}>
                        <Text style={styles.calloutTitle}>{pt.title}</Text>
                        {pt.description ? (
                          <Text style={styles.calloutDesc}>{pt.description}</Text>
                        ) : null}
                      </View>
                    </View>
                  )}
                </React.Fragment>
              );
            })}
          </View>
        </View>

        {/* Footer */}
        <View style={footerStyle} fixed>
          <Text style={footerTextStyle}>
            el4u.de {t.brandTitle} • {documentation.title}
          </Text>
          <Text style={[footerTextStyle, { color: "#94a3b8", fontSize: 13 }]}>
            {t.owner}
          </Text>
          <Text
            style={footerTextStyle}
            render={({ pageNumber, totalPages }) => `${t.pageOf} ${pageNumber} ${t.of} ${totalPages}`}
          />
        </View>
      </Page>

      {/* ================================================================ */}
      {/* PAGE 2 — LARGE FORMAT MATCHING PAGE 1: Overview without photos   */}
      {/* ================================================================ */}
      <Page size={[pageW, pageH]} style={pageStyle}>
        {/* Header */}
        <View style={headerStyle}>
          <View>
            <Text style={brandTitleStyle}>{t.brandTitle}</Text>
            <Text style={brandSubStyle}>el4u.de • {t.page2Title}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={metaLabelStyle}>{t.date}</Text>
            <Text style={metaValueStyle}>{dateStr}</Text>
            <Text style={metaLabelStyle}>{t.pointsCount}</Text>
            <Text style={metaValueStyle}>{sortedPoints.length}</Text>
          </View>
        </View>

        {/* Info Grid */}
        <View style={infoGridStyle}>
          <View style={{ flex: 1, paddingRight: 16 }}>
            <Text style={infoLabelStyle}>{t.doc}</Text>
            <Text style={infoValueStyle}>{documentation.title}</Text>
          </View>
          <View style={{ flex: 1, paddingRight: 16 }}>
            <Text style={infoLabelStyle}>{t.proj}</Text>
            <Text style={infoValueStyle}>{documentation.projects?.name || "Allgemein"}</Text>
          </View>
          <View style={{ flex: 1, paddingRight: 16 }}>
            <Text style={infoLabelStyle}>{t.loc}</Text>
            <Text style={infoValueStyle}>{documentation.location || "—"}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={infoLabelStyle}>{t.author}</Text>
            <Text style={infoValueStyle}>
              {documentation.author_name || "Admin"}
              {documentation.company_name ? ` · ${documentation.company_name}` : ""}
            </Text>
          </View>
        </View>

        {/* Section Heading */}
        <Text style={styles.sectionTitleLarge}>{t.page2Title}</Text>

        {/* Points Table without photos in Grand Format */}
        <View style={styles.tableLarge}>
          {/* Table Header */}
          <View style={styles.tableHeaderRowLarge} fixed>
            <View style={{ width: "8%" }}>
              <Text style={styles.tableHeaderCellLarge}>{t.colNum}</Text>
            </View>
            <View style={{ width: "32%", paddingRight: 12 }}>
              <Text style={styles.tableHeaderCellLarge}>{t.colTitle}</Text>
            </View>
            <View style={{ width: "42%", paddingRight: 12 }}>
              <Text style={styles.tableHeaderCellLarge}>{t.colDesc}</Text>
            </View>
            <View style={{ width: "18%" }}>
              <Text style={styles.tableHeaderCellLarge}>{t.colPos}</Text>
            </View>
          </View>

          {/* Table Rows */}
          {sortedPoints.map((pt, idx) => {
            const pinColor = pt.color || "#0284c7";
            const isAlt = idx % 2 === 1;
            const xPct = (pt.x_norm * 100).toFixed(1);
            const yPct = (pt.y_norm * 100).toFixed(1);
            const photoCount = Array.isArray(pt.photos) ? pt.photos.length : 0;

            return (
              <View
                key={`tbl-row-${pt.id}`}
                wrap={false}
                style={[styles.tableRowLarge, isAlt ? styles.tableRowAltLarge : {}]}
              >
                {/* Number Badge */}
                <View style={{ width: "8%", paddingTop: 2 }}>
                  <View style={[styles.tableBadgeLarge, { backgroundColor: pinColor }]}>
                    <Text style={styles.tableBadgeTextLarge}>{pt.point_number}</Text>
                  </View>
                </View>

                {/* Point Title */}
                <View style={{ width: "32%", paddingRight: 12 }}>
                  <Text style={styles.tableTitleTextLarge}>{pt.title}</Text>
                  {photoCount > 0 ? (
                    <Text style={styles.tablePhotoCountBadgeLarge}>
                      {photoCount} {photoCount === 1 ? (isPl ? "zdjęcie" : isEn ? "photo" : "Foto") : (isPl ? "zdjęć" : isEn ? "photos" : "Fotos")}
                    </Text>
                  ) : (
                    <Text style={[styles.tableCoordTextLarge, { color: "#94a3b8" }]}>{t.noPhotos}</Text>
                  )}
                </View>

                {/* Description */}
                <View style={{ width: "42%", paddingRight: 12 }}>
                  <Text style={styles.tableDescTextLarge}>
                    {pt.description || "—"}
                  </Text>
                </View>

                {/* Coordinates */}
                <View style={{ width: "18%" }}>
                  <Text style={styles.tableCoordTextLarge}>
                    X: {xPct}%{"\n"}
                    Y: {yPct}%
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* Footer */}
        <View style={footerStyle} fixed>
          <Text style={footerTextStyle}>
            el4u.de • {documentation.title}
          </Text>
          <Text style={[footerTextStyle, { color: "#94a3b8", fontSize: 13 }]}>
            {t.owner}
          </Text>
          <Text
            style={footerTextStyle}
            render={({ pageNumber, totalPages }) => `${t.pageOf} ${pageNumber} ${t.of} ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
