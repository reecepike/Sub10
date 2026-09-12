# Sub-10 — adaptive coaching for IRONMAN Leeds 2027

A training site for one athlete. He signs in, checks in each morning, and the
site tells him what to do **today** — adjusted for how he actually is, not for
what a calendar decided in September. Everything he logs feeds back into the
plan and into the projection.

Next.js 16 · Postgres · no framework beyond that. Four dependencies total.

---

## Deploy it in about ten minutes

### 1. Get a database

[Neon](https://neon.tech) is free and takes two minutes.

1. Sign in to the Neon Console and **create a project** (any name; pick the
   region closest to you — London if it is offered).
2. On the Project Dashboard, click **Connect**.
3. Leave **Connection pooling on** — that is the right choice here.
4. Copy the connection string. It looks like:

```
postgresql://user:password@ep-something-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```

Paste it in exactly as Neon gives it to you, extra parameters and all — the app
parses out the ones the Postgres driver cannot handle. Treat it as a password:
it contains one.

Vercel Postgres and Supabase connection strings work identically.

### 2. Put the code on GitHub

```bash
git init
git add -A
git commit -m "Sub-10"
git remote add origin git@github.com:YOU/sub10.git
git push -u origin main
```

### 3. Import it into Vercel

New Project → import the repo → add two environment variables:

| Name | Value |
|---|---|
| `DATABASE_URL` | the Postgres connection string from step 1 |
| `SESSION_SECRET` | any long random string — `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |

**Tick all three environments** — Production, Preview *and* Development — when
you add each one. Variables scoped to Production only will work on the main
deploy and fail on every preview branch, which is a confusing way to spend an
evening.

Deploy. Vercel detects Next.js on its own; there is nothing else to configure.

### 4. Create the tables and the login

Locally, once:

```bash
cp .env.example .env.local        # paste the same two values in
npm install
node --env-file=.env.local scripts/init-db.mjs
node --env-file=.env.local scripts/create-user.mjs isaac@example.com a-good-password
```

Both scripts talk to the same database Vercel uses, so this only needs doing
once, from anywhere.

### 5. Open the site and go to Settings

Set the start date, the race date and his bodyweight. Leave FTP, CSS and 5 km
blank until he has actually tested them — the plan gives descriptive targets
until then, which is more honest than zones built on a guess.

---

## Running it locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

---

## How it works

### The daily loop

1. **Morning check-in** — sleep, resting HR, HRV, weight, and four gut scores
   out of five. Sixty seconds.
2. **The engine scores it** against his own 14-day rolling baseline, not against
   absolutes, and weights trend above any single day.
3. **Today's sessions are adjusted** — trimmed, swapped for aerobic work, or
   cancelled — and every change says *why*.
4. **He logs what he did**, including RPE.
5. **The weekly review** reads it all back and generates the coaching update.

### What the engine actually enforces

- **Readiness bands.** Green trains as planned. Amber trims volume ~20% and caps
  intensity. A second amber swaps the quality session for aerobic work. Three
  ambers running are treated as red, because a slow drift is more dangerous than
  one bad number. Two reds trigger an unplanned recovery week.
- **Hard overrides** that ignore the score entirely: illness, pain that changes
  how he moves, under five hours of sleep before a key session, resting HR more
  than 7 bpm above baseline for two mornings.
- **Structural rules**, checked across all 45 weeks: the two key intensity
  sessions never sit on consecutive days; Monday never carries intensity; no
  single run exceeds 45% of weekly run minutes; swim ≥2, bike ≥3, run ≥3 and
  strength ≥1 sessions a week; weekly volume never jumps more than ~8–10%.
- **Loading**: three weeks progressive, one at about 62%. Christmas is week 15
  and is scheduled as a deload for that reason.

### The projection

Every number on the Progress page comes from one model:

- **Bike** — solved from a physical power model at his weight, CdA 0.30 with
  aero bars or 0.33 without, a 10% penalty for the Leeds profile, VI 1.06.
  Sustainable intensity rises with FTP (0.578 → 0.72), because an untrained
  cyclist cannot hold race intensity for five and a half hours, and a model that
  assumes otherwise flatters a beginner by nearly an hour.
- **Swim** — 38 × (CSS + 4 s/100 m), net of the wetsuit.
- **Run** — Riegel off 5 km, with an Ironman penalty that grows with how long
  the bike took.
- **Limiter** — minutes to be found × elasticity (bike 1.4, swim 1.1, run 0.8,
  transitions 0.3). Absolute minutes, not proportional gap: a proportional
  measure ranks the swim first because 26 minutes is a large share of a
  65-minute leg, but 26 minutes is 26 minutes wherever it sits.

Two anchors keep it honest: the September 2026 baseline projects **12:52:57**,
and the target configuration lands on **9:55:18**. Required FTP comes out at
**300 W — 4.4 W/kg**, which is the single number this whole project turns on.

---

## What it does not do

- **It does not diagnose.** Systemic illness, persistent pain, anything sharp or
  localised in bone — it stops training and says see someone qualified. That is
  the whole of its medical logic and it should stay that way.
- **It does not sync with Strava or Garmin.** Everything is typed in. Adding
  Strava later means registering an API application and an OAuth round trip;
  the session table already has somewhere to put the data.
- **It does not have multiple users.** One login, one athlete, one plan. Adding
  a coach view means a `user_id` column on the data tables and a role check.

---

## If something goes wrong

**Build succeeds, pages error with "DATABASE_URL is not set".**
The variables are missing or scoped to the wrong environment. Add them under
Project → Settings → Environment Variables with all three environments ticked,
then redeploy. The build itself never needs the database — it connects lazily,
on the first query — so a missing variable shows up at runtime, not at build.

**"Settings row missing".**
The tables have not been created yet. Run `scripts/init-db.mjs` against the same
database (step 4).

**Login rejects a password you are sure about.**
`create-user.mjs` is an upsert — run it again with the same email and a new
password and it resets rather than erroring.

**Sessions appear on the wrong day.**
Check the start date in Settings is a Monday. The whole 45-week calendar counts
forward from it.

---

## Layout

```
app/
  page.tsx            Today — the check-in and the adjusted plan
  week/               The current week, with computed hours and splits
  log/                Session logging, per discipline
  progress/           Sub-10 tracker, limiter, test history
  review/             Weekly coaching update and adaptation history
  reference/          Course, zones, blocks, gates, fuelling, when to stop
  settings/           Athlete, tested numbers, kit, commitments
  actions.ts          Every mutation, as server actions
lib/
  plan.ts             The 45-week generator — templates, scaling, gates
  readiness.ts        Rolling-baseline scoring and the band rules
  adapt.ts            How readiness changes today's prescription
  project.ts          The physical model behind every projected split
  coach.ts            The weekly coaching update
  auth.ts             scrypt passwords, signed session cookie
  db.ts / schema.sql  Postgres
scripts/              One-time setup
```

The race date is a **planning anchor, not a fact** — the 2027 edition has not
been announced. It is set to the earliest plausible date so that a later race
adds buffer rather than removing it. Change it in Settings the moment it is
confirmed and the whole calendar re-anchors.

---

## Updating an already-deployed site (the nutrition engine)

If the site is already live, this version adds the nutrition and fuelling
engine and corrects the pool length. Two steps, both in the browser:

1. **Run the migration.** Neon Console → your project → **SQL Editor**. Paste
   the whole of `nutrition-migration.sql` and press **Run**. It is safe on a
   database that already has your training data — every statement is written to
   do nothing the second time it runs.
2. **Push the code.** Upload the files in this zip to your GitHub repo,
   replacing what is there, and commit. Vercel rebuilds on its own. Do not use
   Vercel's **Redeploy** button: it rebuilds the same commit, not your latest
   one. The sign-in page prints a build number so you can see which version is
   actually live.

Nothing about the training side changes, and no existing data is touched.

---

## The pool

Pool length is now an explicit setting rather than an assumption, and it is set
to **25 m**. Every swim prescription is shown in metres and in lengths for that
pool — `8×50 m (2 lengths)` — except open-water sessions, which have no walls
to count. Change it in Settings and every swim set re-renders.

---

## How the nutrition engine works

It is not a separate meal planner bolted on. It reads the same training plan
and the same session log the training side already owns, so a change made on
the Log page shows up in the food plan on the next request, and there is no
second copy of anything to keep in step.

### The order it does things in

```
training plan  →  what was actually logged  →  energy  →  carbohydrate
   →  protein / fat / fibre / fluid / sodium  →  meal timing  →  meals
   →  training fuel  →  shopping list  →  Aldi cost  →  meal prep
```

### The rule that keeps it honest

```
total = resting metabolism × 1.40  +  net cost of the sessions
```

The multiplier covers living and nothing else. Training is added separately and
explicitly, and it is counted **net** of resting metabolism for those minutes,
because the multiplier has already paid for them. Adding gross session calories
on top of an "athlete" multiplier is the commonest way a system like this
over-feeds by six hundred calories a day, and it fails silently.

`lib/nutrition/resolve.ts` is the guard. A logged session **replaces** the
planned one it corresponds to — by plan key, or by discipline when you logged it
from the Log page instead of the Today page. It never adds to it. Log the same
session twice and the app says so rather than quietly counting it twice.

### What moves on its own

| Input | Effect |
|---|---|
| Skipping, shortening, extending or adding a session | Calories and carbohydrate move with it, immediately |
| Badminton | Counted as training, at a duty cycle — three hours booked is about two and a quarter of actual play |
| Seven-day weight average, checked against a three-week slope | The standing calorie adjustment, capped at ±250 a week and ±700 in total |
| Two long sessions fuelled cleanly | Carbohydrate-per-hour target steps up a rung |
| One session with gut trouble | Steps down a rung and holds for a fortnight |
| "I don't like Greek yoghurt" | Works out what it was doing nutritionally and finds the cheapest thing that does the same job — and that also makes sense on the plate |
| An allergy | Removed from every meal and every list immediately, and never suggested as a replacement |

### The floor it will not cross

Energy availability — what is left after training takes its share — never goes
below 30 kcal per kilogram of fat-free mass. If a day's arithmetic would fall
under it, calories go **up** and the app says why. Under-fuelling is the failure
mode that ends Ironman builds, and it does it slowly enough that people blame
something else.

### Prices

Aldi UK, per pack. The ones marked **confirmed** were taken from Aldi listings
in September 2026; the rest are estimates in the right region and are marked as
such. Correct any of them on the **Prices** page and every shopping total,
cost-per-protein figure and cheaper-alternative suggestion updates with it.
Macros are not editable, deliberately — a chicken breast is 24 g of protein per
100 g this year and next year; the price is what moves.

### Food safety

Cooked leftovers get two days in the fridge and cooked rice gets one, per UK
Food Standards Agency guidance. Anything for later in the week is frozen on the
day it is cooked, and the Prep page tells you which evening to move each portion
down to the fridge.

### Where things live

| What | File |
|---|---|
| One session → calories, with a confidence flag | `lib/nutrition/energy.ts` |
| Planned vs actual, and the double-count guard | `lib/nutrition/resolve.ts` |
| Calories, carbs, protein, fat, fibre, fluid, sodium | `lib/nutrition/targets.ts` |
| Before / during / after, and the gut-training ladder | `lib/nutrition/fuel.ts` |
| The Aldi catalogue | `lib/nutrition/foods.ts` |
| Meal templates and the portion solver | `lib/nutrition/meals.ts` |
| Assembling a day around the training | `lib/nutrition/dayplan.ts` |
| Packs, cost, waste, cheaper equivalents | `lib/nutrition/shopping.ts` |
| Sunday and Wednesday batches, and the safety rules | `lib/nutrition/prep.ts` |
| Dislikes, allergies, substitution | `lib/nutrition/prefs.ts` |
| The weekly calorie adjustment | `lib/nutrition/adjust.ts` |
| What the engine believes, and why | `lib/nutrition/evidence.ts` |
| Pool length, and swim sets in lengths | `lib/pool.ts` |

The **More** page carries the evidence table: every rule the engine applies,
the basis behind it, and the date it was last looked at. The bar for changing
one is a systematic review or a consensus statement, not a single striking
trial — and when a line does change, the old one stays visible with what
replaced it.

