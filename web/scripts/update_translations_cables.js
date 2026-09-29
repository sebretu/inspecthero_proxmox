const fs = require("fs");
const path = require("path");

const trPath = path.join(__dirname, "../src/lib/translations.ts");
let content = fs.readFileSync(trPath, "utf8");

// 1. Update EN planLayers
if (!content.includes('cables: "Cables & Connections / Schemas",')) {
  content = content.replace(
    'heating: "Heating & Heat Pumps / Devices",',
    'heating: "Heating & Heat Pumps / Devices",\n      cables: "Cables & Connections / Schemas",'
  );
}

// 2. Update EN planBma
const enKeys = `      cableConnect: "Connect Cable (Device → Device)",
      quickCableConnect: "Connect Cable",
      freeLine: "Free Line / Route",
      quickFreeLine: "Free Line",
      schemaMode: "White Schema",
      floorplanMode: "Floorplan",
      fitSchema: "Fit Schema",
      addDeviceToSchema: "Add Devices to Schema",
      cableNumber: "Cable No.",
      cableType: "Cable Type",
      cableFrom: "From",
      cableTo: "To",
      cableLength: "Length",
      cableDescription: "Description",
      drawCableStartHint: "Click starting device (or choose cross-plan device)",
      drawCableNextHint: "Click waypoints or click target device to connect",
      drawFreeLineHint: "Click points on the plan to draw line, press Enter to finish",`;

if (!content.includes('quickCableConnect: "Connect Cable",')) {
  content = content.replace(
    'quickGeraetBox: "Device / Box",',
    'quickGeraetBox: "Device / Box",\n' + enKeys
  );
}

// 3. Update EN reports
if (!content.includes('optCables: "Cable Connections & Schemas",')) {
  content = content.replace(
    'optHeating: "Heating & Heat Pumps / Devices (Heizung & Wärmepumpen)",',
    'optHeating: "Heating & Heat Pumps / Devices (Heizung & Wärmepumpen)",\n      optCables: "Cable Connections & Schemas",\n      optKabelzugliste: "Cable Schedule Table (Kabelzugliste)",'
  );
}

// 4. Update PL planLayers
if (!content.includes('cables: "Kable i Połączenia / Schematy",')) {
  content = content.replace(
    'heating: "Ogrzewanie & Pompy ciepła / Urządzenia",',
    'heating: "Ogrzewanie & Pompy ciepła / Urządzenia",\n      cables: "Kable i Połączenia / Schematy",'
  );
}

// 5. Update PL planBma
const plKeys = `      cableConnect: "Połącz kablem (Urządzenie → Urządzenie)",
      quickCableConnect: "Połącz kablem",
      freeLine: "Swobodny przewód / Trasa",
      quickFreeLine: "Wolny przewód",
      schemaMode: "Biały schemat",
      floorplanMode: "Rzut planu",
      fitSchema: "Dopasuj schemat",
      addDeviceToSchema: "Dodaj urządzenia do schematu",
      cableNumber: "Nr kabla",
      cableType: "Typ kabla",
      cableFrom: "Od",
      cableTo: "Do",
      cableLength: "Długość",
      cableDescription: "Opis",
      drawCableStartHint: "Kliknij urządzenie początkowe (lub wybierz z innego piętra)",
      drawCableNextHint: "Klikaj punkty trasy lub kliknij urządzenie docelowe, aby połączyć",
      drawFreeLineHint: "Klikaj punkty na planie, aby narysować trasę kabla, naciśnij Enter aby zakończyć",`;

if (!content.includes('quickCableConnect: "Połącz kablem",')) {
  content = content.replace(
    'quickGeraetBox: "Urządzenie",',
    'quickGeraetBox: "Urządzenie",\n' + plKeys
  );
}

// 6. Update PL reports
if (!content.includes('optCables: "Połączenia kablowe & Schematy",')) {
  content = content.replace(
    'optHeating: "Ogrzewanie & Pompy ciepła / Urządzenia (Heizung)",',
    'optHeating: "Ogrzewanie & Pompy ciepła / Urządzenia (Heizung)",\n      optCables: "Połączenia kablowe & Schematy",\n      optKabelzugliste: "Kabelzugliste (Zestawienie kabli)",'
  );
}

