/**
 * What the engine believes.
 *
 * Every rule that decides a number is recorded here with the basis behind it and
 * the date it was last looked at. Two reasons. First, a recommendation you
 * cannot interrogate is an instruction, and a plan that runs for forty-five
 * weeks should be arguable. Second, sports nutrition moves — the carbohydrate
 * rates considered sensible during long endurance events roughly doubled over
 * fifteen years — and the way to survive that is to write down what you assumed
 * so a later review can see it.
 *
 * The bar for changing one of these is a systematic review, a consensus
 * statement, or a shift in a governing body's position. One trial is not enough,
 * however striking. When a line does change, the old one stays here with what
 * replaced it, so the change is visible rather than silent.
 */

export type Evidence = {
  key: string;
  statement: string;
  basis: string;
  strength: 'consensus' | 'systematic' | 'trial' | 'pragmatic';
  reviewed: string;
  superseded?: string;
};

export const EVIDENCE: Evidence[] = [
  {
    key: 'rmr',
    statement: 'Resting metabolism from fat-free mass when body composition is known, otherwise Mifflin–St Jeor',
    basis: 'Mifflin–St Jeor is the best-validated general equation, but it systematically under-reads lean endurance athletes because it cannot see body composition. Cunningham works from fat-free mass directly and is the better fit above roughly 15% lean advantage.',
    strength: 'consensus',
    reviewed: '2026-09-12',
  },
  {
    key: 'pal',
    statement: 'Living costs about 1.40 × resting metabolism, and training is added separately on top',
    basis: 'Physical-activity levels of 1.4–1.5 describe a day with little occupational activity. Using a higher "athlete" multiplier AND adding session calories is the commonest way these systems over-feed — the multiplier and the sessions are the same hours.',
    strength: 'consensus',
    reviewed: '2026-09-12',
  },
  {
    key: 'net-exercise',
    statement: 'Session energy is counted net of resting metabolism for those minutes',
    basis: 'The activity multiplier has already paid for the athlete existing during the session. Adding gross session cost on top double-counts roughly 70–90 kcal an hour, which over a twenty-hour week is most of a day of food.',
    strength: 'pragmatic',
    reviewed: '2026-09-12',
  },
  {
    key: 'kj-kcal',
    statement: 'On the bike, kilojoules of work ≈ kilocalories of energy cost',
    basis: 'Gross mechanical efficiency in trained cyclists sits near 22–25%, and 1 kJ of external work at ~24% efficiency costs about 1 kcal. It is the most accurate estimate available in this whole model, which is why a power meter is worth more here than any other single piece of kit.',
    strength: 'consensus',
    reviewed: '2026-09-12',
  },
  {
    key: 'run-cost',
    statement: 'Running costs about 0.9 kcal per kg per km, largely independent of pace',
    basis: 'Net energy cost of running is close to constant across pace for a given runner, which makes distance a far better input than duration or perceived effort.',
    strength: 'consensus',
    reviewed: '2026-09-12',
  },
  {
    key: 'carb-periodisation',
    statement: 'Carbohydrate 3–5 g/kg on light days rising to 8–12 g/kg on very long days',
    basis: 'The standard sports-nutrition bands, applied per day rather than as a weekly average. A single daily carbohydrate number is wrong on nearly every day of an Ironman build — it either starves the long days or over-feeds the rest days.',
    strength: 'consensus',
    reviewed: '2026-09-12',
  },
  {
    key: 'protein',
    statement: 'Protein 1.6 g/kg, rising toward 2.0 g/kg on strength days and in any deficit',
    basis: 'Meta-analyses put the plateau for muscle protein synthesis around 1.6 g/kg/day, with a case for more when energy is restricted or resistance training is involved. Above about 2.2 g/kg the extra is expensive and displaces carbohydrate, which matters more for this event.',
    strength: 'systematic',
    reviewed: '2026-09-12',
  },
  {
    key: 'fat-floor',
    statement: 'Fat never goes below 0.8 g/kg',
    basis: 'Below roughly 20% of energy from fat, fat-soluble vitamin absorption and endocrine function start to suffer. When the numbers will not fit, carbohydrate is reduced instead — and that is a signal the calorie target is too low for the training.',
    strength: 'consensus',
    reviewed: '2026-09-12',
  },
  {
    key: 'energy-availability',
    statement: 'Never below 30 kcal per kg of fat-free mass after training is paid for',
    basis: 'Low energy availability is the driver behind RED-S: bone, endocrine and immune consequences appear well before performance does, and in an 18-year-old still accruing bone mass the stakes are higher. This floor is enforced rather than advised — the engine raises calories rather than letting a day fall below it.',
    strength: 'consensus',
    reviewed: '2026-09-12',
  },
  {
    key: 'gut-training',
    statement: 'Carbohydrate tolerance during exercise is trainable, and 90 g/h needs building up to',
    basis: 'Repeated exposure increases intestinal transporter capacity and reduces gastrointestinal symptoms. Rates around 90 g/h using mixed glucose and fructose are achievable in trained guts and are not achievable in untrained ones, which is why the ladder is gated on how the last two long sessions actually went.',
    strength: 'systematic',
    reviewed: '2026-09-12',
  },
  {
    key: 'run-vs-bike',
    statement: 'The run tolerates less carbohydrate per hour than the bike',
    basis: 'Gastrointestinal symptoms during running are consistently more common and more severe than during cycling at matched intake, which is why the engine caps run fuelling at 60 g/h regardless of the bike figure.',
    strength: 'consensus',
    reviewed: '2026-09-12',
  },
  {
    key: 'recovery-window',
    statement: 'Fast recovery nutrition matters when you train again inside eight hours, and much less otherwise',
    basis: 'The "anabolic window" is far wider than it was once described. What still holds is that glycogen resynthesis is rate-limited when the next session is close — so the urgency is about the schedule, not the clock.',
    strength: 'systematic',
    reviewed: '2026-09-12',
  },
  {
    key: 'weight-trend',
    statement: 'Calories move on a seven-day average, checked against a three-week slope, never on one weigh-in',
    basis: 'Day-to-day bodyweight varies by a kilogram or more through glycogen, sodium, hydration and gut contents. Reacting to single mornings produces oscillation and teaches the athlete to distrust the system.',
    strength: 'pragmatic',
    reviewed: '2026-09-12',
  },
  {
    key: 'taper',
    statement: 'No calorie reduction during taper or race week',
    basis: 'Glycogen loading raises bodyweight by one to two kilograms and that is the intended effect. Cutting calories because the scale moved would undo the point of the taper.',
    strength: 'consensus',
    reviewed: '2026-09-12',
  },
  {
    key: 'food-safety',
    statement: 'Cooked leftovers two days refrigerated; cooked rice one day, or frozen the same evening',
    basis: 'UK Food Standards Agency guidance. Bacillus cereus spores survive cooking and produce toxin at refrigerator-door temperatures, which is why rice is the strict case and why cooling within an hour matters more than anything else in batch cooking.',
    strength: 'consensus',
    reviewed: '2026-09-12',
  },
  {
    key: 'caffeine',
    statement: 'Caffeine is effective, and is not introduced on race day',
    basis: 'Around 3 mg/kg an hour before is well supported for endurance performance. The engine does not prescribe it because the athlete does not currently use it, and a national-level race is the wrong place to find out how you respond.',
    strength: 'consensus',
    reviewed: '2026-09-12',
  },
];

export const EVIDENCE_BY_KEY = new Map(EVIDENCE.map((e) => [e.key, e]));
