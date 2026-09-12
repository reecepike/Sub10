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

-- ===================================================================
--  NUTRITION & FUELLING ENGINE
--  Added as an extension of the training schema, not a parallel one.
--  Every nutrition row hangs off the same day/session data the training
--  engine already owns; nothing about training is duplicated here.
-- ===================================================================

-- --- profile fields the energy model needs -------------------------
alter table settings add column if not exists height_cm     numeric not null default 177;
alter table settings add column if not exists age_years      int     not null default 18;
alter table settings add column if not exists sex            text    not null default 'male';
alter table settings add column if not exists body_fat_pct   numeric;
alter table settings add column if not exists pool_length_m  int     not null default 25;
alter table settings add column if not exists budget_gbp     numeric not null default 60;
alter table settings add column if not exists neat_pal       numeric not null default 1.40;
alter table settings add column if not exists kcal_adjust    int     not null default 0;
alter table settings add column if not exists sleep_mode     text    not null default 'subjective';
alter table settings add column if not exists carb_tolerance int     not null default 45;
alter table settings add column if not exists meals_per_day  int     not null default 3;

update settings set pool_length_m = 25 where id = 1 and pool_length_m <> 25;

-- The athlete's stated starting figures. Editable in Settings; set once here so
-- the energy model has real numbers rather than population averages on day one.
update settings set body_fat_pct = 10 where id = 1 and body_fat_pct is null;

-- --- the food catalogue -------------------------------------------
-- Prices are Aldi UK. `verified` marks the ones checked against a real
-- listing; everything else is an estimate the user can correct in place.
create table if not exists foods (
  key           text primary key,
  name          text not null,
  aldi_product  text,
  category      text not null,           -- protein carb fat veg fruit dairy fuel store
  roles         text not null default '',-- comma-separated nutritional roles
  pack_g        numeric not null,        -- grams (or ml) per pack
  pack_price    numeric not null,        -- £ per pack
  kcal_100      numeric not null,
  protein_100   numeric not null,
  carb_100      numeric not null,
  fat_100       numeric not null,
  fibre_100     numeric not null default 0,
  sodium_100    numeric not null default 0,  -- mg
  perishable    boolean not null default true,
  freezable     boolean not null default false,
  verified      boolean not null default false,
  price_checked date,
  active        boolean not null default true
);

-- --- preferences, learned over time --------------------------------
create table if not exists food_prefs (
  id         serial primary key,
  food_key   text,                       -- null when the user named something we do not stock
  raw        text not null,              -- exactly what they typed
  stance     text not null,              -- like | dislike | never | gi_problem
  note       text,
  created_at timestamptz not null default now()
);
create index if not exists food_prefs_key_idx on food_prefs (food_key);

create table if not exists meal_prefs (
  meal_key   text primary key,
  stance     text not null,              -- like | dislike
  note       text,
  created_at timestamptz not null default now()
);

create table if not exists restrictions (
  id         serial primary key,
  name       text not null,              -- 'peanuts', 'lactose', 'gluten'
  kind       text not null default 'allergy',  -- allergy | intolerance | avoid
  severity   text not null default 'avoid',    -- avoid | strict
  created_at timestamptz not null default now()
);

-- --- the generated plan --------------------------------------------
create table if not exists nutrition_days (
  day           date primary key,
  week          int,
  phase         text,
  kcal_target   int not null,
  protein_g     int not null,
  carb_g        int not null,
  fat_g         int not null,
  fibre_g       int not null,
  fluid_ml      int not null,
  sodium_mg     int not null,
  train_kcal    int not null default 0,
  rmr_kcal      int not null default 0,
  neat_kcal     int not null default 0,
  confidence    text,
  rationale     text,
  generated_at  timestamptz not null default now()
);

create table if not exists meal_plan (
  id         serial primary key,
  day        date not null,
  seq        int not null default 0,
  slot       text not null,              -- breakfast lunch dinner snack pre during post
  at_time    text,                       -- 'HH:MM'
  meal_key   text,
  title      text not null,
  items      jsonb not null default '[]'::jsonb,
  kcal       int not null default 0,
  protein_g  int not null default 0,
  carb_g     int not null default 0,
  fat_g      int not null default 0,
  fibre_g    int not null default 0,
  note       text,
  session_ref text,                      -- plan key of the session it serves
  unique (day, seq)
);
create index if not exists meal_plan_day_idx on meal_plan (day);

