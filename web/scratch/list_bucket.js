const { createClient } = require('/home/ubuntu/building-task-manager/web/node_modules/@supabase/supabase-js');

const sbUrl = 'https://api.inspecthero.pl';
const sbKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3Nzk3Mjg5NDMsImV4cCI6MjA5NTA4ODk0M30.puiELZCZvCy0vYoMAnjZRiYaVJ3UhdBvkSh9UYtmRbQ';
const supabase = createClient(sbUrl, sbKey);

(async () => {
  console.log("Listing files in bucket 'plans' root:");
  const { data: rootFiles, error: rootErr } = await supabase.storage.from('plans').list('');
  if (rootErr) {
    console.error("Root listing error:", rootErr);
  } else {
    rootFiles.forEach(f => console.log(`  - ${f.name} (size: ${f.metadata?.size || 'unknown'})`));
  }

  const pathEG = 'projects/45558114-382e-4e5c-a277-2d5532c71f58/floors/98a53dfe-deed-4948-8dc2-e305214f9a35';
  console.log(`\nListing files in floor folder '${pathEG}':`);
  const { data: floorFiles, error: floorErr } = await supabase.storage.from('plans').list(pathEG);
  if (floorErr) {
    console.error("Floor listing error:", floorErr);
  } else {
    floorFiles.forEach(f => console.log(`  - ${f.name} (size: ${f.metadata?.size || 'unknown'})`));
  }
})();
