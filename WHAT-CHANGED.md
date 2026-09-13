# What changed, and why

Read this first. The short version is at the top; the detail is underneath.

---

## Before anything else: the 6,500 kcal Friday

I ran every day of the programme through the calorie engine before touching a line of
code, because your brief asked for a calculation audit before a fix, and that was right.

**The bug does not exist in the code I shipped you.** Across fifteen sampled weeks:

| | |
|---|---|
| Baseline before any training | **2,584 kcal** |
| A typical Friday | **3,410 – 4,200 kcal** |
| The single biggest day in 45 weeks | **5,470 kcal** — a 325-minute ride plus a 50-minute brick run |
| Days above 5,200 kcal, out of ~315 | **2**, and both are that same Saturday |

Fridays are the highest *ordinary* day because the plan schedules 180 minutes of
badminton on them in blocks 0–3. That is real training, it is counted once, and it is
already discounted to a 0.75 duty cycle.

So if you saw 6,500 kcal on screen, the most likely causes are:

1. **The deployed site is running older code** — the previous Vercel build, or the
   database migration was never run.
2. **A session has been logged twice.** The app warns about this, but the warning is
   easy to scroll past.
3. **`kcal_adjust` in Settings is carrying a large number.** Check it. If something set
   it to +4,000, every day would be 4,000 kcal high and nothing else would look wrong.

I have built the rest of the brief anyway, because all of it stands on its own merits
regardless of that number. And I have added the thing that would have settled the
question in ten seconds: an audit that refuses to display a figure it cannot justify,
and shows you the arithmetic instead.

---

## The six real changes

### 1. Energy is now allocated **weekly**, not daily

A day's calorie target was a property of that day. It is now the day's share of the
week.

The week's requirement is computed from the week's training and **conserved** — nothing
is invented and nothing is quietly dropped. What the allocator decides is only *which
day each calorie is offered on*, subject to three rules:

- **A ceiling on what one day can absorb** — 65 kcal per kg of bodyweight, about
  4,420 kcal for you. Above that, a plan stops being a plan and becomes a wish.
- **A floor no day may fall below** — the energy-availability floor, 30 kcal per kg of
  fat-free mass after training has taken its share.
- **A limit on how sharply the target may step** between adjacent days, relative to how
  sharply the training actually stepped.

In practice, on week 42 the monster Saturday goes from **5,470 → 4,720 kcal**, and
915 kcal moves to the Friday and Sunday either side. That is not a fudge — it is how
glycogen loading actually works. You fill the tank the day before and refill it the day
after; you do not eat 5,470 kcal on top of six and a quarter hours in the aero position,
because appetite is flat for hours afterwards and the gut has already done a day's work.

The Week page now shows this as a table: what each day earned, what moved, what is
offered.

**One place the two limits genuinely conflict.** On the very biggest day, meeting the
safety floor means eating more than the comfort ceiling allows. The floor wins, because
it is a health limit and the other is a convenience limit — and the app says so out loud
rather than printing a comfortable number and letting you find out the hard way.

### 2. A failsafe that refuses to print numbers it cannot justify

Every calorie target now passes four checks before it is displayed:

- **Is it possible?** Bounds in kcal per kg. Above 85 kcal/kg is not a big day, it is a bug.
- **Is it proportionate?** A 25% change in training may not produce a 150% change in food.
- **Is anything counted twice?** Duplicate session IDs, near-identical pairs, planned-vs-logged.
- **Does it reconcile?** Do the parts sum to the whole, and can the whole be stated in one sentence?

If any check fails, **the number is withheld** and you get the full arithmetic instead —
component by component, with the specific check that failed and what to do about it. The
day's meal plan is withheld too, because a meal plan built from a rejected number is just
the same fault with food on it.

I tested this by setting `kcal_adjust` to +4,200. The app printed `—` in the header and
told me exactly where the 4,200 kcal came from. That is what should have happened the
first time.

Every blocking failure is written to an `audit_log` table. One failure is a typo; the
same failure every Tuesday is a bug, and you can only tell them apart by writing them down.

### 3. Recipes, batches and portions are now three different things

- A **recipe** is the idea: chicken, rice and vegetables.
- A **batch** is what you actually cook: 310 g of raw chicken and 320 g of dry rice, in
  one pan, on Wednesday, at Mum's, yielding three portions.
- A **portion** is what comes out of a container on Thursday: 530 g of it, reheated.

Consequences:

- **You never multiply anything.** Every number on a batch is the number for that batch.
- **Raw and cooked are both stated** wherever they differ. "320 g dry → 864 g cooked".
  A plan that says "180 g chicken" without saying which is out by 40%, every time.
- **Containers are assigned on prep day**, each labelled, each told which day it is for
  and whether it goes in the fridge or the freezer *tonight*.
- **The daily plan references the portion, not the ingredients.** Thursday says
  "Portion 2 of 3 — Chicken, rice and vegetables, Wednesday batch at Mum's, 530 g,
  microwave 4 minutes". The ingredient list is there if you want it, folded away.