-- --- what actually went in ------------------------------------------
create table if not exists intake_log (
  id         serial primary key,
  day        date not null,
  raw        text not null,              -- 'only ate half my dinner'
  slot       text,
  kcal       int not null default 0,
  protein_g  int not null default 0,
  carb_g     int not null default 0,
  fat_g      int not null default 0,
  fibre_g    int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists intake_day_idx on intake_log (day);

-- --- the simple daily check-in --------------------------------------
create table if not exists checkins (
  day           date primary key,
  weight_kg     numeric,
  energy        text,                    -- low normal high
  hunger        text,
  body          text,                    -- good normal sore
  session_feel  text,                    -- poor normal excellent
  bowel         text,                    -- none normal loose hard
  digestion     text,                    -- fine bloated cramping
  sleep_note    text,                    -- subjective
  sleep_h       numeric,                 -- objective, when available
  training_done text,                    -- all most some none
  note          text,
  created_at    timestamptz not null default now()
);

-- --- gut training record ---------------------------------------------
create table if not exists fuel_tolerance (
  id          serial primary key,
  day         date not null,
  session_ref text,
  duration_min int,
  carbs_per_h int not null,
  gi_ok       boolean not null default true,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists fuel_tol_day_idx on fuel_tolerance (day desc);

-- --- shopping and prep ------------------------------------------------
create table if not exists shopping_lists (
  week_start  date primary key,
  items       jsonb not null default '[]'::jsonb,
  total_gbp   numeric not null default 0,
  actual_gbp  numeric,
  waste_note  text,
  generated_at timestamptz not null default now()
);

create table if not exists prep_plans (
  week_start  date primary key,
  batches     jsonb not null default '[]'::jsonb,
  generated_at timestamptz not null default now()
);

-- --- the audit trail --------------------------------------------------
create table if not exists nutrition_changes (
  id         serial primary key,
  day        date not null,
  what       text not null,
  why        text not null,
  delta_kcal int,
  automatic  boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists nut_changes_day_idx on nutrition_changes (day desc);

-- Recommendations the engine holds, with the evidence behind them, so a
-- future review can see what was believed and why before changing it.
create table if not exists evidence_log (
  key         text primary key,
  statement   text not null,
  basis       text not null,
  strength    text not null default 'consensus',   -- consensus | systematic | trial | weak
  reviewed_on date not null default current_date,
  superseded  text
);

-- --- when things happen, so meals can be placed around training ----
alter table settings add column if not exists wake_time text not null default '06:00';
alter table settings add column if not exists bed_time  text not null default '22:30';
alter table settings add column if not exists am_time   text not null default '06:30';
alter table settings add column if not exists pm_time   text not null default '17:30';
alter table settings add column if not exists eve_time  text not null default '19:00';

-- --- catalogue seed ------------------------------------------------
-- Inserted once. 'do nothing' on conflict, so a price you have corrected
-- in the app is never overwritten by a later run of this file.
insert into foods (key, name, aldi_product, category, roles, pack_g, pack_price,
                   kcal_100, protein_100, carb_100, fat_100, fibre_100, sodium_100,
                   perishable, freezable, verified, price_checked)
values
  ('chicken_frozen', 'Chicken breast (frozen)', 'Everyday Essentials Chicken Breast Fillets 1 kg', 'protein', 'protein-lean', 1000, 4.25, 106, 24, 0, 1.2, 0, 60, false, true, true, '2026-09-12'),
  ('chicken_fresh', 'Chicken breast (fresh)', 'Ashfields British Chicken Breast Fillets 1 kg', 'protein', 'protein-lean', 1000, 6.49, 106, 24, 0, 1.2, 0, 60, true, true, true, '2026-09-12'),
  ('chicken_thigh', 'Chicken thighs, boneless', 'Ashfields Chicken Thigh Fillets 1 kg', 'protein', 'protein-lean', 1000, 4.99, 150, 19, 0, 8, 0, 75, true, true, false, '2026-09-12'),
  ('mince_5', 'Lean beef mince, 5%', 'Ashfields 5% Fat Lean Beef Mince 500 g', 'protein', 'protein-red,iron', 500, 3.49, 129, 21, 0, 5, 0, 70, true, true, true, '2026-09-12'),
  ('mince_20', 'Beef mince, 20%', 'Ashfields British Beef Mince 20% Fat 500 g', 'protein', 'protein-red,iron', 500, 2.49, 254, 18, 0, 20, 0, 70, true, true, true, '2026-09-12'),
  ('pork_mince', 'Pork mince', 'Ashfields British Pork Mince 500 g', 'protein', 'protein-red', 500, 2.29, 200, 19, 0, 14, 0, 65, true, true, false, '2026-09-12'),
  ('gammon', 'Gammon joint', 'Everyday Essentials Unsmoked Gammon Joint ~1 kg', 'protein', 'protein-lean', 1000, 4.09, 140, 22, 0, 6, 0, 1100, true, true, true, '2026-09-12'),
  ('eggs', 'Eggs, medium free range', 'Merevale British Free Range Medium Eggs, 6', 'protein', 'protein-lean,fat-whole', 318, 1.45, 143, 12.6, 0.7, 9.9, 0, 124, true, false, true, '2026-09-12'),
  ('tuna', 'Tuna chunks in brine', 'Tuna Chunks In Brine 145 g', 'protein', 'protein-fish', 145, 0.59, 99, 23, 0, 0.6, 0, 320, false, false, true, '2026-09-12'),
  ('salmon_frozen', 'Salmon fillets (frozen)', 'Frozen Salmon Fillets 500 g', 'protein', 'protein-fish,fat-whole', 500, 4.49, 200, 20, 0, 13, 0, 60, false, true, false, '2026-09-12'),
  ('mackerel', 'Tinned mackerel in tomato', 'Tinned Mackerel Fillets 125 g', 'protein', 'protein-fish,fat-whole', 125, 0.85, 195, 16, 2, 13, 0, 380, false, false, false, '2026-09-12'),
  ('bacon', 'Back bacon', 'Everyday Essentials Unsmoked Back Bacon 300 g', 'protein', 'protein-red,flavour', 300, 1.45, 215, 22, 0.5, 14, 0, 1500, true, true, true, '2026-09-12'),
  ('fish_fingers', 'Fish fingers', 'Everyday Essentials Fish Fingers 250 g', 'protein', 'protein-fish,carb-fast', 250, 0.8, 200, 12, 18, 9, 1, 450, false, true, true, '2026-09-12'),
  ('lentils', 'Red lentils, dried', 'Everyday Essentials Red Lentils 500 g', 'protein', 'protein-plant,fibre,iron', 500, 0.99, 345, 24, 56, 1.5, 11, 6, false, false, false, '2026-09-12'),
  ('chickpeas', 'Chickpeas, tinned', 'Four Seasons Chickpeas In Water 400 g', 'protein', 'protein-plant,fibre', 240, 0.49, 120, 7, 17, 2, 6, 240, false, false, true, '2026-09-12'),
  ('baked_beans', 'Baked beans', 'Everyday Essentials Baked Beans 420 g', 'protein', 'protein-plant,fibre,carb-staple', 420, 0.28, 78, 4.7, 12.5, 0.2, 3.7, 240, false, false, true, '2026-09-12'),
  ('kidney_beans', 'Red kidney beans', 'Everyday Essentials Red Kidney Beans 400 g', 'protein', 'protein-plant,fibre,iron', 240, 0.33, 100, 7, 14, 0.5, 6, 220, false, false, true, '2026-09-12'),
  ('milk_whole', 'Whole milk', 'Cowbelle British Whole Milk, 4 pints (2.27 L)', 'dairy', 'protein-dairy,calcium,carb-fast', 2270, 1.45, 64, 3.4, 4.7, 3.6, 0, 44, true, true, true, '2026-09-12'),
  ('milk_semi', 'Semi-skimmed milk', 'Cowbelle British Semi-Skimmed Milk, 6 pints (3.41 L)', 'dairy', 'protein-dairy,calcium,carb-fast', 3410, 2.15, 50, 3.6, 4.8, 1.8, 0, 44, true, true, true, '2026-09-12'),
  ('yoghurt_natural', 'Natural yoghurt, fat free', 'Brooklea Fat Free Natural Yogurt 500 g', 'dairy', 'protein-dairy,calcium', 500, 0.35, 57, 5.6, 7.5, 0.1, 0, 70, true, false, true, '2026-09-12'),
  ('yoghurt_greek', 'Greek-style natural yoghurt', 'Brooklea Greek Style Natural Yogurt 1 kg', 'dairy', 'protein-dairy,calcium', 1000, 1.85, 95, 4.5, 5, 6, 0, 50, true, false, false, '2026-09-12'),
  ('skyr', 'High-protein yoghurt', 'Brooklea Protein Yogurt 450 g', 'dairy', 'protein-dairy,calcium', 450, 1.45, 63, 10, 5, 0.2, 0, 60, true, false, false, '2026-09-12'),
  ('cheddar_grated', 'Grated cheddar', 'Everyday Essentials Grated Cheddar 500 g', 'dairy', 'protein-dairy,calcium,fat-whole,flavour', 500, 2.99, 400, 25, 0.1, 33, 0, 650, true, true, true, '2026-09-12'),
  ('cottage_cheese', 'Cottage cheese', 'Brooklea Cottage Cheese 300 g', 'dairy', 'protein-dairy,calcium', 300, 0.95, 98, 12, 3.5, 4, 0, 350, true, false, false, '2026-09-12'),
  ('butter', 'Butter', 'Cowbelle British Salted Butter 250 g', 'fat', 'fat-added,flavour', 250, 1.69, 744, 0.6, 0.6, 82, 0, 700, true, true, true, '2026-09-12'),
  ('oats', 'Porridge oats', 'Everyday Essentials Porridge Oats 1 kg', 'carb', 'carb-breakfast,carb-staple,fibre', 1000, 0.9, 366, 11, 60, 8, 9, 5, false, false, true, '2026-09-12'),
  ('rice_white', 'Long grain white rice', 'Worldwide Long Grain White Rice 1 kg', 'carb', 'carb-staple', 1000, 0.52, 355, 7, 78, 1, 1.4, 3, false, true, true, '2026-09-12'),
  ('rice_basmati', 'Basmati rice', 'Worldwide Foods Classic Basmati Rice 1 kg', 'carb', 'carb-staple', 1000, 1.85, 350, 8, 77, 1, 1.5, 3, false, true, true, '2026-09-12'),
  ('pasta', 'Penne pasta', 'Everyday Essentials Penne Pasta 500 g', 'carb', 'carb-staple', 500, 0.41, 352, 12, 71, 1.5, 3, 5, false, false, true, '2026-09-12'),
  ('spaghetti', 'Spaghetti', 'Everyday Essentials Spaghetti 500 g', 'carb', 'carb-staple', 500, 0.28, 352, 12, 71, 1.5, 3, 5, false, false, true, '2026-09-12'),
  ('bread_white', 'White sliced bread', 'Village Bakery Medium Sliced White Bread 800 g', 'carb', 'carb-bread,carb-fast', 800, 0.75, 235, 8, 45, 1.5, 2.5, 450, true, true, true, '2026-09-12'),
  ('bread_wholemeal', 'Wholemeal sliced bread', 'Village Bakery Wholemeal Bread 800 g', 'carb', 'carb-bread,fibre', 800, 0.85, 225, 9.5, 38, 2.5, 6.5, 440, true, true, false, '2026-09-12'),
  ('bagels', 'Bagels', 'Village Bakery Plain Bagels, 5', 'carb', 'carb-bread,carb-fast', 425, 0.99, 265, 9, 51, 1.5, 2.5, 480, true, true, false, '2026-09-12'),
  ('wraps', 'Tortilla wraps', 'Village Bakery Tortilla Wraps, 8', 'carb', 'carb-bread', 448, 0.89, 300, 8, 50, 7, 3, 600, true, true, false, '2026-09-12'),
  ('potatoes', 'White potatoes', 'Nature''s Pick White Potatoes 2.5 kg', 'carb', 'carb-staple,veg', 2500, 1.99, 77, 2, 17, 0.1, 2.2, 6, true, false, false, '2026-09-12'),
  ('sweet_potato', 'Sweet potatoes', 'Nature''s Pick Sweet Potatoes 1 kg', 'carb', 'carb-staple,veg,fibre', 1000, 1.35, 86, 1.6, 20, 0.1, 3, 55, true, false, false, '2026-09-12'),
  ('chips_frozen', 'Oven chips', 'Four Seasons Straight Cut Chips 1.5 kg', 'carb', 'carb-staple', 1500, 1.65, 162, 2.5, 26, 5, 2.5, 30, false, true, true, '2026-09-12'),
  ('couscous', 'Couscous', 'Worldwide Foods Couscous 500 g', 'carb', 'carb-staple', 500, 0.85, 355, 12, 72, 1.5, 5, 10, false, false, false, '2026-09-12'),
  ('cornflakes', 'Cornflakes', 'Harvest Morn Cornflakes 500 g', 'carb', 'carb-breakfast,carb-fast', 500, 0.75, 378, 7, 84, 0.9, 3, 450, false, false, true, '2026-09-12'),
  ('flour_sr', 'Self-raising flour', 'Everyday Essentials Self-Raising Flour 1.5 kg', 'carb', 'carb-staple,store', 1500, 0.79, 345, 10, 71, 1.2, 3, 400, false, false, true, '2026-09-12'),
  ('peanut_butter', 'Peanut butter', 'Grandessa Smooth Peanut Butter 340 g', 'fat', 'fat-whole,protein-plant', 340, 1.09, 600, 25, 12, 50, 6, 350, false, false, true, '2026-09-12'),
  ('oil_veg', 'Vegetable oil', 'Solesta Vegetable Oil 1 L', 'fat', 'fat-added', 1000, 1.85, 828, 0, 0, 92, 0, 0, false, false, true, '2026-09-12'),
  ('oil_olive', 'Olive oil', 'Solesta Olive Oil 1 L', 'fat', 'fat-added', 1000, 4.99, 824, 0, 0, 91.6, 0, 0, false, false, false, '2026-09-12'),
  ('peas_frozen', 'Frozen peas', 'Four Seasons Garden Peas 1 kg', 'veg', 'veg,fibre', 1000, 1.19, 77, 5.4, 9.5, 0.9, 5.5, 3, false, true, false, '2026-09-12'),
  ('mixed_veg_frozen', 'Frozen mixed vegetables', 'Four Seasons Mixed Vegetables 1 kg', 'veg', 'veg,fibre', 1000, 1.29, 48, 2.8, 6.5, 0.5, 3.5, 25, false, true, false, '2026-09-12'),
  ('broccoli_frozen', 'Frozen broccoli', 'Four Seasons Broccoli Florets 900 g', 'veg', 'veg,fibre', 900, 1.49, 30, 3, 2, 0.4, 3, 12, false, true, false, '2026-09-12'),
  ('sweetcorn_frozen', 'Frozen sweetcorn', 'Four Seasons Sweetcorn 1 kg', 'veg', 'veg', 1000, 1.29, 90, 3, 17, 1.2, 2.5, 5, false, true, false, '2026-09-12'),
  ('carrots', 'Carrots', 'Nature''s Pick Carrots 1 kg', 'veg', 'veg,fibre', 1000, 0.65, 35, 0.7, 6, 0.3, 2.8, 40, true, false, true, '2026-09-12'),
  ('onions', 'Brown onions', 'Nature''s Pick Brown Onions 1 kg', 'veg', 'veg,flavour', 1000, 0.99, 38, 1.2, 7.3, 0.2, 1.4, 3, true, false, true, '2026-09-12'),
  ('mushrooms', 'Closed cup mushrooms', 'Nature''s Pick Closed Cup Mushrooms 400 g', 'veg', 'veg', 400, 1.19, 22, 3.1, 0.4, 0.5, 1.1, 5, true, false, true, '2026-09-12'),
  ('peppers', 'Mixed peppers', 'Nature''s Pick Mixed Peppers, 3', 'veg', 'veg', 480, 1.6, 30, 1, 5, 0.3, 1.6, 4, true, true, true, '2026-09-12'),
  ('tomatoes_tinned', 'Chopped tomatoes', 'Everyday Essentials Chopped Tomatoes 400 g', 'veg', 'veg,flavour', 400, 0.35, 22, 1.2, 3.5, 0.2, 1, 10, false, false, true, '2026-09-12'),
  ('passata', 'Passata', 'Cucina Passata 500 g', 'veg', 'veg,flavour', 500, 0.39, 32, 1.4, 5.5, 0.2, 1.2, 15, false, false, false, '2026-09-12'),
  ('spinach', 'Spinach', 'Nature''s Pick Spinach 260 g', 'veg', 'veg,iron', 260, 0.95, 25, 3, 1.6, 0.4, 2.1, 65, true, true, false, '2026-09-12'),
  ('green_beans', 'Green beans', 'Nature''s Pick Green Beans 220 g', 'veg', 'veg,fibre', 220, 0.89, 31, 1.8, 3.5, 0.2, 2.7, 6, true, true, true, '2026-09-12'),
  ('bananas', 'Bananas', 'Nature''s Pick Bananas, 5', 'fruit', 'fruit,carb-fast,fuel-sport', 600, 0.78, 89, 1.1, 21, 0.3, 2.6, 1, true, false, true, '2026-09-12'),
  ('apples', 'Apples', 'Nature''s Pick Apples, 6', 'fruit', 'fruit,fibre', 780, 1.15, 52, 0.3, 12, 0.2, 2.4, 1, true, false, false, '2026-09-12'),
  ('oranges', 'Oranges', 'Nature''s Pick Oranges, 4', 'fruit', 'fruit', 600, 1.09, 47, 0.9, 9, 0.1, 2.4, 0, true, false, false, '2026-09-12'),
  ('berries_frozen', 'Frozen berries', 'Four Seasons Four Berry Medley 1 kg', 'fruit', 'fruit,fibre', 1000, 2.99, 45, 0.8, 8, 0.3, 3.5, 2, false, true, true, '2026-09-12'),
  ('sultanas', 'Sultanas', 'Everyday Essentials Sultanas 500 g', 'fruit', 'fruit,carb-fast,fuel-sport,iron', 500, 1.29, 300, 2.7, 69, 0.4, 4, 10, false, false, false, '2026-09-12'),
  ('sugar', 'Granulated sugar', 'Everyday Essentials Granulated Sugar 1 kg', 'fuel', 'fuel-sport,carb-fast', 1000, 1.09, 400, 0, 100, 0, 0, 0, false, false, true, '2026-09-12'),
  ('honey', 'Clear honey', 'Everyday Essentials Clear Honey 340 g', 'fuel', 'fuel-sport,carb-fast,flavour', 340, 0.75, 320, 0.3, 79, 0, 0, 4, false, false, true, '2026-09-12'),
  ('jam', 'Strawberry jam', 'Bramwells Strawberry Jam 454 g', 'fuel', 'carb-fast,flavour', 454, 0.79, 260, 0.4, 64, 0.1, 0.8, 10, false, false, false, '2026-09-12'),
  ('malt_loaf', 'Malt loaf', 'Village Bakery Malt Loaf 260 g', 'fuel', 'fuel-sport,carb-fast', 260, 0.99, 300, 6, 62, 2, 3, 260, true, true, false, '2026-09-12'),
  ('flapjack', 'Oat bars / flapjacks', 'Harvest Morn Oat Bars, 6', 'fuel', 'fuel-sport,carb-fast', 240, 0.89, 430, 5, 62, 17, 4, 130, false, false, false, '2026-09-12'),
  ('squash', 'Orange squash', 'Vive Orange Squash 1.5 L', 'fuel', 'flavour,store', 1500, 0.69, 10, 0, 2, 0, 0, 20, false, false, false, '2026-09-12'),
  ('rice_pudding', 'Tinned rice pudding', 'Bramwells Creamed Rice Pudding 400 g', 'fuel', 'carb-fast,protein-dairy', 400, 0.45, 90, 3, 15, 2, 0.2, 60, false, false, false, '2026-09-12'),
  ('salt', 'Table salt', 'Bramwells Table Salt 750 g', 'store', 'store', 750, 0.35, 0, 0, 0, 0, 0, 38000, false, false, false, '2026-09-12'),
  ('stock_cubes', 'Stock cubes', 'Quixo Chicken Stock Cubes, 10', 'store', 'flavour,store', 100, 0.35, 250, 10, 20, 15, 0, 18000, false, false, false, '2026-09-12'),
  ('herbs', 'Mixed herbs & spices', 'Stonemill Mixed Herbs', 'store', 'flavour,store', 30, 0.59, 250, 10, 40, 5, 20, 50, false, false, false, '2026-09-12'),
  ('garlic', 'Garlic', 'Nature''s Pick Garlic, 3', 'store', 'flavour,store', 150, 0.69, 149, 6, 30, 0.5, 2, 17, true, false, false, '2026-09-12'),
  ('soy_sauce', 'Soy sauce', 'Asia Specialities Soy Sauce 150 ml', 'store', 'flavour,store', 150, 0.69, 60, 8, 5, 0, 0, 5500, false, false, false, '2026-09-12')
on conflict (key) do nothing;

