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
  sectionTitle: {
    fontSize: 12,
    marginTop: 15,
    marginBottom: 8,
    fontWeight: "bold",
    color: "#1e3a8a",
    borderBottomColor: "#cbd5e1",
    borderBottomWidth: 1,
    paddingBottom: 3,
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
    marginBottom: 15,
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

export default function StromkreiseEdvPdf({ projectName, planName, edvGroups, translations }: any) {
  const t = (key: string, def: string) => {
    if (translations && translations[key]) return translations[key];
    return def;
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.header}>{t("stromkreise.edv.pdfTitle", "EDV Patchfeld-Belegungsplan")}</Text>
        <Text style={styles.subheader}>
          {projectName} - {planName || "Grundriss"}
        </Text>

        {edvGroups.map((g: any, gIdx: number) => (
          <View key={g.name || gIdx} wrap={false}>
            <Text style={styles.sectionTitle}>{g.name}</Text>
            <View style={styles.table}>
              {/* Table Header */}
              <View style={[styles.tableRow, styles.tableRowHeader]}>
                <View style={[styles.tableColHeader, { width: "20%" }]}>
                  <Text style={styles.tableCellHeader}>{t("stromkreise.edv.port", "Port")}</Text>
                </View>
                <View style={[styles.tableColHeader, { width: "30%" }]}>
                  <Text style={styles.tableCellHeader}>{t("stromkreise.edv.code", "Kennzeichnung / Code")}</Text>
                </View>
                <View style={[styles.tableColHeader, { width: "50%" }]}>
                  <Text style={styles.tableCellHeader}>{t("stromkreise.edv.desc", "Beschreibung / Ort")}</Text>
                </View>
              </View>

              {/* Table Rows */}
              {g.breakers.map((marker: any, idx: number) => (
                <View key={marker.id || idx} style={styles.tableRow}>
                  <View style={[styles.tableCol, { width: "20%" }]}>
                    <Text style={[styles.tableCell, { fontWeight: "bold" }]}>{marker.short_label}</Text>
                  </View>
                  <View style={[styles.tableCol, { width: "30%" }]}>
                    <Text style={styles.tableCell}>{marker.circuit_code}</Text>
                  </View>
                  <View style={[styles.tableCol, { width: "50%" }]}>
                    <Text style={styles.tableCell}>{marker.full_name}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ))}

        {edvGroups.length === 0 && (
          <Text style={{ color: "#64748b", marginTop: 20 }}>
            Keine EDV-Marker auf diesem Plan gefunden.
          </Text>
        )}
      </Page>
    </Document>
  );
}
