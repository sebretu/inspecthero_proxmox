const fs = require("fs");
const path = require("path");

const trPath = path.join(__dirname, "../src/lib/translations.ts");
let content = fs.readFileSync(trPath, "utf8");

// 1. Update EN reports
if (!content.includes('optHeating: "Heating & Heat Pumps')) {
  content = content.replace(
    'optLighting: "General lighting & Cable trays (Lamps, LED, Trays)",',
    'optLighting: "General lighting & Cable trays (Lamps, LED, Trays)",\n      optHeating: "Heating & Heat Pumps / Devices (Heizung & Wärmepumpen)",'
  );
}
if (!content.includes('presetHeating: "Heating Only",')) {
  content = content.replace(
    'presetOnlyNotlicht: "Only Emergency Lights & Pikto",',
    'presetOnlyNotlicht: "Only Emergency Lights & Pikto",\n      presetHeating: "Heating Only",'
  );
}

// 2. Update EN planLayers
if (!content.includes('heating: "Heating & Heat Pumps / Devices",')) {
  content = content.replace(
    'notlicht: "Emergency Light & Exit Signs",',
    'notlicht: "Emergency Light & Exit Signs",\n      heating: "Heating & Heat Pumps / Devices",'
  );
}

// 3. Update EN planLampTypes
if (!content.includes('zuleitung: "Cable Type / Supply Line (Zuleitung)",')) {
  content = content.replace(
    'powerKwPlaceholder: "e.g. 12 kW / 8.5 kW",',
    'powerKwPlaceholder: "e.g. 12 kW / 8.5 kW",\n      zuleitung: "Cable Type / Supply Line (Zuleitung)",\n      zuleitungPlaceholder: "e.g. NYY-J 5x2.5 mm² / ÖLFLEX 4x1.5 mm²",\n      assignedDeviceLabels: "Assigned Device Identifiers",'
  );
}

// 4. Update PL reports
if (!content.includes('optHeating: "Ogrzewanie & Pompy ciepła')) {
  content = content.replace(
    'optLighting: "Oświetlenie ogólne & Koryta (Lampy, LED, Trasy)",',
    'optLighting: "Oświetlenie ogólne & Koryta (Lampy, LED, Trasy)",\n      optHeating: "Ogrzewanie & Pompy ciepła / Urządzenia (Heizung)",'
  );
}
if (!content.includes('presetHeating: "Tylko ogrzewanie",')) {
  content = content.replace(
    'presetOnlyNotlicht: "Tylko Notbeleuchtung i Pikto",',
    'presetOnlyNotlicht: "Tylko Notbeleuchtung i Pikto",\n      presetHeating: "Tylko ogrzewanie",'
  );
}

// 5. Update PL planLayers
if (!content.includes('heating: "Ogrzewanie & Pompy ciepła / Urządzenia",')) {
  content = content.replace(
    'notlicht: "Notbeleuchtung & Pikto",\n      kabelbahn: "Kabelbahn (Trasy)",',
    'notlicht: "Notbeleuchtung & Pikto",\n      heating: "Ogrzewanie & Pompy ciepła / Urządzenia",\n      kabelbahn: "Kabelbahn (Trasy)",'
  );
}

// 6. Update PL planLampTypes
if (!content.includes('zuleitung: "Typ kabla / Zasilanie (Zuleitung)",')) {
  content = content.replace(
    'powerKwPlaceholder: "np. 12 kW / 8.5 kW",',
    'powerKwPlaceholder: "np. 12 kW / 8.5 kW",\n      zuleitung: "Typ kabla / Zasilanie (Zuleitung)",\n      zuleitungPlaceholder: "np. NYY-J 5x2.5 mm² / ÖLFLEX 4x1.5 mm²",\n      assignedDeviceLabels: "Przypisane oznaczenia urządzeń",'
  );
}

// 7. Update DE reports
if (!content.includes('optHeating: "Heizung & Wärmepumpen')) {
  content = content.replace(
    'optLighting: "Allgemeinbeleuchtung & Trassen (Lampen, LED, Kabelbahnen)",',
    'optLighting: "Allgemeinbeleuchtung & Trassen (Lampen, LED, Kabelbahnen)",\n      optHeating: "Heizung & Wärmepumpen / Geräte (Wärmepumpen & Steuerungen)",'
  );
}
if (!content.includes('presetHeating: "Nur Heizung",')) {
  content = content.replace(
    'presetOnlyNotlicht: "Nur Notbeleuchtung & Pikto",',
    'presetOnlyNotlicht: "Nur Notbeleuchtung & Pikto",\n      presetHeating: "Nur Heizung",'
  );
}

// 8. Update DE planLayers
if (!content.includes('heating: "Heizung & Wärmepumpen / Geräte",')) {
  content = content.replace(
    'notlicht: "Notbeleuchtung & Pikto",\n      kabelbahn: "Kabeltrassen (Kabelbahn)",',
    'notlicht: "Notbeleuchtung & Pikto",\n      heating: "Heizung & Wärmepumpen / Geräte",\n      kabelbahn: "Kabeltrassen (Kabelbahn)",'
  );
}

// 9. Update DE planLampTypes
if (!content.includes('zuleitung: "Kabeltyp / Zuleitung",')) {
  content = content.replace(
    'powerKwPlaceholder: "z.B. 12 kW / 8.5 kW",',
    'powerKwPlaceholder: "z.B. 12 kW / 8.5 kW",\n      zuleitung: "Kabeltyp / Zuleitung",\n      zuleitungPlaceholder: "z.B. NYY-J 5x2.5 mm² / ÖLFLEX 4x1.5 mm²",\n      assignedDeviceLabels: "Zugeordnete Geräte-Kennzeichnungen",'
  );
}

// 10. Update SK planLayers
if (!content.includes('heating: "Vykurovanie & Tepelné čerpadlá / Zariadenia",')) {
  content = content.replace(
    'notlicht: "Núdzové osvetlenie a piktogramy",\n      kabelbahn: "Káblové trasy (Kabelbahn)",',
    'notlicht: "Núdzové osvetlenie a piktogramy",\n      heating: "Vykurovanie & Tepelné čerpadlá / Zariadenia",\n      kabelbahn: "Káblové trasy (Kabelbahn)",'
  );
}

// 11. Update SK planLampTypes
if (!content.includes('zuleitung: "Typ kábla / Prívod (Zuleitung)",')) {
  content = content.replace(
    'powerKwPlaceholder: "napr. 12 kW / 8.5 kW",',
    'powerKwPlaceholder: "napr. 12 kW / 8.5 kW",\n      zuleitung: "Typ kábla / Prívod (Zuleitung)",\n      zuleitungPlaceholder: "napr. NYY-J 5x2.5 mm² / ÖLFLEX 4x1.5 mm²",\n      assignedDeviceLabels: "Priradené označenia zariadení",'
  );
}

fs.writeFileSync(trPath, content, "utf8");
console.log("Successfully updated translations.ts!");
