import { createClient } from '@supabase/supabase-js'

const supabaseUrl = "https://mslvsyvukpmlfngidixu.supabase.co"
const supabaseKey = "eyJhbGciOiJFUzI1NiIsImtpZCI6ImI4MTI2OWYxLTIxZDgtNGYyZS1iNzE5LWMyMjQwYTg0MGQ5MCIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MjA4Njg5MzY4NH0.HKsNGrMAVmhBVSjwa6WIJusrk8kvc7y77DXN6Aatf3l4mon83vIBsCh1W0dpSgh09rdcpha1bYnimYJMFnZ18A"

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkSchema() {
  const { data, error } = await supabase.from('plans').select('*').limit(1)
  if (error) {
    console.error(error)
  } else {
    console.log(JSON.stringify(data[0], null, 2))
  }
}

checkSchema()