I also found and fixed a food-safety contradiction: the page's own rules said cooked rice
keeps 24 hours, and the generator was putting Friday's rice portion in the fridge on
Wednesday. Rice batches now get a one-day fridge window and the rest freeze on the day.

### 4. Real package sizes, and whole units

The Aldi tuna tin is 145 g gross and drains to about 102 g. It is now modelled that way,
and so are eggs, wraps, bagels, bread slices, tins of beans, tins of tomatoes, peppers,
onions, bananas.

Nothing in a plan is ever a fraction of a tin. When rounding to whole units knocks a meal
off target — and it always does, by up to a couple of hundred calories — **the flexible
carbohydrate absorbs the difference**. Carbohydrate, never protein: protein has a floor
that exists for a reason, and carbohydrate is the variable that periodises anyway.

Shopping now derives from the batches and buys whole packs, with leftovers described
honestly: a 2.5 kg bag of potatoes "keeps, so it comes off next week's list", a 500 g
pack of mince "does not keep — freeze it on the day you buy it, portioned".

### 5. Two houses

The single most consequential change, because food does not teleport.

| | |
|---|---|
| **Dad's** | Saturday 16:00 → Tuesday after work. Main cook: **Sunday** |
| **Mum's** | Tuesday after work → Saturday 16:00. Main cook: **Wednesday** |

The rule that makes the edges work: **a meal belongs to the house you woke up in, not the
one you eat in.** Tuesday's packed lunch is eaten at work but it came out of Dad's fridge
that morning, so it is Dad's. Tuesday's dinner is Mum's. Saturday is the same handover in
reverse.

So there are now **three cooks a week** (Sunday at Dad's, Wednesday at Mum's, and the
Sunday before that carries Monday and Tuesday), and **two shopping lists**. Staples appear
on both — one bag of rice in each house, not one bag carried back and forth. The handover
times are editable in Settings.

**On the budget.** The two lists come to £68–£100 at the till, but £27–£49 of that is what
the week actually eats; the rest is store-cupboard stock that lasts a month. Both numbers
are shown, and the one to compare against £60 is the second. At 4,000 kcal a day across
two kitchens, that is honest rather than wasteful.

### 6. No training before work

The coaching templates all put sessions at 06:30 on weekdays, because that is how plans
are written — they assume a day job that will wait. Yours will not.

Every weekday morning session now moves to after work. Weekends are untouched, because
Saturday and Sunday mornings are when the long work happens and that is the point of them.
There is a checkbox in Settings if that ever changes, and turning it on restores the
original scheduling exactly.

Also done: **mushrooms** are seeded as a dislike. **Tinned beans** are deliberately *not*
seeded as a dislike — "I don't want meals dominated by beans" is not "I don't eat beans",
and filing it as a dislike would strip a good cheap protein out of the catalogue. Instead
no day may take more than 40% of its protein from tinned legumes, and no day gets two
bean-led meals.

---

## Tests A–K

The brief said these must pass before the plan is presented. They do, across nine
programme weeks from the lightest to the two hardest:

```
 PASS  A  No day asks for an implausible number of calories
 PASS  B  The week conserves energy through smoothing
 PASS  C  Calorie steps are proportionate to training steps
 PASS  D  Every session is counted exactly once
 PASS  E  Every day reconciles, and can be explained in one sentence
 PASS  F  Batches state real totals and portion counts, and nothing is multiplied
 PASS  G  Raw and cooked weights are both stated wherever they differ
 PASS  H  Shopping is in whole buyable packs, and covers what the batches need
 PASS  I  Every meal resolves to the kitchen it is eaten from
 PASS  J  No weekday session is scheduled before work
 PASS  K  Dislikes are respected, and no day is dominated by tinned beans

11/11 passed.
```

Run them yourself any time with `npm run test:engine`.

---

## How to deploy this

1. **Replace the code.** Unzip over your existing project, or replace the files in your
   Git repository and push. Vercel will rebuild.

2. **Run the migration.** Open your Neon console → SQL Editor → paste the whole of
   `migration-two-house.sql` → Run. It only adds columns and tables; it changes nothing
   you already have, and running it twice does nothing the second time.

3. **Check Settings.** Two new sections: *Work, and when you can train* and *The two
   houses*. The defaults match what you told me, so you should not need to change
   anything — but look at **`kcal_adjust`** while you are there. If it is not 0 or a small
   number, that is very likely what you were seeing.

4. **Open the Week page.** It will show you the allocation table, and the shopping and prep
   pages will be regenerated against it.

---

## One thing I have to keep saying

You have pasted two live Neon database passwords into our conversation in plain text.
Anyone who can read that conversation can read and delete your database. Rotate both of
them in the Neon console — it takes about thirty seconds and you only have to update the
`DATABASE_URL` environment variable in Vercel afterwards. I have never connected to your
live database from here; all of this was tested against a throwaway local one.
