import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  Image,
} from "@react-pdf/renderer";

Font.register({
  family: "Roboto",
  fonts: [
    { src: "https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-regular-webfont.ttf", fontWeight: 400 },
    { src: "https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-bold-webfont.ttf", fontWeight: 700 },
  ],
});

const styles = StyleSheet.create({
  page: {
    fontFamily: "Roboto",
    backgroundColor: "#ffffff",
    padding: 30,
    flexDirection: "column",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    borderBottom: "2px solid #ea580c",
    paddingBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    color: "#ea580c",
    textTransform: "uppercase",
  },
  logo: {
    width: 120,
  },
  content: {
    flex: 1,
    flexDirection: "column",
    gap: 20,
  },
  mapContainer: {
    position: "relative",
    width: "100%",
    height: 350,
    border: "1px solid #e5e7eb",
    backgroundColor: "#f9fafb",
  },
  mapImage: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
  },
  marker: {
    position: "absolute",
    width: 24,
    height: 24,
    transform: "translate(-12, -24)", // centered horizontally, bottom aligned
  },
  infoSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 20,
  },
  detailsColumn: {
    flex: 1,
    flexDirection: "column",
    gap: 10,
  },
  detailRow: {
    flexDirection: "row",
    borderBottom: "1px solid #f3f4f6",
    paddingBottom: 5,
  },
  detailLabel: {
    width: 80,
    fontSize: 10,
    color: "#6b7280",
    fontWeight: 700,
    textTransform: "uppercase",
  },
  detailValue: {
    flex: 1,
    fontSize: 12,
    color: "#111827",
    fontWeight: 700,
  },
  photoColumn: {
    width: 150,
    alignItems: "center",
    gap: 10,
  },
  photoImage: {
    width: 150,
    height: 150,
    objectFit: "contain",
    backgroundColor: "#f8fafc",
    borderRadius: 8,
  },
  qrImage: {
    width: 100,
    height: 100,
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 30,
    right: 30,
    textAlign: "center",
    color: "#9ca3af",
    fontSize: 10,
    borderTop: "1px solid #e5e7eb",
    paddingTop: 10,
  },
  pageNumber: {
    position: "absolute",
    bottom: 30,
    right: 30,
    fontSize: 10,
    color: "#9ca3af",
  }
});

interface ChargerData {
  id: string;
  plan_id: string;
  project_id: string;
  mac: string;
  pin: string;
  service_pin?: string;
  activation_pin?: string;
  qr_text: string;
  x_norm: number;
  y_norm: number;
  created_at: string;
  photoBase64?: string; // We will pass pre-fetched base64 to avoid react-pdf async loading issues
  qrBase64?: string;
  planName?: string;
}

interface ChargersPdfProps {
  chargers: ChargerData[];
  plansMap: Record<string, any>; // full plan objects
  projectName?: string;
  includePin?: boolean;
  translations: {
    project: string;
    generatedOn: string;
    missingMap: string;
    missingPhoto: string;
    owner?: string;
  };
}

// Ensure the marker URL is valid and absolute if using web urls, but for reliability in react-pdf it's better to pass as base64 or a known public URL
const MARKER_URL = "https://et4u.de/pin-icon.png"; 

