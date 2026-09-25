const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
    console.error("Missing SUPABASE_URL or SERVICE_ROLE_KEY");
    process.exit(1);
}

const supabase = createClient(url, serviceKey);

async function listUsers() {
    const { data, error } = await supabase.from("profiles").select("email, role, company_id");
    if (error) {
        console.error(error);
        return;
    }
    console.log(JSON.stringify(data, null, 2));
}

listUsers();
