require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase
    .from('materials')
    .select('id, name, article_number')
    .ilike('name', '%Schrauben%')
    .ilike('article_number', '%111890%')
    .limit(5);

  if (error) {
    console.error(error);
    return;
  }
  
  if (!data || data.length === 0) {
    console.log("No match found for 111890. Trying CIMC%...");
    const { data: d2 } = await supabase.from('materials').select('name').ilike('name', '%CIMC%6x50%').limit(2);
    console.log(d2);
    return;
  }

  data.forEach(item => {
    console.log(`\nName: ${item.name}`);
    console.log("Bytes:");
    console.log(Array.from(item.name).map(c => `[${c}] = ${c.charCodeAt(0).toString(16)}`).join(', '));
  });
}
run();
