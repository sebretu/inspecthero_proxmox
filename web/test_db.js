const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
sb.from('plans').select('*, floors(name, buildings(name))').limit(3).then(({data}) => console.log(JSON.stringify(data, null, 2)));
