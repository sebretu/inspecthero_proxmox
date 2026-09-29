const React = require("react");
const { pdf } = require("@react-pdf/renderer");
const path = require("path");

// Register ts-node or load compiled
require("ts-node").register({
  transpileOnly: true,
  compilerOptions: {
    module: "commonjs",
    jsx: "react-jsx",
    target: "es2020",
    allowJs: true,
    esModuleInterop: true,
  }
});

// Alias @
const moduleAlias = require("module-alias");
moduleAlias.addAlias("@", path.join(__dirname, "../src"));

const PlanElementsPdf = require("../src/app/reports/PlanElementsPdf").default;

async function testPdf() {
  console.log("Testing PlanElementsPdf...");
  const mockPlan = {
    planId: "test-plan-1",
    planName: "EG Plan",
    buildingName: "Haus A",
    floorName: "EG",
    imageBase64: null,
    imageWidth: 2000,
    imageHeight: 1500,
    measurements: [],
    klappen: [],
    bmaSymbols: [
      { id: "s1", x_norm: 0.2, y_norm: 0.3, symbol_type: "warmepumpe_aussen", label: "WP-01", description: JSON.stringify({ powerKw: "12" }) },
      { id: "s2", x_norm: 0.5, y_norm: 0.6, symbol_type: "warmepumpe_innen", label: "WP-IN-01", description: "" },
      { id: "s3", x_norm: 0.7, y_norm: 0.8, symbol_type: "notlicht_lampe", loop_number: "1", address: "1", label: "1/1" }
    ],
    photoPins: [],
    lampTypes: {
      warmepumpe_aussen: { model: "Viessmann Vitocal", notes: "Außeneinheit" },
      warmepumpe_innen: { model: "Viessmann Innen", notes: "Inneneinheit" },
      variants: []
    },
    cableConnections: [
      {
        id: "c1",
        name: "K-001",
        color: "#0284c7",
        metadata: {
          cable_number: "K-001",
          cable_type: "NYY-J 5x2,5 mm²",
          source_symbol_id: "s1",
          target_symbol_id: "s2",
          length_meters: 24.5,
          waypoints: [{ x_norm: 0.3, y_norm: 0.3 }]
        }
      }
    ]
  };

  try {
    const doc = React.createElement(PlanElementsPdf, {
      projectName: "Test Project",
      plansData: [mockPlan],
      options: {
        includeHeating: true,
        includeNotlicht: true,
        includeBma: true,
        includeLighting: true,
        includeKlappen: true,
        includeMeasurements: true,
        includePhotoPins: true,
        includePlanOverview: true,
        includeLampTypes: true,
        includeCables: true,
      },
      translations: {
        title: "Plan-Elemente",
        project: "Projekt",
        plan: "Plan",
        generatedOn: "Erstellt am",
        page: "Seite",
        of: "von",
        measurementsTitle: "Messungen",
        klappenTitle: "Revisionsklappen",
        photoPinsTitle: "Foto-Pins",
        totalLength: "Gesamtlänge",
        dimensions: "Maße",
        loopAddress: "Loop / Adresse",
        label: "Bezeichnung",
        description: "Beschreibung",
        date: "Datum",
        author: "Erstellt von",
        noData: "—",
        planOverview: "Planübersicht",
      }
    });

    console.log("Rendering to buffer...");
    const stream = await pdf(doc).toBuffer();
    console.log("SUCCESS! PDF Buffer size:", stream.length);
  } catch (err) {
    console.error("PDF RENDER FAILED WITH ERROR:\n", err);
  }
}

testPdf();
