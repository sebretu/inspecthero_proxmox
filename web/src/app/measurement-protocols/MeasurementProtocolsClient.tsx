"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Upload, Plus, Trash2, Edit2, FileText, Check, 
  RefreshCw, Download, AlertCircle, FileCheck, ArrowRight, History
} from "lucide-react";
import { pdf } from "@react-pdf/renderer";
import { apiPost, apiGet, apiDelete, getToken, apiCall } from "@/lib/apiClient";
import { Fuse, MeasurementRow, generateMeasurementsForFuses, detectRcd } from "@/lib/measurementGenerator";
import { MeasurementProtocolPdf, CoverPageData } from "@/components/MeasurementProtocolPdf";
import { useLanguage } from "@/contexts/LanguageContext";

export default function MeasurementProtocolsClient() {
  const { t } = useLanguage();
  // Access control states
  const [accessLoading, setAccessLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    async function checkAccess() {
      try {
        const j = await apiGet<any>("/api/me");
        const role = (j?.profile?.role || "").toUpperCase();
        const hasVde = !!j?.profile?.has_vde_access;
        const isAdm = role === "ADMIN" || role === "MODERATOR" || role === "MOD";
        setIsAdmin(isAdm);
        if (isAdm || hasVde) {
          setHasAccess(true);
        } else {
          setHasAccess(false);
        }
      } catch {
        setHasAccess(false);
      } finally {
        setAccessLoading(false);
      }
    }
    checkAccess();
  }, []);

  // Saved protocols states
  const [activeTab, setActiveTab] = useState<"generator" | "history">("generator");
  const [savedProtocols, setSavedProtocols] = useState<any[]>([]);
  const [isLoadingProtocols, setIsLoadingProtocols] = useState(false);
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null);

  const fetchSavedProtocols = async () => {
    setIsLoadingProtocols(true);
    try {
      const res = await apiGet<any[]>("/api/vde-protocols");
      setSavedProtocols(res || []);
    } catch (err) {
      console.error("Failed to fetch saved protocols:", err);
    } finally {
      setIsLoadingProtocols(false);
    }
  };

  useEffect(() => {
    if (activeTab === "history") {
      fetchSavedProtocols();
    }
  }, [activeTab]);

  const handleDeleteProtocol = async (id: string) => {
    if (!confirm("Möchten Sie dieses Protokoll wirklich unwiderruflich vom Server löschen?")) {
      return;
    }
    setDeleteLoadingId(id);
    try {
      await apiDelete(`/api/vde-protocols?id=${id}`);
      setSavedProtocols(prev => prev.filter(p => p.id !== id));
    } catch (err: any) {
      console.error("Failed to delete protocol:", err);
      alert("Fehler beim Löschen des Protokolls: " + err.message);
    } finally {
      setDeleteLoadingId(null);
    }
  };

  const handleLoadProtocol = async (protocol: any) => {
    setIsLoadingProtocols(true);
    try {
      const stateUrl = protocol.file_url + ".json";
      const res = await fetch(stateUrl);
      if (!res.ok) {
        throw new Error("Generierungsdaten für dieses Protokoll wurden nicht gefunden.");
      }
      const data = await res.json();
      
      // Load arrays/objects
      if (data.fuses) setFuses(data.fuses);
      if (data.rows) setRows(data.rows);
      if (data.einspeisungRows) setEinspeisungRows(data.einspeisungRows);
      if (data.einspeisungVerteilerName !== undefined) setEinspeisungVerteilerName(data.einspeisungVerteilerName);
      if (data.einspeisungRisoMit !== undefined) setEinspeisungRisoMit(data.einspeisungRisoMit);
      if (data.comments !== undefined) setComments(data.comments);
      
      // Load cover data
      const c = data.coverData;
      if (c) {
        if (c.kundenNr !== undefined) setKundenNr(c.kundenNr);
        if (c.pruefprotokollNr !== undefined) setPruefprotokollNr(c.pruefprotokollNr);
        if (c.auftragNr !== undefined) setAuftragNr(c.auftragNr);
        if (c.auftraggeber !== undefined) setAuftraggeber(c.auftraggeber);
        if (c.auftragnehmer !== undefined) setAuftragnehmer(c.auftragnehmer);
        if (c.anlage !== undefined) setAnlage(c.anlage);
        if (c.grundNeuanlage !== undefined) setGrundNeuanlage(c.grundNeuanlage);
        if (c.grundInstandsetzung !== undefined) setGrundInstandsetzung(c.grundInstandsetzung);
        if (c.grundAenderung !== undefined) setGrundAenderung(c.grundAenderung);
        if (c.grundWiederholung !== undefined) setGrundWiederholung(c.grundWiederholung);
        if (c.grundErweiterung !== undefined) setGrundErweiterung(c.grundErweiterung);
        if (c.grundSonstiges !== undefined) setGrundSonstiges(c.grundSonstiges);
        if (c.nachVde0100 !== undefined) setNachVde0100(c.nachVde0100);
        if (c.nachVde0105 !== undefined) setNachVde0105(c.nachVde0105);
        if (c.nachDguv !== undefined) setNachDguv(c.nachDguv);
        if (c.nachEcheck !== undefined) setNachEcheck(c.nachEcheck);
        if (c.nachSonstiges !== undefined) setNachSonstiges(c.nachSonstiges);
        if (c.beginnDatum !== undefined) setBeginnDatum(c.beginnDatum);
        if (c.endeDatum !== undefined) setEndeDatum(c.endeDatum);
        if (c.messgeraetModel1 !== undefined) setMessgeraetModel1(c.messgeraetModel1);
        if (c.messgeraetSerien1 !== undefined) setMessgeraetSerien1(c.messgeraetSerien1);
        if (c.messgeraetModel2 !== undefined) setMessgeraetModel2(c.messgeraetModel2);
        if (c.messgeraetSerien2 !== undefined) setMessgeraetSerien2(c.messgeraetSerien2);
        if (c.messgeraetModel3 !== undefined) setMessgeraetModel3(c.messgeraetModel3);
        if (c.messgeraetSerien3 !== undefined) setMessgeraetSerien3(c.messgeraetSerien3);
        if (c.beauftragterKunde !== undefined) setBeauftragterKunde(c.beauftragterKunde);
        if (c.prueferName !== undefined) setPrueferName(c.prueferName);
        if (c.netzformTnc !== undefined) setNetzformTnc(c.netzformTnc);
        if (c.netzformTncs !== undefined) setNetzformTncs(c.netzformTncs);
        if (c.netzformTns !== undefined) setNetzformTns(c.netzformTns);
        if (c.netzformTt !== undefined) setNetzformTt(c.netzformTt);
        if (c.netzformIt !== undefined) setNetzformIt(c.netzformIt);
        if (c.netzSpannung !== undefined) setNetzSpannung(c.netzSpannung);
        if (c.evuvnb !== undefined) setEvuvnb(c.evuvnb);
        if (c.besichtigenAuswahl !== undefined) setBesichtigenAuswahl(c.besichtigenAuswahl);
        if (c.besichtigenTrenn !== undefined) setBesichtigenTrenn(c.besichtigenTrenn);
        if (c.besichtigenBrand !== undefined) setBesichtigenBrand(c.besichtigenBrand);
        if (c.besichtigenKabel !== undefined) setBesichtigenKabel(c.besichtigenKabel);
        if (c.besichtigenGebaeude !== undefined) setBesichtigenGebaeude(c.besichtigenGebaeude);
        if (c.besichtigenKennzeichnung !== undefined) setBesichtigenKennzeichnung(c.besichtigenKennzeichnung);
        if (c.besichtigenLeiter !== undefined) setBesichtigenLeiter(c.besichtigenLeiter);
        if (c.besichtigenVerbindungen !== undefined) setBesichtigenVerbindungen(c.besichtigenVerbindungen);
        if (c.besichtigenSchutzDirekt !== undefined) setBesichtigenSchutzDirekt(c.besichtigenSchutzDirekt);
        if (c.besichtigenSchutzUeberwachung !== undefined) setBesichtigenSchutzUeberwachung(c.besichtigenSchutzUeberwachung);
        if (c.besichtigenZugaenglichkeit !== undefined) setBesichtigenZugaenglichkeit(c.besichtigenZugaenglichkeit);
        if (c.besichtigenHauptpotentialausgleich !== undefined) setBesichtigenHauptpotentialausgleich(c.besichtigenHauptpotentialausgleich);
        if (c.besichtigenZusPotentialausgleich !== undefined) setBesichtigenZusPotentialausgleich(c.besichtigenZusPotentialausgleich);
        if (c.besichtigenDokumentation !== undefined) setBesichtigenDokumentation(c.besichtigenDokumentation);
        if (c.besichtigenErgaenzungsblaetter !== undefined) setBesichtigenErgaenzungsblaetter(c.besichtigenErgaenzungsblaetter);
        if (c.erprobenFunktion !== undefined) setErprobenFunktion(c.erprobenFunktion);
        if (c.erprobenRcd !== undefined) setErprobenRcd(c.erprobenRcd);
        if (c.erprobenSchutzSicherheit !== undefined) setErprobenSchutzSicherheit(c.erprobenSchutzSicherheit);
        if (c.erprobenDrehrichtung !== undefined) setErprobenDrehrichtung(c.erprobenDrehrichtung);
        if (c.erprobenRechtsfeld !== undefined) setErprobenRechtsfeld(c.erprobenRechtsfeld);
        if (c.erprobenGebaeude !== undefined) setErprobenGebaeude(c.erprobenGebaeude);
        if (c.schtzleiterDurchgaengig !== undefined) setSchtzleiterDurchgaengig(c.schtzleiterDurchgaengig);
        if (c.erdungswiderstand !== undefined) setErdungswiderstand(c.erdungswiderstand);
        if (c.potFundamenterder !== undefined) setPotFundamenterder(c.potFundamenterder);
        if (c.potSchiene !== undefined) setPotSchiene(c.potSchiene);
        if (c.potWasserzaehler !== undefined) setPotWasserzaehler(c.potWasserzaehler);
        if (c.potHauptwasser !== undefined) setPotHauptwasser(c.potHauptwasser);
        if (c.potHauptschutzleiter !== undefined) setPotHauptschutzleiter(c.potHauptschutzleiter);
        if (c.potGas !== undefined) setPotGas(c.potGas);
        if (c.potHeizung !== undefined) setPotHeizung(c.potHeizung);
        if (c.potKlima !== undefined) setPotKlima(c.potKlima);
        if (c.potAufzug !== undefined) setPotAufzug(c.potAufzug);
        if (c.potEdv !== undefined) setPotEdv(c.potEdv);
        if (c.potTelefon !== undefined) setPotTelefon(c.potTelefon);
        if (c.potBlitzschutz !== undefined) setPotBlitzschutz(c.potBlitzschutz);
        if (c.potAntenne !== undefined) setPotAntenne(c.potAntenne);
        if (c.potGebaeudekonstr !== undefined) setPotGebaeudekonstr(c.potGebaeudekonstr);
        if (c.potSonstiges !== undefined) setPotSonstiges(c.potSonstiges);
        if (c.keineMaengel !== undefined) setKeineMaengel(c.keineMaengel);
        if (c.maengelFestgestellt !== undefined) setMaengelFestgestellt(c.maengelFestgestellt);
        if (c.naechsterTermin !== undefined) setNaechsterTermin(c.naechsterTermin);
        if (c.plaketteJa !== undefined) setPlaketteJa(c.plaketteJa);
        if (c.plaketteNein !== undefined) setPlaketteNein(c.plaketteNein);
        if (c.kundeUebernommen !== undefined) setKundeUebernommen(c.kundeUebernommen);
        if (c.kundeZustandsbericht !== undefined) setKundeZustandsbericht(c.kundeZustandsbericht);
        if (c.kundeOrt !== undefined) setKundeOrt(c.kundeOrt);
        if (c.kundeDatum !== undefined) setKundeDatum(c.kundeDatum);
        if (c.prueferOrt !== undefined) setPrueferOrt(c.prueferOrt);
        if (c.prueferDatum !== undefined) setPrueferDatum(c.prueferDatum);
        if (c.entsprichtVDE !== undefined) setEntsprichtVDE(c.entsprichtVDE);
        if (c.prueferSignatureBase64 !== undefined) setPrueferSignatureBase64(c.prueferSignatureBase64);
      }
      
      setActiveTab("generator");
      setStep(3); // Jump to preview page or step 2, step 2 is safer to let them edit
      
    } catch (err: any) {
      console.error(err);
      alert("Fehler beim Laden des Protokoll-Status: " + err.message);
    } finally {
      setIsLoadingProtocols(false);
    }
  };

  // Main workflow states
  const [step, setStep] = useState<1 | 2 | 3>(1); // 1: Upload, 2: Fuses Table & Cover info, 3: Protocol Preview
  const [fuses, setFuses] = useState<Fuse[]>([]);
  const [rows, setRows] = useState<MeasurementRow[]>([]);
  
  // File upload and AI parsing states
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tab state for Cover page forms
  const [activeFormTab, setActiveFormTab] = useState<"allgemein" | "besichtigen" | "erdung" | "ergebnis" | "einspeisung">("allgemein");

  const [einspeisungRows, setEinspeisungRows] = useState<any[]>([
    {
      nr: 1,
      bezeichnung: "SICHERUNG1",
      kabeltyp: "",
      leiterAnzahl: "",
      leiterQuerschnitt: "",
      rPeHaupt: "",
      rPeZusatz: "",
      rIso: "",
      charakteristik: "",
      absicherung: "",
      ausloeseZeit: "",
      zS: "",
      iK: "",
      zL: "",
      iKL: "",
      rcdInArt: "",
      rcdIdn: "",
      rcdId: "",
      rcdTa: "",
      rcdTd: "",
      rcdUc: "",
      fehlercode: ""
    },
    {
      nr: 2,
      bezeichnung: "MESSPUNKT1",
      kabeltyp: "",
      leiterAnzahl: "",
      leiterQuerschnitt: "",
      rPeHaupt: "",
      rPeZusatz: "",
      rIso: ">999",
      charakteristik: "gL/gG",
      absicherung: "63",
      ausloeseZeit: "5",
      zS: "0.29",
      iK: "790",
      zL: "0.21",
      iKL: "1.08k",
      rcdInArt: "",
      rcdIdn: "",
      rcdId: "",
      rcdTa: "",
      rcdTd: "",
      rcdUc: "",
      fehlercode: ""
    },
    {
      nr: 3,
      bezeichnung: "MESSPUNKT2",
      kabeltyp: "",
      leiterAnzahl: "",
      leiterQuerschnitt: "",
      rPeHaupt: "",
      rPeZusatz: "",
      rIso: ">999",
      charakteristik: "gL/gG",
      absicherung: "63",
      ausloeseZeit: "5",
      zS: "0.28",
      iK: "824",
      zL: "0.22",
      iKL: "1.05k",
      rcdInArt: "",
      rcdIdn: "",
      rcdId: "",
      rcdTa: "",
      rcdTd: "",
      rcdUc: "",
      fehlercode: ""
    },
    {
      nr: 4,
      bezeichnung: "MESSPUNKT3",
      kabeltyp: "",
      leiterAnzahl: "",
      leiterQuerschnitt: "",
      rPeHaupt: "",
      rPeZusatz: "",
      rIso: ">999",
      charakteristik: "gL/gG",
      absicherung: "63",
      ausloeseZeit: "5",
      zS: "0.28",
      iK: "811",
      zL: "0.21",
      iKL: "1.09k",
      rcdInArt: "",
      rcdIdn: "",
      rcdId: "",
      rcdTa: "",
      rcdTd: "",
      rcdUc: "",
      fehlercode: ""
    }
  ]);

  const updateEinspeisungField = (idx: number, field: string, value: any) => {
    setEinspeisungRows(prev =>
      prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row))
    );
  };

  const updateCircuitField = (idx: number, field: string, value: any) => {
    setRows(prev =>
      prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row))
    );
  };

  // Cover Page States (ZVEH Page 1)
  const [kundenNr, setKundenNr] = useState("");
  const [pruefprotokollNr, setPruefprotokollNr] = useState("");
  const [auftragNr, setAuftragNr] = useState("");
  const [auftraggeber, setAuftraggeber] = useState("bt building technologies GmbH\nAm Gleisdreieck 1-5\n50823 Köln");
  const [auftragnehmer, setAuftragnehmer] = useState("EtecProjekt+Bau GmbH\nHeinrich-Hertz-Straße 22a\n40699 Erkrath");
  const [anlage, setAnlage] = useState("UV OG Unit UL01");
  const [einspeisungVerteilerName, setEinspeisungVerteilerName] = useState("Einspeisung");
  const [einspeisungRisoMit, setEinspeisungRisoMit] = useState(false);

  // Grund der Prüfung
  const [grundNeuanlage, setGrundNeuanlage] = useState(true);
  const [grundInstandsetzung, setGrundInstandsetzung] = useState(false);
  const [grundAenderung, setGrundAenderung] = useState(false);
  const [grundWiederholung, setGrundWiederholung] = useState(false);
  const [grundErweiterung, setGrundErweiterung] = useState(false);
  const [grundSonstiges, setGrundSonstiges] = useState("");

  // Prüfung nach
  const [nachVde0100, setNachVde0100] = useState(true);
  const [nachVde0105, setNachVde0105] = useState(false);
  const [nachDguv, setNachDguv] = useState(false);
  const [nachEcheck, setNachEcheck] = useState(false);
  const [nachSonstiges, setNachSonstiges] = useState("");

  const [beginnDatum, setBeginnDatum] = useState(() => new Date().toISOString().slice(0, 10));
  const [endeDatum, setEndeDatum] = useState(() => new Date().toISOString().slice(0, 10));

  // Messgeräte
  const [messgeraetModel1, setMessgeraetModel1] = useState("IT 130");
  const [messgeraetSerien1, setMessgeraetSerien1] = useState("19352355");
  const [messgeraetModel2, setMessgeraetModel2] = useState("");
  const [messgeraetSerien2, setMessgeraetSerien2] = useState("");
  const [messgeraetModel3, setMessgeraetModel3] = useState("");
  const [messgeraetSerien3, setMessgeraetSerien3] = useState("");

  const [beauftragterKunde, setBeauftragterKunde] = useState("");
  const [prueferName, setPrueferName] = useState("");
  const [prueferSignatureBase64, setPrueferSignatureBase64] = useState("");

  // Netz
  const [netzformTnc, setNetzformTnc] = useState(false);
  const [netzformTncs, setNetzformTncs] = useState(false);
  const [netzformTns, setNetzformTns] = useState(true);
  const [netzformTt, setNetzformTt] = useState(false);
  const [netzformIt, setNetzformIt] = useState(false);
  const [netzSpannung, setNetzSpannung] = useState("400V / 230V");
  const [evuvnb, setEvuvnb] = useState("RheinEnergie AG");

  // History memory states for Auftraggeber and EVU / VNB
  const [savedAuftraggebers, setSavedAuftraggebers] = useState<string[]>([]);
  const [showAuftraggeberHistory, setShowAuftraggeberHistory] = useState(false);
  const [savedEvuvnbs, setSavedEvuvnbs] = useState<string[]>([]);
  const [showEvuvnbHistory, setShowEvuvnbHistory] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedA = localStorage.getItem("inspecthero_saved_auftraggebers");
      if (savedA) {
        try {
          const parsed = JSON.parse(savedA);
          setSavedAuftraggebers(parsed);
          if (parsed && parsed.length > 0 && parsed[0]) {
            setAuftraggeber(parsed[0]);
          }
        } catch (e) {}
      } else {
        const initial = ["bt building technologies GmbH\nAm Gleisdreieck 1-5\n50823 Köln"];
        setSavedAuftraggebers(initial);
        localStorage.setItem("inspecthero_saved_auftraggebers", JSON.stringify(initial));
      }

      const savedE = localStorage.getItem("inspecthero_saved_evuvnbs");
      if (savedE) {
        try {
          const parsed = JSON.parse(savedE);
          setSavedEvuvnbs(parsed);
          if (parsed && parsed.length > 0 && parsed[0]) {
            setEvuvnb(parsed[0]);
          }
        } catch (e) {}
      } else {
        const initial = ["RheinEnergie AG", "Westnetz GmbH", "Netz Düsseldorf GmbH"];
        setSavedEvuvnbs(initial);
        localStorage.setItem("inspecthero_saved_evuvnbs", JSON.stringify(initial));
      }

      const savedSig = localStorage.getItem("inspecthero_saved_pruefer_signature");
      if (savedSig) {
        setPrueferSignatureBase64(savedSig);
      }
    }
  }, []);

  const handleAuftraggeberBlur = () => {
    const trimmed = auftraggeber.trim();
    if (!trimmed) return;
    setSavedAuftraggebers(prev => {
      const filtered = prev.filter(x => x.trim() !== trimmed);
      const updated = [trimmed, ...filtered].slice(0, 15);
      localStorage.setItem("inspecthero_saved_auftraggebers", JSON.stringify(updated));
      return updated;
    });
  };

  const handleEvuvnbBlur = () => {
    const trimmed = evuvnb.trim();
    if (!trimmed) return;
    setSavedEvuvnbs(prev => {
      const filtered = prev.filter(x => x.trim() !== trimmed);
      const updated = [trimmed, ...filtered].slice(0, 15);
      localStorage.setItem("inspecthero_saved_evuvnbs", JSON.stringify(updated));
      return updated;
    });
  };

  // Besichtigen Checklist (io / nio / none)
  const [besichtigenAuswahl, setBesichtigenAuswahl] = useState<"io" | "nio" | "none">("io");
  const [besichtigenTrenn, setBesichtigenTrenn] = useState<"io" | "nio" | "none">("io");
  const [besichtigenBrand, setBesichtigenBrand] = useState<"io" | "nio" | "none">("none");
  const [besichtigenKabel, setBesichtigenKabel] = useState<"io" | "nio" | "none">("io");
  const [besichtigenGebaeude, setBesichtigenGebaeude] = useState<"io" | "nio" | "none">("none");
  const [besichtigenKennzeichnung, setBesichtigenKennzeichnung] = useState<"io" | "nio" | "none">("io");
  const [besichtigenLeiter, setBesichtigenLeiter] = useState<"io" | "nio" | "none">("io");
  const [besichtigenVerbindungen, setBesichtigenVerbindungen] = useState<"io" | "nio" | "none">("io");
  const [besichtigenSchutzDirekt, setBesichtigenSchutzDirekt] = useState<"io" | "nio" | "none">("io");
  const [besichtigenSchutzUeberwachung, setBesichtigenSchutzUeberwachung] = useState<"io" | "nio" | "none">("none");
  const [besichtigenZugaenglichkeit, setBesichtigenZugaenglichkeit] = useState<"io" | "nio" | "none">("io");
  const [besichtigenHauptpotentialausgleich, setBesichtigenHauptpotentialausgleich] = useState<"io" | "nio" | "none">("io");
  const [besichtigenZusPotentialausgleich, setBesichtigenZusPotentialausgleich] = useState<"io" | "nio" | "none">("io");
  const [besichtigenDokumentation, setBesichtigenDokumentation] = useState<"io" | "nio" | "none">("io");
  const [besichtigenErgaenzungsblaetter, setBesichtigenErgaenzungsblaetter] = useState<"io" | "nio" | "none">("none");

  // Erproben Checklist (io / nio / none)
  const [erprobenFunktion, setErprobenFunktion] = useState<"io" | "nio" | "none">("io");
  const [erprobenRcd, setErprobenRcd] = useState<"io" | "nio" | "none">("io");
  const [erprobenSchutzSicherheit, setErprobenSchutzSicherheit] = useState<"io" | "nio" | "none">("none");
  const [erprobenDrehrichtung, setErprobenDrehrichtung] = useState<"io" | "nio" | "none">("none");
  const [erprobenRechtsfeld, setErprobenRechtsfeld] = useState<"io" | "nio" | "none">("none");
  const [erprobenGebaeude, setErprobenGebaeude] = useState<"io" | "nio" | "none">("none");

  // Erdung & Schutzleiter
  const [schtzleiterDurchgaengig, setSchtzleiterDurchgaengig] = useState(true);
  const [erdungswiderstand, setErdungswiderstand] = useState("");
  const [potFundamenterder, setPotFundamenterder] = useState(false);
  const [potSchiene, setPotSchiene] = useState(true);
  const [potWasserzaehler, setPotWasserzaehler] = useState(false);
  const [potHauptwasser, setPotHauptwasser] = useState(true);
  const [potHauptschutzleiter, setPotHauptschutzleiter] = useState(true);
  const [potGas, setPotGas] = useState(false);
  const [potHeizung, setPotHeizung] = useState(false);
  const [potKlima, setPotKlima] = useState(false);
  const [potAufzug, setPotAufzug] = useState(false);
  const [potEdv, setPotEdv] = useState(false);
  const [potTelefon, setPotTelefon] = useState(false);
  const [potBlitzschutz, setPotBlitzschutz] = useState(false);
  const [potAntenne, setPotAntenne] = useState(false);
  const [potGebaeudekonstr, setPotGebaeudekonstr] = useState(false);
  const [potSonstiges, setPotSonstiges] = useState("");

  // Ergebnis
  const [keineMaengel, setKeineMaengel] = useState(true);
  const [maengelFestgestellt, setMaengelFestgestellt] = useState(false);
  const [naechsterTermin, setNaechsterTermin] = useState("");
  const [plaketteJa, setPlaketteJa] = useState(true);
  const [plaketteNein, setPlaketteNein] = useState(false);
  const [kundeUebernommen, setKundeUebernommen] = useState(true);
  const [kundeZustandsbericht, setKundeZustandsbericht] = useState(false);
  const [kundeOrt, setKundeOrt] = useState("Erkrath");
  const [kundeDatum, setKundeDatum] = useState(() => new Date().toISOString().slice(0, 10));
  const [prueferOrt, setPrueferOrt] = useState("Erkrath");
  const [prueferDatum, setPrueferDatum] = useState(() => new Date().toISOString().slice(0, 10));

  // Sync signature dates with the end measurement date (endeDatum)
  useEffect(() => {
    setPrueferDatum(endeDatum);
    setKundeDatum(endeDatum);
  }, [endeDatum]);
  const [entsprichtVDE, setEntsprichtVDE] = useState(true);

  const [comments, setComments] = useState(
    "Die gemessenen Werte entsprechen den Anforderungen der DIN VDE 0100-600. Die elektrische Anlage weist in den geprüften Stromkreisen keine Mängel auf. Alle Sicherungsorgane und RCD-Schutzschalter lösen ordnungsgemäß aus."
  );

  // Fuse inline editor states
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editRating, setEditRating] = useState<number>(16);
  const [editChar, setEditChar] = useState("B");
  const [editDesc, setEditDesc] = useState("");
  const [editRcd, setEditRcd] = useState(true);
  const [editPhases, setEditPhases] = useState<number>(1);

  // PDF Generation loading
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Handle PDF file selection and AI parsing
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setFileName(file.name);
    setUploadError(null);
    setIsAnalyzing(true);

    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.split(",")[1];
          resolve(base64);
        };
        reader.onerror = (error) => reject(error);
      });

      const res = await apiCall<{ boardName?: string; einspeisung?: any; fuses: Fuse[] }>("/api/parse-plan", {
        method: "POST",
        body: {
          fileData: base64Data,
          fileName: file.name
        },
        timeoutMs: 120000 // 2 minutes for heavy PDF text parsing and LLM structuring
      });

      if (res && res.fuses) {
        const processed = res.fuses.map(f => {
          const isReserve = f.name.toLowerCase().includes("reserve") || f.description.toLowerCase().includes("reserve");
          return {
            ...f,
            active: isReserve ? false : (f.active !== false),
            rcd: typeof f.rcd === 'boolean' ? f.rcd : detectRcd(f.name, f.description),
            phases: f.phases || 1
          };
        });
        setFuses(processed);
        if (res.boardName) {
          setAnlage(res.boardName);
        }

        // Populate Einspeisung (Seite 2) values from PDF parser
        if (res.einspeisung) {
          setEinspeisungRows(prev => {
            const updated = [...prev];
            const e = res.einspeisung;
            
            const fuseDesignation = e.name || "0F01";
            const cableName = e.kabelDesignation ? `${e.kabelDesignation} - ${e.kabeltyp || ""}` : (e.kabeltyp || "");
            const rating = e.rating ? String(e.rating) : "";
            const char = e.characteristic || "";
            const conductors = e.leiterAnzahl || "";
            const crossSection = e.leiterQuerschnitt || "";

            // Row 1 (Main protection device)
            updated[0] = {
              ...updated[0],
              bezeichnung: fuseDesignation,
              kabeltyp: cableName,
              leiterAnzahl: conductors,
              leiterQuerschnitt: crossSection,
              charakteristik: char,
              absicherung: rating,
            };

            // Rows 2, 3, 4 (Copy details for MESSPUNKT 1, 2, 3)
            for (let i = 1; i < 4; i++) {
              updated[i] = {
                ...updated[i],
                kabeltyp: cableName,
                leiterAnzahl: conductors,
                leiterQuerschnitt: crossSection,
                charakteristik: char,
                absicherung: rating,
              };
            }
            return updated;
          });
        }

        setStep(2);
      } else {
        throw new Error("Ungültiges Antwortformat vom Server.");
      }
    } catch (err: any) {
      console.error("Failed to parse PDF:", err);
      setUploadError(
        err?.message || "Fehler beim Analysieren des Schaltplans. Bitte erneut versuchen oder Sicherungen manuell eintragen."
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleAddNewFuse = () => {
    const newFuse: Fuse = {
      name: `${fuses.length + 1}F1`,
      rating: 16,
      characteristic: "B",
      description: "Neuer Stromkreis",
      rcd: true,
      phases: 1
    };
    setFuses([...fuses, newFuse]);
    setEditingIndex(fuses.length);
    setEditName(newFuse.name);
    setEditRating(newFuse.rating);
    setEditChar(newFuse.characteristic);
    setEditDesc(newFuse.description);
    setEditRcd(newFuse.rcd);
    setEditPhases(1);
  };

  const handleDeleteFuse = (index: number) => {
    const updated = fuses.filter((_, i) => i !== index);
    setFuses(updated);
    if (editingIndex === index) {
      setEditingIndex(null);
    } else if (editingIndex !== null && editingIndex > index) {
      setEditingIndex(editingIndex - 1);
    }
  };

  const startEditing = (index: number) => {
    setEditingIndex(index);
    const f = fuses[index];
    setEditName(f.name);
    setEditRating(f.rating);
    setEditChar(f.characteristic);
    setEditDesc(f.description);
    setEditRcd(f.rcd);
    setEditPhases(f.phases || 1);
  };

  const saveEditing = (index: number) => {
    const updated = [...fuses];
    updated[index] = {
      name: editName.trim() || `F${index + 1}`,
      rating: Number(editRating) || 16,
      characteristic: editChar,
      description: editDesc.trim() || "Stromkreis",
      rcd: editRcd,
      phases: Number(editPhases) || 1,
      active: fuses[index].active
    };
    setFuses(updated);
    setEditingIndex(null);
  };

  const cancelEditing = () => {
    setEditingIndex(null);
  };

  const toggleRcd = (index: number) => {
    const updated = [...fuses];
    const newRcd = !updated[index].rcd;
    updated[index] = {
      ...updated[index],
      rcd: newRcd
    };
    setFuses(updated);
    if (editingIndex === index) {
      setEditRcd(newRcd);
    }
  };

  const toggleActive = (index: number) => {
    const updated = [...fuses];
    const currentActive = updated[index].active !== false;
    updated[index] = {
      ...updated[index],
      active: !currentActive
    };
    setFuses(updated);
  };

  const handleGenerateMeasurements = () => {
    if (fuses.length === 0) {
      alert("Bitte fügen Sie mindestens eine Sicherung hinzu.");
      return;
    }
    const generated = generateMeasurementsForFuses(fuses);
    setRows(generated);
    setStep(3);
  };

  const handleRegenerateValues = () => {
    const generated = generateMeasurementsForFuses(fuses);
    setRows(generated);
  };

  // Download PDF with Page 1 details
  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true);
    try {
      const coverData: CoverPageData = {
        kundenNr,
        pruefprotokollNr,
        auftragNr,
        auftraggeber,
        auftragnehmer,
        anlage,
        grundNeuanlage,
        grundInstandsetzung,
        grundAenderung,
        grundWiederholung,
        grundErweiterung,
        grundSonstiges,
        nachVde0100,
        nachVde0105,
        nachDguv,
        nachEcheck,
        nachSonstiges,
        beginnDatum,
        endeDatum,
        messgeraetModel1,
        messgeraetSerien1,
        messgeraetModel2,
        messgeraetSerien2,
        messgeraetModel3,
        messgeraetSerien3,
        beauftragterKunde,
        prueferName,
        netzformTnc,
        netzformTncs,
        netzformTns,
        netzformTt,
        netzformIt,
        netzSpannung,
        evuvnb,
        besichtigenAuswahl,
        besichtigenTrenn,
        besichtigenBrand,
        besichtigenKabel,
        besichtigenGebaeude,
        besichtigenKennzeichnung,
        besichtigenLeiter,
        besichtigenVerbindungen,
        besichtigenSchutzDirekt,
        besichtigenSchutzUeberwachung,
        besichtigenZugaenglichkeit,
        besichtigenHauptpotentialausgleich,
        besichtigenZusPotentialausgleich,
        besichtigenDokumentation,
        besichtigenErgaenzungsblaetter,
        erprobenFunktion,
        erprobenRcd,
        erprobenSchutzSicherheit,
        erprobenDrehrichtung,
        erprobenRechtsfeld,
        erprobenGebaeude,
        schtzleiterDurchgaengig,
        erdungswiderstand,
        potFundamenterder,
        potSchiene,
        potWasserzaehler,
        potHauptwasser,
        potHauptschutzleiter,
        potGas,
        potHeizung,
        potKlima,
        potAufzug,
        potEdv,
        potTelefon,
        potBlitzschutz,
        potAntenne,
        potGebaeudekonstr,
        potSonstiges,
        keineMaengel,
        maengelFestgestellt,
        naechsterTermin,
        plaketteJa,
        plaketteNein,
        kundeUebernommen,
        kundeZustandsbericht,
        kundeOrt,
        kundeDatum,
        prueferOrt,
        prueferDatum,
        entsprichtVDE,
        prueferSignatureBase64
      };

      const blob = await pdf(
        <MeasurementProtocolPdf
          rows={rows}
          customer={coverData.auftraggeber.split("\n")[0] || "Kunde"}
          location={anlage}
          boardName={anlage}
          inspector={prueferName}
          date={prueferDatum}
          testerDevice={messgeraetModel1}
          networkForm={netzformTns ? "TN-S" : "TN"}
          comments={comments}
          coverData={coverData}
          einspeisungRows={einspeisungRows}
          einspeisungVerteilerName={einspeisungVerteilerName}
          einspeisungRisoMit={einspeisungRisoMit}
        />
      ).toBlob();

      const prefix = anlage.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_") || "messprotokoll";
      const filename = `messprotokoll_${prefix}_${prueferDatum}.pdf`;

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      // Redirect to step 1 (beginning)
      setStep(1);

      // Upload copy to server storage
      try {
        const formData = new FormData();
        formData.append("file", blob, filename);
        formData.append("anlage", anlage);
        formData.append("pruefer_name", prueferName);

        const fullState = {
          coverData,
          fuses,
          rows,
          einspeisungRows,
          einspeisungVerteilerName,
          einspeisungRisoMit,
          comments
        };
        formData.append("state", JSON.stringify(fullState));

        const token = await getToken();
        const headers: Record<string, string> = {};
        if (token) {
          headers.Authorization = `Bearer ${token}`;
          headers["X-App-Token"] = token;
        }

        const uploadRes = await fetch("/api/vde-protocols", {
          method: "POST",
          headers,
          body: formData,
        });
        const uploadJson = await uploadRes.json();
        if (!uploadJson.ok) {
          console.error("Failed to save protocol to server:", uploadJson.error?.message);
        } else {
          console.log("Protocol saved to server successfully.");
        }
      } catch (uploadErr) {
        console.error("Error uploading protocol to server:", uploadErr);
      }
    } catch (e) {
      console.error("Failed to generate PDF:", e);
      alert("Fehler beim Erstellen des PDF-Dokuments.");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  if (accessLoading) {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-slate-800 border-t-cyan-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-10 text-center">
        <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center text-4xl mb-8 border border-red-500/20 shadow-2xl shadow-red-500/10">🚫</div>
        <h1 className="text-3xl font-black text-white uppercase tracking-tighter mb-4">Zugriff verweigert</h1>
        <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">Sie haben keine Berechtigung für den Zugriff auf den E-Check Generator.</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1600px] mx-auto p-4 md:p-8 space-y-8 animate-in fade-in duration-500">
      {/* Header section */}
      <div className="relative overflow-hidden bg-ui-card backdrop-blur-xl border border-ui-border rounded-xl p-8 shadow-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="absolute top-0 right-0 w-64 h-64 bg-ui-accent/15 rounded-full blur-[100px] pointer-events-none" />
        <div className="space-y-2">
          <h1 className="text-3xl md:text-4xl font-black tracking-tight text-ui-text uppercase">
            VDE Prüfprotokoll-Generator
          </h1>
          <p className="text-sm font-semibold text-ui-muted tracking-wide uppercase opacity-75">
            Automatisches Einlesen von Schaltplan und Erstellen von Protokollen nach DIN VDE 0100-600 (ZVEH Standard)
          </p>
        </div>
        
        {/* Step indicator */}
        {activeTab === "generator" && (
          <div className="flex items-center gap-4 bg-black/30 px-6 py-3 rounded-full border border-ui-border">
            <div className="flex items-center gap-2">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step >= 1 ? "bg-ui-accent text-ui-bg" : "bg-ui-border text-ui-muted"}`}>1</span>
              <span className="text-xs font-black uppercase tracking-wider text-ui-text">Schaltplan</span>
            </div>
            <ArrowRight className="w-4 h-4 text-ui-muted" />
            <div className="flex items-center gap-2">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step >= 2 ? "bg-ui-accent text-ui-bg" : "bg-ui-border text-ui-muted"}`}>2</span>
              <span className="text-xs font-black uppercase tracking-wider text-ui-text">Angaben & Sicherungen</span>
            </div>
            <ArrowRight className="w-4 h-4 text-ui-muted" />
            <div className="flex items-center gap-2">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step >= 3 ? "bg-ui-accent text-ui-bg" : "bg-ui-border text-ui-muted"}`}>3</span>
              <span className="text-xs font-black uppercase tracking-wider text-ui-text">Protokoll</span>
            </div>
          </div>
        )}
      </div>

      {/* Tab Switcher */}
      <div className="flex border-b border-ui-border gap-6">
        <button
          onClick={() => setActiveTab("generator")}
          className={`pb-4 px-2 text-sm font-black uppercase tracking-wider transition-all relative ${
            activeTab === "generator"
              ? "text-ui-accent font-black"
              : "text-ui-muted hover:text-ui-text font-bold"
          }`}
        >
          Generator
          {activeTab === "generator" && (
            <motion.div
              layoutId="vde-active-tab-line"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-ui-accent"
            />
          )}
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`pb-4 px-2 text-sm font-black uppercase tracking-wider transition-all relative ${
            activeTab === "history"
              ? "text-ui-accent font-black"
              : "text-ui-muted hover:text-ui-text font-bold"
          }`}
        >
          Gespeicherte Protokolle
          {activeTab === "history" && (
            <motion.div
              layoutId="vde-active-tab-line"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-ui-accent"
            />
          )}
        </button>
      </div>

      {/* Saved Protocols (History) Tab Content */}
      {activeTab === "history" && (
        <div className="bg-ui-card border border-ui-border rounded-xl p-8 shadow-2xl space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-black text-ui-text uppercase tracking-tight">
                Zuvor generierte Messprotokolle
              </h2>
              <p className="text-xs font-bold text-ui-muted uppercase tracking-widest opacity-60">
                Hier finden Sie alle auf dem Server archivierten E-Check PDF-Messprotokolle.
              </p>
            </div>
            <button
              onClick={fetchSavedProtocols}
              disabled={isLoadingProtocols}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-ui-border rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingProtocols ? "animate-spin" : ""}`} />
              Aktualisieren
            </button>
          </div>

          {isLoadingProtocols ? (
            <div className="py-20 flex flex-col items-center justify-center space-y-4">
              <RefreshCw className="w-8 h-8 text-ui-accent animate-spin" />
              <p className="text-xs font-black text-ui-muted uppercase tracking-widest animate-pulse">Lade Protokolle...</p>
            </div>
          ) : savedProtocols.length === 0 ? (
            <div className="py-20 text-center space-y-3 border border-dashed border-ui-border rounded-xl bg-black/10">
              <FileText className="w-12 h-12 text-ui-muted mx-auto opacity-40" />
              <p className="text-sm font-bold text-ui-muted uppercase tracking-wider">Keine gespeicherten Protokolle gefunden</p>
              <p className="text-xs text-ui-muted opacity-60">Generieren und laden Sie ein PDF-Messprotokoll herunter, um es hier zu speichern.</p>
            </div>
          ) : (
            <div className="border border-ui-border rounded-xl overflow-hidden bg-black/20">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-white/5 border-b border-ui-border text-[9px] font-black uppercase tracking-wider text-ui-muted text-center">
                      <th className="py-4 px-6 text-left">Name</th>
                      <th className="py-4 px-4">Anlage / Verteiler</th>
                      <th className="py-4 px-4">Prüfer</th>
                      <th className="py-4 px-4">Erstellt von</th>
                      <th className="py-4 px-4">Erstellungsdatum</th>
                      <th className="py-4 px-6 text-right">Aktionen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ui-border font-semibold text-ui-text text-center">
                    {savedProtocols.map((protocol) => (
                      <tr key={protocol.id} className="hover:bg-white/5 transition-colors">
                        <td className="py-4 px-6 flex items-center gap-3 text-left">
                          <div className="w-8 h-8 bg-cyan-500/10 border border-cyan-500/20 rounded-lg flex items-center justify-center text-cyan-400 flex-shrink-0">
                            <FileCheck className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="font-bold text-ui-text block max-w-xs truncate" title={protocol.name}>
                              {protocol.name}
                            </span>
                            <span className="text-[10px] text-ui-muted block font-medium">
                              PDF-Dokument
                            </span>
                          </div>
                        </td>
                        <td className="py-4 px-4 text-ui-text font-bold">
                          {protocol.anlage || "—"}
                        </td>
                        <td className="py-4 px-4 text-ui-muted">
                          {protocol.pruefer_name || "—"}
                        </td>
                        <td className="py-4 px-4 text-ui-muted">
                          {protocol.created_by_name || "Unbekannt"}
                        </td>
                        <td className="py-4 px-4 text-ui-muted">
                          {new Date(protocol.created_at).toLocaleString("de-DE")}
                        </td>
                        <td className="py-4 px-6 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => handleLoadProtocol(protocol)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 border border-yellow-500/20 hover:border-yellow-500/40 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all"
                            >
                              {t("common", "edit")}
                            </button>
                            <a
                              href={protocol.file_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 hover:border-cyan-500/40 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all"
                            >
                              <Download className="w-3.5 h-3.5" />
                              {t("common", "download")}
                            </a>
                            {isAdmin && (
                              <button
                                onClick={() => handleDeleteProtocol(protocol.id)}
                                disabled={deleteLoadingId === protocol.id}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 hover:border-red-500/40 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-50"
                              >
                                {deleteLoadingId === protocol.id ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="w-3.5 h-3.5" />
                                )}
                                {t("common", "delete")}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Workflow Panel */}
      {activeTab === "generator" && (
        <AnimatePresence mode="wait">
          {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-8"
          >
            {/* Left side: Upload Card */}
            <div className="lg:col-span-2 bg-ui-card backdrop-blur-xl border border-ui-border rounded-xl p-8 shadow-2xl flex flex-col justify-between min-h-[450px] relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-32 h-32 bg-ui-accent/5 rounded-full blur-3xl pointer-events-none" />
              
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-black text-ui-text uppercase tracking-tight">
                    Schaltplan hochladen (PDF)
                  </h2>
                  <p className="text-sm font-semibold text-ui-muted mt-1 uppercase tracking-widest opacity-60">
                    PDF mit einpoligem Schaltplan oder Verteilerübersicht hochladen
                  </p>
                </div>

                {/* Upload drag-n-drop area */}
                <div 
                  onClick={triggerFileInput}
                  className="border-2 border-dashed border-ui-border hover:border-ui-accent/40 rounded-xl p-12 flex flex-col items-center justify-center gap-4 bg-black/20 hover:bg-white/5 cursor-pointer transition-all duration-300 group/drop"
                >
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="application/pdf"
                    className="hidden"
                  />
                  {isAnalyzing ? (
                    <div className="flex flex-col items-center gap-4 py-4">
                      <RefreshCw className="w-12 h-12 text-ui-accent animate-spin" />
                      <div className="text-center">
                        <p className="text-base font-bold text-ui-text uppercase tracking-wider animate-pulse">
                          Datei wird analysiert...
                        </p>
                        <p className="text-xs font-semibold text-ui-muted mt-1 uppercase tracking-widest">
                          Sicherungen und Stromkreise werden extrahiert und übersetzt
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="w-16 h-16 rounded-full bg-ui-accent/10 flex items-center justify-center group-hover/drop:scale-110 transition-transform duration-300">
                        <Upload className="w-8 h-8 text-ui-accent" />
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-black text-ui-text uppercase tracking-tight">
                          Datei auswählen oder hierher ziehen
                        </p>
                        <p className="text-xs font-bold text-ui-muted mt-2 uppercase tracking-widest opacity-50">
                          Maximale Dateigröße: 15MB (PDF)
                        </p>
                      </div>
                    </>
                  )}
                </div>

                {uploadError && (
                  <div className="flex items-center gap-3 p-4 bg-danger/10 border border-danger/30 rounded-xl text-danger text-xs font-bold uppercase tracking-wider">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <span>{uploadError}</span>
                  </div>
                )}
              </div>

              {/* Manual mode button */}
              <div className="mt-8 flex justify-end">
                <button
                  onClick={() => setStep(2)}
                  className="px-6 py-4 bg-white/5 hover:bg-white/10 border border-ui-border hover:border-ui-accent/30 rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-300"
                >
                  Ohne Datei fortfahren & manuell eintragen
                </button>
              </div>
            </div>

            {/* Right side: Instructions/Guidelines */}
            <div className="bg-ui-card border border-ui-border rounded-xl p-8 shadow-2xl space-y-6">
              <h3 className="text-lg font-black text-ui-text uppercase tracking-tight">
                ZVEH Prüfbericht Cover-Funktion
              </h3>
              
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-lg bg-ui-accent/10 text-ui-accent flex items-center justify-center font-bold flex-shrink-0">
                    1
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-ui-text uppercase tracking-wide">
                      Seite 1 (ZVEH Deckblatt)
                    </h4>
                    <p className="text-xs text-ui-muted leading-relaxed mt-1">
                      Enthält allgemeine Angaben, Grund der Prüfung, verwendete Messgeräte, den ausführlichen Besichtigungs- und Erprobungsbericht sowie Prüfergebnis & Unterschriften.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-lg bg-ui-accent/10 text-ui-accent flex items-center justify-center font-bold flex-shrink-0">
                    2
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-ui-text uppercase tracking-wide">
                      Seite 2 (Messwerte)
                    </h4>
                    <p className="text-xs text-ui-muted leading-relaxed mt-1">
                      Gibt die detaillierte Tabelle der Stromkreise und Sicherungen aus, inklusive R_ISO (mindestens 700 MΩ), R_PE, Z_S, I_K und FI/RCD-Zeiten.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-ui-accent/5 border border-ui-accent/25 rounded-xl flex items-start gap-3">
                <FileCheck className="w-5 h-5 text-ui-accent flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-ui-muted leading-relaxed font-semibold">
                  Das Deckblatt entspricht dem standardisierten ZVEH Prüfbericht für elektrische Anlagen.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-8"
          >
            {/* Cover Page Form Panel */}
            <div className="bg-ui-card border border-ui-border rounded-xl p-8 shadow-2xl space-y-6">
              <h2 className="text-xl font-black text-ui-text uppercase tracking-tight">
                ZVEH DECKBLATT AUSFÜLLEN
              </h2>

              {/* Tabs navigation */}
              <div className="flex border-b border-ui-border/50 gap-2 pb-px overflow-x-auto">
                <button
                  onClick={() => setActiveFormTab("allgemein")}
                  className={`px-4 py-2 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${
                    activeFormTab === "allgemein" 
                      ? "border-ui-accent text-ui-accent" 
                      : "border-transparent text-ui-muted hover:text-ui-text"
                  }`}
                >
                  Allgemeine Angaben
                </button>
                <button
                  onClick={() => setActiveFormTab("besichtigen")}
                  className={`px-4 py-2 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${
                    activeFormTab === "besichtigen" 
                      ? "border-ui-accent text-ui-accent" 
                      : "border-transparent text-ui-muted hover:text-ui-text"
                  }`}
                >
                  Besichtigen & Erproben
                </button>
                <button
                  onClick={() => setActiveFormTab("erdung")}
                  className={`px-4 py-2 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${
                    activeFormTab === "erdung" 
                      ? "border-ui-accent text-ui-accent" 
                      : "border-transparent text-ui-muted hover:text-ui-text"
                  }`}
                >
                  Schutzleiter & Potentialausgleich
                </button>
                <button
                  onClick={() => setActiveFormTab("ergebnis")}
                  className={`px-4 py-2 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${
                    activeFormTab === "ergebnis" 
                      ? "border-ui-accent text-ui-accent" 
                      : "border-transparent text-ui-muted hover:text-ui-text"
                  }`}
                >
                  Prüfergebnis & Unterschriften
                </button>
                <button
                  onClick={() => setActiveFormTab("einspeisung")}
                  className={`px-4 py-2 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${
                    activeFormTab === "einspeisung" 
                      ? "border-ui-accent text-ui-accent" 
                      : "border-transparent text-ui-muted hover:text-ui-text"
                  }`}
                >
                  Einspeisung (Seite 2)
                </button>
              </div>

              {/* Tab Contents */}
              <div className="pt-4">
                {activeFormTab === "allgemein" && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div>
                        <label className="block text-[10px] font-black text-ui-muted uppercase tracking-widest mb-2">Kunden Nr.</label>
                        <input type="text" value={kundenNr} onChange={e => setKundenNr(e.target.value)} className="w-full bg-black/40 border border-ui-border/50 rounded-xl px-4 py-3 text-sm font-bold text-ui-text focus:outline-none focus:border-ui-accent" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-ui-muted uppercase tracking-widest mb-2">Prüfprotokoll Nr.</label>
                        <input type="text" value={pruefprotokollNr} onChange={e => setPruefprotokollNr(e.target.value)} className="w-full bg-black/40 border border-ui-border/50 rounded-xl px-4 py-3 text-sm font-bold text-ui-text focus:outline-none focus:border-ui-accent" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-ui-muted uppercase tracking-widest mb-2">Auftrag Nr.</label>
                        <input type="text" value={auftragNr} onChange={e => setAuftragNr(e.target.value)} className="w-full bg-black/40 border border-ui-border/50 rounded-xl px-4 py-3 text-sm font-bold text-ui-text focus:outline-none focus:border-ui-accent" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <label className="block text-[10px] font-black text-ui-muted uppercase tracking-widest">
                            Auftraggeber (Kunde)
                          </label>
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setShowAuftraggeberHistory(!showAuftraggeberHistory)}
                              className="flex items-center gap-1.5 text-[10px] font-black text-ui-accent hover:text-ui-accent/80 uppercase tracking-widest transition-colors focus:outline-none"
                            >
                              <History className="w-3.5 h-3.5" />
                              Kunden-Auswahl ({savedAuftraggebers.length})
                            </button>
                            {showAuftraggeberHistory && (
                              <>
                                <div 
                                  className="fixed inset-0 z-40" 
                                  onClick={() => setShowAuftraggeberHistory(false)} 
                                />
                                <div className="absolute right-0 mt-1 w-80 bg-ui-card border border-ui-border rounded-xl shadow-2xl z-50 p-2 max-h-60 overflow-y-auto divide-y divide-ui-border/40 scrollbar-thin">
                                  {savedAuftraggebers.map((item, i) => (
                                    <div 
                                      key={i} 
                                      className="flex justify-between items-start gap-2 p-2 hover:bg-white/5 rounded-lg transition-colors cursor-pointer group"
                                      onClick={() => {
                                        setAuftraggeber(item);
                                        setShowAuftraggeberHistory(false);
                                      }}
                                    >
                                      <span className="text-[11px] text-ui-text font-medium text-left whitespace-pre-line line-clamp-2">
                                        {item}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const updated = savedAuftraggebers.filter((_, idx) => idx !== i);
                                          setSavedAuftraggebers(updated);
                                          localStorage.setItem("inspecthero_saved_auftraggebers", JSON.stringify(updated));
                                        }}
                                        className="text-ui-muted hover:text-danger opacity-0 group-hover:opacity-100 p-1 transition-all rounded"
                                        title="Eintrag löschen"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </div>
                                  ))}
                                  {savedAuftraggebers.length === 0 && (
                                    <div className="p-2 text-center text-[10px] text-ui-muted">
                                      Keine gespeicherten Kunden
                                    </div>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                        <textarea 
                          rows={3} 
                          value={auftraggeber} 
                          onChange={e => setAuftraggeber(e.target.value)} 
                          onBlur={handleAuftraggeberBlur}
                          className="w-full bg-black/40 border border-ui-border/50 rounded-xl px-4 py-3 text-sm font-semibold text-ui-text focus:outline-none focus:border-ui-accent resize-none" 
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-ui-muted uppercase tracking-widest mb-2">Auftragnehmer (Firma)</label>
                        <textarea rows={3} value={auftragnehmer} onChange={e => setAuftragnehmer(e.target.value)} className="w-full bg-black/40 border border-ui-border/50 rounded-xl px-4 py-3 text-sm font-semibold text-ui-text focus:outline-none focus:border-ui-accent resize-none" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="md:col-span-2">
                        <label className="block text-[10px] font-black text-ui-muted uppercase tracking-widest mb-2">Anlage / UV (Bezeichnung)</label>
                        <input type="text" value={anlage} onChange={e => setAnlage(e.target.value)} className="w-full bg-black/40 border border-ui-border/50 rounded-xl px-4 py-3 text-sm font-bold text-ui-text focus:outline-none focus:border-ui-accent" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-ui-muted uppercase tracking-widest mb-2">Netzspannung (z.B. 400V/230V)</label>
                        <input type="text" value={netzSpannung} onChange={e => setNetzSpannung(e.target.value)} className="w-full bg-black/40 border border-ui-border/50 rounded-xl px-4 py-3 text-sm font-bold text-ui-text focus:outline-none focus:border-ui-accent" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {/* Grund der Prüfung */}
                      <div className="space-y-3">
                        <span className="block text-[10px] font-black text-ui-muted uppercase tracking-widest">Grund der Prüfung</span>
                        <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
                          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={grundNeuanlage} onChange={e => setGrundNeuanlage(e.target.checked)} className="rounded border-ui-border text-ui-accent focus:ring-ui-accent" /> Neuanlage</label>
                          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={grundInstandsetzung} onChange={e => setGrundInstandsetzung(e.target.checked)} className="rounded border-ui-border text-ui-accent focus:ring-ui-accent" /> Instandsetzung</label>
                          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={grundAenderung} onChange={e => setGrundAenderung(e.target.checked)} className="rounded border-ui-border text-ui-accent focus:ring-ui-accent" /> Änderung</label>
                          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={grundWiederholung} onChange={e => setGrundWiederholung(e.target.checked)} className="rounded border-ui-border text-ui-accent focus:ring-ui-accent" /> Wiederholungsprüfung</label>
                          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={grundErweiterung} onChange={e => setGrundErweiterung(e.target.checked)} className="rounded border-ui-border text-ui-accent focus:ring-ui-accent" /> Erweiterung</label>
                        </div>
                        <input type="text" placeholder="Sonstiges..." value={grundSonstiges} onChange={e => setGrundSonstiges(e.target.value)} className="w-full bg-black/40 border border-ui-border/50 rounded-xl px-4 py-2.5 text-xs text-ui-text focus:outline-none focus:border-ui-accent" />
                      </div>

                      {/* Prüfung nach */}
                      <div className="space-y-3">
                        <span className="block text-[10px] font-black text-ui-muted uppercase tracking-widest">Prüfung nach</span>
                        <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
                          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={nachVde0100} onChange={e => setNachVde0100(e.target.checked)} className="rounded border-ui-border text-ui-accent focus:ring-ui-accent" /> VDE 0100-600</label>
                          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={nachVde0105} onChange={e => setNachVde0105(e.target.checked)} className="rounded border-ui-border text-ui-accent focus:ring-ui-accent" /> VDE 0105-100</label>
                          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={nachDguv} onChange={e => setNachDguv(e.target.checked)} className="rounded border-ui-border text-ui-accent focus:ring-ui-accent" /> DGUV V3</label>
                          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={nachEcheck} onChange={e => setNachEcheck(e.target.checked)} className="rounded border-ui-border text-ui-accent focus:ring-ui-accent" /> E-CHECK</label>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[9px] text-ui-muted uppercase tracking-wider mb-1">Beginn</label>
                            <input type="date" value={beginnDatum} onChange={e => { setBeginnDatum(e.target.value); setEndeDatum(e.target.value); }} className="w-full bg-black/40 border border-ui-border/50 rounded-xl px-3 py-1.5 text-xs font-bold text-ui-text focus:outline-none" />
                          </div>
                          <div>
                            <label className="block text-[9px] text-ui-muted uppercase tracking-wider mb-1">Ende</label>
                            <input type="date" value={endeDatum} onChange={e => setEndeDatum(e.target.value)} className="w-full bg-black/40 border border-ui-border/50 rounded-xl px-3 py-1.5 text-xs font-bold text-ui-text focus:outline-none" />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-ui-border/30">
                      {/* Messgeräte */}
                      <div className="space-y-4">
                        <span className="block text-[10px] font-black text-ui-muted uppercase tracking-widest">Verwendete Messgeräte</span>
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <input type="text" placeholder="Messgerät 1 (Model)" value={messgeraetModel1} onChange={e => setMessgeraetModel1(e.target.value)} className="w-full bg-black/40 border border-ui-border/50 rounded-xl px-3 py-2 text-xs text-ui-text focus:outline-none" />
                            <input type="text" placeholder="Serien-Nr." value={messgeraetSerien1} onChange={e => setMessgeraetSerien1(e.target.value)} className="w-full bg-black/40 border border-ui-border/50 rounded-xl px-3 py-2 text-xs text-ui-text focus:outline-none" />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <input type="text" placeholder="Messgerät 2 (Model)" value={messgeraetModel2} onChange={e => setMessgeraetModel2(e.target.value)} className="w-full bg-black/40 border border-ui-border/50 rounded-xl px-3 py-2 text-xs text-ui-text focus:outline-none" />
                            <input type="text" placeholder="Serien-Nr." value={messgeraetSerien2} onChange={e => setMessgeraetSerien2(e.target.value)} className="w-full bg-black/40 border border-ui-border/50 rounded-xl px-3 py-2 text-xs text-ui-text focus:outline-none" />
                          </div>
                        </div>
                      </div>

                      {/* Netzform & Prüfer */}
                      <div className="space-y-4">
                        <span className="block text-[10px] font-black text-ui-muted uppercase tracking-widest">Netzform & Zuständige</span>
                        <div className="grid grid-cols-3 gap-2 text-xs font-semibold mb-3">
                          <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={netzformTnc} onChange={e => setNetzformTnc(e.target.checked)} className="rounded border-ui-border text-ui-accent focus:ring-ui-accent" /> TN-C</label>
                          <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={netzformTncs} onChange={e => setNetzformTncs(e.target.checked)} className="rounded border-ui-border text-ui-accent focus:ring-ui-accent" /> TN-C-S</label>
                          <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={netzformTns} onChange={e => setNetzformTns(e.target.checked)} className="rounded border-ui-border text-ui-accent focus:ring-ui-accent" /> TN-S</label>
                          <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={netzformTt} onChange={e => setNetzformTt(e.target.checked)} className="rounded border-ui-border text-ui-accent focus:ring-ui-accent" /> TT</label>
                          <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={netzformIt} onChange={e => setNetzformIt(e.target.checked)} className="rounded border-ui-border text-ui-accent focus:ring-ui-accent" /> IT</label>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[9px] text-ui-muted mb-1">Zuständiger Prüfer</label>
                            <input type="text" value={prueferName} onChange={e => setPrueferName(e.target.value)} className="w-full bg-black/40 border border-ui-border/50 rounded-xl px-3 py-2 text-xs font-bold text-ui-text focus:outline-none" />
                          </div>
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <label className="block text-[9px] text-ui-muted">EVU / VNB</label>
                              <div className="relative">
                                <button
                                  type="button"
                                  onClick={() => setShowEvuvnbHistory(!showEvuvnbHistory)}
                                  className="flex items-center gap-0.5 text-[8px] font-black text-ui-accent hover:text-ui-accent/80 uppercase tracking-widest transition-colors focus:outline-none"
                                >
                                  <History className="w-2.5 h-2.5" />
                                  Auswahl ({savedEvuvnbs.length})
                                </button>
                                {showEvuvnbHistory && (
                                  <>
                                    <div 
                                      className="fixed inset-0 z-40" 
                                      onClick={() => setShowEvuvnbHistory(false)} 
                                    />
                                    <div className="absolute right-0 mt-1 w-56 bg-ui-card border border-ui-border rounded-xl shadow-2xl z-50 p-2 max-h-48 overflow-y-auto divide-y divide-ui-border/40 scrollbar-thin">
                                      {savedEvuvnbs.map((item, i) => (
                                        <div 
                                          key={i} 
                                          className="flex justify-between items-center gap-2 p-1.5 hover:bg-white/5 rounded-lg transition-colors cursor-pointer group"
                                          onClick={() => {
                                            setEvuvnb(item);
                                            setShowEvuvnbHistory(false);
                                          }}
                                        >
                                          <span className="text-[10px] text-ui-text font-semibold truncate w-40 text-left">
                                            {item}
                                          </span>
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              const updated = savedEvuvnbs.filter((_, idx) => idx !== i);
                                              setSavedEvuvnbs(updated);
                                              localStorage.setItem("inspecthero_saved_evuvnbs", JSON.stringify(updated));
                                            }}
                                            className="text-ui-muted hover:text-danger opacity-0 group-hover:opacity-100 p-0.5 transition-all rounded"
                                            title="Eintrag löschen"
                                          >
                                            <Trash2 className="w-2.5 h-2.5" />
                                          </button>
                                        </div>
                                      ))}
                                      {savedEvuvnbs.length === 0 && (
                                        <div className="p-2 text-center text-[8px] text-ui-muted">
                                          Keine Einträge
                                        </div>
                                      )}
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                            <input 
                              type="text" 
                              value={evuvnb} 
                              onChange={e => setEvuvnb(e.target.value)} 
                              onBlur={handleEvuvnbBlur}
                              className="w-full bg-black/40 border border-ui-border/50 rounded-xl px-3 py-2 text-xs text-ui-text focus:outline-none" 
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[9px] text-ui-muted mb-1">Prüfer Unterschrift (Unterschriftenbild hochladen)</label>
                          <div className="flex items-center gap-3 bg-black/40 border border-ui-border/50 rounded-xl p-3">
                            <label className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-ui-border/50 bg-white/5 hover:bg-white/10 cursor-pointer text-xs font-bold text-ui-text transition-colors">
                              <Upload className="w-3.5 h-3.5 text-ui-accent" />
                              {prueferSignatureBase64 ? "Unterschrift ändern" : "Unterschrift hochladen"}
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const reader = new FileReader();
                                    reader.onloadend = () => {
                                      const base64 = reader.result as string;
                                      setPrueferSignatureBase64(base64);
                                      localStorage.setItem("inspecthero_saved_pruefer_signature", base64);
                                    };
                                    reader.readAsDataURL(file);
                                  }
                                }}
                              />
                            </label>
                            {prueferSignatureBase64 ? (
                              <div className="flex items-center gap-3">
                                <div className="h-10 w-20 bg-white/95 rounded border border-ui-border/60 p-1 flex items-center justify-center">
                                  <img src={prueferSignatureBase64} className="h-8 w-18 object-contain" />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPrueferSignatureBase64("");
                                    localStorage.removeItem("inspecthero_saved_pruefer_signature");
                                  }}
                                  className="flex items-center gap-1 text-[10px] text-red-400 hover:text-red-300 font-bold px-2 py-1 rounded-lg hover:bg-red-500/10 border border-red-500/20 transition-all"
                                  title="Unterschrift löschen"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  Löschen
                                </button>
                              </div>
                            ) : (
                              <span className="text-[10px] text-ui-muted italic">Keine Unterschrift hochgeladen (wird leer gelassen)</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeFormTab === "besichtigen" && (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-sm font-black text-ui-text uppercase tracking-wider mb-4">Besichtigen:</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[
                          { label: "Auswahl der Betriebsmittel", val: besichtigenAuswahl, set: setBesichtigenAuswahl },
                          { label: "Trenn- und Schaltgeräte", val: besichtigenTrenn, set: setBesichtigenTrenn },
                          { label: "Brandabschottungen", val: besichtigenBrand, set: setBesichtigenBrand },
                          { label: "Kabel, Leitungen, Schienen", val: besichtigenKabel, set: setBesichtigenKabel },
                          { label: "Gebäudesystemtechnik (Visual)", val: besichtigenGebaeude, set: setBesichtigenGebaeude },
                          { label: "Kennzeichnung Stromkreise", val: besichtigenKennzeichnung, set: setBesichtigenKennzeichnung },
                          { label: "Kennzeichnung N- und PE-Leiter", val: besichtigenLeiter, set: setBesichtigenLeiter },
                          { label: "Leiterverbindungen", val: besichtigenVerbindungen, set: setBesichtigenVerbindungen },
                          { label: "Schutz geg. direktes Berühren", val: besichtigenSchutzDirekt, set: setBesichtigenSchutzDirekt },
                          { label: "Schutz/Überwachungseinr.", val: besichtigenSchutzUeberwachung, set: setBesichtigenSchutzUeberwachung },
                          { label: "Zugänglichkeit", val: besichtigenZugaenglichkeit, set: setBesichtigenZugaenglichkeit },
                          { label: "Hauptpotentialausgleich", val: besichtigenHauptpotentialausgleich, set: setBesichtigenHauptpotentialausgleich },
                          { label: "Zus. örtl. Potentialausgleich", val: besichtigenZusPotentialausgleich, set: setBesichtigenZusPotentialausgleich },
                          { label: "Dokumentation", val: besichtigenDokumentation, set: setBesichtigenDokumentation },
                          { label: "Siehe Ergänzungsblätter", val: besichtigenErgaenzungsblaetter, set: setBesichtigenErgaenzungsblaetter },
                        ].map((item, idx) => (
                          <div key={idx} className="flex justify-between items-center bg-black/25 p-3 rounded-xl border border-ui-border/30">
                            <span className="text-xs font-semibold text-ui-text">{item.label}</span>
                            <div className="flex gap-2">
                              {["io", "nio", "none"].map(opt => (
                                <button
                                  key={opt}
                                  onClick={() => item.set(opt as any)}
                                  className={`px-2 py-1 text-[10px] font-black uppercase rounded ${
                                    item.val === opt 
                                      ? opt === "io" ? "bg-success/20 text-success border border-success/35" : opt === "nio" ? "bg-danger/20 text-danger border border-danger/35" : "bg-white/10 text-ui-muted"
                                      : "bg-transparent text-ui-muted/50 border border-transparent hover:bg-white/5"
                                  }`}
                                >
                                  {opt === "io" ? "i.O." : opt === "nio" ? "n.i.O." : "—"}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="pt-6 border-t border-ui-border/30">
                      <h3 className="text-sm font-black text-ui-text uppercase tracking-wider mb-4">Erproben:</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[
                          { label: "Funktionsprüfung der Anlage", val: erprobenFunktion, set: setErprobenFunktion },
                          { label: "FI-Schutzschalter (RCD)", val: erprobenRcd, set: setErprobenRcd },
                          { label: "Funktion Schutz-/Sicherheit", val: erprobenSchutzSicherheit, set: setErprobenSchutzSicherheit },
                          { label: "Drehrichtung der Motoren", val: erprobenDrehrichtung, set: setErprobenDrehrichtung },
                          { label: "Rechtsfeld Drehstromsteckd.", val: erprobenRechtsfeld, set: setErprobenRechtsfeld },
                          { label: "Gebäudesystemtechnik (Erproben)", val: erprobenGebaeude, set: setErprobenGebaeude },
                        ].map((item, idx) => (
                          <div key={idx} className="flex justify-between items-center bg-black/25 p-3 rounded-xl border border-ui-border/30">
                            <span className="text-xs font-semibold text-ui-text">{item.label}</span>
                            <div className="flex gap-2">
                              {["io", "nio", "none"].map(opt => (
                                <button
                                  key={opt}
                                  onClick={() => item.set(opt as any)}
                                  className={`px-2 py-1 text-[10px] font-black uppercase rounded ${
                                    item.val === opt 
                                      ? opt === "io" ? "bg-success/20 text-success border border-success/35" : opt === "nio" ? "bg-danger/20 text-danger border border-danger/35" : "bg-white/10 text-ui-muted"
                                      : "bg-transparent text-ui-muted/50 border border-transparent hover:bg-white/5"
                                  }`}
                                >
                                  {opt === "io" ? "i.O." : opt === "nio" ? "n.i.O." : "—"}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {activeFormTab === "erdung" && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="flex items-center justify-between bg-black/25 p-4 rounded-xl border border-ui-border/30">
                        <span className="text-sm font-semibold">Durchgängigkeit des Schutzleiters (≤1Ω)</span>
                        <input type="checkbox" checked={schtzleiterDurchgaengig} onChange={e => setSchtzleiterDurchgaengig(e.target.checked)} className="w-5 h-5 rounded border-ui-border text-ui-accent focus:ring-ui-accent" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-ui-muted uppercase tracking-widest mb-2">Erdungswiderstand (Ω)</label>
                        <input type="text" placeholder="z.B. 0.15" value={erdungswiderstand} onChange={e => setErdungswiderstand(e.target.value)} className="w-full bg-black/40 border border-ui-border/50 rounded-xl px-4 py-3 text-sm font-bold text-ui-text focus:outline-none" />
                      </div>
                    </div>

                    <div className="space-y-4 pt-4 border-t border-ui-border/30">
                      <span className="block text-[10px] font-black text-ui-muted uppercase tracking-widest">Durchgängigkeit Potentialausgleich geprüft bei:</span>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-semibold">
                        <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={potFundamenterder} onChange={e => setPotFundamenterder(e.target.checked)} className="rounded text-ui-accent" /> Fundamenterder</label>
                        <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={potSchiene} onChange={e => setPotSchiene(e.target.checked)} className="rounded text-ui-accent" /> Potentialausgleichsschiene</label>
                        <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={potWasserzaehler} onChange={e => setPotWasserzaehler(e.target.checked)} className="rounded text-ui-accent" /> Wasserzwischenzähler</label>
                        <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={potHauptwasser} onChange={e => setPotHauptwasser(e.target.checked)} className="rounded text-ui-accent" /> Hauptwasserleitung</label>
                        <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={potHauptschutzleiter} onChange={e => setPotHauptschutzleiter(e.target.checked)} className="rounded text-ui-accent" /> Hauptschutzleiter</label>
                        <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={potGas} onChange={e => setPotGas(e.target.checked)} className="rounded text-ui-accent" /> Gasinnenleitung</label>
                        <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={potHeizung} onChange={e => setPotHeizung(e.target.checked)} className="rounded text-ui-accent" /> Heizungsanlage</label>
                        <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={potKlima} onChange={e => setPotKlima(e.target.checked)} className="rounded text-ui-accent" /> Klimaanlage</label>
                        <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={potAufzug} onChange={e => setPotAufzug(e.target.checked)} className="rounded text-ui-accent" /> Aufzugsanlage</label>
                        <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={potEdv} onChange={e => setPotEdv(e.target.checked)} className="rounded text-ui-accent" /> EDV Anlage</label>
                        <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={potTelefon} onChange={e => setPotTelefon(e.target.checked)} className="rounded text-ui-accent" /> Telefonanlage</label>
                        <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={potBlitzschutz} onChange={e => setPotBlitzschutz(e.target.checked)} className="rounded text-ui-accent" /> Blitzschutzanlage</label>
                        <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={potAntenne} onChange={e => setPotAntenne(e.target.checked)} className="rounded text-ui-accent" /> Antennenanlage/BK</label>
                        <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={potGebaeudekonstr} onChange={e => setPotGebaeudekonstr(e.target.checked)} className="rounded text-ui-accent" /> Gebäudekonstruktion</label>
                      </div>
                      <input type="text" placeholder="Weitere Anschlüsse..." value={potSonstiges} onChange={e => setPotSonstiges(e.target.value)} className="w-full md:w-1/2 bg-black/40 border border-ui-border/50 rounded-xl px-4 py-2.5 text-xs text-ui-text focus:outline-none" />
                    </div>
                  </div>
                )}

                {activeFormTab === "ergebnis" && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {/* Prüfergebnis */}
                      <div className="space-y-4">
                        <span className="block text-[10px] font-black text-ui-muted uppercase tracking-widest">Gesamtprüfergebnis</span>
                        <div className="flex gap-6 text-sm font-semibold">
                          <label className="flex items-center gap-2 cursor-pointer"><input type="radio" checked={keineMaengel} onChange={() => { setKeineMaengel(true); setMaengelFestgestellt(false); }} className="text-ui-accent focus:ring-ui-accent" /> keine Mängel festgestellt</label>
                          <label className="flex items-center gap-2 cursor-pointer"><input type="radio" checked={maengelFestgestellt} onChange={() => { setKeineMaengel(false); setMaengelFestgestellt(true); }} className="text-ui-accent focus:ring-ui-accent" /> Mängel festgestellt</label>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[9px] text-ui-muted mb-1">Nächster Prüftermin</label>
                            <input type="text" placeholder="z.B. Nov 2024" value={naechsterTermin} onChange={e => setNaechsterTermin(e.target.value)} className="w-full bg-black/40 border border-ui-border/50 rounded-xl px-3 py-2 text-xs text-ui-text focus:outline-none" />
                          </div>
                          <div>
                            <label className="block text-[9px] text-ui-muted mb-1">Prüfplakette angebracht?</label>
                            <div className="flex gap-4 items-center h-10 text-xs font-semibold">
                              <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" checked={plaketteJa} onChange={() => { setPlaketteJa(true); setPlaketteNein(false); }} className="text-ui-accent" /> JA</label>
                              <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" checked={plaketteNein} onChange={() => { setPlaketteJa(false); setPlaketteNein(true); }} className="text-ui-accent" /> NEIN</label>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Konformität */}
                      <div className="space-y-4">
                        <span className="block text-[10px] font-black text-ui-muted uppercase tracking-widest">VDE-Regelwerksprüfung</span>
                        <div className="flex flex-col gap-2 text-xs font-semibold">
                          <label className="flex items-center gap-2 cursor-pointer"><input type="radio" checked={entsprichtVDE} onChange={() => setEntsprichtVDE(true)} className="text-ui-accent" /> Elektrische Anlage entspricht den anerkannten Regeln der Elektrotechnik</label>
                          <label className="flex items-center gap-2 cursor-pointer"><input type="radio" checked={!entsprichtVDE} onChange={() => setEntsprichtVDE(false)} className="text-ui-accent" /> Elektrische Anlage entspricht NICHT den anerkannten Regeln</label>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-ui-border/30">
                      {/* Auftraggeber Freigabe */}
                      <div className="space-y-3">
                        <span className="block text-[10px] font-black text-ui-muted uppercase tracking-widest">Auftraggeber Freigabe</span>
                        <div className="flex flex-col gap-2 text-xs font-semibold mb-3">
                          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={kundeUebernommen} onChange={e => setKundeUebernommen(e.target.checked)} className="rounded" /> Anlage vollständig übernommen</label>
                          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={kundeZustandsbericht} onChange={e => setKundeZustandsbericht(e.target.checked)} className="rounded" /> Zustandsbericht erhalten</label>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <input type="text" placeholder="Ort (Kunde)" value={kundeOrt} onChange={e => setKundeOrt(e.target.value)} className="w-full bg-black/40 border border-ui-border/50 rounded-xl px-3 py-2 text-xs text-ui-text focus:outline-none" />
                          <input type="text" placeholder="Datum (Kunde)" value={kundeDatum} onChange={e => setKundeDatum(e.target.value)} className="w-full bg-black/40 border border-ui-border/50 rounded-xl px-3 py-2 text-xs text-ui-text focus:outline-none" />
                        </div>
                      </div>

                      {/* Prüfer Freigabe */}
                      <div className="space-y-3">
                        <span className="block text-[10px] font-black text-ui-muted uppercase tracking-widest">Prüfer Freigabe</span>
                        <div className="grid grid-cols-2 gap-3 pt-6">
                          <div>
                            <label className="block text-[9px] text-ui-muted mb-1">Ort</label>
                            <input type="text" value={prueferOrt} onChange={e => setPrueferOrt(e.target.value)} className="w-full bg-black/40 border border-ui-border/50 rounded-xl px-3 py-2 text-xs text-ui-text focus:outline-none" />
                          </div>
                          <div>
                            <label className="block text-[9px] text-ui-muted mb-1">Datum</label>
                            <input type="date" value={prueferDatum} onChange={e => setPrueferDatum(e.target.value)} className="w-full bg-black/40 border border-ui-border/50 rounded-xl px-3 py-2 text-xs text-ui-text focus:outline-none" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeFormTab === "einspeisung" && (
                  <div className="space-y-6">
                    <div className="bg-black/30 border border-ui-border rounded-xl p-6 space-y-4">
                      <h3 className="text-sm font-black text-ui-text uppercase tracking-wider">
                        Einspeisung / Hauptzuleitung (Seite 2) - Messwerte bearbeiten
                      </h3>
                      <p className="text-xs text-ui-muted">
                        Hier können Sie die 4 Zeilen der Hauptzuleitung (Einspeisung) anpassen, die nahtlos auf Seite 2 generiert werden.
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-2 border-b border-ui-border/30">
                        <div>
                          <label className="block text-[10px] font-black text-ui-muted uppercase tracking-widest mb-1.5">
                            Verteiler / UV Name (Seite 2)
                          </label>
                          <input
                            type="text"
                            value={einspeisungVerteilerName}
                            onChange={e => setEinspeisungVerteilerName(e.target.value)}
                            className="w-full bg-black/40 border border-ui-border/50 rounded-xl px-3 py-2 text-xs text-ui-text focus:outline-none focus:border-ui-accent"
                          />
                        </div>
                        <div className="flex flex-col justify-end">
                          <label className="flex items-center gap-2.5 cursor-pointer text-xs text-ui-text select-none py-2.5">
                            <input
                              type="checkbox"
                              checked={einspeisungRisoMit}
                              onChange={e => setEinspeisungRisoMit(e.target.checked)}
                              className="rounded border-ui-border text-ui-accent focus:ring-ui-accent h-4 w-4 bg-black/40"
                            />
                            <span>R_ISO Messung mit Verbrauchern (mit / ohne)</span>
                          </label>
                        </div>
                      </div>

                      <div className="overflow-x-auto border border-ui-border rounded-lg bg-black/20">
                        <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                          <thead>
                            <tr className="bg-white/5 border-b border-ui-border text-[9px] font-black uppercase tracking-wider text-ui-muted text-center">
                              <th className="py-2 px-2" rowSpan={2}>Nr.</th>
                              <th className="py-2 px-2 text-left" rowSpan={2}>Zielbezeichnung</th>
                              <th className="py-2 px-2 border-l border-ui-border" colSpan={3}>Leitung / Kabel</th>
                              <th className="py-2 px-2 border-l border-ui-border" colSpan={2}>Schutzleiter (≤1Ω)</th>
                              <th className="py-2 px-2 border-l border-ui-border" rowSpan={2}>R_ISO (MΩ)</th>
                              <th className="py-2 px-2 border-l border-ui-border" colSpan={5}>Überstromschutz</th>
                              <th className="py-2 px-2 border-l border-ui-border" colSpan={6}>RCD Schutzorgan</th>
                              <th className="py-2 px-2 border-l border-ui-border" rowSpan={2}>Fehlercode</th>
                            </tr>
                            <tr className="bg-white/5 border-b border-ui-border text-[8px] font-bold text-ui-muted text-center">
                              {/* Leitung/Kabel */}
                              <th className="py-1 px-1 border-l border-ui-border">Typ</th>
                              <th className="py-1 px-1">Anz.</th>
                              <th className="py-1 px-1">mm²</th>
                              {/* Schutzleiter */}
                              <th className="py-1 px-1 border-l border-ui-border">HPA (Ω)</th>
                              <th className="py-1 px-1">ZPA (Ω)</th>
                              {/* Überstromschutz */}
                              <th className="py-1 px-1 border-l border-ui-border">Art/Char</th>
                              <th className="py-1 px-1">In (A)</th>
                              <th className="py-1 px-1">t (s)</th>
                              <th className="py-1 px-1">Zs (Ω) / Ik (A)</th>
                              <th className="py-1 px-1">Zl (Ω) / Ik (A)</th>
                              {/* RCD */}
                              <th className="py-1 px-1 border-l border-ui-border">In/Art</th>
                              <th className="py-1 px-1">IdN (mA)</th>
                              <th className="py-1 px-1">Id (mA)</th>
                              <th className="py-1 px-1">ta (ms)</th>
                              <th className="py-1 px-1">td (ms)</th>
                              <th className="py-1 px-1">Uc (V)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-ui-border">
                            {einspeisungRows.map((row, idx) => (
                              <tr key={idx} className="hover:bg-white/5 transition-colors">
                                <td className="py-2 px-2 text-center text-ui-muted font-bold">#{row.nr}</td>
                                <td className="py-2 px-2">
                                  <input
                                    type="text"
                                    value={row.bezeichnung}
                                    onChange={e => updateEinspeisungField(idx, "bezeichnung", e.target.value)}
                                    className="w-32 bg-black/40 border border-ui-border rounded px-2 py-1 text-xs text-ui-text font-bold focus:outline-none focus:border-ui-accent"
                                  />
                                </td>
                                
                                {/* Leitung/Kabel */}
                                <td className="py-2 px-1 border-l border-ui-border">
                                  <input
                                    type="text"
                                    placeholder="z.B. NYM"
                                    value={row.kabeltyp || ""}
                                    onChange={e => updateEinspeisungField(idx, "kabeltyp", e.target.value)}
                                    className="w-20 bg-black/40 border border-ui-border rounded px-1.5 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center"
                                  />
                                </td>
                                <td className="py-2 px-1">
                                  <input
                                    type="text"
                                    placeholder="5"
                                    value={row.leiterAnzahl || ""}
                                    onChange={e => updateEinspeisungField(idx, "leiterAnzahl", e.target.value)}
                                    className="w-10 bg-black/40 border border-ui-border rounded px-1.5 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center"
                                  />
                                </td>
                                <td className="py-2 px-1">
                                  <input
                                    type="text"
                                    placeholder="16"
                                    value={row.leiterQuerschnitt || ""}
                                    onChange={e => updateEinspeisungField(idx, "leiterQuerschnitt", e.target.value)}
                                    className="w-12 bg-black/40 border border-ui-border rounded px-1.5 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center"
                                  />
                                </td>

                                {/* Schutzleiter */}
                                <td className="py-2 px-1 border-l border-ui-border">
                                  <input
                                    type="text"
                                    value={row.rPeHaupt || ""}
                                    onChange={e => updateEinspeisungField(idx, "rPeHaupt", e.target.value)}
                                    className="w-14 bg-black/40 border border-ui-border rounded px-1.5 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center"
                                  />
                                </td>
                                <td className="py-2 px-1">
                                  <input
                                    type="text"
                                    value={row.rPeZusatz || ""}
                                    onChange={e => updateEinspeisungField(idx, "rPeZusatz", e.target.value)}
                                    className="w-14 bg-black/40 border border-ui-border rounded px-1.5 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center"
                                  />
                                </td>

                                {/* R_ISO */}
                                <td className="py-2 px-1 border-l border-ui-border">
                                  <input
                                    type="text"
                                    value={row.rIso || ""}
                                    onChange={e => updateEinspeisungField(idx, "rIso", e.target.value)}
                                    className="w-20 bg-black/40 border border-ui-border rounded px-1.5 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center font-bold text-success"
                                  />
                                </td>

                                {/* Überstromschutz */}
                                <td className="py-2 px-1 border-l border-ui-border">
                                  <input
                                    type="text"
                                    value={row.charakteristik || ""}
                                    onChange={e => updateEinspeisungField(idx, "charakteristik", e.target.value)}
                                    className="w-20 bg-black/40 border border-ui-border rounded px-1.5 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center"
                                  />
                                </td>
                                <td className="py-2 px-1">
                                  <input
                                    type="text"
                                    value={row.absicherung || ""}
                                    onChange={e => updateEinspeisungField(idx, "absicherung", e.target.value)}
                                    className="w-14 bg-black/40 border border-ui-border rounded px-1.5 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center font-bold"
                                  />
                                </td>
                                <td className="py-2 px-1">
                                  <input
                                    type="text"
                                    value={row.ausloeseZeit || ""}
                                    onChange={e => updateEinspeisungField(idx, "ausloeseZeit", e.target.value)}
                                    className="w-12 bg-black/40 border border-ui-border rounded px-1.5 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center"
                                  />
                                </td>
                                <td className="py-2 px-1">
                                  <div className="flex gap-1 items-center">
                                    <input
                                      type="text"
                                      placeholder="Zs"
                                      value={row.zS || ""}
                                      onChange={e => updateEinspeisungField(idx, "zS", e.target.value)}
                                      className="w-14 bg-black/40 border border-ui-border rounded px-1 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center"
                                    />
                                    <span className="text-ui-muted">/</span>
                                    <input
                                      type="text"
                                      placeholder="Ik"
                                      value={row.iK || ""}
                                      onChange={e => updateEinspeisungField(idx, "iK", e.target.value)}
                                      className="w-16 bg-black/40 border border-ui-border rounded px-1 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center"
                                    />
                                  </div>
                                </td>
                                <td className="py-2 px-1">
                                  <div className="flex gap-1 items-center">
                                    <input
                                      type="text"
                                      placeholder="Zl"
                                      value={row.zL || ""}
                                      onChange={e => updateEinspeisungField(idx, "zL", e.target.value)}
                                      className="w-14 bg-black/40 border border-ui-border rounded px-1 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center"
                                    />
                                    <span className="text-ui-muted">/</span>
                                    <input
                                      type="text"
                                      placeholder="Ik"
                                      value={row.iKL || ""}
                                      onChange={e => updateEinspeisungField(idx, "iKL", e.target.value)}
                                      className="w-16 bg-black/40 border border-ui-border rounded px-1 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center"
                                    />
                                  </div>
                                </td>

                                {/* RCD */}
                                <td className="py-2 px-1 border-l border-ui-border">
                                  <input
                                    type="text"
                                    placeholder="40/A"
                                    value={row.rcdInArt || ""}
                                    onChange={e => updateEinspeisungField(idx, "rcdInArt", e.target.value)}
                                    className="w-16 bg-black/40 border border-ui-border rounded px-1.5 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center"
                                  />
                                </td>
                                <td className="py-2 px-1">
                                  <input
                                    type="text"
                                    placeholder="30"
                                    value={row.rcdIdn || ""}
                                    onChange={e => updateEinspeisungField(idx, "rcdIdn", e.target.value)}
                                    className="w-12 bg-black/40 border border-ui-border rounded px-1.5 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center"
                                  />
                                </td>
                                <td className="py-2 px-1">
                                  <input
                                    type="text"
                                    placeholder="22"
                                    value={row.rcdId || ""}
                                    onChange={e => updateEinspeisungField(idx, "rcdId", e.target.value)}
                                    className="w-12 bg-black/40 border border-ui-border rounded px-1.5 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center"
                                  />
                                </td>
                                <td className="py-2 px-1">
                                  <input
                                    type="text"
                                    placeholder="25"
                                    value={row.rcdTa || ""}
                                    onChange={e => updateEinspeisungField(idx, "rcdTa", e.target.value)}
                                    className="w-12 bg-black/40 border border-ui-border rounded px-1.5 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center"
                                  />
                                </td>
                                <td className="py-2 px-1">
                                  <input
                                    type="text"
                                    value={row.rcdTd || ""}
                                    onChange={e => updateEinspeisungField(idx, "rcdTd", e.target.value)}
                                    className="w-12 bg-black/40 border border-ui-border rounded px-1.5 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center"
                                  />
                                </td>
                                <td className="py-2 px-1">
                                  <input
                                    type="text"
                                    placeholder="0.8"
                                    value={row.rcdUc || ""}
                                    onChange={e => updateEinspeisungField(idx, "rcdUc", e.target.value)}
                                    className="w-12 bg-black/40 border border-ui-border rounded px-1.5 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center"
                                  />
                                </td>

                                {/* Fehlercode */}
                                <td className="py-2 px-2 border-l border-ui-border">
                                  <input
                                    type="text"
                                    value={row.fehlercode || ""}
                                    onChange={e => updateEinspeisungField(idx, "fehlercode", e.target.value)}
                                    className="w-16 bg-black/40 border border-ui-border rounded px-2 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center"
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Fuses table & configuration */}
            <div className="bg-ui-card border border-ui-border rounded-xl p-8 shadow-2xl space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h2 className="text-xl font-black text-ui-text uppercase tracking-tight">
                    Sicherungsbelegungsplan des Verteilers
                  </h2>
                  <p className="text-xs font-bold text-ui-muted mt-1 uppercase tracking-widest opacity-60">
                    Sicherungsorgane aus dem Stromlaufplan anpassen oder neu erstellen
                  </p>
                </div>
                <button
                  onClick={handleAddNewFuse}
                  className="flex items-center gap-2 px-5 py-3 bg-ui-accent text-ui-bg hover:opacity-90 rounded-xl text-xs font-black uppercase tracking-wider shadow-lg active:scale-95 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  Sicherung hinzufügen
                </button>
              </div>

              {/* Grid / Table container */}
              <div className="border border-ui-border rounded-xl overflow-hidden bg-black/20">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-white/5 border-b border-ui-border text-[10px] font-black uppercase tracking-wider text-ui-muted">
                        <th className="py-4 px-6 w-[80px]">Nr.</th>
                        <th className="py-4 px-6 w-[100px] text-center">Messung</th>
                        <th className="py-4 px-6 w-[150px]">Sicherung (z.B. 1F1.2)</th>
                        <th className="py-4 px-6 w-[120px]">Nennstrom (A)</th>
                        <th className="py-4 px-6 w-[120px]">Charakteristik</th>
                        <th className="py-4 px-6 w-[140px]">Phasen</th>
                        <th className="py-4 px-6">Stromkreis / Bezeichnung</th>
                        <th className="py-4 px-6 w-[100px] text-center">RCD / FI</th>
                        <th className="py-4 px-6 w-[140px] text-center">Aktionen</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ui-border text-sm font-semibold text-ui-text">
                      {fuses.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-12 text-center text-ui-muted uppercase tracking-widest text-xs">
                            Keine Sicherungen gelistet. Klicken Sie auf "Sicherung hinzufügen" oder laden Sie einen PDF-Plan hoch.
                          </td>
                        </tr>
                      ) : (
                        fuses.map((fuse, i) => (
                          <tr 
                            key={i} 
                            className={`hover:bg-white/5 transition-colors ${
                              editingIndex === i ? "bg-ui-accent/5 border-ui-accent/30" : ""
                            } ${fuse.active === false ? "opacity-40" : ""}`}
                          >
                            <td className="py-3 px-6 text-ui-muted">#{i + 1}</td>
                            <td className="py-3 px-6 text-center">
                              <input 
                                type="checkbox" 
                                checked={fuse.active !== false}
                                onChange={() => toggleActive(i)}
                                className="w-5 h-5 rounded border-ui-border bg-transparent text-ui-accent focus:ring-ui-accent cursor-pointer"
                                title="Messung durchführen?"
                              />
                            </td>
                            <td className="py-3 px-6">
                              {editingIndex === i ? (
                                <input 
                                  type="text" 
                                  value={editName}
                                  onChange={e => setEditName(e.target.value)}
                                  className="w-full bg-black/40 border border-ui-border rounded-lg px-3 py-1.5 text-sm font-bold text-ui-text focus:outline-none focus:border-ui-accent"
                                />
                              ) : (
                                <span className="font-black text-ui-accent">{fuse.name}</span>
                              )}
                            </td>
                            <td className="py-3 px-6">
                              {editingIndex === i ? (
                                <select 
                                  value={editRating}
                                  onChange={e => setEditRating(Number(e.target.value))}
                                  className="w-full bg-black/40 border border-ui-border rounded-lg px-2 py-1.5 text-sm font-bold text-ui-text focus:outline-none focus:border-ui-accent"
                                >
                                  {[6, 10, 13, 16, 20, 25, 32, 40, 50, 63].map(val => (
                                    <option key={val} value={val} className="bg-ui-bg">{val} A</option>
                                  ))}
                                </select>
                              ) : (
                                <span>{fuse.rating} A</span>
                              )}
                            </td>
                            <td className="py-3 px-6">
                              {editingIndex === i ? (
                                <select 
                                  value={editChar}
                                  onChange={e => setEditChar(e.target.value)}
                                  className="w-full bg-black/40 border border-ui-border rounded-lg px-2 py-1.5 text-sm font-bold text-ui-text focus:outline-none focus:border-ui-accent"
                                >
                                  {["B", "C", "D", "gG"].map(val => (
                                    <option key={val} value={val} className="bg-ui-bg">{val}</option>
                                  ))}
                                </select>
                              ) : (
                                <span>{fuse.characteristic}</span>
                              )}
                            </td>
                            <td className="py-3 px-6">
                              {editingIndex === i ? (
                                <select 
                                  value={editPhases}
                                  onChange={e => setEditPhases(Number(e.target.value))}
                                  className="w-full bg-black/40 border border-ui-border rounded-lg px-2 py-1.5 text-sm font-bold text-ui-text focus:outline-none focus:border-ui-accent"
                                >
                                  <option value={1} className="bg-ui-bg">1-Phase</option>
                                  <option value={3} className="bg-ui-bg">3-Phasen</option>
                                </select>
                              ) : (
                                <span>{fuse.phases === 3 ? "3-Phasen" : "1-Phase"}</span>
                              )}
                            </td>
                            <td className="py-3 px-6">
                              {editingIndex === i ? (
                                <input 
                                  type="text" 
                                  value={editDesc}
                                  onChange={e => setEditDesc(e.target.value)}
                                  className="w-full bg-black/40 border border-ui-border rounded-lg px-3 py-1.5 text-sm font-bold text-ui-text focus:outline-none focus:border-ui-accent"
                                />
                              ) : (
                                <span className="opacity-80">{fuse.description}</span>
                              )}
                            </td>
                            <td className="py-3 px-6 text-center">
                              <input 
                                type="checkbox" 
                                checked={editingIndex === i ? editRcd : fuse.rcd}
                                onChange={() => toggleRcd(i)}
                                className="w-5 h-5 rounded border-ui-border bg-transparent text-ui-accent focus:ring-ui-accent cursor-pointer"
                              />
                            </td>
                            <td className="py-3 px-6">
                              <div className="flex items-center justify-center gap-2">
                                {editingIndex === i ? (
                                  <>
                                    <button
                                      onClick={() => saveEditing(i)}
                                      className="p-2 bg-success/10 text-success border border-success/30 rounded-lg hover:bg-success/20 transition-colors"
                                      title="Speichern"
                                    >
                                      <Check className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={cancelEditing}
                                      className="p-2 bg-white/5 text-ui-muted border border-ui-border rounded-lg hover:bg-white/10 transition-colors"
                                      title="Abbrechen"
                                    >
                                      ✕
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => startEditing(i)}
                                      className="p-2 bg-white/5 text-ui-text border border-ui-border rounded-lg hover:bg-white/10 hover:text-ui-accent transition-colors"
                                      title="Bearbeiten"
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteFuse(i)}
                                      className="p-2 bg-danger/5 text-danger border border-danger/10 rounded-lg hover:bg-danger/10 hover:border-danger/30 transition-all"
                                      title="Löschen"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Form Controls */}
              <div className="flex justify-between items-center pt-4">
                <button
                  onClick={() => setStep(1)}
                  className="px-6 py-4 bg-white/5 hover:bg-white/10 border border-ui-border rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-300"
                >
                  Zurück
                </button>
                
                <button
                  onClick={handleGenerateMeasurements}
                  disabled={fuses.length === 0}
                  className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-ui-accent to-blue-600 disabled:from-ui-border disabled:to-ui-border text-ui-bg hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-xs font-black uppercase tracking-widest shadow-xl shadow-ui-accent/10 active:scale-95 transition-all duration-300"
                >
                  <RefreshCw className="w-4 h-4" />
                  Messwerte generieren
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-6"
          >
            {/* Action buttons & Summary */}
            <div className="bg-ui-card border border-ui-border rounded-xl p-8 shadow-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div className="space-y-2">
                <h2 className="text-xl font-black text-ui-text uppercase tracking-tight">
                  Generierte Messprotokoll-Werte
                </h2>
                <p className="text-xs font-bold text-ui-muted uppercase tracking-widest opacity-60">
                  Die Werte wurden berechnet und erfüllen alle Anforderungen der DIN VDE 0100-600.
                </p>
              </div>

              <div className="flex flex-wrap gap-4 w-full md:w-auto">
                <button
                  onClick={handleRegenerateValues}
                  className="flex-grow md:flex-grow-0 flex items-center justify-center gap-2 px-6 py-4 bg-white/5 hover:bg-white/10 border border-ui-border hover:border-ui-accent/30 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300"
                  title="Werte neu auswürfeln"
                >
                  <RefreshCw className="w-4 h-4" />
                  Werte neu generieren
                </button>
              </div>
            </div>

            {/* Comments Editor Box */}
            <div className="bg-ui-card border border-ui-border rounded-xl p-8 shadow-2xl">
              <label className="block text-[10px] font-black text-ui-muted uppercase tracking-widest mb-3">
                Bemerkungen / Messergebnis (wird unten auf dem PDF ausgegeben)
              </label>
              <textarea
                value={comments}
                onChange={e => setComments(e.target.value)}
                rows={3}
                className="w-full bg-black/40 border border-ui-border/50 rounded-xl px-4 py-3 text-sm font-semibold text-ui-text focus:outline-none focus:border-ui-accent resize-y"
              />
            </div>

            {/* Page 2 - Einspeisung Table in Step 3 */}
            <div className="bg-ui-card border border-ui-border rounded-xl p-8 shadow-2xl space-y-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h3 className="text-lg font-black text-ui-text uppercase tracking-tight">
                  Einspeisung / Hauptzuleitung (Seite 2) - Daten bearbeiten
                </h3>
                <div className="flex flex-wrap items-center gap-6">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-ui-text select-none">
                    <input
                      type="checkbox"
                      checked={einspeisungRisoMit}
                      onChange={e => setEinspeisungRisoMit(e.target.checked)}
                      className="rounded border-ui-border text-ui-accent focus:ring-ui-accent h-4 w-4 bg-black/40"
                    />
                    <span>R_ISO Messung mit Verbrauchern</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-ui-muted font-bold uppercase tracking-wider">Verteiler:</span>
                    <input
                      type="text"
                      value={einspeisungVerteilerName}
                      onChange={e => setEinspeisungVerteilerName(e.target.value)}
                      className="bg-black/40 border border-ui-border/50 rounded px-2.5 py-1 text-xs font-bold text-ui-text focus:outline-none focus:border-ui-accent text-center w-40"
                    />
                  </div>
                </div>
              </div>

              <div className="border border-ui-border rounded-xl overflow-hidden bg-black/20">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                    <thead>
                      <tr className="bg-white/5 border-b border-ui-border text-[9px] font-black uppercase tracking-wider text-ui-muted text-center">
                        <th className="py-3 px-2" rowSpan={2}>Nr.</th>
                        <th className="py-3 px-2 text-left" rowSpan={2}>Zielbezeichnung</th>
                        <th className="py-3 px-2 border-l border-ui-border" colSpan={3}>Leitung / Kabel</th>
                        <th className="py-3 px-2 border-l border-ui-border" colSpan={2}>Schutzleiter (≤1Ω)</th>
                        <th className="py-3 px-2 border-l border-ui-border" rowSpan={2}>R_ISO (MΩ)</th>
                        <th className="py-3 px-2 border-l border-ui-border" colSpan={5}>Überstromschutz</th>
                        <th className="py-3 px-2 border-l border-ui-border" colSpan={6}>RCD Schutzorgan</th>
                        <th className="py-3 px-2 border-l border-ui-border" rowSpan={2}>Fehlercode</th>
                      </tr>
                      <tr className="bg-white/5 border-b border-ui-border text-[8px] font-bold text-ui-muted text-center">
                        <th className="py-1 px-1 border-l border-ui-border">Typ</th>
                        <th className="py-1 px-1">Anz.</th>
                        <th className="py-1 px-1">mm²</th>
                        <th className="py-1 px-1 border-l border-ui-border">HPA (Ω)</th>
                        <th className="py-1 px-1">ZPA (Ω)</th>
                        <th className="py-1 px-1 border-l border-ui-border">Art/Char</th>
                        <th className="py-1 px-1">In (A)</th>
                        <th className="py-1 px-1">t (s)</th>
                        <th className="py-1 px-1">Zs / Ik</th>
                        <th className="py-1 px-1">ZL / Ik</th>
                        <th className="py-1 px-1 border-l border-ui-border">In/Art</th>
                        <th className="py-1 px-1">IdN (mA)</th>
                        <th className="py-1 px-1">Id (mA)</th>
                        <th className="py-1 px-1">ta (ms)</th>
                        <th className="py-1 px-1">td (ms)</th>
                        <th className="py-1 px-1">Uc (V)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ui-border font-semibold text-ui-text text-center">
                      {einspeisungRows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-white/5 transition-colors">
                          <td className="py-2 px-2 text-center text-ui-muted font-bold">#{row.nr}</td>
                          <td className="py-2 px-2">
                            <input
                              type="text"
                              value={row.bezeichnung || ""}
                              onChange={e => updateEinspeisungField(idx, "bezeichnung", e.target.value)}
                              className="w-32 bg-black/40 border border-ui-border rounded px-2 py-1 text-xs text-ui-text font-bold focus:outline-none focus:border-ui-accent"
                            />
                          </td>
                          <td className="py-2 px-1 border-l border-ui-border">
                            <input
                              type="text"
                              placeholder="z.B. NYM"
                              value={row.kabeltyp || ""}
                              onChange={e => updateEinspeisungField(idx, "kabeltyp", e.target.value)}
                              className="w-20 bg-black/40 border border-ui-border rounded px-1.5 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center"
                            />
                          </td>
                          <td className="py-2 px-1">
                            <input
                              type="text"
                              placeholder="5"
                              value={row.leiterAnzahl || ""}
                              onChange={e => updateEinspeisungField(idx, "leiterAnzahl", e.target.value)}
                              className="w-10 bg-black/40 border border-ui-border rounded px-1.5 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center"
                            />
                          </td>
                          <td className="py-2 px-1">
                            <input
                              type="text"
                              placeholder="16"
                              value={row.leiterQuerschnitt || ""}
                              onChange={e => updateEinspeisungField(idx, "leiterQuerschnitt", e.target.value)}
                              className="w-12 bg-black/40 border border-ui-border rounded px-1.5 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center"
                            />
                          </td>
                          <td className="py-2 px-1 border-l border-ui-border">
                            <input
                              type="text"
                              value={row.rPeHaupt || ""}
                              onChange={e => updateEinspeisungField(idx, "rPeHaupt", e.target.value)}
                              className="w-14 bg-black/40 border border-ui-border rounded px-1.5 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center"
                            />
                          </td>
                          <td className="py-2 px-1">
                            <input
                              type="text"
                              value={row.rPeZusatz || ""}
                              onChange={e => updateEinspeisungField(idx, "rPeZusatz", e.target.value)}
                              className="w-14 bg-black/40 border border-ui-border rounded px-1.5 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center"
                            />
                          </td>
                          <td className="py-2 px-1 border-l border-ui-border">
                            <input
                              type="text"
                              value={row.rIso || ""}
                              onChange={e => updateEinspeisungField(idx, "rIso", e.target.value)}
                              className="w-20 bg-black/40 border border-ui-border rounded px-1.5 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center font-bold text-success"
                            />
                          </td>
                          <td className="py-2 px-1 border-l border-ui-border">
                            <input
                              type="text"
                              value={row.charakteristik || ""}
                              onChange={e => updateEinspeisungField(idx, "charakteristik", e.target.value)}
                              className="w-20 bg-black/40 border border-ui-border rounded px-1.5 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center"
                            />
                          </td>
                          <td className="py-2 px-1">
                            <input
                              type="text"
                              value={row.absicherung || ""}
                              onChange={e => updateEinspeisungField(idx, "absicherung", e.target.value)}
                              className="w-14 bg-black/40 border border-ui-border rounded px-1.5 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center font-bold"
                            />
                          </td>
                          <td className="py-2 px-1">
                            <input
                              type="text"
                              value={row.ausloeseZeit || ""}
                              onChange={e => updateEinspeisungField(idx, "ausloeseZeit", e.target.value)}
                              className="w-12 bg-black/40 border border-ui-border rounded px-1.5 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center"
                            />
                          </td>
                          <td className="py-2 px-1">
                            <div className="flex gap-1 items-center">
                              <input
                                type="text"
                                placeholder="Zs"
                                value={row.zS || ""}
                                onChange={e => updateEinspeisungField(idx, "zS", e.target.value)}
                                className="w-14 bg-black/40 border border-ui-border rounded px-1 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center"
                              />
                              <span className="text-ui-muted">/</span>
                              <input
                                type="text"
                                placeholder="Ik"
                                value={row.iK || ""}
                                onChange={e => updateEinspeisungField(idx, "iK", e.target.value)}
                                className="w-16 bg-black/40 border border-ui-border rounded px-1 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center"
                              />
                            </div>
                          </td>
                          <td className="py-2 px-1">
                            <div className="flex gap-1 items-center">
                              <input
                                type="text"
                                placeholder="Zl"
                                value={row.zL || ""}
                                onChange={e => updateEinspeisungField(idx, "zL", e.target.value)}
                                className="w-14 bg-black/40 border border-ui-border rounded px-1 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center"
                              />
                              <span className="text-ui-muted">/</span>
                              <input
                                type="text"
                                placeholder="Ik"
                                value={row.iKL || ""}
                                onChange={e => updateEinspeisungField(idx, "iKL", e.target.value)}
                                className="w-16 bg-black/40 border border-ui-border rounded px-1 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center"
                              />
                            </div>
                          </td>
                          <td className="py-2 px-1 border-l border-ui-border">
                            <input
                              type="text"
                              placeholder="40/A"
                              value={row.rcdInArt || ""}
                              onChange={e => updateEinspeisungField(idx, "rcdInArt", e.target.value)}
                              className="w-16 bg-black/40 border border-ui-border rounded px-1.5 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center"
                            />
                          </td>
                          <td className="py-2 px-1">
                            <input
                              type="text"
                              placeholder="30"
                              value={row.rcdIdn || ""}
                              onChange={e => updateEinspeisungField(idx, "rcdIdn", e.target.value)}
                              className="w-12 bg-black/40 border border-ui-border rounded px-1.5 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center"
                            />
                          </td>
                          <td className="py-2 px-1">
                            <input
                              type="text"
                              placeholder="22"
                              value={row.rcdId || ""}
                              onChange={e => updateEinspeisungField(idx, "rcdId", e.target.value)}
                              className="w-12 bg-black/40 border border-ui-border rounded px-1.5 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center"
                            />
                          </td>
                          <td className="py-2 px-1">
                            <input
                              type="text"
                              placeholder="25"
                              value={row.rcdTa || ""}
                              onChange={e => updateEinspeisungField(idx, "rcdTa", e.target.value)}
                              className="w-12 bg-black/40 border border-ui-border rounded px-1.5 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center"
                            />
                          </td>
                          <td className="py-2 px-1">
                            <input
                              type="text"
                              value={row.rcdTd || ""}
                              onChange={e => updateEinspeisungField(idx, "rcdTd", e.target.value)}
                              className="w-12 bg-black/40 border border-ui-border rounded px-1.5 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center"
                            />
                          </td>
                          <td className="py-2 px-1">
                            <input
                              type="text"
                              placeholder="0.8"
                              value={row.rcdUc || ""}
                              onChange={e => updateEinspeisungField(idx, "rcdUc", e.target.value)}
                              className="w-12 bg-black/40 border border-ui-border rounded px-1.5 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center"
                            />
                          </td>
                          <td className="py-2 px-2 border-l border-ui-border">
                            <input
                              type="text"
                              value={row.fehlercode || ""}
                              onChange={e => updateEinspeisungField(idx, "fehlercode", e.target.value)}
                              className="w-16 bg-black/40 border border-ui-border rounded px-2 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Page 3+ - Stromkreise Table in Step 3 */}
            <div className="bg-ui-card border border-ui-border rounded-xl p-8 shadow-2xl space-y-6">
              <h3 className="text-lg font-black text-ui-text uppercase tracking-tight">
                Stromkreise / Sicherungen (Seite 3+) - Messwerte bearbeiten
              </h3>
              
              <div className="border border-ui-border rounded-xl overflow-hidden bg-black/20">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-white/5 border-b border-ui-border text-[9px] font-black uppercase tracking-wider text-ui-muted text-center">
                        <th className="py-4 px-3 w-[40px]">Nr.</th>
                        <th className="py-4 px-4 text-left">Bezeichnung des Stromkreises</th>
                        <th className="py-4 px-3">Kabeltyp</th>
                        <th className="py-4 px-3 w-[100px]">Absicherung</th>
                        <th className="py-4 px-3">R_ISO (MΩ)</th>
                        <th className="py-4 px-3">R_PE (Ω)</th>
                        <th className="py-4 px-3">Z_S (Ω)</th>
                        <th className="py-4 px-3">I_K (A)</th>
                        <th className="py-4 px-3 w-[60px]">FI-Typ</th>
                        <th className="py-4 px-3">FI-I_ΔN</th>
                        <th className="py-4 px-3">FI-t_A (ms)</th>
                        <th className="py-4 px-3">FI-I_A (mA)</th>
                        <th className="py-4 px-3">FI-U_B (V)</th>
                        <th className="py-4 px-3">Ergebnis</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ui-border font-semibold text-ui-text text-center">
                      {rows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-white/5 transition-colors">
                          <td className="py-3 px-3 text-ui-muted">#{row.nr}</td>
                          <td className="py-2 px-2 text-left">
                            <input
                              type="text"
                              value={row.bezeichnung || ""}
                              onChange={e => updateCircuitField(idx, "bezeichnung", e.target.value)}
                              className="w-full bg-black/40 border border-ui-border rounded px-2 py-1 text-xs text-ui-text font-bold focus:outline-none focus:border-ui-accent"
                            />
                          </td>
                          <td className="py-2 px-2">
                            <input
                              type="text"
                              value={row.kabeltyp || ""}
                              onChange={e => updateCircuitField(idx, "kabeltyp", e.target.value)}
                              className="w-28 bg-black/40 border border-ui-border rounded px-1.5 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center"
                            />
                          </td>
                          <td className="py-2 px-2">
                            <div className="flex gap-1 items-center justify-center">
                              <input
                                type="text"
                                value={row.absicherung || ""}
                                onChange={e => updateCircuitField(idx, "absicherung", e.target.value)}
                                className="w-10 bg-black/40 border border-ui-border rounded px-1 py-1 text-xs text-ui-text font-bold focus:outline-none focus:border-ui-accent text-center"
                              />
                              <input
                                type="text"
                                value={row.charakteristik || ""}
                                onChange={e => updateCircuitField(idx, "charakteristik", e.target.value)}
                                className="w-10 bg-black/40 border border-ui-border rounded px-1 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center"
                              />
                            </div>
                          </td>
                          <td className="py-2 px-2">
                            <input
                              type="text"
                              value={row.rIso || ""}
                              onChange={e => updateCircuitField(idx, "rIso", e.target.value)}
                              className="w-16 bg-black/40 border border-ui-border rounded px-1.5 py-1 text-xs text-success font-bold focus:outline-none focus:border-ui-accent text-center"
                            />
                          </td>
                          <td className="py-2 px-2">
                            <input
                              type="text"
                              value={row.rPe !== undefined ? row.rPe : ""}
                              onChange={e => updateCircuitField(idx, "rPe", e.target.value)}
                              className="w-12 bg-black/40 border border-ui-border rounded px-1.5 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center"
                            />
                          </td>
                          <td className="py-2 px-2">
                            <input
                              type="text"
                              value={row.zS !== undefined ? row.zS : ""}
                              onChange={e => updateCircuitField(idx, "zS", e.target.value)}
                              className="w-12 bg-black/40 border border-ui-border rounded px-1.5 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center"
                            />
                          </td>
                          <td className="py-2 px-2">
                            <input
                              type="text"
                              value={row.iK !== undefined ? row.iK : ""}
                              onChange={e => updateCircuitField(idx, "iK", e.target.value)}
                              className="w-14 bg-black/40 border border-ui-border rounded px-1.5 py-1 text-xs text-ui-text font-bold focus:outline-none focus:border-ui-accent text-center"
                            />
                          </td>
                          <td className="py-2 px-2">
                            <input
                              type="text"
                              value={row.rcdTyp || ""}
                              onChange={e => updateCircuitField(idx, "rcdTyp", e.target.value)}
                              className="w-10 bg-black/40 border border-ui-border rounded px-1 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center"
                            />
                          </td>
                          <td className="py-2 px-2">
                            <input
                              type="text"
                              value={row.rcdIdn || ""}
                              onChange={e => updateCircuitField(idx, "rcdIdn", e.target.value)}
                              className="w-16 bg-black/40 border border-ui-border rounded px-1 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center"
                            />
                          </td>
                          <td className="py-2 px-2">
                            <input
                              type="text"
                              value={row.rcdTa || ""}
                              onChange={e => updateCircuitField(idx, "rcdTa", e.target.value)}
                              className="w-12 bg-black/40 border border-ui-border rounded px-1 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center"
                            />
                          </td>
                          <td className="py-2 px-2">
                            <input
                              type="text"
                              value={row.rcdIa || ""}
                              onChange={e => updateCircuitField(idx, "rcdIa", e.target.value)}
                              className="w-12 bg-black/40 border border-ui-border rounded px-1 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center"
                            />
                          </td>
                          <td className="py-2 px-2">
                            <input
                              type="text"
                              value={row.rcdUb || ""}
                              onChange={e => updateCircuitField(idx, "rcdUb", e.target.value)}
                              className="w-12 bg-black/40 border border-ui-border rounded px-1 py-1 text-xs text-ui-text focus:outline-none focus:border-ui-accent text-center"
                            />
                          </td>
                          <td className="py-3 px-3">
                            <span className="bg-success/10 text-success border border-success/20 px-2 py-0.5 rounded text-[10px] font-black uppercase">
                              ok
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Form Controls */}
              <div className="flex justify-between items-center pt-4">
                <button
                  onClick={() => setStep(2)}
                  className="px-6 py-4 bg-white/5 hover:bg-white/10 border border-ui-border rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-300"
                >
                  Zurück
                </button>

                <button
                  onClick={handleDownloadPdf}
                  disabled={isGeneratingPdf}
                  className="flex items-center gap-4 px-10 py-5 bg-gradient-to-r from-cyan-400 via-teal-400 to-emerald-400 hover:from-cyan-300 hover:via-teal-300 hover:to-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed text-black rounded-xl text-sm font-black uppercase tracking-widest shadow-[0_0_30px_rgba(34,211,238,0.3)] hover:shadow-[0_0_40px_rgba(34,211,238,0.5)] active:scale-[0.98] hover:scale-[1.02] transition-all duration-300 border border-cyan-300/40"
                >
                  {isGeneratingPdf ? (
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  ) : (
                    <Download className="w-5 h-5" />
                  )}
                  PDF-Messprotokoll herunterladen
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      )}
    </div>
  );
}
