import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { getSettings } from '@/lib/db';
import { ms } from '@/lib/project';
import { saveSettingsAction, logoutAction } from '../actions';
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
              <input type="number" step="0.1" name="weight_kg" id="weight_kg"
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
      </div>
      <Nav active="/reference" />
    </>
  );
}
