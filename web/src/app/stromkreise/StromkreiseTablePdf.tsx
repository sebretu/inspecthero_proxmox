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
    padding: 30,
    fontFamily: ROBOTO,
    fontSize: 9,
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
    marginBottom: 20,
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
  table: {
    display: "flex",
    width: "100%",
    borderStyle: "solid",
    borderColor: "#e2e8f0",
    borderWidth: 1,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomColor: "#e2e8f0",
    borderBottomWidth: 1,
    alignItems: "center",
    minHeight: 20,
  },
  tableRowHeader: {
    backgroundColor: "#f8fafc",
  },
  tableColHeader: {
    padding: 6,
    borderRightColor: "#e2e8f0",
    borderRightWidth: 1,
  },
  tableCol: {
    padding: 6,
    borderRightColor: "#e2e8f0",
    borderRightWidth: 1,
  },
  tableCellHeader: {
    fontWeight: "bold",
    color: "#334155",
    textTransform: "uppercase",
    fontSize: 8,
  },
  tableCell: {
    color: "#0f172a",
  },
});

export default function StromkreiseTablePdf({ projectName, planName, markers, translations }: any) {
  const t = (key: string, def: string) => {
    if (translations && translations[key]) return translations[key];
    return def;
  };

  const groupedMarkers = React.useMemo(() => {
    const groups: Record<string, any[]> = {};
    markers.forEach((m: any) => {
      const rawPanel = m.panel_group || "Verteiler";
      const normalizedPanel = rawPanel === "Verteiler" ? "Verteiler" : rawPanel.replace(/\s+/g, "").toUpperCase();
      if (!groups[normalizedPanel]) {
        groups[normalizedPanel] = [];
      }
      groups[normalizedPanel].push(m);
    });
    return groups;
  }, [markers]);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.header}>{t("stromkreise.table.pdfTitle", "Sicherungsbelegungsplan")}</Text>
        <Text style={styles.subheader}>
          {projectName} - {planName || "Grundriss"}
        </Text>

        {Object.entries(groupedMarkers)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([groupName, groupMarkers]) => (
            <View key={groupName} style={{ marginBottom: 20 }}>
              <Text style={styles.groupTitle}>Verteiler: {groupName}</Text>
              
              <View style={styles.table}>
                {/* Table Header */}
                <View style={[styles.tableRow, styles.tableRowHeader]} wrap={false}>
                  <View style={[styles.tableColHeader, { width: "10%" }]}>
                    <Text style={styles.tableCellHeader}>{t("stromkreise.table.nr", "Nr.")}</Text>
                  </View>
                  <View style={[styles.tableColHeader, { width: "20%" }]}>
                    <Text style={styles.tableCellHeader}>{t("stromkreise.table.breaker", "Sicherung")}</Text>
                  </View>
                  <View style={[styles.tableColHeader, { width: "15%" }]}>
                    <Text style={styles.tableCellHeader}>{t("stromkreise.table.current", "Nennstrom")}</Text>
                  </View>
                  <View style={[styles.tableColHeader, { width: "15%" }]}>
                    <Text style={styles.tableCellHeader}>{t("stromkreise.table.char", "Charakteristik")}</Text>
                  </View>
                  <View style={[styles.tableColHeader, { width: "15%" }]}>
                    <Text style={styles.tableCellHeader}>{t("stromkreise.table.phase", "Phase")}</Text>
                  </View>
                  <View style={[styles.tableColHeader, { width: "15%" }]}>
                    <Text style={styles.tableCellHeader}>{t("stromkreise.table.rcd", "RCD")}</Text>
                  </View>
                  <View style={[styles.tableColHeader, { width: "10%" }]}>
                    <Text style={styles.tableCellHeader}>{t("stromkreise.table.type", "Typ")}</Text>
                  </View>
                </View>

                {/* Table Rows */}
                {groupMarkers.map((marker: any, idx: number) => (
                  <View key={marker.id || idx} style={styles.tableRow} wrap={false}>
                    <View style={[styles.tableCol, { width: "10%" }]}>
                      <Text style={styles.tableCell}>{marker.circuit_number || idx + 1}</Text>
                    </View>
                    <View style={[styles.tableCol, { width: "20%" }]}>
                      <Text style={[styles.tableCell, { fontWeight: "bold" }]}>{marker.circuit_code}</Text>
                      <Text style={{ fontSize: 7, color: "#64748b", marginTop: 2 }}>{marker.full_name}</Text>
                    </View>
                    <View style={[styles.tableCol, { width: "15%" }]}>
                      <Text style={styles.tableCell}>{marker.breaker_current}A</Text>
                    </View>
                    <View style={[styles.tableCol, { width: "15%" }]}>
                      <Text style={styles.tableCell}>{marker.breaker_curve}</Text>
                    </View>
                    <View style={[styles.tableCol, { width: "15%" }]}>
                      <Text style={styles.tableCell}>
                        {marker.phase === 3
                          ? t("stromkreise.phase.3", "3-Phasen")
                          : t("stromkreise.phase.1", "1-Phase")}
                      </Text>
                    </View>
                    <View style={[styles.tableCol, { width: "15%" }]}>
                      <Text style={styles.tableCell}>
                        {marker.has_rcd ? marker.rcd_group || "Ja" : "Nein"}
                      </Text>
                    </View>
                    <View style={[styles.tableCol, { width: "10%" }]}>
                      <Text style={styles.tableCell}>
                        {t(`stromkreise.type.${marker.type}`, marker.type)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
        ))}
      </Page>
    </Document>
  );
}
