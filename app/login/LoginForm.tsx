'use client';

import { useActionState } from 'react';

type State = { error?: string };

export default function LoginForm({
  action,
}: {
  action: (prev: State, fd: FormData) => Promise<State>;
}) {
  const [state, formAction, pending] = useActionState(action, {} as State);

  return (
    <form action={formAction}>
      <label className="f">
        <span className="lab">Email</span>
        <input type="email" name="email" id="email" autoComplete="username" required autoFocus />
      </label>
      <label className="f">
        <span className="lab">Password</span>
        <input type="password" name="password" id="password" autoComplete="current-password" required />
      </label>
      {state?.error && <p className="err" style={{ marginBottom: 12 }}>{state.error}</p>}
      <button className="wide" type="submit" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
