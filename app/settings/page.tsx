import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { getSettings } from '@/lib/db';
import { ms } from '@/lib/project';
import { saveSettingsAction, saveNutritionSettingsAction, logoutAction } from '../actions';
import Nav from '../_components/Nav';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  if (!(await currentUser())) redirect('/login');
  const p = await searchParams;
  const s = await getSettings();

  return (
    <>
      <div className="wrap">
        <header className="mast"><h1>Settings</h1></header>
        {p.saved && <p className="ok small">Saved. Every prescription has been recalculated.</p>}

        <form action={saveSettingsAction} className="card">
          <h2>Athlete</h2>
          <p className="desc">These drive every session prescription and the whole projection.</p>

          <div className="grid2">
            <label className="f"><span className="lab">Name</span>
              <input type="text" name="athlete_name" id="athlete_name" defaultValue={s.athlete_name} /></label>
            <label className="f"><span className="lab">Bodyweight (kg)</span>
              <input type="number" step="any" name="weight_kg" id="weight_kg"
                     defaultValue={Number(s.weight_kg)} inputMode="decimal" /></label>
          </div>

          <div className="grid2">
            <label className="f"><span className="lab">Programme starts (Monday)</span>
              <input type="date" name="start_date" id="start_date" defaultValue={String(s.start_date).slice(0, 10)} /></label>
            <label className="f"><span className="lab">Race day</span>
              <input type="date" name="race_date" id="race_date" defaultValue={String(s.race_date).slice(0, 10)} /></label>
          </div>
          <p className="xs" style={{ marginTop: -4 }}>
            The 2027 IRONMAN Leeds date has not been published. 25 July is a planning anchor set
            to the earliest plausible date, so that a later race adds buffer rather than removing
            it. Change it the moment it is confirmed and the whole calendar re-anchors.
          </p>

          <hr />
          <h2>Tested numbers</h2>
          <p className="desc">
            Leave blank until tested. Descriptive targets are more honest than zones built on a guess.
          </p>

          <div className="grid2">
            <label className="f"><span className="lab">FTP (watts)</span>
              <input type="number" name="ftp" id="ftp" defaultValue={s.ftp ?? ''} inputMode="numeric" /></label>
            <label className="f"><span className="lab">CSS (mm:ss / 100 m)</span>
              <input type="text" name="css_sec" id="css_sec"
                     defaultValue={s.css_sec ? ms(s.css_sec) : ''} placeholder="1:52" /></label>
            <label className="f"><span className="lab">5 km (mm:ss)</span>
              <input type="text" name="five_k_sec" id="five_k_sec"
                     defaultValue={s.five_k_sec ? ms(s.five_k_sec) : ''} placeholder="21:40" /></label>
            <label className="f"><span className="lab">Bench 5RM (kg)</span>
              <input type="number" name="bench_5rm" id="bench_5rm" defaultValue={s.bench_5rm ?? ''} inputMode="numeric" /></label>
            <label className="f"><span className="lab">Run LTHR</span>
              <input type="number" name="lthr_run" id="lthr_run" defaultValue={s.lthr_run ?? ''} inputMode="numeric" /></label>
            <label className="f"><span className="lab">Bike LTHR</span>
              <input type="number" name="lthr_bike" id="lthr_bike" defaultValue={s.lthr_bike ?? ''} inputMode="numeric" /></label>
          </div>

          <hr />
          <h2>Kit and commitments</h2>

          <label className="f" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="checkbox" name="aero_bars" id="aero_bars" defaultChecked={s.aero_bars} style={{ width: 18, height: 18 }} />
            <span className="small">Clip-on aero bars fitted <span className="muted">· CdA 0.30 rather than 0.33</span></span>
          </label>
          <label className="f" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="checkbox" name="transitions_rehearsed" id="transitions_rehearsed"
                   defaultChecked={s.transitions_rehearsed} style={{ width: 18, height: 18 }} />
            <span className="small">Transitions rehearsed <span className="muted">· 9:00 rather than 12:00</span></span>
          </label>
          <label className="f" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="checkbox" name="badminton_fri" id="badminton_fri" defaultChecked={s.badminton_fri} style={{ width: 18, height: 18 }} />
            <span className="small">Badminton — Friday 19:00–22:00</span>
          </label>
          <label className="f" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="checkbox" name="badminton_sun" id="badminton_sun" defaultChecked={s.badminton_sun} style={{ width: 18, height: 18 }} />
            <span className="small">Badminton — Sunday 19:00–22:00</span>
          </label>
          <p className="xs" style={{ marginTop: -4 }}>
            Six hours a week of high-intensity intermittent work is a real load, not recreation.
            The plan counts it at 0.7× and drops Friday from Block 4 — but it will schedule around
            whatever you actually do.
          </p>

          <button className="wide" type="submit">Save</button>
        </form>

        <form action={logoutAction}>
          <button className="ghost wide" type="submit">Sign out</button>
        </form>

        {/* ================= nutrition & fuelling ================= */}
        <form action={saveNutritionSettingsAction} className="card">
          <h2>Body and day</h2>
          <p className="desc">
            The energy model runs off these. Height, age and body fat set resting metabolism; the rest tells the
            engine when your day actually happens, so meals land around training rather than on top of it.
          </p>

          <div className="grid3">
            <label className="f"><span className="lab">Height (cm)</span>
              <input type="number" step="any" name="height_cm" defaultValue={s.height_cm} inputMode="decimal" /></label>
            <label className="f"><span className="lab">Age</span>
              <input type="number" name="age_years" defaultValue={s.age_years} inputMode="numeric" /></label>
            <label className="f"><span className="lab">Body fat %</span>
              <input type="number" step="any" name="body_fat_pct" defaultValue={s.body_fat_pct ?? ''} inputMode="decimal" placeholder="leave blank if unknown" /></label>
          </div>
          <p className="xs" style={{ marginTop: -4 }}>
            With a body-fat figure the engine uses Cunningham, which reads lean athletes properly. Without one it falls
            back to Mifflin&ndash;St Jeor, which under-reads them by a couple of hundred calories. A rough estimate is
            better than nothing; an obsessive one is worse than useless.
          </p>

          <div className="grid2">
            <label className="f"><span className="lab">Pool length (m)</span>
              <input type="number" name="pool_length_m" defaultValue={s.pool_length_m} inputMode="numeric" /></label>
            <label className="f"><span className="lab">Weekly food budget (£)</span>
              <input type="number" step="any" name="budget_gbp" defaultValue={s.budget_gbp} inputMode="decimal" /></label>
          </div>
          <p className="xs" style={{ marginTop: -4 }}>
            Every swim set is shown in metres and in lengths for this pool. The budget is a preference, not a ceiling —
            if hitting it would mean under-fuelling, the plan goes over and says so.
          </p>

          <hr />
          <h2>When the day happens</h2>
          <div className="grid2">
            <label className="f"><span className="lab">Wake</span>
              <input type="time" name="wake_time" defaultValue={s.wake_time} /></label>
            <label className="f"><span className="lab">Lights out</span>
              <input type="time" name="bed_time" defaultValue={s.bed_time} /></label>
          </div>
          <div className="grid3">
            <label className="f"><span className="lab">Morning session</span>
              <input type="time" name="am_time" defaultValue={s.am_time} /></label>
            <label className="f"><span className="lab">Afternoon session</span>
              <input type="time" name="pm_time" defaultValue={s.pm_time} /></label>
            <label className="f"><span className="lab">Evening session</span>
              <input type="time" name="eve_time" defaultValue={s.eve_time} /></label>
          </div>

          <hr />
          <h2>Work, and when you can train</h2>
          <p className="xs" style={{ marginTop: -4 }}>
            The coaching templates were all written with morning sessions on weekdays, because that is how plans are
            always written — they assume a day job that will wait. Yours will not. With this off, every weekday
            morning session is moved to after work, and the plan stops inventing sessions you were never going to do.
          </p>
          <label className="f" style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8 }}>
            <input type="checkbox" name="allow_pre_work" id="allow_pre_work" defaultChecked={s.allow_pre_work}
              style={{ width: 18, height: 18 }} />
            <span className="small">I can train before work on a weekday</span>
          </label>
          <div className="grid3">
            <label className="f"><span className="lab">Workdays (1 = Mon)</span>
              <input type="text" name="work_days" defaultValue={s.work_days} /></label>
            <label className="f"><span className="lab">Work starts</span>
              <input type="time" name="work_start" defaultValue={s.work_start} /></label>
            <label className="f"><span className="lab">Work ends</span>
              <input type="time" name="work_end" defaultValue={s.work_end} /></label>
          </div>

          <hr />
          <h2>The two houses</h2>
          <p className="xs" style={{ marginTop: -4 }}>
            Food does not move between them, so the shopping, the cooking and every portion in the fridge are worked
            out per house. Change a handover time here and the batches, the containers and both shopping lists
            re-cut themselves around it.
          </p>
          <div className="grid2">
            <label className="f"><span className="lab">First house is called</span>
              <input type="text" name="dad_label" defaultValue={s.dad_label} /></label>
            <label className="f"><span className="lab">Second house is called</span>
              <input type="text" name="mum_label" defaultValue={s.mum_label} /></label>
          </div>
          <div className="grid2">
            <label className="f"><span className="lab">Saturday handover to {s.dad_label}</span>
              <input type="time" name="sat_handover" defaultValue={s.sat_handover} /></label>
            <label className="f"><span className="lab">Tuesday handover to {s.mum_label}</span>
              <input type="time" name="tue_handover" defaultValue={s.tue_handover} /></label>
          </div>
          <p className="xs">
            As it stands: {s.dad_label} from Saturday {s.sat_handover} until Tuesday {s.tue_handover}, cooking on
            Sunday; {s.mum_label} from Tuesday {s.tue_handover} until Saturday {s.sat_handover}, cooking on
            Wednesday. Tuesday&rsquo;s packed lunch comes from {s.dad_label} because that is where it gets packed;
            Tuesday&rsquo;s dinner is at {s.mum_label}.
          </p>

          <hr />
          <h2>Fuelling</h2>
          <div className="grid2">
            <label className="f"><span className="lab">Carbs tolerated per hour (g)</span>
              <input type="number" name="carb_tolerance" defaultValue={s.carb_tolerance} inputMode="numeric" /></label>
            <label className="f"><span className="lab">Non-training activity multiplier</span>
              <input type="number" step="any" name="neat_pal" defaultValue={s.neat_pal} inputMode="decimal" /></label>
          </div>
          <p className="xs" style={{ marginTop: -4 }}>
            The multiplier covers living — walking about, digesting food, being eighteen — and nothing else. Training is
            added separately and explicitly, which is what stops it being counted twice. 1.40 suits most people with a
            desk or a classroom; raise it toward 1.55 if you are on your feet all day.
          </p>

          <div className="grid2">
            <label className="f"><span className="lab">Standing calorie adjustment</span>
              <input type="number" name="kcal_adjust" defaultValue={s.kcal_adjust} inputMode="numeric" /></label>
            <label className="f"><span className="lab">Sleep tracking</span>
              <select name="sleep_mode" defaultValue={s.sleep_mode}>
                <option value="subjective">Subjective — poor / average / good</option>
                <option value="objective">Objective — I log hours</option>
              </select></label>
          </div>
          <p className="xs" style={{ marginTop: -4 }}>
            The adjustment is set by the weekly weight review and is capped at &plusmn;700 kcal. You can override it,
            but the review will move it again next week — which is usually the right answer.
          </p>

          <button className="wide" type="submit">Save</button>
        </form>

      </div>
      <Nav active="/reference" />
    </>
  );
}
