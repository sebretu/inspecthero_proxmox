const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

async function checkCables() {
  const { data: trs } = await supabase.from('trommels').select('id, index_number').eq('index_number', 1000)
  if (trs && trs.length > 0) {
    const { data: cbs } = await supabase.from('cables').select('id, name, length').eq('trommel_id', trs[0].id)
    console.log("Trommel 1000 cables:", cbs)
  }
}

checkCables()
