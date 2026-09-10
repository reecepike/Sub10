# Sub-10 — adaptive coaching for IRONMAN Leeds 2027

A training site for one athlete. He signs in, checks in each morning, and the
site tells him what to do **today** — adjusted for how he actually is, not for
what a calendar decided in September. Everything he logs feeds back into the
plan and into the projection.

Next.js 15 · Postgres · no framework beyond that. Four dependencies total.

---

## Deploy it in about ten minutes

### 1. Get a database

Any Postgres will do. [Neon](https://neon.tech) is free and takes two minutes —
create a project and copy the connection string. Vercel Postgres and Supabase
work identically.

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

Deploy. Vercel detects Next.js on its own; there is nothing to configure.

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
