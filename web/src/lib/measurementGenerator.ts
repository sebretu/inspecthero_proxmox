export interface Fuse {
  name: string;
  rating: number;
  characteristic: string;
  description: string;
  rcd: boolean;
  active?: boolean;
  phases?: number;
}

export interface MeasurementRow {
  nr: number;
  bezeichnung: string;
  kabeltyp: string;
  absicherung: number;
  charakteristik: string;
  rIso: string;
  rPe: number;
  zS: number;
  iK: number;
  rcdTyp: string;
  rcdIdn: string;
  rcdTa: string;
  rcdIa: string;
  rcdUb: string;
  ergebnis: string;
}

function randomRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function randomIntRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function detectRcd(name: string, description: string): boolean {
  const n = name.toLowerCase();
  const d = description.toLowerCase();

  // If it contains "ohne fi" or "ohne rcd", then it is definitely false
  if (n.includes("ohne fi") || d.includes("ohne fi") || n.includes("ohne rcd") || d.includes("ohne rcd")) {
    return false;
  }

  // If it contains "fi" or "rcd" or "rcbo" or "fi-ls", it is definitely true
  if (n.includes("fi") || d.includes("fi") || n.includes("rcd") || d.includes("rcd") || n.includes("rcbo")) {
    return true;
  }

  // Lighting / illumination circuits do not have RCD by default
  if (
    n.includes("beleuchtung") || d.includes("beleuchtung") ||
    n.includes("licht") || d.includes("licht") ||
    n.includes("aussenbeleuchtung") || d.includes("aussenbeleuchtung")
  ) {
    return false;
  }

  // Default fallback:
  // Standard residential / socket / kitchen / bathroom circuits usually have RCD.
  const rcdKeywords = [
    "steckdose", "schuko", "kueche", "küche", "bad", "wc", "waschmaschine", 
    "trockner", "spülmaschine", "geschirrspüler", "herd", "backofen", 
    "aussen", "außen", "garten", "pumpe", "heizung", "dunstabzug", 
    "mcb", "fuses", "lader", "wallbox"
  ];

  if (rcdKeywords.some(keyword => n.includes(keyword) || d.includes(keyword))) {
    return true;
  }

  return false;
}

