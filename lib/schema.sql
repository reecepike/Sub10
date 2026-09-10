-- Sub-10 coaching system — schema

create table if not exists users (
  id            serial primary key,
  email         text unique not null,
  password_hash text not null,
  created_at    timestamptz not null default now()
);

create table if not exists settings (
  id                    int primary key default 1,
  athlete_name          text    not null default 'Isaac',
  race_date             date    not null default '2027-07-25',
  start_date            date    not null default '2026-09-14',
  weight_kg             numeric not null default 68,
  ftp                   int,
  css_sec               int,
  five_k_sec            int,
  lthr_run              int,
  lthr_bike             int,
  bench_5rm             int,
  aero_bars             boolean not null default false,
  transitions_rehearsed boolean not null default false,
  badminton_fri         boolean not null default true,
  badminton_sun         boolean not null default true,
  updated_at            timestamptz not null default now(),
  constraint settings_singleton check (id = 1)
);

create table if not exists readiness (
  day        date primary key,
  sleep_h    numeric,
  sleep_q    int,
  rhr        int,
  hrv        int,
  weight_kg  numeric,
  fatigue    int,
  soreness   int,
  stress     int,
  motivation int,
  illness    boolean not null default false,
  pain       text,
  notes      text,
  score      int,
  band       text,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  id            serial primary key,
  day           date not null,
  discipline    text not null,          -- SW BK RN ST OT BR
  plan_key      text,                   -- links back to the prescribed session
  title         text,
  duration_min  int,
  distance      numeric,
  rpe           int,
  avg_hr        int,
  avg_power     int,
  np            int,
  cadence       int,
  avg_pace_sec  int,
  stroke_count  int,
  hr_drift      numeric,
  carbs_per_h   int,
  niggle        text,
  notes         text,
  completed     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists sessions_day_idx on sessions (day);

create table if not exists tests (
  id         serial primary key,
  day        date not null,
  kind       text not null,             -- ftp css five_k bench thirty_min drift
  value      numeric not null,
  note       text,
  created_at timestamptz not null default now()
);
create index if not exists tests_kind_idx on tests (kind, day);

create table if not exists weekly_reviews (
  week          int primary key,
  day           date not null,
  planned_eth   numeric,
  actual_eth    numeric,
  missed        text,
  key_sessions  text,
  recovery      text,
  limiter       text,
  one_line      text,
  created_at    timestamptz not null default now()
);

create table if not exists monthly_reviews (
  id            serial primary key,
  day           date not null,
  strongest     text,
  weakest       text,
  limiter       text,
  injury_risk   text,
  sustainable   text,
  projection    text,
  trajectory    text,
  changes       text,
  created_at    timestamptz not null default now()
);

create table if not exists adaptations (
  id          serial primary key,
  day         date not null,
  week        int,
  trigger     text,
  decision    text,
  reasoning   text,
  outcome     text,
  automatic   boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists adaptations_day_idx on adaptations (day desc);

-- Other activity: badminton, skiing, gym, manual work
create table if not exists other_activity (
  id          serial primary key,
  day         date not null,
  activity    text not null,
  duration_min int not null,
  rpe         int,
  factor      numeric not null default 0.7,
  next_day    text,
  created_at  timestamptz not null default now()
);
create index if not exists other_day_idx on other_activity (day);

insert into settings (id) values (1) on conflict (id) do nothing;
