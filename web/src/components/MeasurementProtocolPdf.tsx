import React from "react";
import { Document, Page, Text, View, StyleSheet, Font, Image } from "@react-pdf/renderer";
import { MeasurementRow } from "@/lib/measurementGenerator";

// Register Roboto font to support German special characters (like ä, ö, ü, ß)
Font.register({
  family: "Roboto",
  fonts: [
    { src: "https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxP.ttf", fontWeight: 400 },
    { src: "https://fonts.gstatic.com/s/roboto/v30/KFOlCnqEu92Fr1MmWUlfBBc9.ttf", fontWeight: 700 }
  ]
});

const styles = StyleSheet.create({
  // Portrait Page (Page 1)
  portraitPage: {
    padding: 18,
    fontFamily: "Roboto",
    fontSize: 6.8,
    backgroundColor: "#ffffff",
  },
  portraitBorder: {
    borderWidth: 1.2,
    borderColor: "#000000",
    padding: 8,
    height: "100%",
    flexDirection: "column",
    justifyContent: "space-between",
  },
  topHeaderGrid: {
    flexDirection: "row",
    justifyContent: "flex-start",
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#000000",
    width: "60%",
  },
  topHeaderBox: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: "#000000",
    padding: 2,
  },
  topHeaderLabel: {
    fontSize: 5.5,
    fontWeight: "bold",
    color: "#334155",
  },
  topHeaderValue: {
    fontSize: 7,
    fontWeight: "bold",
    marginTop: 1,
  },
  portraitTitle: {
    fontSize: 13,
    fontWeight: "bold",
    textAlign: "center",
    letterSpacing: 0.5,
  },
  portraitSubtitle: {
    fontSize: 7.5,
    textAlign: "center",
    marginBottom: 6,
    color: "#475569",
  },
  
  // Section Title Headers
  sectionTitleBar: {
    backgroundColor: "#d1d5db",
    borderColor: "#000000",
    borderWidth: 1,
    padding: 2.5,
    marginTop: 5,
  },
  sectionTitleText: {
    fontWeight: "bold",
    fontSize: 7.5,
  },

  // Grid Blocks with Borders
  gridBlock: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#000000",
  },
  gridRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#000000",
  },
  gridCell: {
    padding: 3,
    justifyContent: "flex-start",
  },
  cellBorderRight: {
    borderRightWidth: 1,
    borderRightColor: "#000000",
  },
  cellTitle: {
    fontWeight: "bold",
    fontSize: 6.5,
    color: "#334155",
    marginBottom: 2.5,
  },
  cellText: {
    fontSize: 7,
    lineHeight: 1.2,
  },

  // Inline inputs
  inlineCheckboxGroup: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2,
  },
  inlineCheckboxItem: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 4,
    marginBottom: 2,
  },
  pdfCheckbox: {
    width: 6.5,
    height: 6.5,
    borderWidth: 0.8,
    borderColor: "#000000",
    marginRight: 2.5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  pdfCheckboxChecked: {
    fontSize: 5,
    fontWeight: "bold",
    lineHeight: 0.9,
  },
  checkboxLabel: {
    fontSize: 6.2,
  },

  // Besichtigen und Erproben
  checklistTable: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 2,
  },
  checklistItem: {
    width: "33.33%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingRight: 8,
    paddingVertical: 1.2,
  },
  checklistLabel: {
    fontSize: 5.8,
    width: "72%",
  },
  checklistStatusGroup: {
    flexDirection: "row",
    gap: 3.5,
  },

  // Landscape Page (Page 2)
  landscapePage: {
    padding: 18,
    fontFamily: "Roboto",
    fontSize: 6.8,
    backgroundColor: "#ffffff",
  },
  landscapeBorder: {
    borderWidth: 1.2,
    borderColor: "#000000",
    padding: 8,
    height: "100%",
    flexDirection: "column",
    justifyContent: "space-between",
  },
  headerContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1.2,
    borderBottomColor: "#000000",
    paddingBottom: 4,
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: "column",
    gap: 1,
  },
  headerRight: {
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#000000",
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 7,
    color: "#334155",
    fontWeight: "bold",
  },
  companyName: {
    fontSize: 8.5,
    fontWeight: "bold",
    color: "#000000",
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderColor: "#000000",
    borderWidth: 1,
    padding: 5,
    marginBottom: 8,
    backgroundColor: "#f8fafc",
  },
  metaItem: {
    width: "25%",
    marginBottom: 2,
  },
  metaLabel: {
    fontSize: 5.8,
    color: "#475569",
    fontWeight: "bold",
  },
  metaValue: {
    fontSize: 7.8,
    color: "#000000",
    fontWeight: "bold",
    marginTop: 0.5,
  },
  table: {
    width: "100%",
    borderStyle: "solid",
    borderWidth: 1,
    borderColor: "#000000",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#000000",
    minHeight: 13,
    alignItems: "center",
  },
  tableHeaderRow: {
    backgroundColor: "#f1f5f9",
    minHeight: 14,
    alignItems: "center",
  },
  tableHeaderCell: {
    color: "#000000",
    fontWeight: "bold",
    fontSize: 5.8,
    textAlign: "center",
    padding: 0.8,
  },
  tableCell: {
    fontSize: 6.2,
    textAlign: "center",
    padding: 0.8,
    color: "#000000",
  },
  // Column definitions with vertical grid lines
  colNr: { width: "3%", borderRightWidth: 1, borderRightColor: "#000000", height: "100%", justifyContent: "center" },
  colBezeichnung: { width: "23%", textAlign: "left", paddingLeft: 3, borderRightWidth: 1, borderRightColor: "#000000", height: "100%", justifyContent: "center" },
  colKabeltyp: { width: "9%", borderRightWidth: 1, borderRightColor: "#000000", height: "100%", justifyContent: "center" },
  colAbsicherung: { width: "6%", borderRightWidth: 1, borderRightColor: "#000000", height: "100%", justifyContent: "center" },
  colChar: { width: "4%", borderRightWidth: 1, borderRightColor: "#000000", height: "100%", justifyContent: "center" },
  colRiso: { width: "6%", borderRightWidth: 1, borderRightColor: "#000000", height: "100%", justifyContent: "center" },
  colRpe: { width: "5%", borderRightWidth: 1, borderRightColor: "#000000", height: "100%", justifyContent: "center" },
  colZs: { width: "5%", borderRightWidth: 1, borderRightColor: "#000000", height: "100%", justifyContent: "center" },
  colIk: { width: "6%", borderRightWidth: 1, borderRightColor: "#000000", height: "100%", justifyContent: "center" },
  colRcdTyp: { width: "4%", borderRightWidth: 1, borderRightColor: "#000000", height: "100%", justifyContent: "center" },
  colRcdIdn: { width: "6%", borderRightWidth: 1, borderRightColor: "#000000", height: "100%", justifyContent: "center" },
  colRcdTa: { width: "7%", borderRightWidth: 1, borderRightColor: "#000000", height: "100%", justifyContent: "center" },
  colRcdIa: { width: "7%", borderRightWidth: 1, borderRightColor: "#000000", height: "100%", justifyContent: "center" },
  colRcdUb: { width: "5%", borderRightWidth: 1, borderRightColor: "#000000", height: "100%", justifyContent: "center" },
  colErgebnis: { width: "4%", height: "100%", justifyContent: "center" },

  colZvehNr: { width: "2.5%", borderRightWidth: 0.5, borderRightColor: "#000000", height: "100%", justifyContent: "center" },
  colZvehBezeichnung: { width: "15.5%", textAlign: "left", paddingLeft: 3, borderRightWidth: 0.5, borderRightColor: "#000000", height: "100%", justifyContent: "center" },
  colZvehTyp: { width: "5%", borderRightWidth: 0.5, borderRightColor: "#000000", height: "100%", justifyContent: "center" },
  colZvehAnzahl: { width: "3%", borderRightWidth: 0.5, borderRightColor: "#000000", height: "100%", justifyContent: "center" },
  colZvehQuerschnitt: { width: "4%", borderRightWidth: 0.5, borderRightColor: "#000000", height: "100%", justifyContent: "center" },
  colZvehHpa: { width: "4%", borderRightWidth: 0.5, borderRightColor: "#000000", height: "100%", justifyContent: "center" },
  colZvehZpa: { width: "4%", borderRightWidth: 0.5, borderRightColor: "#000000", height: "100%", justifyContent: "center" },
  colZvehRiso: { width: "6%", borderRightWidth: 0.5, borderRightColor: "#000000", height: "100%", justifyContent: "center" },
  colZvehChar: { width: "5%", borderRightWidth: 0.5, borderRightColor: "#000000", height: "100%", justifyContent: "center" },
  colZvehIn: { width: "4%", borderRightWidth: 0.5, borderRightColor: "#000000", height: "100%", justifyContent: "center" },
  colZvehAusloese: { width: "4%", borderRightWidth: 0.5, borderRightColor: "#000000", height: "100%", justifyContent: "center" },
  colZvehZsIk: { width: "6%", borderRightWidth: 0.5, borderRightColor: "#000000", height: "100%", justifyContent: "center" },
  colZvehZlIk: { width: "6%", borderRightWidth: 0.5, borderRightColor: "#000000", height: "100%", justifyContent: "center" },
  colZvehRcdInArt: { width: "5.5%", borderRightWidth: 0.5, borderRightColor: "#000000", height: "100%", justifyContent: "center" },
  colZvehRcdIdn: { width: "4.5%", borderRightWidth: 0.5, borderRightColor: "#000000", height: "100%", justifyContent: "center" },
  colZvehRcdId: { width: "4%", borderRightWidth: 0.5, borderRightColor: "#000000", height: "100%", justifyContent: "center" },
  colZvehRcdTa: { width: "4.5%", borderRightWidth: 0.5, borderRightColor: "#000000", height: "100%", justifyContent: "center" },
  colZvehRcdTd: { width: "4.5%", borderRightWidth: 0.5, borderRightColor: "#000000", height: "100%", justifyContent: "center" },
  colZvehRcdUc: { width: "4%", borderRightWidth: 0.5, borderRightColor: "#000000", height: "100%", justifyContent: "center" },
  colZvehFehlercode: { width: "4%", height: "100%", justifyContent: "center" },

  footerContainer: {
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  commentsBox: {
    width: "60%",
    borderColor: "#000000",
    borderWidth: 1,
    padding: 4,
    backgroundColor: "#f8fafc",
  },
  commentsTitle: {
    fontWeight: "bold",
    fontSize: 6.5,
    color: "#000000",
    marginBottom: 1,
  },
  commentsText: {
    fontSize: 6.5,
    color: "#000000",
    lineHeight: 1.1,
  },
  signaturesBox: {
    width: "38%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingTop: 4,
  },
  signatureLine: {
    width: "48%",
    borderTopWidth: 1,
    borderTopColor: "#000000",
    paddingTop: 1.5,
    alignItems: "center",
  },
  signatureLabel: {
    fontSize: 5.5,
    color: "#475569",
    fontWeight: "bold",
  }
});