export function ChargersPdf({ chargers, plansMap, projectName, translations, includePin = true }: ChargersPdfProps) {
  const sortedChargers = [...chargers].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const formatDate = (ds: string) => {
    try {
      const d = new Date(ds);
      return d.toLocaleDateString("pl-PL", { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch {
      return ds;
    }
  };

  const plansIds = Array.from(new Set(sortedChargers.map(c => c.plan_id))).filter(Boolean) as string[];

  return (
    <Document>
      {plansIds.map((planId) => {
        const planChargers = sortedChargers.filter(c => c.plan_id === planId);
        const plan = plansMap[planId];
        const planImg = plan?.imageBase64;
        const planName = planChargers[0]?.planName || "Plan";

        const pageWidth = 842; // A4 landscape
        const pageHeight = 595;
        const padding = 20;
        const containerWidth = pageWidth - (padding * 2);
        const containerHeight = pageHeight - (padding * 2) - 100; // leave room for header/footer

        const imgW = plan?.image_width || 1000;
        const imgH = plan?.image_height || 700;
        const imgRatio = imgW / imgH;
        const containerRatio = containerWidth / containerHeight;

        let renderW, renderH, offsetX, offsetY;
        if (imgRatio > containerRatio) {
            renderW = containerWidth;
            renderH = containerWidth / imgRatio;
            offsetX = 0;
            offsetY = (containerHeight - renderH) / 2;
        } else {
            renderH = containerHeight;
            renderW = containerHeight * imgRatio;
            offsetX = (containerWidth - renderW) / 2;
            offsetY = 0;
        }

        return (
          <React.Fragment key={`plan-${planId}`}>
            <Page size="A4" orientation="landscape" style={{ padding: 20, backgroundColor: "#ffffff" }}>
              <View style={{ marginBottom: 10, borderBottomWidth: 2, borderBottomColor: '#ea580c', paddingBottom: 10 }}>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: "#111827" }}>LADEGERÄTE INSTALLATION (OVERVIEW)</Text>
                {projectName && <Text style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{translations.project}: {projectName}</Text>}
                <Text style={{ fontSize: 12, color: "#6b7280" }}>Plan: {planName}</Text>
              </View>

              <View style={{ flex: 1, position: 'relative', width: containerWidth, height: containerHeight, alignSelf: 'center' }}>
                {planImg ? (
                  <React.Fragment>
                    <Image src={planImg} style={{ width: renderW, height: renderH, position: 'absolute', left: offsetX, top: offsetY }} />
                    {planChargers.map((charger, idx) => {
                      if (charger.x_norm === null || charger.y_norm === null) return null;
                      
                      const xNorm = Number(charger.x_norm);
                      const yNorm = Number(charger.y_norm);
                      
                      // -8 and -16 to center the bottom tip of the 16x16 icon
                      const mX = Math.round(offsetX + (xNorm * renderW) - 8);
                      const mY = Math.round(offsetY + (yNorm * renderH) - 16);
                      
                      return (
                        <View 
                          key={`marker-${charger.id}`}
                          style={{ 
                            position: 'absolute',
                            left: mX, 
                            top: mY,
                            alignItems: 'center'
                          }}
                        >
                          <Image src={MARKER_URL} style={{ width: 16, height: 16 }} />
                          <View style={{ backgroundColor: '#ea580c', borderRadius: 4, paddingHorizontal: 3, paddingVertical: 1, marginTop: 1 }}>
                             <Text style={{ fontSize: 6, color: 'white', fontWeight: 'bold' }}>{idx + 1}</Text>
                          </View>
                        </View>
                      );
                    })}
                  </React.Fragment>
                ) : (
                  <Text style={{ color: "#9ca3af", fontSize: 12, alignSelf: 'center' }}>{translations.missingMap}</Text>
                )}
              </View>

              <Text style={{ position: "absolute", bottom: 20, left: 20, fontSize: 10, color: "#9ca3af" }}>
                 {translations.generatedOn} et4u.de
              </Text>
              <Text style={styles.pageNumber} render={({ pageNumber, totalPages }) => (`${pageNumber} / ${totalPages}`)} fixed />
            </Page>

            {planChargers.map((charger, idx) => (
              <Page key={`details-${charger.id}`} size="A4" orientation="landscape" style={styles.page}>
                <View style={styles.header}>
                  <Text style={styles.title}>LADEGERÄTE INSTALLATION</Text>
                  <Image src="https://et4u.de/logo_bma.png" style={styles.logo} />
                </View>
                <View style={styles.content}>
                  <View style={styles.infoSection}>
                    <View style={styles.detailsColumn}>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>{translations.project}</Text>
                        <Text style={styles.detailValue}>{projectName}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Plan</Text>
                        <Text style={styles.detailValue}>{planName}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Marker / Index</Text>
                        <Text style={styles.detailValue}>{idx + 1}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>MAC</Text>
                        <Text style={styles.detailValue}>{charger.mac}</Text>
                      </View>
                      {includePin && (
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>PIN</Text>
                          <Text style={styles.detailValue}>{charger.pin}</Text>
                        </View>
                      )}
                      {charger.service_pin ? (
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Service PIN</Text>
                          <Text style={styles.detailValue}>{charger.service_pin}</Text>
                        </View>
                      ) : null}
                      {charger.activation_pin ? (
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Aktivierungs PIN</Text>
                          <Text style={styles.detailValue}>{charger.activation_pin}</Text>
                        </View>
                      ) : null}
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Date</Text>
                        <Text style={styles.detailValue}>{formatDate(charger.created_at)}</Text>
                      </View>
                    </View>

                    <View style={styles.photoColumn}>
                      {charger.photoBase64 ? (
                        <Image src={charger.photoBase64} style={styles.photoImage} />
                      ) : (
                        <Text style={{ color: "#9ca3af", fontSize: 10 }}>{translations.missingPhoto}</Text>
                      )}
                      {charger.qrBase64 && (
                        <Image src={charger.qrBase64} style={styles.qrImage} />
                      )}
                    </View>
                  </View>
                </View>
                <Text style={styles.footer}>
                   {translations.generatedOn} et4u.de{"\n"}{translations.owner || "Inhaber: Marcin Slapinski"}
                </Text>
                <Text style={styles.pageNumber} render={({ pageNumber, totalPages }) => (`${pageNumber} / ${totalPages}`)} fixed />
              </Page>
            ))}
          </React.Fragment>
        );
      })}
    </Document>
  );
}
