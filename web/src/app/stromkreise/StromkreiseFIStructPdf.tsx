import React from "react";
import { Page, Text, View, Document, StyleSheet, Font } from "@react-pdf/renderer";

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
    padding: 40,
    fontFamily: ROBOTO,
    fontSize: 10,
    color: "#333",
  },
  header: {
    fontSize: 18,
    marginBottom: 5,
    fontWeight: "bold",
    color: "#0f172a",
    textTransform: "uppercase",
  },
  subheader: {
    fontSize: 10,
    color: "#64748b",
    marginBottom: 30,
    textTransform: "uppercase",
    fontWeight: "bold",
  },
  groupTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#0f172a",
    textAlign: "center",
    marginTop: 35,
    marginBottom: 15,
    paddingBottom: 8,
    borderBottomWidth: 1.5,
    borderBottomColor: "#94a3b8",
    textTransform: "uppercase",
  },
  rcdCard: {
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    padding: 15,
    backgroundColor: "#f8fafc",
  },
  rcdHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1.5,
    borderBottomColor: "#cbd5e1",
    paddingBottom: 8,
    marginBottom: 10,
  },
  rcdTitle: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#1e3a8a",
  },
  rcdMeta: {
    fontSize: 9,
    color: "#475569",
    fontWeight: "bold",
  },
  breakerList: {
    paddingLeft: 10,
  },
  breakerItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 6,
    paddingLeft: 12,
    borderLeftWidth: 1.5,
    borderLeftColor: "#94a3b8",
    position: "relative",
  },
  treeNodeSymbol: {
    color: "#64748b",
    marginRight: 6,
    fontFamily: ROBOTO,
  },
  breakerCode: {
    fontWeight: "bold",
    color: "#0f172a",
    width: 60,
  },
  breakerRating: {
    color: "#475569",
    width: 65,
    marginRight: 5,
  },
  breakerName: {
    color: "#334155",
    flex: 1,
  },
});

export default function StromkreiseFIStructPdf({ projectName, planName, rcdGroups, translations }: any) {
  const t = (key: string, def: string) => {
    if (translations && translations[key]) return translations[key];
    return def;
  };

  const formatSicherung = (curve: string, phase: number, current: number) => {
    const c = (curve || "").toUpperCase();
    const p = phase || 1;
    const a = current || "";
    if (c === "B") return `MBN${p}${a}`;
    if (c === "C") return `MCN${p}${a}`;
    return `${c}${a}`;
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.header}>{t("stromkreise.fi.pdfTitle", "Verteilerstruktur")}</Text>
        <Text style={styles.subheader}>
          {projectName} - {planName || "Grundriss"}
        </Text>

        {(() => {
          // Group rcdGroups by verteiler
          const groupedByVerteiler: Record<string, any[]> = {};
          rcdGroups.forEach((group: any) => {
            const vName = group.verteiler || "Verteiler";
            if (!groupedByVerteiler[vName]) {
              groupedByVerteiler[vName] = [];
            }
            groupedByVerteiler[vName].push(group);
          });

          return Object.entries(groupedByVerteiler)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([vName, vGroups]) => (
              <View key={vName} style={{ marginBottom: 30 }}>
                <Text style={styles.groupTitle}>Verteiler: {vName}</Text>
                
                {vGroups.map((group: any, idx: number) => (
                  <View key={group.name || idx} style={styles.rcdCard} wrap={false}>
                    <View style={styles.rcdHeader}>
                      <Text style={styles.rcdTitle}>
                        {group.rcdGroup === "__no_rcd__" ? t("stromkreise.rcd.noRcd", "Ohne RCD / FI") : group.rcdGroup}
                      </Text>
                      {group.rcdGroup !== "__no_rcd__" && (group.current || group.ma) && (
                        <Text style={styles.rcdMeta}>
                          FI: {group.current ? `${group.current}A` : ""} {group.ma ? `/ ${group.ma}mA` : ""}
                        </Text>
                      )}
                    </View>

                    <View style={styles.breakerList}>
                      {group.breakers.map((br: any, bIdx: number) => {
                        const isLast = bIdx === group.breakers.length - 1;
                        const nodeSymbol = isLast ? "L--" : "|--";
                        return (
                          <View key={br.id || bIdx} style={styles.breakerItem}>
                            <Text style={styles.treeNodeSymbol}>{nodeSymbol}</Text>
                            <Text style={styles.breakerCode}>{br.circuit_code}</Text>
                            <Text style={styles.breakerRating}>
                              {formatSicherung(br.breaker_curve, br.phase, br.breaker_current)}
                            </Text>
                            <View style={{ flex: 1, flexDirection: "column" }}>
                              <Text style={{ color: "#334155" }}>
                                {br.full_name}
                                {br.metadata?.kabeltyp ? ` (${br.metadata.kabeltyp})` : ""}
                              </Text>
                              {br.metadata?.uv_status === "nachruesten" && (
                                <Text style={{ color: "#d97706", fontWeight: "bold", fontSize: 8, marginTop: 2 }}>
                                  [NACHRÜSTEN IM BEST. UV]
                                </Text>
                              )}
                              {br.metadata?.uv_status === "neue" && (
                                <Text style={{ color: "#dc2626", fontWeight: "bold", fontSize: 8, marginTop: 2 }}>
                                  [NEUE UV]
                                </Text>
                              )}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </View>
            ));
        })()}
      </Page>
    </Document>
  );
}
