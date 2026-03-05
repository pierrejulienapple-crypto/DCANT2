-- ═══════════════════════════════════════════
-- DCANT V1 — Script d'initialisation Supabase
-- Coller en une fois dans SQL Editor
-- ═══════════════════════════════════════════

-- Table historique des calculs
create table if not exists historique (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  domaine text,
  cuvee text,
  millesime text,
  commentaire text,
  prix_achat numeric not null,
  charges jsonb default '{"transport":0,"douane":0,"others":[],"total":0}',
  cout_revient numeric not null,
  mode text not null check (mode in ('euros','pct','coeff')),
  mode_value numeric not null,
  pvht numeric not null,
  marge_euros numeric not null,
  marge_pct numeric not null,
  coeff numeric not null,
  pvttc numeric not null,
  created_at timestamptz default now()
);

-- Table feedback questionnaire
create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  user_email text,
  question int2 not null,
  reponse text not null,
  commentaire text,
  created_at timestamptz default now()
);

-- Table modèles de marge
create table if not exists modeles (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  nom text not null,
  mode text not null check (mode in ('euros','pct','coeff')),
  mode_value numeric not null,
  transport numeric default 0,
  douane numeric default 0,
  others jsonb default '[]',
  created_at timestamptz default now()
);

-- ── Row Level Security ──
alter table historique enable row level security;
alter table feedback enable row level security;
alter table modeles enable row level security;

-- Policies historique : chaque user ne voit que ses données
create policy "historique_select" on historique
  for select using (user_email = current_setting('request.jwt.claims', true)::json->>'email');
create policy "historique_insert" on historique
  for insert with check (user_email = current_setting('request.jwt.claims', true)::json->>'email');
create policy "historique_update" on historique
  for update using (user_email = current_setting('request.jwt.claims', true)::json->>'email');
create policy "historique_delete" on historique
  for delete using (user_email = current_setting('request.jwt.claims', true)::json->>'email');

-- Policies modèles
create policy "modeles_select" on modeles
  for select using (user_email = current_setting('request.jwt.claims', true)::json->>'email');
create policy "modeles_insert" on modeles
  for insert with check (user_email = current_setting('request.jwt.claims', true)::json->>'email');
create policy "modeles_delete" on modeles
  for delete using (user_email = current_setting('request.jwt.claims', true)::json->>'email');

-- Feedback : insert public (anonyme ok), lecture admin seulement
create policy "feedback_insert" on feedback
  for insert with check (true);

-- Table corrections (apprentissage IA)
create table if not exists corrections (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  original text,
  corrected text,
  field text,
  created_at timestamptz default now()
);

alter table corrections enable row level security;
create policy "corrections_own" on corrections for all using (user_email = auth.jwt()->>'email');
