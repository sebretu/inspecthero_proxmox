const fs = require("fs");
const path = require("path");

const pdfPath = path.join(__dirname, "../src/app/reports/PlanElementsPdf.tsx");
let pdfContent = fs.readFileSync(pdfPath, "utf8");

// Remove broken duplicate block between line 1813 and line 1970
const blockStart = '{/* ══════════════════════════════════════════════════════════════════════\n                PAGE: KABELZUGLISTE & VERBINDUNGSÜBERSICHT';
const startIdx = pdfContent.indexOf(blockStart);
if (startIdx !== -1) {
  const blockEnd = '{/* ── KABELZÜGE & LEITUNGSLISTE (KABELVERBINDUNGEN) SEPARATE REPORT PAGE ── */}';
  const endIdx = pdfContent.indexOf(blockEnd, startIdx);
  if (endIdx !== -1) {
    pdfContent = pdfContent.slice(0, startIdx) + pdfContent.slice(endIdx);
    console.log("Removed broken duplicate block with projectTitle ReferenceError!");
  }
}

// Remove display: none page
pdfContent = pdfContent.replace(
  `            {/* Fallback Page: ensures document is never empty */}
            <Page size="A4" style={{ display: 'none' }}>
                <View><Text> </Text></View>
            </Page>`,
  ''
);

fs.writeFileSync(pdfPath, pdfContent, "utf8");
console.log("PlanElementsPdf.tsx cleaned up successfully!");
