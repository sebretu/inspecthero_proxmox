"use client";
import React from "react";
import { Page, Text, View, Document, StyleSheet, Image, Font } from "@react-pdf/renderer";

// Registered fonts or standard ones
const styles = StyleSheet.create({
  page: {
    padding: 40,
    backgroundColor: "#FFFFFF",
    fontFamily: "Helvetica",
  },
  header: {
    marginBottom: 30,
    borderBottomWidth: 2,
    borderBottomColor: "#1e293b",
    paddingBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1e293b",
    textTransform: "uppercase",
  },
  subtitle: {
    fontSize: 10,
    color: "#64748b",
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "bold",
    backgroundColor: "#f1f5f9",
    padding: 8,
    marginTop: 20,
    marginBottom: 10,
    color: "#1e293b",
    textTransform: "uppercase",
  },
  table: {
    display: "flex",
    width: "auto",
    borderStyle: "solid",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  tableRow: {
    flexDirection: "row",
  },
  tableColHeader: {
    width: "25%",
    borderStyle: "solid",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderLeftWidth: 0,
    borderTopWidth: 0,
    backgroundColor: "#f8fafc",
    padding: 5,
  },
  tableCol: {
    width: "25%",
    borderStyle: "solid",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderLeftWidth: 0,
    borderTopWidth: 0,
    padding: 5,
  },
  tableCellHeader: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#475569",
  },
  tableCell: {
    fontSize: 9,
    color: "#1e293b",
  },
  mapSection: {
    marginTop: 30,
    alignItems: "center",
  },
  mapImage: {
    width: "100%",
    maxWidth: 500,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: {
    fontSize: 8,
    color: "#94a3b8",
  },
});

interface BmaReportPdfProps {
  projectName: string;
  devices: any[];
  connections: any[];
  routes: any[];
  translations: any;
}

export default function BmaReportPdf({ projectName, devices, connections, routes, translations }: BmaReportPdfProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>{translations.title || "BMA REPORT"}</Text>
            <Text style={styles.subtitle}>{projectName}</Text>
          </View>
          <Text style={styles.subtitle}>{new Date().toLocaleDateString()}</Text>
        </View>

        <Text style={styles.sectionTitle}>{translations.devices || "Devices"}</Text>
        <View style={styles.table}>
          <View style={styles.tableRow}>
            <View style={[styles.tableColHeader, { width: "40%" }]}>
              <Text style={styles.tableCellHeader}>{translations.deviceName || "Name"}</Text>
            </View>
            <View style={[styles.tableColHeader, { width: "30%" }]}>
              <Text style={styles.tableCellHeader}>{translations.deviceType || "Type"}</Text>
            </View>
            <View style={[styles.tableColHeader, { width: "30%" }]}>
              <Text style={styles.tableCellHeader}>Position (X, Y)</Text>
            </View>
          </View>
          {devices.map((dev, i) => (
            <View key={i} style={styles.tableRow}>
              <View style={[styles.tableCol, { width: "40%" }]}>
                <Text style={styles.tableCell}>{dev.name}</Text>
              </View>
              <View style={[styles.tableCol, { width: "30%" }]}>
                <Text style={styles.tableCell}>{dev.type}</Text>
              </View>
              <View style={[styles.tableCol, { width: "30%" }]}>
                <Text style={styles.tableCell}>{dev.x.toFixed(2)}, {dev.y.toFixed(2)}</Text>
              </View>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>{translations.connections || "Connections"}</Text>
        <View style={styles.table}>
          <View style={styles.tableRow}>
            <View style={[styles.tableColHeader, { width: "30%" }]}>
              <Text style={styles.tableCellHeader}>Connection</Text>
            </View>
            <View style={[styles.tableColHeader, { width: "35%" }]}>
              <Text style={styles.tableCellHeader}>Source</Text>
            </View>
            <View style={[styles.tableColHeader, { width: "35%" }]}>
              <Text style={styles.tableCellHeader}>Target</Text>
            </View>
          </View>
          {routes.map((route, i) => {
            const source = devices.find(d => d.id === route.source_device_id);
            const target = devices.find(d => d.id === route.target_device_id);
            const conn = connections.find(c => c.id === route.connection_id);
            return (
              <View key={i} style={styles.tableRow}>
                <View style={[styles.tableCol, { width: "30%" }]}>
                  <Text style={styles.tableCell}>{conn?.name || "N/A"}</Text>
                </View>
                <View style={[styles.tableCol, { width: "35%" }]}>
                  <Text style={styles.tableCell}>{source?.name || "N/A"}</Text>
                </View>
                <View style={[styles.tableCol, { width: "35%" }]}>
                  <Text style={styles.tableCell}>{target?.name || "N/A"}</Text>
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>InspectHero BMA Automation Report</Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
