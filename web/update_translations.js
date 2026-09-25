const fs = require("fs");
let content = fs.readFileSync("src/lib/translations.ts", "utf8");

const keysEN = `
      scanQrTitle: "QR Scanner",
      scanQrHint: "Point your camera at the QR code for a trommel or cable.",
      scanQr: "Scan QR",
      newCableTitle: "New Cable",
      cableNamePlaceholder: "Cable name",
      cableTypePlaceholder: "Cable type",
      assignRouteOpt: "Assign to route (optional)",
      trommelsList: "Trommels",
      freeSpace: "free",
      cablesCount: "cables",
      reportedBy: "reported by:",
      cancelReport: "Undo",
      trommelTitle: "CABLE TROMMEL",
      lengthOpt: "Length (m)",
      capacity: "Capacity",
      used: "used",
      cablesOnTrommel: "Cables on trommel",
      deleteTrommel: "Delete trommel",
      cableMapTitle: "CABLE MAP",
      routeNoCoords: "Route has no map coordinates",
      noAssignedRoute: "No assigned route",
      useAddRouteHint: "Use 'Add route on map' to set points",
      noAssignedCables: "No assigned cables",`;

const keysPL = `
      scanQrTitle: "Skaner QR",
      scanQrHint: "Nakieruj aparat na kod QR wygenerowany dla bębna lub kabla.",
      scanQr: "Skanuj QR",
      newCableTitle: "Nowy kabel",
      cableNamePlaceholder: "Nazwa kabla",
      cableTypePlaceholder: "Typ kabla",
      assignRouteOpt: "Przypisz do trasy (opcjonalnie)",
      trommelsList: "Bębny",
      freeSpace: "wolne",
      cablesCount: "kabli",
      reportedBy: "zgłosił:",
      cancelReport: "Cofnij",
      trommelTitle: "BĘBEN KABLOWY",
      lengthOpt: "Długość (m)",
      capacity: "Pojemność",
      used: "użyte",
      cablesOnTrommel: "Kable na bębnie",
      deleteTrommel: "Usuń bęben",
      cableMapTitle: "MAPA KABLA",
      routeNoCoords: "Trasa bez współrzędnych na mapie",
      noAssignedRoute: "Brak przypisanej trasy",
      useAddRouteHint: "Użyj przycisku „Dodaj trasę na mapie” aby wyznaczyć punkty",
      noAssignedCables: "Brak przypisanych kabli",`;

const keysDE = `
      scanQrTitle: "QR Scanner",
      scanQrHint: "Richten Sie Ihre Kamera auf den QR-Code einer Kabeltrommel oder eines Kabels.",
      scanQr: "QR scannen",
      newCableTitle: "Neues Kabel",
      cableNamePlaceholder: "Kabelname",
      cableTypePlaceholder: "Kabeltyp",
      assignRouteOpt: "Route zuweisen (optional)",
      trommelsList: "Kabeltrommeln",
      freeSpace: "frei",
      cablesCount: "Kabel",
      reportedBy: "gemeldet von:",
      cancelReport: "Rückgängig",
      trommelTitle: "KABELTROMMEL",
      lengthOpt: "Länge (m)",
      capacity: "Kapazität",
      used: "verwendet",
      cablesOnTrommel: "Kabel auf Trommel",
      deleteTrommel: "Trommel löschen",
      cableMapTitle: "KABELKARTE",
      routeNoCoords: "Route ohne Kartenkoordinaten",
      noAssignedRoute: "Keine Route zugewiesen",
      useAddRouteHint: "Verwenden Sie 'Route auf Karte hinzufügen', um Punkte festzulegen",
      noAssignedCables: "Keine zugewiesenen Kabel",`;

const keysSK = `
      scanQrTitle: "QR Skener",
      scanQrHint: "Nasmerujte kameru na QR kód pre bubon alebo kábel.",
      scanQr: "Skenovať QR",
      newCableTitle: "Nový kábel",
      cableNamePlaceholder: "Názov kábla",
      cableTypePlaceholder: "Typ kábla",
      assignRouteOpt: "Priradiť k trase (voliteľné)",
      trommelsList: "Bubny",
      freeSpace: "voľné",
      cablesCount: "káblov",
      reportedBy: "nahlásil:",
      cancelReport: "Späť",
      trommelTitle: "KÁBLOVÝ BUBON",
      lengthOpt: "Dĺžka (m)",
      capacity: "Kapacita",
      used: "použité",
      cablesOnTrommel: "Káble na bubne",
      deleteTrommel: "Odstrániť bubon",
      cableMapTitle: "MAPA KÁBLA",
      routeNoCoords: "Trasa bez súradníc na mape",
      noAssignedRoute: "Žiadna priradená trasa",
      useAddRouteHint: "Použite 'Pridať trasu na mapu' pre nastavenie bodov",
      noAssignedCables: "Žiadne priradené káble",`;

content = content.replace(/(en:\s*\{[\s\S]*?cables:\s*\{)/, "$1" + keysEN);
content = content.replace(/(pl:\s*\{[\s\S]*?cables:\s*\{)/, "$1" + keysPL);
content = content.replace(/(de:\s*\{[\s\S]*?cables:\s*\{)/, "$1" + keysDE);
content = content.replace(/(sk:\s*\{[\s\S]*?cables:\s*\{)/, "$1" + keysSK);

fs.writeFileSync("src/lib/translations.ts", content);
console.log("Translations updated!");