export function generateMeasurementsForFuses(fuses: Fuse[]): MeasurementRow[] {
  // Exclude inactive fuses and those containing "reserve" in name or description
  const activeFuses = fuses.filter(f => 
    f.active !== false &&
    !f.name.toLowerCase().includes("reserve") &&
    !f.description.toLowerCase().includes("reserve")
  );
  const rows: MeasurementRow[] = [];
  let nr = 1;

  for (const fuse of activeFuses) {
    const isThreePhase = 
      fuse.phases === 3 || 
      /^3f/i.test(fuse.name) ||
      fuse.description.toLowerCase().includes("cee") ||
      fuse.description.toLowerCase().includes("wallbox") ||
      fuse.description.toLowerCase().includes("herd") ||
      fuse.description.toLowerCase().includes("backofen") ||
      fuse.description.toLowerCase().includes("kraft") ||
      fuse.description.toLowerCase().includes("drehstrom") ||
      fuse.description.toLowerCase().includes("wp") ||
      fuse.description.toLowerCase().includes("wärmepumpe");
    const loops = isThreePhase ? 3 : 1;

    // Generate base values for this fuse
    const baseRIsoVal = randomIntRange(700, 999);
    const baseRPe = Math.round(randomRange(0.08, 0.22) * 100) / 100;
    
    let baseZS = 0.35;
    const char = (fuse.characteristic || "B").toUpperCase();
    const rating = fuse.rating || 16;

    if (char === "B") {
      if (rating <= 10) {
        baseZS = randomRange(0.35, 0.48);
      } else if (rating === 13) {
        baseZS = randomRange(0.30, 0.45);
      } else if (rating === 16) {
        baseZS = randomRange(0.28, 0.42);
      } else {
        baseZS = randomRange(0.20, 0.38);
      }
    } else if (char === "C") {
      if (rating <= 10) {
        baseZS = randomRange(0.25, 0.45);
      } else if (rating === 13) {
        baseZS = randomRange(0.22, 0.42);
      } else if (rating === 16) {
        baseZS = randomRange(0.20, 0.40);
      } else {
        baseZS = randomRange(0.15, 0.32);
      }
    } else {
      baseZS = randomRange(0.25, 0.45);
    }
    baseZS = Math.round(baseZS * 100) / 100;

    const hasRcd = typeof fuse.rcd === 'boolean' ? fuse.rcd : detectRcd(fuse.name, fuse.description);
    const baseRcdTa = randomIntRange(18, 28);
    const baseRcdIa = Math.round(randomRange(20.0, 24.0) * 10) / 10;
    const baseRcdUb = Math.round(randomRange(0.1, 1.5) * 10) / 10;

    for (let m = 1; m <= loops; m++) {
      const descLower = fuse.description.toLowerCase();
      
      // 1. Determine cable type
      let kabeltyp = "NYM-J 3x2.5";
      if (isThreePhase) {
        kabeltyp = fuse.rating >= 32 ? "NYM-J 5x6.0" : "NYM-J 5x2.5";
      } else if (fuse.rating <= 10) {
        kabeltyp = "NYM-J 3x1.5";
      } else if (
        descLower.includes("herd") || 
        descLower.includes("cooker") || 
        descLower.includes("backofen") ||
        descLower.includes("wallbox") || 
        descLower.includes("drehstrom") || 
        descLower.includes("kraft") ||
        descLower.includes("lade")
      ) {
        kabeltyp = fuse.rating >= 32 ? "NYM-J 5x6.0" : "NYM-J 5x2.5";
      } else if (fuse.rating >= 32) {
        kabeltyp = "NYM-J 5x6.0";
      } else if (fuse.rating === 13) {
        kabeltyp = "NYM-J 3x1.5";
      }

      // 2. Generate R_ISO (Insulation resistance in MΩ)
      let rIsoVal = baseRIsoVal;
      if (isThreePhase) {
        rIsoVal = Math.min(999, Math.max(700, baseRIsoVal + randomIntRange(-15, 15)));
      }
      const rIso = `${rIsoVal}`;

      // 3. Generate R_PE (Protective conductor continuity in Ω)
      let rPe = baseRPe;
      if (isThreePhase) {
        rPe = Math.round(Math.max(0.05, baseRPe + randomIntRange(-1, 1) / 100) * 100) / 100;
      }

      // 4. Generate Z_S (Loop impedance in Ω) and I_K (Short circuit current in A)
      let zS = baseZS;
      if (isThreePhase) {
        zS = Math.round(Math.max(0.10, Math.min(0.50, baseZS + randomIntRange(-2, 2) / 100)) * 100) / 100;
      } else {
        zS = Math.min(0.50, zS);
      }

      // Calculate short circuit current based on Ohm's law: I_K = 230 / Z_S (with slight random fluctuation)
      const exactIk = 230 / zS;
      const ikRandomFactor = isThreePhase ? randomRange(0.98, 1.02) : randomRange(0.96, 1.04);
      const iK = Math.round(exactIk * ikRandomFactor);

      // 5. Generate RCD values if protected by RCD
      let rcdTyp = "—";
      let rcdIdn = "—";
      let rcdTa = "—";
      let rcdIa = "—";
      let rcdUb = "—";

      if (hasRcd) {
        rcdTyp = "A";
        rcdIdn = "30 mA";
        
        let taVal = baseRcdTa;
        let iaVal = baseRcdIa;
        let ubVal = baseRcdUb;

        if (isThreePhase) {
          taVal = Math.min(35, Math.max(10, baseRcdTa + randomIntRange(-2, 2)));
          iaVal = Math.round(Math.min(30, Math.max(15, baseRcdIa + randomIntRange(-5, 5) / 10)) * 10) / 10;
          ubVal = Math.round(Math.min(5, Math.max(0.1, baseRcdUb + randomIntRange(-2, 2) / 10)) * 10) / 10;
        }

        rcdTa = `${taVal}`;
        rcdIa = iaVal.toFixed(1);
        rcdUb = ubVal.toFixed(1);
      }

      const suffix = isThreePhase ? ` (Messpunkt ${m})` : "";
      const baseBezeichnung = `${fuse.name} ${fuse.description}`.trim();

      rows.push({
        nr: nr++,
        bezeichnung: `${baseBezeichnung}${suffix}`,
        kabeltyp,
        absicherung: fuse.rating,
        charakteristik: char,
        rIso,
        rPe,
        zS,
        iK,
        rcdTyp,
        rcdIdn,
        rcdTa,
        rcdIa,
        rcdUb,
        ergebnis: "OK",
      });
    }
  }

  return rows;
}
