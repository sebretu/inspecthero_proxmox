const { createClient } = require('/home/ubuntu/building-task-manager/web/node_modules/@supabase/supabase-js');
const { PDFDocument } = require('/home/ubuntu/building-task-manager/web/node_modules/pdf-lib');

const sbUrl = 'https://api.inspecthero.pl';
const sbKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3Nzk3Mjg5NDMsImV4cCI6MjA5NTA4ODk0M30.puiELZCZvCy0vYoMAnjZRiYaVJ3UhdBvkSh9UYtmRbQ';
const supabase = createClient(sbUrl, sbKey);

(async () => {
  const planId = '990da539-ab71-42da-a501-45bf840a8d99';
  
  const { data: plan } = await supabase.from('plans').select('*').eq('id', planId).single();
  const { data: markers } = await supabase.from('stromkreise').select('*').eq('plan_id', planId).limit(5);

  const downloadPDF = async (path) => {
    const { data } = await supabase.storage.from('plans').download(path);
    return PDFDocument.load(await data.arrayBuffer());
  };

  const doc1 = await downloadPDF(plan.storage_path); // v1.pdf
  const doc2 = await downloadPDF('projects/45558114-382e-4e5c-a277-2d5532c71f58/floors/98a53dfe-deed-4948-8dc2-e305214f9a35/plan_990da539-ab71-42da-a501-45bf840a8d99_v2.pdf'); // v2.pdf

  const getDetails = (doc) => {
    const page = doc.getPages()[0];
    const crop = page.getCropBox();
    const media = page.getMediaBox();
    const rot = page.getRotation().angle || 0;
    return { w: crop.width, h: crop.height, ox: crop.x || 0, oy: crop.y || 0, rot };
  };

  const p1 = getDetails(doc1);
  const p2 = getDetails(doc2);

  console.log("PDF v1 details:", p1);
  console.log("PDF v2 details:", p2);

  const getCoords = (m, details) => {
    const { w, h, ox, oy, rot } = details;
    // Assume scaleX/scaleY are 1 for comparison
    const x = m.x_norm;
    const y = m.y_norm;
    let cx = 0, cy = 0;
    if (rot === 90) {
      cx = y * w;
      cy = x * h;
    } else {
      cx = x * w;
      cy = (1 - y) * h;
    }
    return { x: cx + ox, y: cy + oy };
  };

  markers.forEach(m => {
    const c1 = getCoords(m, p1);
    const c2 = getCoords(m, p2);
    console.log(`Marker ${m.circuit_code}:`);
    console.log(`  v1: (${c1.x.toFixed(2)}, ${c1.y.toFixed(2)})`);
    console.log(`  v2: (${c2.x.toFixed(2)}, ${c2.y.toFixed(2)})`);
    console.log(`  Diff: (${(c2.x - c1.x).toFixed(2)}, ${(c2.y - c1.y).toFixed(2)})`);
  });
})();
