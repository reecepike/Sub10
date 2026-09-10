import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { loginAction } from '../actions';
import LoginForm from './LoginForm';
import nextPkg from 'next/package.json';

export const dynamic = 'force-dynamic';

/** Bump this when you push a change — it shows at the bottom of the sign-in page,
 *  so you can tell at a glance which version is actually live. */
const BUILD = '2';
const NEXT_VERSION = nextPkg.version;

export default async function LoginPage() {
  if (await currentUser()) redirect('/');
  return (
    <div className="wrap" style={{ maxWidth: 380, paddingTop: 64 }}>
      <div className="lab" style={{ marginBottom: 6 }}>Road to Sub-10</div>
      <h1 style={{ marginBottom: 4 }}>IRONMAN Leeds 2027</h1>
      <p className="muted small" style={{ marginBottom: 24 }}>
        Sign in to see what today asks of you.
      </p>
      <LoginForm action={loginAction} />
      <p className="xs" style={{ marginTop: 28, textAlign: 'center' }}>
        Build {BUILD} &middot; Next {NEXT_VERSION}
      </p>
    </div>
  );
}
