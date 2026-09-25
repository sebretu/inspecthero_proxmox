import React from "react";
import { Page, Text, View, Document, StyleSheet, Image, Font, Link } from "@react-pdf/renderer";
import {
  MaengelanzeigeItem,
  ReportConfig,
  DEFAULT_REPORT_CONFIG,
} from "@/types/maengelanzeige";

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
  page: {
    padding: 28,
    fontFamily: ROBOTO,
    fontSize: 9,
    color: "#222",
    backgroundColor: "#ffffff",
  },
  headerContainer: {
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: "#1e3a8a",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1e3a8a",
    marginBottom: 3,
  },
  subtitle: {
    fontSize: 10,
    color: "#475569",
  },
  metaBox: {
    alignItems: "flex-end",
  },
  metaText: {
    fontSize: 8,
    color: "#64748b",
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#0f172a",
  },
  projectInfoBox: {
    flexDirection: "row",
    backgroundColor: "#f8fafc",
    padding: 8,
    borderRadius: 4,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  projectInfoCol: {
    flex: 1,
  },
  label: {
    fontSize: 7,
    fontWeight: "bold",
    color: "#64748b",
    textTransform: "uppercase",
    marginBottom: 2,
  },
  value: {
    fontSize: 9,
    color: "#1e293b",
    fontWeight: "bold",
  },
  card: {
    marginBottom: 14,
    padding: 10,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 6,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
    paddingBottom: 5,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  itemBadge: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#1e3a8a",
  },
  statusBadge: {
    fontSize: 8,
    fontWeight: "bold",
    textTransform: "uppercase",
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 3,
  },
  statusOffen: {
    backgroundColor: "#fef3c7",
    color: "#b45309",
  },
  statusInBearbeitung: {
    backgroundColor: "#e0f2fe",
    color: "#0369a1",
  },
  statusZuKlaeren: {
    backgroundColor: "#f3e8ff",
    color: "#7e22ce",
  },
  statusErledigt: {
    backgroundColor: "#dcfce7",
    color: "#15803d",
  },
  statusNichtRelevant: {
    backgroundColor: "#f1f5f9",
    color: "#64748b",
  },
  metaContainer: {
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    gap: 3,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
    width: "100%",
  },
  metaColLabel: {
    fontSize: 7.5,
    fontWeight: "bold",
    color: "#64748b",
    textTransform: "uppercase",
    flexShrink: 0,
  },
  metaColValue: {
    fontSize: 8.5,
    fontWeight: "bold",
    color: "#0f172a",
    flex: 1,
  },
  sectionBox: {
    marginBottom: 6,
    padding: 7,
    borderRadius: 4,
  },
  originalBox: {
    backgroundColor: "#f8fafc",
    borderLeftWidth: 3,
    borderLeftColor: "#64748b",
  },
  adminDocBox: {
    backgroundColor: "#fffbeb",
    borderLeftWidth: 3,
    borderLeftColor: "#f59e0b",
  },
  userDocBox: {
    backgroundColor: "#f0fdf4",
    borderLeftWidth: 3,
    borderLeftColor: "#16a34a",
  },
  sectionLabel: {
    fontSize: 7.5,
    fontWeight: "bold",
    marginBottom: 2,
  },
  originalLabel: {
    color: "#475569",
  },
  adminDocLabel: {
    color: "#b45309",
  },
  userDocLabel: {
    color: "#15803d",
  },
  sectionText: {
    fontSize: 8.5,
    color: "#1e293b",
    lineHeight: 1.25,
  },
  photoRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 6,
    width: "100%",
  },
  photoWrapperSingle: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: "#f8fafc",
  },
  photoImgSingle: {
    width: "100%",
    height: 230,
    objectFit: "contain",
  },
  photoWrapperTwo: {
    width: "49%",
    flex: 1,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: "#f8fafc",
  },
  photoImgTwo: {
    width: "100%",
    height: 180,
    objectFit: "contain",
  },
  photoBadge: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    fontSize: 6.5,
    fontWeight: "bold",
    color: "#ffffff",
    alignSelf: "flex-start",
  },
  photoBadgeBefore: {
    backgroundColor: "#2563eb",
  },
  photoBadgeAfter: {
    backgroundColor: "#16a34a",
  },
  photoCaption: {
    fontSize: 7,
    fontWeight: "bold",
    color: "#334155",
    padding: 4,
    backgroundColor: "#f1f5f9",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  hdLinkBox: {
    paddingVertical: 3.5,
    paddingHorizontal: 6,
    backgroundColor: "#eff6ff",
    borderTopWidth: 1,
    borderTopColor: "#dbeafe",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
  },
  hdLinkText: {
    fontSize: 6.5,
    fontWeight: "bold",
    color: "#2563eb",
    textDecoration: "none",
  },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 28,
    right: 28,
    textAlign: "center",
    fontSize: 7.5,
    color: "#94a3b8",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

interface MaengelanzeigePdfProps {
  documentTitle: string;
  projectName: string;
  projectAddress?: string | null;
  reportDate?: string;
  reportNumber?: string;
  globalConfig?: ReportConfig;
  language?: string;
  items: Array<
    MaengelanzeigeItem & {
      photosBase64?: Array<{ url: string; caption?: string | null; photo_type?: string | null }>;
    }
  >;
}

export function MaengelanzeigePdf({
  documentTitle,
  projectName,
  projectAddress,
  reportDate = new Date().toLocaleDateString("de-DE"),
  reportNumber = `MA-${Date.now().toString().slice(-6)}`,
  globalConfig = DEFAULT_REPORT_CONFIG,
  language = "de",
  items,
}: MaengelanzeigePdfProps) {
  const isPl = language === "pl";
  const isEn = language === "en";
  const isSk = language === "sk";
  const ownerText = isPl ? "Właściciel: Marcin Slapinski" : isEn ? "Owner: Marcin Slapinski" : isSk ? "Vlastník: Marcin Slapinski" : "Inhaber: Marcin Slapinski";
  // Filter items included in report and matching the configured status export filter
  const includedStatuses = globalConfig.includedStatuses || ["OPEN", "IN_PROGRESS", "ZU_KLAEREN", "DONE"];
  const selectedItems = items.filter(
    (item) =>
      (item.is_selected === true || item.is_selected === undefined) &&
      includedStatuses.includes(item.status as any)
  );

  const getStatusStyle = (status: string) => {
    switch (status) {
      case "DONE":
      case "ERLEDIGT":
        return styles.statusErledigt;
      case "IN_PROGRESS":
      case "IN_BEARBEITUNG":
        return styles.statusInBearbeitung;
      case "ZU_KLAEREN":
      case "ZU_KLÄREN":
        return styles.statusZuKlaeren;
      case "NOT_RELEVANT":
        return styles.statusNichtRelevant;
      default:
        return styles.statusOffen;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "DONE":
      case "ERLEDIGT":
        return "Erledigt";
      case "IN_PROGRESS":
      case "IN_BEARBEITUNG":
        return "In Bearbeitung";
      case "ZU_KLAEREN":
      case "ZU_KLÄREN":
        return "Zu klären";
      case "NOT_RELEVANT":
        return "Nicht relevant";
      default:
        return "Offen";
    }
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.headerContainer}>
          <View>
            <Text style={styles.title}>Mängelanzeige – Dokumentationsbericht</Text>
            <Text style={styles.subtitle}>{documentTitle}</Text>
          </View>
          <View style={styles.metaBox}>
            <Text style={styles.metaText}>
              Bericht-Nr.: <Text style={styles.metaValue}>{reportNumber}</Text>
            </Text>
            <Text style={styles.metaText}>
              Datum: <Text style={styles.metaValue}>{reportDate}</Text>
            </Text>
          </View>
        </View>

        {/* Project Meta Info */}
        <View style={styles.projectInfoBox}>
          <View style={styles.projectInfoCol}>
            <Text style={styles.label}>Projekt</Text>
            <Text style={styles.value}>{projectName || "–"}</Text>
          </View>
          {projectAddress && (
            <View style={styles.projectInfoCol}>
              <Text style={styles.label}>Adresse</Text>
              <Text style={styles.value}>{projectAddress}</Text>
            </View>
          )}
          <View style={styles.projectInfoCol}>
            <Text style={styles.label}>Bearbeitete Punkte</Text>
            <Text style={styles.value}>
              {selectedItems.filter((i) => i.status === "DONE").length} von {selectedItems.length} erledigt
            </Text>
          </View>
        </View>

        {/* Items List */}
        {selectedItems.map((item, index) => {
          // Resolve effective configuration for this item: item custom override fallback to global config
          const cfg: ReportConfig = {
            ...globalConfig,
            ...(item.custom_report_config || {}),
            // Backward compatibility with individual legacy export flags if present
            ...(item.export_include_before_photos !== undefined ? { includeBeforePhotos: item.export_include_before_photos } : {}),
            ...(item.export_include_after_photos !== undefined ? { includeAfterPhotos: item.export_include_after_photos } : {}),
            ...(item.export_include_admin_doc !== undefined ? { includeAdminDoc: item.export_include_admin_doc } : {}),
            ...(item.export_include_user_doc !== undefined ? { includeUserDoc: item.export_include_user_doc } : {}),
          };

          const rawPhotos = item.photosBase64 || item.photos || [];
          const filteredPhotos = rawPhotos.filter((p: any) => {
            const isBefore =
              p.photo_type === "BEFORE" ||
              p.photo_type === "VORHER" ||
              (p.caption && p.caption.startsWith("[VORHER]"));
            if (isBefore && !cfg.includeBeforePhotos) return false;
            if (!isBefore && !cfg.includeAfterPhotos) return false;
            return true;
          });

          // Group photos in pairs of 2 so each row stays unbroken with wrap={false}
          const photoRows: any[][] = [];
          for (let i = 0; i < filteredPhotos.length; i += 2) {
            photoRows.push(filteredPhotos.slice(i, i + 2));
          }

          const showTrade = cfg.includeTrade && !!item.trade_or_company;
          const showLocation = cfg.includeLocation && !!item.location;

          return (
            <View key={`item-${item.id || index}`} style={styles.card}>
              {/* Card Header & Text Info (kept together) */}
              <View wrap={false}>
                {/* Card Header: Item Number & Status */}
                <View style={styles.cardHeader}>
                  <Text style={styles.itemBadge}>
                    Punkt {item.item_number || `${index + 1}`} (Seite {item.page_number || 1})
                  </Text>
                  {cfg.includeStatus && (
                    <Text style={[styles.statusBadge, getStatusStyle(item.status)]}>
                      {getStatusLabel(item.status)}
                    </Text>
                  )}
                </View>

                {/* Trade & Location Meta - Stacked without collision */}
                {(showTrade || showLocation) && (
                  <View style={styles.metaContainer}>
                    {showTrade && (
                      <View style={styles.metaItem}>
                        <Text style={styles.metaColLabel}>Gewerk / Firma:</Text>
                        <Text style={styles.metaColValue}>{item.trade_or_company}</Text>
                      </View>
                    )}
                    {showLocation && (
                      <View style={styles.metaItem}>
                        <Text style={styles.metaColLabel}>Ort / Raum:</Text>
                        <Text style={styles.metaColValue}>{item.location}</Text>
                      </View>
                    )}
                  </View>
                )}

                {/* 1. Original Mängelanzeige */}
                {cfg.includeOriginalText && (
                  <View style={[styles.sectionBox, styles.originalBox]}>
                    <Text style={[styles.sectionLabel, styles.originalLabel]}>
                      Original Mängelanzeige:
                    </Text>
                    <Text style={styles.sectionText}>{item.original_text || "–"}</Text>
                  </View>
                )}

                {/* 2. Admin-Dokumentation (Bauleitung) */}
                {cfg.includeAdminDoc && item.our_documentation && (
                  <View style={[styles.sectionBox, styles.adminDocBox]}>
                    <Text style={[styles.sectionLabel, styles.adminDocLabel]}>
                      Dokumentation & Stellungnahme (Bauleitung / Admin):
                    </Text>
                    <Text style={styles.sectionText}>{item.our_documentation}</Text>
                  </View>
                )}

                {/* 3. Ausführung & Kommentar (Mitarbeiter) */}
                {cfg.includeUserDoc && item.user_documentation && (
                  <View style={[styles.sectionBox, styles.userDocBox]}>
                    <Text style={[styles.sectionLabel, styles.userDocLabel]}>
                      Ausgeführte Arbeiten & Rückmeldung (Mitarbeiter):
                    </Text>
                    <Text style={styles.sectionText}>{item.user_documentation}</Text>
                  </View>
                )}
              </View>

              {/* 4. Fotos - each row has wrap={false} to NEVER cut across page breaks */}
              {photoRows.map((row, rIdx) => {
                const isSingle = filteredPhotos.length === 1;

                return (
                  <View key={`photo-row-${rIdx}`} style={styles.photoRow} wrap={false}>
                    {row.map((photo: any, pIdx: number) => {
                      const src = photo.base64 || photo.url;
                      if (!src) return null;

                      const isBefore =
                        photo.photo_type === "BEFORE" ||
                        photo.photo_type === "VORHER" ||
                        (photo.caption && photo.caption.startsWith("[VORHER]"));

                      const originalUrl = photo.url || (!photo.base64 ? src : undefined);
                      const showHdLink = (cfg.includeHdPhotoLinks !== false) && !!originalUrl;

                      return (
                        <View
                          key={`photo-${rIdx}-${pIdx}`}
                          style={isSingle ? styles.photoWrapperSingle : styles.photoWrapperTwo}
                          wrap={false}
                        >
                          <View
                            style={[
                              styles.photoBadge,
                              isBefore ? styles.photoBadgeBefore : styles.photoBadgeAfter,
                            ]}
                          >
                            <Text>{isBefore ? "VORHER" : "NACHHER"}</Text>
                          </View>
                          {originalUrl ? (
                            <Link src={originalUrl} style={{ textDecoration: "none" }}>
                              <Image
                                src={src}
                                style={isSingle ? styles.photoImgSingle : styles.photoImgTwo}
                              />
                            </Link>
                          ) : (
                            <Image
                              src={src}
                              style={isSingle ? styles.photoImgSingle : styles.photoImgTwo}
                            />
                          )}
                          {photo.caption && (
                            <Text style={styles.photoCaption}>
                              {photo.caption.replace(/^\[(VORHER|NACHHER)\]\s*/, "")}
                            </Text>
                          )}
                          {showHdLink && (
                            <Link src={originalUrl!} style={styles.hdLinkBox}>
                              <Text style={styles.hdLinkText}>Originalbild in voller Größe öffnen</Text>
                            </Link>
                          )}
                        </View>
                      );
                    })}
                  </View>
                );
              })}
            </View>
          );
        })}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text>et4u.de – Mängelanzeige Dokumentationsbericht</Text>
          <Text style={{ fontSize: 7, color: "#64748b" }}>{ownerText}</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Seite ${pageNumber} von ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}

export default MaengelanzeigePdf;
