import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "http://188.245.42.178:54321";
const supabaseKey = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const supabase = createClient(supabaseUrl, supabaseKey);

const COMPANY_SLUG = "etecprojekt";
const PROJECT_NAME = "Listbau";
const BUILDING_NAME = "Listbau Building";
const BUILDING_CODE = "LISTBAU-A";
const DESCRIPTION = "Project created for Listbau so floors and plans can be added.";
const MEMBER_IDS = [
  "f98a1615-8314-416f-a5ff-c1092f6acbeb",
  "e314faa3-a6dc-492a-b26a-93579544aadb",
];
const ADDED_BY = MEMBER_IDS[0];

async function ensureCompany() {
  const { data, error } = await supabase
    .from("companies")
    .select("id")
    .eq("slug", COMPANY_SLUG)
    .maybeSingle();
  if (error) throw new Error(`Failed to load company: ${error.message}`);
  if (!data) throw new Error(`Company with slug ${COMPANY_SLUG} not found`);
  return data.id;
}

async function ensureProject(companyId) {
  const { data: existing } = await supabase
    .from("projects")
    .select("id")
    .eq("name", PROJECT_NAME)
    .maybeSingle();
  if (existing?.id) {
    return existing.id;
  }
  const { data, error } = await supabase
    .from("projects")
    .insert({
      company_id: companyId,
      name: PROJECT_NAME,
      address: "",
      description: DESCRIPTION,
      created_by: ADDED_BY,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Failed to create project: ${error.message}`);
  return data.id;
}

async function ensureBuilding(projectId) {
  const { data: existing } = await supabase
    .from("buildings")
    .select("id")
    .eq("project_id", projectId)
    .eq("name", BUILDING_NAME)
    .maybeSingle();
  if (existing?.id) {
    return existing.id;
  }
  const { data, error } = await supabase
    .from("buildings")
    .insert({
      project_id: projectId,
      name: BUILDING_NAME,
      code: BUILDING_CODE,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Failed to create building: ${error.message}`);
  return data.id;
}

async function ensureMembers(projectId) {
  for (const userId of MEMBER_IDS) {
    const { data: existing } = await supabase
      .from("project_members")
      .select("id")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .maybeSingle();
    if (existing?.id) continue;
    const { error } = await supabase.from("project_members").insert({
      project_id: projectId,
      user_id: userId,
      role: "ADMIN",
      added_by: ADDED_BY,
    });
    if (error) throw new Error(`Failed to add member ${userId}: ${error.message}`);
  }
}

async function main() {
  const companyId = await ensureCompany();
  const projectId = await ensureProject(companyId);
  const buildingId = await ensureBuilding(projectId);
  await ensureMembers(projectId);
  console.log("Listbau project ready", { projectId, buildingId });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
