
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkTrommel() {
  const index = process.argv[2]
  const { data, error } = await supabase
    .from('trommels')
    .select('*')
    .eq('index_number', index)
    .single()

  if (error) {
    console.error('Error:', error.message)
  } else {
    console.log('Trommel Info:', JSON.stringify(data, null, 2))
  }
}

checkTrommel()