// Helper Checkbox Component
const Checkbox: React.FC<{ checked: boolean; label?: string }> = ({ checked, label }) => (
  <View style={styles.inlineCheckboxItem}>
    <View style={styles.pdfCheckbox}>
      {checked && <Text style={styles.pdfCheckboxChecked}>X</Text>}
    </View>
    {label && <Text style={styles.checkboxLabel}>{label}</Text>}
  </View>
);

// Helper IO / NIO Status Box
const StatusBox: React.FC<{ status: "io" | "nio" | "none"; type: "io" | "nio"; label: string }> = ({ status, type, label }) => {
  const isChecked = status === type;
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <View style={[styles.pdfCheckbox, { width: 5.5, height: 5.5, marginRight: 1.5 }]}>
        {isChecked && <Text style={{ fontSize: 4.5, fontWeight: "bold", lineHeight: 0.8 }}>X</Text>}
      </View>
      <Text style={{ fontSize: 5.2 }}>{label}</Text>
    </View>
  );
};

export interface CoverPageData {
  kundenNr: string;
  prueferSignatureBase64?: string;
  pruefprotokollNr: string;
  auftragNr: string;
  auftraggeber: string;
  auftragnehmer: string;
  anlage: string;
  
  // Grund der Prüfung
  grundNeuanlage: boolean;
  grundInstandsetzung: boolean;
  grundAenderung: boolean;
  grundWiederholung: boolean;
  grundErweiterung: boolean;
  grundSonstiges: string;

  // Prüfung nach
  nachVde0100: boolean;
  nachVde0105: boolean;
  nachDguv: boolean;
  nachEcheck: boolean;
  nachSonstiges: string;

  beginnDatum: string;
  endeDatum: string;

  // Messgeräte
  messgeraetModel1: string;
  messgeraetSerien1: string;
  messgeraetModel2: string;
  messgeraetSerien2: string;
  messgeraetModel3: string;
  messgeraetSerien3: string;

  beauftragterKunde: string;
  prueferName: string;

  // Netz
  netzformTnc: boolean;
  netzformTncs: boolean;
  netzformTns: boolean;
  netzformTt: boolean;
  netzformIt: boolean;
  netzSpannung: string;
  evuvnb: string;

  // Besichtigen Checklist (io / nio / none)
  besichtigenAuswahl: "io" | "nio" | "none";
  besichtigenTrenn: "io" | "nio" | "none";
  besichtigenBrand: "io" | "nio" | "none";
  besichtigenKabel: "io" | "nio" | "none";
  besichtigenGebaeude: "io" | "nio" | "none";
  besichtigenKennzeichnung: "io" | "nio" | "none";
  besichtigenLeiter: "io" | "nio" | "none";
  besichtigenVerbindungen: "io" | "nio" | "none";
  besichtigenSchutzDirekt: "io" | "nio" | "none";
  besichtigenSchutzUeberwachung: "io" | "nio" | "none";
  besichtigenZugaenglichkeit: "io" | "nio" | "none";
  besichtigenHauptpotentialausgleich: "io" | "nio" | "none";
  besichtigenZusPotentialausgleich: "io" | "nio" | "none";
  besichtigenDokumentation: "io" | "nio" | "none";
  besichtigenErgaenzungsblaetter: "io" | "nio" | "none";

  // Erproben Checklist (io / nio / none)
  erprobenFunktion: "io" | "nio" | "none";
  erprobenRcd: "io" | "nio" | "none";
  erprobenSchutzSicherheit: "io" | "nio" | "none";
  erprobenDrehrichtung: "io" | "nio" | "none";
  erprobenRechtsfeld: "io" | "nio" | "none";
  erprobenGebaeude: "io" | "nio" | "none";

  // Erdung & Schutzleiter
  schtzleiterDurchgaengig: boolean;
  erdungswiderstand: string;
  potFundamenterder: boolean;
  potSchiene: boolean;
  potWasserzaehler: boolean;
  potHauptwasser: boolean;
  potHauptschutzleiter: boolean;
  potGas: boolean;
  potHeizung: boolean;
  potKlima: boolean;
  potAufzug: boolean;
  potEdv: boolean;
  potTelefon: boolean;
  potBlitzschutz: boolean;
  potAntenne: boolean;
  potGebaeudekonstr: boolean;
  potSonstiges: string;

  // Ergebnis
  keineMaengel: boolean;
  maengelFestgestellt: boolean;
  naechsterTermin: string;
  plaketteJa: boolean;
  plaketteNein: boolean;
  kundeUebernommen: boolean;
  kundeZustandsbericht: boolean;
  kundeOrt: string;
  kundeDatum: string;
  prueferOrt: string;
  prueferDatum: string;
  entsprichtVDE: boolean;
}

