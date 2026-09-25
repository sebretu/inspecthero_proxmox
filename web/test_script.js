const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

function fixUtf8Encoding(text) {
    if (!text) return '';
    try {
        return text
            .replace(/„/g, 'ä')
            .replace(/”/g, 'ö')
            .replace(/\x84/g, 'ä').replace(/\x8e/g, 'Ä')
            .replace(/\x94/g, 'ö').replace(/\x99/g, 'Ö')
            .replace(/\x81/g, 'ü').replace(/\x9a/g, 'Ü')
            .replace(/\xe1/g, 'ß')
            .replace(/f\s*r\s+/gi, 'für ')
            .replace(/hellgr\s*n/gi, 'hellgrün')
            .replace(/Przisions/gi, 'Präzisions')
            .replace(/f\.Leiterpl\./g, 'für Leiterplatten')
            .replace(/Analogeing„nge/g, 'Analogeingänge')
            .replace(/Befehlsger„te/g, 'Befehlsgeräte')
            .replace(/gepr\s*ft/gi, 'geprüft');
    } catch {
        return text;
    }
}

async function run() {
    const { data } = await supabase.from('materials').select('name').ilike('name', '%CIMC%111890%').limit(1);
    if (data && data[0]) {
        console.log('Original DB Name:', data[0].name);
        console.log('Hex codes:', Array.from(data[0].name).map(c => c.charCodeAt(0).toString(16)).join(' '));
        const fixed = fixUtf8Encoding(data[0].name);
        console.log('Fixed Name:', fixed);
        console.log('Fixed Hex codes:', Array.from(fixed).map(c => c.charCodeAt(0).toString(16)).join(' '));
    } else {
        console.log('No item found');
    }
    process.exit(0);
}
run();
