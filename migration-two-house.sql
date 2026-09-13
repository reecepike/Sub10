-- ===================================================================
--  Sub-10 · migration for the two-house / weekly-allocation rebuild
--
--  Run this ONCE against your Neon database, after deploying the new
--  code. Everything in it is additive and idempotent: it adds columns
--  and tables, and touches no data you already have. Running it twice
--  does nothing the second time.
--
--  In the Neon console: SQL Editor → paste the whole file → Run.
-- ===================================================================

-- ===================================================================
--  The two-house / weekly-allocation rebuild.
--
--  Everything here is additive and idempotent — running it twice does
--  nothing the second time, and running it against the existing
--  database changes no data that is already there.
-- ===================================================================

-- --- the no-pre-work rule ------------------------------------------
-- False by default and deliberately so: he cannot train before work on
-- a normal weekday. A plan that keeps scheduling a 06:30 threshold run
-- on a Tuesday is not being ambitious, it is manufacturing sessions
-- that get missed.
alter table settings add column if not exists allow_pre_work boolean not null default false;
alter table settings add column if not exists work_days      text    not null default '1,2,3,4,5';
alter table settings add column if not exists work_start     text    not null default '08:30';
alter table settings add column if not exists work_end       text    not null default '17:00';

-- --- the two houses ------------------------------------------------
-- Dad's:  Saturday 16:00 → Tuesday after work.   Main cook: Sunday.
-- Mum's:  Tuesday after work → Saturday 16:00.   Main cook: Wednesday.
alter table settings add column if not exists sat_handover text not null default '16:00';
alter table settings add column if not exists tue_handover text not null default '18:00';
alter table settings add column if not exists dad_label    text not null default 'Dad''s';
alter table settings add column if not exists mum_label    text not null default 'Mum''s';

-- --- batches, portions and containers ------------------------------
-- The generated kitchen is cached per week so the prep page, the
-- shopping page and the daily plan cannot disagree with each other
-- about which container Thursday's dinner is in.
create table if not exists kitchen_plans (
  week_start   date primary key,
  batches      jsonb not null,
  portions     jsonb not null,
  segments     jsonb not null,
  generated_at timestamptz not null default now()
);

create table if not exists house_shopping (
  week_start   date not null,
  house        text not null,            -- dad | mum
  lines        jsonb not null,
  total_gbp    numeric not null default 0,
  ongoing_gbp  numeric not null default 0,
  actual_gbp   numeric,
  generated_at timestamptz not null default now(),
  primary key (week_start, house)
);

-- --- the audit trail -----------------------------------------------
-- Every time the failsafe refuses to display a number, it is recorded.
-- A blocking audit that happens once is a data-entry mistake; one that
-- happens every Tuesday is a bug, and the difference is only visible
-- if they are written down.
create table if not exists audit_log (
  id         serial primary key,
  day        date not null,
  scope      text not null,              -- day | week
  code       text not null,
  severity   text not null,
  title      text not null,
  detail     text not null,
  displayed  numeric,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_day_idx on audit_log (day desc);

-- --- the stated dislikes -------------------------------------------
-- Mushrooms, and a standing note that meals should not be built on
-- tinned beans. Seeded once; deleting the row on the Food page is
-- enough to reverse it, and this will not put it back.
insert into food_prefs (food_key, raw, stance, note)
select 'mushrooms', 'mushrooms', 'dislike', 'Stated directly. Substituted with something of the same culinary class, never dropped silently.'
where not exists (select 1 from food_prefs where food_key = 'mushrooms');

-- Tinned beans are NOT seeded as a dislike, deliberately. "I don't want
-- meals dominated by tinned beans" is not "I don't eat beans", and
-- filing it as a dislike would strip a genuinely good cheap protein out
-- of the catalogue. It is enforced as a composition rule in the day
-- builder instead: no day may take more than 40% of its protein from
-- tinned legumes, and no day gets more than two meals built on them.