interface MeasurementProtocolPdfProps {
  rows: MeasurementRow[];
  customer: string;
  location: string;
  boardName: string;
  inspector: string;
  date: string;
  testerDevice: string;
  networkForm: string;
  comments: string;
  coverData?: CoverPageData;
  einspeisungRows?: any[];
  einspeisungVerteilerName?: string;
  einspeisungRisoMit?: boolean;
}

export const MeasurementProtocolPdf: React.FC<MeasurementProtocolPdfProps> = ({
  rows,
  customer,
  location,
  boardName,
  inspector,
  date,
  testerDevice,
  networkForm,
  comments,
  coverData,
  einspeisungRows,
  einspeisungVerteilerName = "Einspeisung",
  einspeisungRisoMit = false
}) => {
  // Default values fallback
  const d = coverData || {
    kundenNr: "", pruefprotokollNr: "", auftragNr: "",
    auftraggeber: customer || "bt building technologies GmbH\nAm Gleisdreieck 1-5\n50823 Köln",
    auftragnehmer: "EtecProjekt+Bau GmbH\nHeinrich-Hertz-Straße 22a\n40699 Erkrath",
    anlage: location || boardName || "UV SV (Untersuchungsräume)",
    grundNeuanlage: true, grundInstandsetzung: false, grundAenderung: false, grundWiederholung: false, grundErweiterung: false, grundSonstiges: "",
    nachVde0100: true, nachVde0105: false, nachDguv: false, nachEcheck: false, nachSonstiges: "",
    beginnDatum: date, endeDatum: date,
    messgeraetModel1: testerDevice || "IT 130", messgeraetSerien1: "19352355",
    messgeraetModel2: "", messgeraetSerien2: "", messgeraetModel3: "", messgeraetSerien3: "",
    beauftragterKunde: "", prueferName: inspector || "Tomasz Puskarz",
    netzformTnc: false, netzformTncs: false, netzformTns: networkForm === "TN-S", netzformTt: false, netzformIt: false,
    netzSpannung: "400V / 230V", evuvnb: "RheinEnergie AG",
    besichtigenAuswahl: "io", besichtigenTrenn: "io", besichtigenBrand: "none", besichtigenKabel: "io", besichtigenGebaeude: "none",
    besichtigenKennzeichnung: "io", besichtigenLeiter: "io", besichtigenVerbindungen: "io", besichtigenSchutzDirekt: "io", besichtigenSchutzUeberwachung: "none",
    besichtigenZugaenglichkeit: "io", besichtigenHauptpotentialausgleich: "io", besichtigenZusPotentialausgleich: "io", besichtigenDokumentation: "io", besichtigenErgaenzungsblaetter: "none",
    erprobenFunktion: "io", erprobenRcd: "io", erprobenSchutzSicherheit: "none", erprobenDrehrichtung: "none", erprobenRechtsfeld: "none", erprobenGebaeude: "none",
    schtzleiterDurchgaengig: true, erdungswiderstand: "",
    potFundamenterder: false, potSchiene: true, potWasserzaehler: false, potHauptwasser: true, potHauptschutzleiter: true,
    potGas: false, potHeizung: false, potKlima: false, potAufzug: false, potEdv: false, potTelefon: false, potBlitzschutz: false, potAntenne: false, potGebaeudekonstr: false, potSonstiges: "",
    keineMaengel: true, maengelFestgestellt: false, naechsterTermin: "", plaketteJa: true, plaketteNein: false,
    kundeUebernommen: true, kundeZustandsbericht: false, kundeOrt: "", kundeDatum: "",
    prueferOrt: "Erkrath", prueferDatum: date, entsprichtVDE: true
  } as CoverPageData;

  const totalPages = 2 + Math.ceil(rows.length / 28);

  const defaultEinspeisungRows = [
    {
      nr: 1,
      bezeichnung: "SICHERUNG1",
      kabeltyp: "",
      absicherung: "",
      charakteristik: "",
      rIso: "",
      rPe: "",
      zS: "",
      iK: "",
      rcdTyp: "",
      rcdIdn: "",
      rcdTa: "",
      rcdIa: "",
      rcdUb: "",
      ergebnis: ""
    },
    {
      nr: 2,
      bezeichnung: "MESSPUNKT1",
      kabeltyp: "",
      absicherung: "63",
      charakteristik: "gL/gG",
      rIso: ">999",
      rPe: "",
      zS: "0.29",
      iK: "790",
      rcdTyp: "",
      rcdIdn: "",
      rcdTa: "",
      rcdIa: "",
      rcdUb: "",
      ergebnis: "ok"
    },
    {
      nr: 3,
      bezeichnung: "MESSPUNKT2",
      kabeltyp: "",
      absicherung: "63",
      charakteristik: "gL/gG",
      rIso: ">999",
      rPe: "",
      zS: "0.28",
      iK: "824",
      rcdTyp: "",
      rcdIdn: "",
      rcdTa: "",
      rcdIa: "",
      rcdUb: "",
      ergebnis: "ok"
    },
    {
      nr: 4,
      bezeichnung: "MESSPUNKT3",
      kabeltyp: "",
      absicherung: "63",
      charakteristik: "gL/gG",
      rIso: ">999",
      rPe: "",
      zS: "0.28",
      iK: "811",
      rcdTyp: "",
      rcdIdn: "",
      rcdTa: "",
      rcdIa: "",
      rcdUb: "",
      ergebnis: "ok"
    }
  ];

  const finalEinspeisungRows = einspeisungRows || defaultEinspeisungRows;

  return (
    <Document>
      {/* PAGE 1: PORTRAIT COVER SHEET */}
      <Page size="A4" style={styles.portraitPage}>
        <View style={styles.portraitBorder}>
          {/* Top metadata boxes */}
          <View style={styles.topHeaderGrid}>
            <View style={styles.topHeaderBox}>
              <Text style={styles.topHeaderLabel}>Kunden Nr.:</Text>
              <Text style={styles.topHeaderValue}>{d.kundenNr}</Text>
            </View>
            <View style={styles.topHeaderBox}>
              <Text style={styles.topHeaderLabel}>Prüfprotokoll Nr.:</Text>
              <Text style={styles.topHeaderValue}>{d.pruefprotokollNr}</Text>
            </View>
            <View style={[styles.topHeaderBox, { borderRightWidth: 0 }]}>
              <Text style={styles.topHeaderLabel}>Auftrag Nr.:</Text>
              <Text style={styles.topHeaderValue}>{d.auftragNr}</Text>
            </View>
          </View>

          {/* Title */}
          <Text style={styles.portraitTitle}>PRÜFUNG ELEKTRISCHER ANLAGEN</Text>
          <Text style={styles.portraitSubtitle}>Gemäß ZVEH</Text>

          {/* SECTION 1: ALLGEMEINE ANGABEN */}
          <View style={styles.sectionTitleBar}>
            <Text style={styles.sectionTitleText}>ALLGEMEINE ANGABEN</Text>
          </View>
          <View style={styles.gridBlock}>
            {/* Row 1: Auftraggeber / Auftragnehmer */}
            <View style={styles.gridRow}>
              <View style={[styles.gridCell, styles.cellBorderRight, { flex: 1, height: 50 }]}>
                <Text style={styles.cellTitle}>Auftraggeber:</Text>
                <Text style={styles.cellText}>{d.auftraggeber}</Text>
              </View>
              <View style={[styles.gridCell, { flex: 1, height: 50 }]}>
                <Text style={styles.cellTitle}>Auftragnehmer:</Text>
                <Text style={styles.cellText}>{d.auftragnehmer}</Text>
              </View>
            </View>

            {/* Row 2: Anlage */}
            <View style={styles.gridRow}>
              <View style={[styles.gridCell, { flex: 1, paddingVertical: 4 }]}>
                <Text style={styles.cellText}><Text style={{ fontWeight: "bold" }}>Anlage: </Text>{d.anlage}</Text>
              </View>
            </View>

            {/* Row 3: Grund der Prüfung / Prüfung nach / Beginn-Ende */}
            <View style={styles.gridRow}>
              {/* Grund */}
              <View style={[styles.gridCell, styles.cellBorderRight, { flex: 1.1 }]}>
                <Text style={styles.cellTitle}>Grund der Prüfung:</Text>
                <View style={styles.inlineCheckboxGroup}>
                  <Checkbox checked={d.grundNeuanlage} label="Neuanlage" />
                  <Checkbox checked={d.grundInstandsetzung} label="Instandsetzung" />
                  <Checkbox checked={d.grundAenderung} label="Änderung" />
                  <Checkbox checked={d.grundWiederholung} label="Wiederholungsprüfung" />
                  <Checkbox checked={d.grundErweiterung} label="Erweiterung" />
                  {d.grundSonstiges && <Checkbox checked={true} label={d.grundSonstiges} />}
                </View>
              </View>
              {/* Nach / Termine */}
              <View style={[styles.gridCell, { flex: 0.9 }]}>
                <Text style={styles.cellTitle}>Prüfung nach:</Text>
                <View style={styles.inlineCheckboxGroup}>
                  <Checkbox checked={d.nachVde0100} label="VDE 0100-600" />
                  <Checkbox checked={d.nachVde0105} label="VDE 0105-100" />
                  <Checkbox checked={d.nachDguv} label="DGUV V3" />
                  <Checkbox checked={d.nachEcheck} label="E-CHECK" />
                </View>
                <View style={{ marginTop: 4, flexDirection: "row", gap: 8 }}>
                  <Text style={{ fontSize: 6.2 }}><Text style={{ fontWeight: "bold" }}>Beginn:</Text> {d.beginnDatum}</Text>
                  <Text style={{ fontSize: 6.2 }}><Text style={{ fontWeight: "bold" }}>Ende:</Text> {d.endeDatum}</Text>
                </View>
              </View>
            </View>

            {/* Row 4: Verwendete Messgeräte */}
            <View style={styles.gridRow}>
              <View style={[styles.gridCell, { flex: 1, paddingVertical: 4 }]}>
                <Text style={styles.cellTitle}>Verwendete Messgeräte:</Text>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontSize: 6.2 }}><Text style={{ fontWeight: "bold" }}>1. Model:</Text> {d.messgeraetModel1 || "—"}  <Text style={{ fontWeight: "bold" }}>Serien-Nr.:</Text> {d.messgeraetSerien1 || "—"}</Text>
                  <Text style={{ fontSize: 6.2 }}><Text style={{ fontWeight: "bold" }}>2. Model:</Text> {d.messgeraetModel2 || "—"}  <Text style={{ fontWeight: "bold" }}>Serien-Nr.:</Text> {d.messgeraetSerien2 || "—"}</Text>
                  <Text style={{ fontSize: 6.2 }}><Text style={{ fontWeight: "bold" }}>3. Model:</Text> {d.messgeraetModel3 || "—"}  <Text style={{ fontWeight: "bold" }}>Serien-Nr.:</Text> {d.messgeraetSerien3 || "—"}</Text>
                </View>
              </View>
            </View>

            {/* Row 5: Beauftragter / Prüfer */}
            <View style={styles.gridRow}>
              <View style={[styles.gridCell, styles.cellBorderRight, { flex: 1.2 }]}>
                <Text style={styles.cellTitle}>Beauftragter des Auftraggebers:</Text>
                <Text style={styles.cellText}>{d.beauftragterKunde || "—"}</Text>
              </View>
              <View style={[styles.gridCell, { flex: 0.8 }]}>
                <Text style={styles.cellTitle}>Prüfer:</Text>
                <Text style={styles.cellText}>{d.prueferName}</Text>
              </View>
            </View>

            {/* Row 6: Netzform / Spannung / EVU */}
            <View style={[styles.gridRow, { borderBottomWidth: 0 }]}>
              <View style={[styles.gridCell, styles.cellBorderRight, { flex: 1 }]}>
                <Text style={styles.cellTitle}>Netzform:</Text>
                <View style={styles.inlineCheckboxGroup}>
                  <Checkbox checked={d.netzformTnc} label="TN-C" />
                  <Checkbox checked={d.netzformTncs} label="TN-C-S" />
                  <Checkbox checked={d.netzformTns} label="TN-S" />
                  <Checkbox checked={d.netzformTt} label="TT" />
                  <Checkbox checked={d.netzformIt} label="IT" />
                </View>
              </View>
              <View style={[styles.gridCell, styles.cellBorderRight, { flex: 0.5 }]}>
                <Text style={styles.cellTitle}>Netz:</Text>
                <Text style={styles.cellText}>{d.netzSpannung}</Text>
              </View>
              <View style={[styles.gridCell, { flex: 0.5 }]}>
                <Text style={styles.cellTitle}>EVU/VNB:</Text>
                <Text style={styles.cellText}>{d.evuvnb}</Text>
              </View>
            </View>
          </View>

          {/* SECTION 2: BESICHTIGEN UND ERPROBEN */}
          <View style={styles.sectionTitleBar}>
            <Text style={styles.sectionTitleText}>BESICHTIGEN UND ERPROBEN</Text>
          </View>
          <View style={styles.gridBlock}>
            {/* Visual checks container */}
            <View style={{ padding: 4 }}>
              <Text style={{ fontWeight: "bold", fontSize: 6.5, marginBottom: 2 }}>Besichtigen:</Text>
              <View style={styles.checklistTable}>
                {/* 1 */}
                <View style={styles.checklistItem}>
                  <Text style={styles.checklistLabel}>Auswahl der Betriebsmittel</Text>
                  <View style={styles.checklistStatusGroup}>
                    <StatusBox status={d.besichtigenAuswahl} type="io" label="i.O" />
                    <StatusBox status={d.besichtigenAuswahl} type="nio" label="n.i.O" />
                  </View>
                </View>
                {/* 2 */}
                <View style={styles.checklistItem}>
                  <Text style={styles.checklistLabel}>Kennzeichnung, Stromkreis</Text>
                  <View style={styles.checklistStatusGroup}>
                    <StatusBox status={d.besichtigenKennzeichnung} type="io" label="i.O" />
                    <StatusBox status={d.besichtigenKennzeichnung} type="nio" label="n.i.O" />
                  </View>
                </View>
                {/* 3 */}
                <View style={styles.checklistItem}>
                  <Text style={styles.checklistLabel}>Zugänglichkeit</Text>
                  <View style={styles.checklistStatusGroup}>
                    <StatusBox status={d.besichtigenZugaenglichkeit} type="io" label="i.O" />
                    <StatusBox status={d.besichtigenZugaenglichkeit} type="nio" label="n.i.O" />
                  </View>
                </View>
                {/* 4 */}
                <View style={styles.checklistItem}>
                  <Text style={styles.checklistLabel}>Trenn- und Schaltgeräte</Text>
                  <View style={styles.checklistStatusGroup}>
                    <StatusBox status={d.besichtigenTrenn} type="io" label="i.O" />
                    <StatusBox status={d.besichtigenTrenn} type="nio" label="n.i.O" />
                  </View>
                </View>
                {/* 5 */}
                <View style={styles.checklistItem}>
                  <Text style={styles.checklistLabel}>Kennzeichnung N- und PE</Text>
                  <View style={styles.checklistStatusGroup}>
                    <StatusBox status={d.besichtigenLeiter} type="io" label="i.O" />
                    <StatusBox status={d.besichtigenLeiter} type="nio" label="n.i.O" />
                  </View>
                </View>
                {/* 6 */}
                <View style={styles.checklistItem}>
                  <Text style={styles.checklistLabel}>Hauptpotentialausgleich</Text>
                  <View style={styles.checklistStatusGroup}>
                    <StatusBox status={d.besichtigenHauptpotentialausgleich} type="io" label="i.O" />
                    <StatusBox status={d.besichtigenHauptpotentialausgleich} type="nio" label="n.i.O" />
                  </View>
                </View>
                {/* 7 */}
                <View style={styles.checklistItem}>
                  <Text style={styles.checklistLabel}>Brandabschottungen</Text>
                  <View style={styles.checklistStatusGroup}>
                    <StatusBox status={d.besichtigenBrand} type="io" label="i.O" />
                    <StatusBox status={d.besichtigenBrand} type="nio" label="n.i.O" />
                  </View>
                </View>
                {/* 8 */}
                <View style={styles.checklistItem}>
                  <Text style={styles.checklistLabel}>Leiterverbindungen</Text>
                  <View style={styles.checklistStatusGroup}>
                    <StatusBox status={d.besichtigenVerbindungen} type="io" label="i.O" />
                    <StatusBox status={d.besichtigenVerbindungen} type="nio" label="n.i.O" />
                  </View>
                </View>
                {/* 9 */}
                <View style={styles.checklistItem}>
                  <Text style={styles.checklistLabel}>Zus. örtl. Potentialausgleich</Text>
                  <View style={styles.checklistStatusGroup}>
                    <StatusBox status={d.besichtigenZusPotentialausgleich} type="io" label="i.O" />
                    <StatusBox status={d.besichtigenZusPotentialausgleich} type="nio" label="n.i.O" />
                  </View>
                </View>
                {/* 10 */}
                <View style={styles.checklistItem}>
                  <Text style={styles.checklistLabel}>Kabel, Leitungen, Schienen</Text>
                  <View style={styles.checklistStatusGroup}>
                    <StatusBox status={d.besichtigenKabel} type="io" label="i.O" />
                    <StatusBox status={d.besichtigenKabel} type="nio" label="n.i.O" />
                  </View>
                </View>
                {/* 11 */}
                <View style={styles.checklistItem}>
                  <Text style={styles.checklistLabel}>Schutz gegen direktes Berühren</Text>
                  <View style={styles.checklistStatusGroup}>
                    <StatusBox status={d.besichtigenSchutzDirekt} type="io" label="i.O" />
                    <StatusBox status={d.besichtigenSchutzDirekt} type="nio" label="n.i.O" />
                  </View>
                </View>
                {/* 12 */}
                <View style={styles.checklistItem}>
                  <Text style={styles.checklistLabel}>Dokumentation</Text>
                  <View style={styles.checklistStatusGroup}>
                    <StatusBox status={d.besichtigenDokumentation} type="io" label="i.O" />
                    <StatusBox status={d.besichtigenDokumentation} type="nio" label="n.i.O" />
                  </View>
                </View>
                {/* 13 */}
                <View style={styles.checklistItem}>
                  <Text style={styles.checklistLabel}>Gebäudesystemtechnik</Text>
                  <View style={styles.checklistStatusGroup}>
                    <StatusBox status={d.besichtigenGebaeude} type="io" label="i.O" />
                    <StatusBox status={d.besichtigenGebaeude} type="nio" label="n.i.O" />
                  </View>
                </View>
                {/* 14 */}
                <View style={styles.checklistItem}>
                  <Text style={styles.checklistLabel}>Schutz- u. Überwachungseinr.</Text>
                  <View style={styles.checklistStatusGroup}>
                    <StatusBox status={d.besichtigenSchutzUeberwachung} type="io" label="i.O" />
                    <StatusBox status={d.besichtigenSchutzUeberwachung} type="nio" label="n.i.O" />
                  </View>
                </View>
                {/* 15 */}
                <View style={styles.checklistItem}>
                  <Text style={styles.checklistLabel}>Siehe Ergänzungsblätter</Text>
                  <View style={styles.checklistStatusGroup}>
                    <StatusBox status={d.besichtigenErgaenzungsblaetter} type="io" label="i.O" />
                    <StatusBox status={d.besichtigenErgaenzungsblaetter} type="nio" label="n.i.O" />
                  </View>
                </View>
              </View>

              <View style={{ borderTopWidth: 0.8, borderTopColor: "#000000", marginTop: 3, paddingTop: 2 }}>
                <Text style={{ fontWeight: "bold", fontSize: 6.5, marginBottom: 2 }}>Erproben:</Text>
                <View style={styles.checklistTable}>
                  <View style={styles.checklistItem}>
                    <Text style={styles.checklistLabel}>Funktionsprüfung der Anlage</Text>
                    <View style={styles.checklistStatusGroup}>
                      <StatusBox status={d.erprobenFunktion} type="io" label="i.O" />
                      <StatusBox status={d.erprobenFunktion} type="nio" label="n.i.O" />
                    </View>
                  </View>
                  <View style={styles.checklistItem}>
                    <Text style={styles.checklistLabel}>Funktion Schutz-/Sicherheit</Text>
                    <View style={styles.checklistStatusGroup}>
                      <StatusBox status={d.erprobenSchutzSicherheit} type="io" label="i.O" />
                      <StatusBox status={d.erprobenSchutzSicherheit} type="nio" label="n.i.O" />
                    </View>
                  </View>
                  <View style={styles.checklistItem}>
                    <Text style={styles.checklistLabel}>Rechtsfeld Drehstromstd.</Text>
                    <View style={styles.checklistStatusGroup}>
                      <StatusBox status={d.erprobenRechtsfeld} type="io" label="i.O" />
                      <StatusBox status={d.erprobenRechtsfeld} type="nio" label="n.i.O" />
                    </View>
                  </View>
                  <View style={styles.checklistItem}>
                    <Text style={styles.checklistLabel}>FI-Schutzschalter (RCD)</Text>
                    <View style={styles.checklistStatusGroup}>
                      <StatusBox status={d.erprobenRcd} type="io" label="i.O" />
                      <StatusBox status={d.erprobenRcd} type="nio" label="n.i.O" />
                    </View>
                  </View>
                  <View style={styles.checklistItem}>
                    <Text style={styles.checklistLabel}>Drehrichtung der Motoren</Text>
                    <View style={styles.checklistStatusGroup}>
                      <StatusBox status={d.erprobenDrehrichtung} type="io" label="i.O" />
                      <StatusBox status={d.erprobenDrehrichtung} type="nio" label="n.i.O" />
                    </View>
                  </View>
                  <View style={styles.checklistItem}>
                    <Text style={styles.checklistLabel}>Gebäudesystemtechnik</Text>
                    <View style={styles.checklistStatusGroup}>
                      <StatusBox status={d.erprobenGebaeude} type="io" label="i.O" />
                      <StatusBox status={d.erprobenGebaeude} type="nio" label="n.i.O" />
                    </View>
                  </View>
                </View>
              </View>
            </View>
          </View>

          {/* SECTION 3: SCHUTZLEITERDURCHGÄNGIGKEIT, POTENTIALAUSGLEICH UND ERDUNG */}
          <View style={styles.sectionTitleBar}>
            <Text style={styles.sectionTitleText}>SCHUTZLEITERDURCHGÄNGIGKEIT, POTENTIALAUSGLEICH UND ERDUNG</Text>
          </View>
          <View style={styles.gridBlock}>
            <View style={styles.gridRow}>
              <View style={[styles.gridCell, styles.cellBorderRight, { flex: 1, paddingVertical: 2.5 }]}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text style={{ fontSize: 6.5, fontWeight: "bold" }}>{"Durchgängigkeit des Schutzleiters (<= 1 Ohm):"}</Text>
                  <View style={{ marginLeft: 6 }}>
                    <Checkbox checked={d.schtzleiterDurchgaengig} />
                  </View>
                </View>
              </View>
              <View style={[styles.gridCell, { flex: 1, paddingVertical: 2.5 }]}>
                <Text style={{ fontSize: 6.5, fontWeight: "bold" }}>Erdungswiderstand:  <Text style={{ fontWeight: "normal" }}>{d.erdungswiderstand ? `${d.erdungswiderstand} Ohm` : "— Ohm"}</Text></Text>
              </View>
            </View>

            <View style={[styles.gridRow, { borderBottomWidth: 0, padding: 3 }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cellTitle}>{"Durchgängigkeit Potentialausgleich (<= 1 Ohm) geprüft bei:"}</Text>
                <View style={styles.inlineCheckboxGroup}>
                  <Checkbox checked={d.potFundamenterder} label="Fundamenterder" />
                  <Checkbox checked={d.potSchiene} label="Potentialausgleichsschiene" />
                  <Checkbox checked={d.potWasserzaehler} label="Wasserzwischenzähler" />
                  <Checkbox checked={d.potHauptwasser} label="Hauptwasserleitung" />
                  <Checkbox checked={d.potHauptschutzleiter} label="Hauptschutzleiter" />
                  <Checkbox checked={d.potGas} label="Gasinnenleitung" />
                  <Checkbox checked={d.potHeizung} label="Heizungsanlage" />
                  <Checkbox checked={d.potKlima} label="Klimaanlage" />
                  <Checkbox checked={d.potAufzug} label="Aufzugsanlage" />
                  <Checkbox checked={d.potEdv} label="EDV Anlage" />
                  <Checkbox checked={d.potTelefon} label="Telefonanlage" />
                  <Checkbox checked={d.potBlitzschutz} label="Blitzschutzanlage" />
                  <Checkbox checked={d.potAntenne} label="Antennenanlage/BK" />
                  <Checkbox checked={d.potGebaeudekonstr} label="Gebäudekonstruktion" />
                  {d.potSonstiges && <Checkbox checked={true} label={d.potSonstiges} />}
                </View>
              </View>
            </View>
          </View>

          {/* SECTION 4: PRÜFERGEBNIS */}
          <View style={styles.sectionTitleBar}>
            <Text style={styles.sectionTitleText}>PRÜFERGEBNIS</Text>
          </View>
          <View style={[styles.gridBlock, { borderBottomWidth: 0 }]}>
            {/* Verdict */}
            <View style={styles.gridRow}>
              <View style={[styles.gridCell, styles.cellBorderRight, { flex: 1.1 }]}>
                <View style={styles.inlineCheckboxGroup}>
                  <Checkbox checked={d.keineMaengel} label="keine Mängel festgestellt" />
                  <Checkbox checked={d.maengelFestgestellt} label="Mängel festgestellt" />
                </View>
              </View>
              <View style={[styles.gridCell, { flex: 0.9 }]}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ fontSize: 6.2 }}><Text style={{ fontWeight: "bold" }}>Nächster Prüftermin:</Text> {d.naechsterTermin || "—"}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={{ fontSize: 6.2, fontWeight: "bold", marginRight: 3 }}>Plakette:</Text>
                    <Checkbox checked={d.plaketteJa} label="JA" />
                    <Checkbox checked={d.plaketteNein} label="NEIN" />
                  </View>
                </View>
              </View>
            </View>

            {/* Bottom details */}
            <View style={[styles.gridRow, { borderBottomWidth: 0 }]}>
              {/* Kunde section */}
              <View style={[styles.gridCell, styles.cellBorderRight, { flex: 1, height: 75, justifyContent: "space-between" }]}>
                <Text style={styles.cellTitle}>Auftraggeber:</Text>
                <View style={{ gap: 2 }}>
                  <Checkbox checked={d.kundeUebernommen} label="Gemäß Übergabebericht Anlage übernommen" />
                  <Checkbox checked={d.kundeZustandsbericht} label="Zustandsbericht erhalten" />
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between", fontSize: 6.2, marginTop: 4 }}>
                  <Text>Ort: {d.kundeOrt || "—"}</Text>
                  <Text>Datum: {d.kundeDatum || "—"}</Text>
                </View>
              </View>

              {/* Prüfer section */}
              <View style={[styles.gridCell, { flex: 1, height: 75, justifyContent: "space-between", position: "relative" }]}>
                <Text style={styles.cellTitle}>Prüfer:</Text>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text style={{ fontSize: 6.2 }}>Elektrische Anlage </Text>
                  <Checkbox checked={d.entsprichtVDE} label="entspricht" />
                  <Checkbox checked={!d.entsprichtVDE} label="entspricht nicht" />
                </View>
                <Text style={{ fontSize: 6.2 }}>den anerkannten Regeln der Elektrotechnik.</Text>
                <View style={{ flexDirection: "row", justifyContent: "space-between", fontSize: 6.2, marginTop: 4 }}>
                  <Text>Ort: {d.prueferOrt || "—"}</Text>
                  <Text>Datum: {d.prueferDatum || "—"}</Text>
                </View>
                {d.prueferSignatureBase64 && (
                  <Image
                    src={d.prueferSignatureBase64}
                    style={{
                      position: "absolute",
                      right: 15,
                      bottom: 12,
                      width: 80,
                      height: 35,
                      objectFit: "contain"
                    }}
                  />
                )}
              </View>
            </View>
          </View>

          {/* Page Footer */}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, borderTopColor: "#000000", paddingTop: 4, marginTop: 6 }}>
            <Checkbox checked={true} label="Anlagen" />
            <Text style={{ fontWeight: "bold", fontSize: 7 }}>Prüfprotokoll - Blatt 1</Text>
            <Text style={{ fontSize: 6, color: "#64748b" }}>Inhaber: Marcin Slapinski</Text>
            <Text style={{ fontSize: 7 }}>Seite 1 / {totalPages}</Text>
          </View>
        </View>
      </Page>

      {/* PAGE 2: EISPEISUNG LANDSCAPE TABLE */}
      <Page size="A4" orientation="landscape" style={styles.landscapePage}>
        <View style={styles.landscapeBorder}>
          {/* HEADER */}
          <View style={styles.headerContainer}>
            <View style={styles.headerLeft}>
              <Text style={styles.title}>PRÜFPROTOKOLL ÜBER DIE PRÜFUNG EINER ELEKTRISCHEN ANLAGE</Text>
              <Text style={styles.subtitle}>
                Messprotokoll nach DIN VDE 0100-600 / DIN VDE 0105-100 (E-Check)
              </Text>
            </View>
          </View>

          {/* METADATA GRID */}
          <View style={styles.metaGrid}>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Auftraggeber (Kunde):</Text>
              <Text style={styles.metaValue}>{customer || "—"}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Ort der Anlage:</Text>
              <Text style={styles.metaValue}>{location || "—"}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Verteiler / UV:</Text>
              <Text style={styles.metaValue}>{einspeisungVerteilerName}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Prüfdatum:</Text>
              <Text style={styles.metaValue}>{date || "—"}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Zuständiger Prüfer:</Text>
              <Text style={styles.metaValue}>{inspector || "—"}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Prüfgerät / Messgerät:</Text>
              <Text style={styles.metaValue}>{testerDevice || "—"}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Netzform:</Text>
              <Text style={styles.metaValue}>{networkForm || "—"}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Gesamtergebnis:</Text>
              <Text style={[styles.metaValue, { color: "#16a34a" }]}>Anlage mängelfrei / ok</Text>
            </View>
          </View>

          {/* TABLE */}
          <View style={styles.table}>
            {/* Header Row 1 */}
            <View style={[styles.tableRow, styles.tableHeaderRow, { height: 24, minHeight: 24 }]}>
              <Text style={[styles.tableHeaderCell, styles.colZvehNr]}>Nr.</Text>
              <Text style={[styles.tableHeaderCell, styles.colZvehBezeichnung]}>Zielbezeichnung</Text>
              <Text style={[styles.tableHeaderCell, { width: "12%", borderRightWidth: 0.5, borderRightColor: "#000000", height: "100%", justifyContent: "center" }]}>Leitung / Kabel</Text>
              <Text style={[styles.tableHeaderCell, { width: "8%", borderRightWidth: 0.5, borderRightColor: "#000000", height: "100%", justifyContent: "center" }]}>{"Durchgängigkeit des Schutzleiter (<= 1 Ohm)"}</Text>
              <View style={[styles.tableHeaderCell, styles.colZvehRiso, { flexDirection: "column", alignItems: "flex-start", paddingLeft: 2, height: "100%", justifyContent: "center" }]}>
                <Text style={{ fontSize: 4.8, fontWeight: "bold" }}>R_ISO</Text>
                <Text style={{ fontSize: 3.8 }}>{einspeisungRisoMit ? "[x] mit" : "[ ] mit"}</Text>
                <Text style={{ fontSize: 3.8 }}>{einspeisungRisoMit ? "[ ] ohne" : "[x] ohne"}</Text>
                <Text style={{ fontSize: 3.8 }}>(MOhm)</Text>
              </View>
              <Text style={[styles.tableHeaderCell, { width: "25%", borderRightWidth: 0.5, borderRightColor: "#000000", height: "100%", justifyContent: "center" }]}>Überstromschutzeinrichtung</Text>
              <Text style={[styles.tableHeaderCell, { width: "27%", borderRightWidth: 0.5, borderRightColor: "#000000", height: "100%", justifyContent: "center" }]}>Fehlerstromschutzeinrichtung (RCD)</Text>
              <Text style={[styles.tableHeaderCell, styles.colZvehFehlercode]}>Fehlercode</Text>
            </View>

            {/* Header Row 2 */}
            <View style={[styles.tableRow, styles.tableHeaderRow, { height: 16, minHeight: 16 }]}>
              <Text style={[styles.tableHeaderCell, styles.colZvehNr]}></Text>
              <Text style={[styles.tableHeaderCell, styles.colZvehBezeichnung]}></Text>
              <Text style={[styles.tableHeaderCell, styles.colZvehTyp]}>Typ</Text>
              <Text style={[styles.tableHeaderCell, styles.colZvehAnzahl]}>Anz.</Text>
              <Text style={[styles.tableHeaderCell, styles.colZvehQuerschnitt]}>mm²</Text>
              <Text style={[styles.tableHeaderCell, styles.colZvehHpa]}>HPA (Ohm)</Text>
              <Text style={[styles.tableHeaderCell, styles.colZvehZpa]}>ZPA (Ohm)</Text>
              <Text style={[styles.tableHeaderCell, styles.colZvehRiso]}></Text>
              <Text style={[styles.tableHeaderCell, styles.colZvehChar]}>Art/Char</Text>
              <Text style={[styles.tableHeaderCell, styles.colZvehIn]}>In (A)</Text>
              <Text style={[styles.tableHeaderCell, styles.colZvehAusloese]}>t (s)</Text>
              <Text style={[styles.tableHeaderCell, styles.colZvehZsIk]}>Zs / Ik</Text>
              <Text style={[styles.tableHeaderCell, styles.colZvehZlIk]}>ZL / Ik</Text>
              <Text style={[styles.tableHeaderCell, styles.colZvehRcdInArt]}>In/Art</Text>
              <Text style={[styles.tableHeaderCell, styles.colZvehRcdIdn]}>IdN (mA)</Text>
              <Text style={[styles.tableHeaderCell, styles.colZvehRcdId]}>Id (mA)</Text>
              <Text style={[styles.tableHeaderCell, styles.colZvehRcdTa]}>ta (ms)</Text>
              <Text style={[styles.tableHeaderCell, styles.colZvehRcdTd]}>td (ms)</Text>
              <Text style={[styles.tableHeaderCell, styles.colZvehRcdUc]}>Uc (V)</Text>
              <Text style={[styles.tableHeaderCell, styles.colZvehFehlercode]}></Text>
            </View>

            {/* Rows */}
            {finalEinspeisungRows.map((row) => (
              <View
                key={row.nr}
                style={[
                  styles.tableRow,
                  { backgroundColor: row.nr % 2 === 0 ? "#f8fafc" : "#ffffff", minHeight: 14, height: 14 }
                ]}
              >
                <Text style={[styles.tableCell, styles.colZvehNr]}>{row.nr}</Text>
                <Text style={[styles.tableCell, styles.colZvehBezeichnung, { fontWeight: "bold", textAlign: "left", paddingLeft: 3 }]}>
                  {row.bezeichnung}
                </Text>
                <Text style={[styles.tableCell, styles.colZvehTyp]}>{row.kabeltyp || ""}</Text>
                <Text style={[styles.tableCell, styles.colZvehAnzahl]}>{row.leiterAnzahl || ""}</Text>
                <Text style={[styles.tableCell, styles.colZvehQuerschnitt]}>{row.leiterQuerschnitt || ""}</Text>
                <Text style={[styles.tableCell, styles.colZvehHpa]}>{row.rPeHaupt || ""}</Text>
                <Text style={[styles.tableCell, styles.colZvehZpa]}>{row.rPeZusatz || ""}</Text>
                <Text style={[styles.tableCell, styles.colZvehRiso, { fontWeight: "bold" }]}>{row.rIso || ""}</Text>
                <Text style={[styles.tableCell, styles.colZvehChar]}>{row.charakteristik || ""}</Text>
                <Text style={[styles.tableCell, styles.colZvehIn]}>
                  {row.absicherung || ""}
                </Text>
                <Text style={[styles.tableCell, styles.colZvehAusloese]}>{row.ausloeseZeit || ""}</Text>
                <Text style={[styles.tableCell, styles.colZvehZsIk]}>
                  {row.zS && row.iK ? `${row.zS} / ${row.iK}` : (row.zS || row.iK || "")}
                </Text>
                <Text style={[styles.tableCell, styles.colZvehZlIk]}>
                  {row.zL && row.iKL ? `${row.zL} / ${row.iKL}` : (row.zL || row.iKL || "")}
                </Text>
                <Text style={[styles.tableCell, styles.colZvehRcdInArt]}>{row.rcdInArt || ""}</Text>
                <Text style={[styles.tableCell, styles.colZvehRcdIdn]}>{row.rcdIdn || ""}</Text>
                <Text style={[styles.tableCell, styles.colZvehRcdId]}>{row.rcdId || ""}</Text>
                <Text style={[styles.tableCell, styles.colZvehRcdTa]}>{row.rcdTa || ""}</Text>
                <Text style={[styles.tableCell, styles.colZvehRcdTd]}>{row.rcdTd || ""}</Text>
                <Text style={[styles.tableCell, styles.colZvehRcdUc]}>{row.rcdUc || ""}</Text>
                <Text style={[styles.tableCell, styles.colZvehFehlercode]}>{row.fehlercode || ""}</Text>
              </View>
            ))}
          </View>

          {/* FOOTER */}
          <View style={styles.footerContainer}>
            <View style={[styles.commentsBox, { width: "100%" }]}>
              <Text style={styles.commentsTitle}>Bemerkungen / Messergebnis</Text>
              <Text style={styles.commentsText}>
                {comments || "Die gemessenen Werte entsprechen den Anforderungen der DIN VDE 0100-600. Die elektrische Anlage weist in den geprüften Stromkreisen keine Mängel auf. Alle Sicherungsorgane und RCD-Schutzschalter lösen ordnungsgemäß aus."}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.5, borderTopColor: "#000000", paddingTop: 3, marginTop: 4 }}>
            <Text style={{ fontSize: 6, fontWeight: "bold" }}>Prüfprotokoll - Messwerte</Text>
            <Text style={{ fontSize: 6, color: "#64748b" }}>Inhaber: Marcin Slapinski</Text>
            <Text style={{ fontSize: 6 }}>Seite 2 / {totalPages}</Text>
          </View>
        </View>
      </Page>

      {/* PAGE 3 (AND SUBSEQUENT PAGES): LANDSCAPE MEASUREMENT TABLE */}
      {/* Chop the rows into chunks of 28 rows per page to prevent layout overflow */}
      {Array.from({ length: Math.ceil(rows.length / 28) }).map((_, pageIndex) => {
        const pageRows = rows.slice(pageIndex * 28, (pageIndex + 1) * 28);
        return (
          <Page key={pageIndex} size="A4" orientation="landscape" style={styles.landscapePage}>
            <View style={styles.landscapeBorder}>
              {/* HEADER */}
              <View style={styles.headerContainer}>
                <View style={styles.headerLeft}>
                  <Text style={styles.title}>PRÜFPROTOKOLL ÜBER DIE PRÜFUNG EINER ELEKTRISCHEN ANLAGE</Text>
                  <Text style={styles.subtitle}>
                    Messprotokoll nach DIN VDE 0100-600 / DIN VDE 0105-100 (E-Check)
                  </Text>
                </View>
                <View style={styles.headerRight}>
                </View>
              </View>

              {/* METADATA GRID */}
              <View style={styles.metaGrid}>
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>Auftraggeber (Kunde):</Text>
                  <Text style={styles.metaValue}>{customer || "—"}</Text>
                </View>
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>Ort der Anlage:</Text>
                  <Text style={styles.metaValue}>{location || "—"}</Text>
                </View>
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>Verteiler / UV:</Text>
                  <Text style={styles.metaValue}>Kabel</Text>
                </View>
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>Prüfdatum:</Text>
                  <Text style={styles.metaValue}>{date || "—"}</Text>
                </View>
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>Zuständiger Prüfer:</Text>
                  <Text style={styles.metaValue}>{inspector || "—"}</Text>
                </View>
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>Prüfgerät / Messgerät:</Text>
                  <Text style={styles.metaValue}>{testerDevice || "—"}</Text>
                </View>
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>Netzform:</Text>
                  <Text style={styles.metaValue}>{networkForm || "—"}</Text>
                </View>
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>Gesamtergebnis:</Text>
                  <Text style={[styles.metaValue, { color: "#16a34a" }]}>Anlage mängelfrei / ok</Text>
                </View>
              </View>

              {/* TABLE */}
              <View style={styles.table}>
                {/* Header Row 1 */}
                <View style={[styles.tableRow, styles.tableHeaderRow]}>
                  <Text style={[styles.tableHeaderCell, styles.colNr]}>Nr.</Text>
                  <Text style={[styles.tableHeaderCell, styles.colBezeichnung]}>Bezeichnung des Stromkreises</Text>
                  <Text style={[styles.tableHeaderCell, styles.colKabeltyp]}>Kabeltyp</Text>
                  <Text style={[styles.tableHeaderCell, styles.colAbsicherung]}>Sicherung</Text>
                  <Text style={[styles.tableHeaderCell, styles.colChar]}>Char.</Text>
                  <Text style={[styles.tableHeaderCell, { width: "22%", borderRightWidth: 1, borderRightColor: "#000000", height: "100%", justifyContent: "center" }]}>Messwerte</Text>
                  <Text style={[styles.tableHeaderCell, { width: "29%", borderRightWidth: 1, borderRightColor: "#000000", height: "100%", justifyContent: "center" }]}>FI-Schutzschalter (RCD)</Text>
                  <Text style={[styles.tableHeaderCell, styles.colErgebnis]}>Ergebnis</Text>
                </View>

                {/* Header Row 2 */}
                <View style={[styles.tableRow, styles.tableHeaderRow]}>
                  <Text style={[styles.tableHeaderCell, styles.colNr]}></Text>
                  <Text style={[styles.tableHeaderCell, styles.colBezeichnung]}></Text>
                  <Text style={[styles.tableHeaderCell, styles.colKabeltyp]}></Text>
                  <Text style={[styles.tableHeaderCell, styles.colAbsicherung]}></Text>
                  <Text style={[styles.tableHeaderCell, styles.colChar]}></Text>
                  <Text style={[styles.tableHeaderCell, styles.colRiso]}>R_ISO (MOhm)</Text>
                  <Text style={[styles.tableHeaderCell, styles.colRpe]}>R_PE (Ohm)</Text>
                  <Text style={[styles.tableHeaderCell, styles.colZs]}>Z_S (Ohm)</Text>
                  <Text style={[styles.tableHeaderCell, styles.colIk]}>I_K (A)</Text>
                  <Text style={[styles.tableHeaderCell, styles.colRcdTyp]}>Typ</Text>
                  <Text style={[styles.tableHeaderCell, styles.colRcdIdn]}>I_ΔN</Text>
                  <Text style={[styles.tableHeaderCell, styles.colRcdTa]}>t_A (ms)</Text>
                  <Text style={[styles.tableHeaderCell, styles.colRcdIa]}>I_A (mA)</Text>
                  <Text style={[styles.tableHeaderCell, styles.colRcdUb]}>U_B (V)</Text>
                  <Text style={[styles.tableHeaderCell, styles.colErgebnis]}></Text>
                </View>

                {/* Rows */}
                {pageRows.map((row) => (
                  <View
                    key={row.nr}
                    style={[
                      styles.tableRow,
                      { backgroundColor: row.nr % 2 === 0 ? "#f8fafc" : "#ffffff" }
                    ]}
                  >
                    <Text style={[styles.tableCell, styles.colNr]}>{row.nr}</Text>
                    <Text style={[styles.tableCell, styles.colBezeichnung, { fontWeight: "bold" }]}>
                      {row.bezeichnung}
                    </Text>
                    <Text style={[styles.tableCell, styles.colKabeltyp]}>{row.kabeltyp}</Text>
                    <Text style={[styles.tableCell, styles.colAbsicherung]}>
                      {row.absicherung ? `${row.absicherung}A` : ""}
                    </Text>
                    <Text style={[styles.tableCell, styles.colChar]}>{row.charakteristik}</Text>
                    <Text style={[styles.tableCell, styles.colRiso, { fontWeight: "bold" }]}>{row.rIso}</Text>
                    <Text style={[styles.tableCell, styles.colRpe]}>{row.rPe}</Text>
                    <Text style={[styles.tableCell, styles.colZs]}>{row.zS}</Text>
                    <Text style={[styles.tableCell, styles.colIk]}>{row.iK}</Text>
                    <Text style={[styles.tableCell, styles.colRcdTyp]}>{row.rcdTyp}</Text>
                    <Text style={[styles.tableCell, styles.colRcdIdn]}>{row.rcdIdn}</Text>
                    <Text style={[styles.tableCell, styles.colRcdTa]}>{row.rcdTa}</Text>
                    <Text style={[styles.tableCell, styles.colRcdIa]}>{row.rcdIa}</Text>
                    <Text style={[styles.tableCell, styles.colRcdUb]}>{row.rcdUb}</Text>
                    <Text style={[styles.tableCell, styles.colErgebnis, { color: "#16a34a", fontWeight: "bold" }]}>
                      ok
                    </Text>
                  </View>
                ))}
              </View>

              {/* FOOTER */}
              <View style={styles.footerContainer}>
                <View style={[styles.commentsBox, { width: "100%" }]}>
                  <Text style={styles.commentsTitle}>Bemerkungen / Messergebnis</Text>
                  <Text style={styles.commentsText}>
                    {comments || "Die gemessenen Werte entsprechen den Anforderungen der DIN VDE 0100-600. Die elektrische Anlage weist in den geprüften Stromkreisen keine Mängel auf. Alle Sicherungsorgane und RCD-Schutzschalter lösen ordnungsgemäß aus."}
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.5, borderTopColor: "#000000", paddingTop: 3, marginTop: 4 }}>
                <Text style={{ fontSize: 6, fontWeight: "bold" }}>Prüfprotokoll - Messwerte</Text>
                <Text style={{ fontSize: 6, color: "#64748b" }}>Inhaber: Marcin Slapinski</Text>
                <Text style={{ fontSize: 6 }}>Seite {pageIndex + 3} / {totalPages}</Text>
              </View>
            </View>
          </Page>
        );
      })}
    </Document>
  );
};
