const { createClient } = require('/home/ubuntu/building-task-manager/web/node_modules/@supabase/supabase-js');
const { PDFDocument } = require('/home/ubuntu/building-task-manager/web/node_modules/pdf-lib');

const sbUrl = 'https://api.inspecthero.pl';
const sbKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3Nzk3Mjg5NDMsImV4cCI6MjA5NTA4ODk0M30.puiELZCZvCy0vYoMAnjZRiYaVJ3UhdBvkSh9UYtmRbQ';
const supabase = createClient(sbUrl, sbKey);

(async () => {
  const { data: plans, error: planErr } = await supabase.from('plans').select('id, storage_path, image_width, image_height, floors(name, buildings(name))');
  if (planErr) {
    console.error("Error plans:", planErr);
    return;
  }

  for (const plan of plans) {
    const floorName = plan.floors?.name || "";
    const bldName = plan.floors?.buildings?.name || "";
    const name = `${bldName} - ${floorName}`;
    
    try {
      const { data: fileData, error: dlErr } = await supabase.storage.from('plans').download(plan.storage_path);
      if (dlErr) {
        console.log(`Plan: ${name} (${plan.id}) | Download error: ${dlErr.message}`);
        continue;
      }
      const doc = await PDFDocument.load(await fileData.arrayBuffer());
      const page = doc.getPages()[0];
      const rot = page.getRotation().angle || 0;
      const size = page.getSize();
      console.log(`Plan: ${name} (${plan.id}) | DB size: ${plan.image_width} x ${plan.image_height} | PDF size: ${size.width} x ${size.height} | Rotation: ${rot}`);
    } catch (e) {
      console.log(`Plan: ${name} (${plan.id}) | Parse error: ${e.message}`);
    }
  }
})();