// 7. Update DE planLayers
if (!content.includes('cables: "Kabel & Verbindungen / Schemata",')) {
  content = content.replace(
    'heating: "Heizung & Wärmepumpen / Geräte",',
    'heating: "Heizung & Wärmepumpen / Geräte",\n      cables: "Kabel & Verbindungen / Schemata",'
  );
}

// 8. Update DE planBma
const deKeys = `      cableConnect: "Kabel verbinden (Gerät → Gerät)",
      quickCableConnect: "Kabel verbinden",
      freeLine: "Freie Leitung / Kabel",
      quickFreeLine: "Freie Leitung",
      schemaMode: "Weißes Schema",
      floorplanMode: "Grundriss",
      fitSchema: "Schema einpassen",
      addDeviceToSchema: "Geräte zum Schema hinzufügen",
      cableNumber: "Kabel-Nr.",
      cableType: "Kabeltyp",
      cableFrom: "Von",
      cableTo: "Nach",
      cableLength: "Länge",
      cableDescription: "Beschreibung",
      drawCableStartHint: "Start-Gerät anklicken (oder aus anderem Plan wählen)",
      drawCableNextHint: "Wegpunkte anklicken oder Ziel-Gerät anklicken zum Verbinden",
      drawFreeLineHint: "Punkte auf dem Plan anklicken, mit Enter abschließen",`;

if (!content.includes('quickCableConnect: "Kabel verbinden",')) {
  content = content.replace(
    'quickGeraetBox: "Gerät / Box",',
    'quickGeraetBox: "Gerät / Box",\n' + deKeys
  );
}

// 9. Update DE reports
if (!content.includes('optCables: "Kabelverbindungen & Schemata",')) {
  content = content.replace(
    'optHeating: "Heizung & Wärmepumpen / Geräte (Wärmepumpen & Steuerungen)",',
    'optHeating: "Heizung & Wärmepumpen / Geräte (Wärmepumpen & Steuerungen)",\n      optCables: "Kabelverbindungen & Schemata",\n      optKabelzugliste: "Kabelzugliste & Verbindungsübersicht",'
  );
}

// 10. Update SK planLayers
if (!content.includes('cables: "Káble & Spojenia / Schémy",')) {
  content = content.replace(
    'heating: "Vykurovanie & Tepelné čerpadlá / Zariadenia",',
    'heating: "Vykurovanie & Tepelné čerpadlá / Zariadenia",\n      cables: "Káble & Spojenia / Schémy",'
  );
}

// 11. Update SK planBma
const skKeys = `      cableConnect: "Prepojiť káblom (Zariadenie → Zariadenie)",
      quickCableConnect: "Prepojiť káblom",
      freeLine: "Voľný kábel / Trasa",
      quickFreeLine: "Voľný kábel",
      schemaMode: "Biela schéma",
      floorplanMode: "Pôdorys",
      fitSchema: "Prispôsobiť schému",
      addDeviceToSchema: "Pridať zariadenia do schémy",
      cableNumber: "Číslo kábla",
      cableType: "Typ kábla",
      cableFrom: "Od",
      cableTo: "Do",
      cableLength: "Dĺžka",
      cableDescription: "Popis",
      drawCableStartHint: "Kliknite na počiatočné zariadenie",
      drawCableNextHint: "Klikajte body trasy alebo kliknite na cieľové zariadenie",
      drawFreeLineHint: "Klikajte body na pláne, ukončite klávesom Enter",`;

if (!content.includes('quickCableConnect: "Prepojiť káblom",')) {
  content = content.replace(
    'quickGeraetBox: "Zariadenie",',
    'quickGeraetBox: "Zariadenie",\n' + skKeys
  );
}

fs.writeFileSync(trPath, content, "utf8");
console.log("Updated translations.ts with cable schemata keys!");
