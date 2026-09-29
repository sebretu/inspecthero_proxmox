const { createClient } = require('/home/ubuntu/building-task-manager/web/node_modules/@supabase/supabase-js');
const { PDFDocument } = require('/home/ubuntu/building-task-manager/web/node_modules/pdf-lib');

const sbUrl = 'https://api.inspecthero.pl';
const sbKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3Nzk3Mjg5NDMsImV4cCI6MjA5NTA4ODk0M30.puiELZCZvCy0vYoMAnjZRiYaVJ3UhdBvkSh9UYtmRbQ';
const supabase = createClient(sbUrl, sbKey);

(async () => {
  const targetPlanIds = [
    '990da539-ab71-42da-a501-45bf840a8d99', // Grundfos EG
    '633c788d-fe28-4f0d-97f1-87d2affe9021'  // Grundfos OG
  ];

  for (const id of targetPlanIds) {
    console.log(`=== Checking Plan ID: ${id} ===`);
    const { data: plan } = await supabase.from('plans').select('*').eq('id', id).single();
    const { data: activeVersion } = await supabase.from('plan_versions').select('*').eq('plan_id', id).eq('status', 'active').single();
    
    const resolvePath = (fileUrl) => {
      if (!fileUrl) return plan.storage_path;
      if (fileUrl.includes("/")) return fileUrl;
      const parts = plan.storage_path.split("/");
      parts.pop();
      parts.push(fileUrl);
      return parts.join("/");
    };

    const activePath = resolvePath(activeVersion.file_url);
    console.log(`Active version file URL: ${activeVersion.file_url} | Full Storage Path: ${activePath}`);

    const { data: fileData, error: dlErr } = await supabase.storage.from('plans').download(activePath);
    if (dlErr) {
      console.error("  Download error:", dlErr);
      continue;
    }

    const doc = await PDFDocument.load(await fileData.arrayBuffer());
    const page = doc.getPages()[0];
    const mediaBox = page.getMediaBox();
    const cropBox = page.getCropBox();
    const size = page.getSize();
    const rot = page.getRotation().angle || 0;

    console.log("PDF dimensions:", {
      size,
      mediaBox: { x: mediaBox.x, y: mediaBox.y, w: mediaBox.width, h: mediaBox.height },
      cropBox: { x: cropBox.x, y: cropBox.y, w: cropBox.width, h: cropBox.height },
      rotation: rot
    });
    console.log("------------------------\n");
  }
})();
