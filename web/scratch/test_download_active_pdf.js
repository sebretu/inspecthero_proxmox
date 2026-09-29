const { createClient } = require('/home/ubuntu/building-task-manager/web/node_modules/@supabase/supabase-js');
const { PDFDocument } = require('/home/ubuntu/building-task-manager/web/node_modules/pdf-lib');

const sbUrl = 'https://api.inspecthero.pl';
const sbKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3Nzk3Mjg5NDMsImV4cCI6MjA5NTA4ODk0M30.puiELZCZvCy0vYoMAnjZRiYaVJ3UhdBvkSh9UYtmRbQ';
const supabase = createClient(sbUrl, sbKey);

(async () => {
  const targets = [
    {
      planId: '990da539-ab71-42da-a501-45bf840a8d99',
      storagePath: 'projects/45558114-382e-4e5c-a277-2d5532c71f58/floors/98a53dfe-deed-4948-8dc2-e305214f9a35/v1.pdf',
      activeUrl: 'plan_990da539-ab71-42da-a501-45bf840a8d99_v2.pdf'
    },
    {
      planId: '633c788d-fe28-4f0d-97f1-87d2affe9021',
      storagePath: 'projects/45558114-382e-4e5c-a277-2d5532c71f58/floors/f7b3b7a6-c995-41c9-bba8-fd19a33bbc74/v1.pdf',
      activeUrl: 'plan_633c788d-fe28-4f0d-97f1-87d2affe9021_v2.pdf'
    },
    {
      planId: '6b0a791d-312b-4ed9-9d68-76ca3184006f',
      storagePath: 'projects/45558114-382e-4e5c-a277-2d5532c71f58/floors/ad5f1317-40e8-4d03-9696-5f1d56a56b8a/v1.pdf',
      activeUrl: 'plan_6b0a791d-312b-4ed9-9d68-76ca3184006f_v3.pdf'
    }
  ];

  for (const t of targets) {
    const parts = t.storagePath.split('/');
    parts.pop();
    parts.push(t.activeUrl);
    const reconstructedPath = parts.join('/');
    console.log(`Reconstructed path: ${reconstructedPath}`);

    const { data: fileData, error } = await supabase.storage.from('plans').download(reconstructedPath);
    if (error) {
      console.error(`  -> Download error for ${t.planId}:`, error.message);
    } else {
      const doc = await PDFDocument.load(await fileData.arrayBuffer());
      console.log(`  -> SUCCESS! PDF loaded, pages count: ${doc.getPages().length}`);
    }
  }
})();
