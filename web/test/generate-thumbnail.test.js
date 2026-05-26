// Test wywołania Edge Function generate-thumbnail
const fetch = require('node-fetch');

const EDGE_URL = 'https://phvtrpskgupxkktbznac.functions.supabase.co/generate-thumbnail';
const imagePath = 'test-task/2026-02-23-test-photo.jpg'; // Przykładowa ścieżka

async function testGenerateThumbnail() {
  const res = await fetch(EDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imagePath }),
  });
  const json = await res.json();
  console.log('Edge Function response:', json);
  if (!json.thumbUrl || !json.thumbUrlWebp) {
    throw new Error('Brak URL miniatury JPG lub WEBP');
  }
  console.log('Test OK: Miniatury wygenerowane');
}

if (require.main === module) {
  testGenerateThumbnail().catch(e => {
    console.error('Test failed:', e);
    process.exit(1);
  });
}
