const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve('.env.local');
require('dotenv').config({ path: envPath });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const projectId = '76530312-bc7b-4681-a760-84c0c7765084'; // GewerbePark Duisburg Neumühl
  const companyId = '1e827112-9db0-4c09-b14f-50f76b6b9579'; // Harden IndustrieBau
  
  console.log(`--- Aligning company_id to ${companyId} for project ${projectId} ---`);

  // 1. Update cables
  console.log("Updating cables...");
  const { data: cablesUpdated, error: cablesErr } = await supabase
    .from('cables')
    .update({ company_id: companyId })
    .eq('project_id', projectId);

  if (cablesErr) {
    console.error("Cables update error:", cablesErr);
  } else {
    console.log("Cables updated successfully.");
  }

  // 2. Update cable_routes
  console.log("Updating cable_routes...");
  const { data: routesUpdated, error: routesErr } = await supabase
    .from('cable_routes')
    .update({ company_id: companyId })
    .eq('project_id', projectId);

  if (routesErr) {
    console.error("Cable routes update error:", routesErr);
  } else {
    console.log("Cable routes updated successfully.");
  }

  // 3. Update trommels
  console.log("Updating trommels...");
  const { data: trommelsUpdated, error: trommelsErr } = await supabase
    .from('trommels')
    .update({ company_id: companyId })
    .eq('project_id', projectId);

  if (trommelsErr) {
    console.error("Trommels update error:", trommelsErr);
  } else {
    console.log("Trommels updated successfully.");
  }

  console.log("--- Verification scan ---");
  const { count: mismatchedCables } = await supabase
    .from('cables')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .neq('company_id', companyId);

  const { count: mismatchedRoutes } = await supabase
    .from('cable_routes')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .neq('company_id', companyId);

  const { count: mismatchedTrommels } = await supabase
    .from('trommels')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .neq('company_id', companyId);

  console.log("Mismatched cables remaining:", mismatchedCables);
  console.log("Mismatched routes remaining:", mismatchedRoutes);
  console.log("Mismatched trommels remaining:", mismatchedTrommels);
}

run();
