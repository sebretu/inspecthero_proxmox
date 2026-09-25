import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

async function refresh() {
  const projectId = '76530312-bc7b-4681-a760-84c0c7765084';
  const apiUrl = `https://api.inspecthero.pl/api/bma/recalculate-routes?projectId=${projectId}`;
  
  console.log(`Calling ${apiUrl}...`);
  
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  });
  
  const data = await res.json();
  console.log('Refresh result:', data);
}

refresh();
