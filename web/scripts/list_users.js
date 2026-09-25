import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'http://188.245.42.178:54321';
const supabaseKey = 'sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz';
const supabase = createClient(supabaseUrl, supabaseKey);

async function listUsers() {
  const { data, error } = await supabase.from('profiles').select('*');
  if (error) {
    console.error('Błąd pobierania użytkowników:', error.message);
  } else {
    console.log('Użytkownicy w bazie:');
    for (const user of data) {
      console.log(`id: ${user.id}, email: ${user.email}, full_name: ${user.full_name}, role: ${user.role}`);
    }
  }
}

listUsers();
