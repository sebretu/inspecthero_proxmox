-- =============================================================================
-- MIGRATION: 20260908130000_progress_templates.sql
-- Description: Project Progress Templates (Muster) with N-level template nodes and default system template
-- =============================================================================

create table if not exists public.project_progress_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  name text not null,
  description text,
  is_system boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_progress_template_nodes (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.project_progress_templates(id) on delete cascade,
  parent_id uuid references public.project_progress_template_nodes(id) on delete cascade,
  node_type text not null default 'WORK_ITEM',
  name text not null,
  description text,
  weight numeric(5,2) not null default 0.00 check (weight >= 0 and weight <= 100),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_template_nodes_template on public.project_progress_template_nodes(template_id);
create index if not exists idx_template_nodes_parent on public.project_progress_template_nodes(parent_id);

alter table public.project_progress_templates enable row level security;
alter table public.project_progress_template_nodes enable row level security;

-- RLS: Templates are viewable by any authenticated user if is_system = true OR company matches
drop policy if exists progress_templates_select on public.project_progress_templates;
create policy progress_templates_select on public.project_progress_templates for select
using (is_system = true or (company_id is not null and company_id = public.current_company_id()));

drop policy if exists progress_templates_insert on public.project_progress_templates;
create policy progress_templates_insert on public.project_progress_templates for insert
with check (is_system = false and company_id = public.current_company_id());

drop policy if exists progress_templates_update on public.project_progress_templates;
create policy progress_templates_update on public.project_progress_templates for update
using (is_system = false and company_id = public.current_company_id());

drop policy if exists progress_templates_delete on public.project_progress_templates;
create policy progress_templates_delete on public.project_progress_templates for delete
using (is_system = false and company_id = public.current_company_id());

-- Template nodes RLS
drop policy if exists progress_template_nodes_select on public.project_progress_template_nodes;
create policy progress_template_nodes_select on public.project_progress_template_nodes for select
using (
  exists (
    select 1 from public.project_progress_templates t
    where t.id = template_id and (t.is_system = true or t.company_id = public.current_company_id())
  )
);

drop policy if exists progress_template_nodes_modify on public.project_progress_template_nodes;
create policy progress_template_nodes_modify on public.project_progress_template_nodes for all
using (
  exists (
    select 1 from public.project_progress_templates t
    where t.id = template_id and t.is_system = false and t.company_id = public.current_company_id()
  )
);

-- Seed Default System Template: "Elektro Ausbau – Komplettinstallation"
do $$
declare
  v_tpl_id uuid;
  v_cat_id uuid;
begin
  -- Check if already seeded
  select id into v_tpl_id from public.project_progress_templates where name = 'Elektro Ausbau – Komplettinstallation' and is_system = true limit 1;

  if v_tpl_id is null then
    insert into public.project_progress_templates (name, description, is_system)
    values (
      'Elektro Ausbau – Komplettinstallation',
      'Komplette manuelle Fortschrittsstruktur für Elektroinstallationen im Ausbau, einschließlich Zuleitungen, Unterverteilungen, Rohinstallation, Steckdosen, Schalter, Beleuchtung, Prüfungen und Abschlussarbeiten.',
      true
    ) returning id into v_tpl_id;

    -- 1. Planung & Vorbereitung (5%)
    insert into public.project_progress_template_nodes (template_id, parent_id, node_type, name, weight, sort_order)
    values (v_tpl_id, null, 'CATEGORY', 'Planung & Vorbereitung', 5.00, 1) returning id into v_cat_id;

    insert into public.project_progress_template_nodes (template_id, parent_id, node_type, name, weight, sort_order) values
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Bestandsaufnahme / Baustellenaufnahme', 20.00, 1),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Elektroplanung / Stromkreisaufteilung', 20.00, 2),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Material- und Montagevorbereitung', 20.00, 3),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Baustelleneinrichtung / Schutzmaßnahmen', 20.00, 4),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Kennzeichnung und Vorbereitung der Installationswege', 20.00, 5);

    -- 2. Zuleitungen & Energieversorgung (10%)
    insert into public.project_progress_template_nodes (template_id, parent_id, node_type, name, weight, sort_order)
    values (v_tpl_id, null, 'CATEGORY', 'Zuleitungen & Energieversorgung', 10.00, 2) returning id into v_cat_id;

    insert into public.project_progress_template_nodes (template_id, parent_id, node_type, name, weight, sort_order) values
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Hauptzuleitung zum Objekt / zur Unterverteilung', 40.00, 1),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Zuleitungen für Unterverteilungen', 20.00, 2),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Zuleitungen für größere Verbraucher', 20.00, 3),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Leitungswege / Kabeltrassen für Zuleitungen', 10.00, 4),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Anschluss und Prüfung der Zuleitungen', 10.00, 5);

    -- 3. Unterverteilungen (12%)
    insert into public.project_progress_template_nodes (template_id, parent_id, node_type, name, weight, sort_order)
    values (v_tpl_id, null, 'CATEGORY', 'Unterverteilungen', 12.00, 3) returning id into v_cat_id;

    insert into public.project_progress_template_nodes (template_id, parent_id, node_type, name, weight, sort_order) values
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Demontage / Vorbereitung bestehender UV', 8.33, 1),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Montage neue Unterverteilung', 16.67, 2),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Umbau / Erweiterung bestehender Unterverteilung', 16.67, 3),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Einbau Leitungsschutzschalter / Sicherungen', 16.67, 4),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Einbau FI/RCD / Schutzgeräte', 16.67, 5),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Verdrahtung der Unterverteilung', 16.67, 6),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Beschriftung und Stromkreiskennzeichnung', 8.32, 7);

    -- 4. Leitungsverlegung & Rohinstallation (20%)
    insert into public.project_progress_template_nodes (template_id, parent_id, node_type, name, weight, sort_order)
    values (v_tpl_id, null, 'CATEGORY', 'Leitungsverlegung & Rohinstallation', 20.00, 4) returning id into v_cat_id;

    insert into public.project_progress_template_nodes (template_id, parent_id, node_type, name, weight, sort_order) values
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Verlegung NYM / Installationsleitungen', 25.00, 1),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Verlegung stärkerer Zuleitungen', 10.00, 2),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Leitungsführung in Wänden / Decken', 15.00, 3),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Leitungsführung in Installationszonen', 10.00, 4),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Kabeltrassen / Kabelkanäle / Befestigung', 10.00, 5),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Herstellung von Durchführungen / Wanddurchbrüchen', 5.00, 6),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Befestigung und Sicherung der Leitungen', 10.00, 7),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Vorbereitung der Leitungsenden', 5.00, 8),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Prüfung und Zuordnung der verlegten Leitungen', 10.00, 9);

    -- 5. Dosen & Anschlusspunkte (10%)
    insert into public.project_progress_template_nodes (template_id, parent_id, node_type, name, weight, sort_order)
    values (v_tpl_id, null, 'CATEGORY', 'Dosen & Anschlusspunkte', 10.00, 5) returning id into v_cat_id;

    insert into public.project_progress_template_nodes (template_id, parent_id, node_type, name, weight, sort_order) values
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Setzen Unterputzdosen', 30.00, 1),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Setzen Abzweigdosen / Gerätedosen', 10.00, 2),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Vorbereitung Steckdosenanschlüsse', 20.00, 3),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Vorbereitung Schalteranschlüsse', 10.00, 4),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Vorbereitung Lichtauslässe', 20.00, 5),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Anschluss und Kontrolle der Dosen', 10.00, 6);

    -- 6. Steckdosen & Schalter (12%)
    insert into public.project_progress_template_nodes (template_id, parent_id, node_type, name, weight, sort_order)
    values (v_tpl_id, null, 'CATEGORY', 'Steckdosen & Schalter', 12.00, 6) returning id into v_cat_id;

    insert into public.project_progress_template_nodes (template_id, parent_id, node_type, name, weight, sort_order) values
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Montage Standard-Steckdosen', 33.33, 1),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Montage Schalter', 16.67, 2),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Montage Taster / Serienschalter / Wechselschalter', 16.67, 3),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Montage Sondersteckdosen', 8.33, 4),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Anschluss und Verdrahtung', 16.67, 5),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Funktionsprüfung', 8.33, 6);

    -- 7. Beleuchtung (10%)
    insert into public.project_progress_template_nodes (template_id, parent_id, node_type, name, weight, sort_order)
    values (v_tpl_id, null, 'CATEGORY', 'Beleuchtung', 10.00, 7) returning id into v_cat_id;

    insert into public.project_progress_template_nodes (template_id, parent_id, node_type, name, weight, sort_order) values
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Vorbereitung Beleuchtungsauslässe', 20.00, 1),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Montage Decken-/Wandauslässe', 20.00, 2),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Montage Leuchten', 30.00, 3),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Anschluss und Verdrahtung der Leuchten', 10.00, 4),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Montage Bewegungs-/Präsenzmelder', 10.00, 5),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Funktionsprüfung Beleuchtung', 10.00, 6);

    -- 8. Schutz & Potentialausgleich (5%)
    insert into public.project_progress_template_nodes (template_id, parent_id, node_type, name, weight, sort_order)
    values (v_tpl_id, null, 'CATEGORY', 'Schutz & Potentialausgleich', 5.00, 8) returning id into v_cat_id;

    insert into public.project_progress_template_nodes (template_id, parent_id, node_type, name, weight, sort_order) values
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Schutzleiter / PE-Verbindungen', 20.00, 1),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Potentialausgleich', 20.00, 2),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Erdungsanschlüsse', 20.00, 3),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Schutzmaßnahmen / Abschaltbedingungen', 20.00, 4),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Kontrolle Schutzleiterverbindungen', 20.00, 5);

    -- 9. Prüfung & Dokumentation (6%)
    insert into public.project_progress_template_nodes (template_id, parent_id, node_type, name, weight, sort_order)
    values (v_tpl_id, null, 'CATEGORY', 'Prüfung & Dokumentation', 6.00, 9) returning id into v_cat_id;

    insert into public.project_progress_template_nodes (template_id, parent_id, node_type, name, weight, sort_order) values
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Durchgangsprüfung', 16.67, 1),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Isolationsmessung', 16.67, 2),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'RCD/FI-Prüfung', 16.67, 3),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Prüfung der Schutzmaßnahmen', 16.67, 4),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Stromkreisprüfung / Zuordnung', 16.67, 5),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Messprotokoll / Dokumentation', 16.65, 6);

    -- 10. Endmontage & Abschluss (10%)
    insert into public.project_progress_template_nodes (template_id, parent_id, node_type, name, weight, sort_order)
    values (v_tpl_id, null, 'CATEGORY', 'Endmontage & Abschluss', 10.00, 10) returning id into v_cat_id;

    insert into public.project_progress_template_nodes (template_id, parent_id, node_type, name, weight, sort_order) values
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Endmontage Schalter und Steckdosen', 20.00, 1),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Endmontage Beleuchtung', 20.00, 2),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Kontrolle der Unterverteilungen', 10.00, 3),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Beschriftung / Kennzeichnung finalisieren', 10.00, 4),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Beseitigung von Restarbeiten', 10.00, 5),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Funktionskontrolle Gesamtanlage', 10.00, 6),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Mängelbeseitigung / Nacharbeiten', 10.00, 7),
      (v_tpl_id, v_cat_id, 'WORK_ITEM', 'Übergabe / Abschlussdokumentation', 10.00, 8);
  end if;
end $$;
