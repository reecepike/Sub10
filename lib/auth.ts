import { cookies } from 'next/headers';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { sql } from './db';

const COOKIE = 'sub10_session';
const MAX_AGE = 60 * 60 * 24 * 120; // 120 days — he should not be logging in every week

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error('SESSION_SECRET is not set (or is too short). See .env.example.');
  }
  return s;
}

/* --------------------------------------------------------- passwords */

export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString('hex');
  const key = scryptSync(plain, salt, 64).toString('hex');
  return `scrypt:${salt}:${key}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const [scheme, salt, key] = stored.split(':');
  if (scheme !== 'scrypt' || !salt || !key) return false;
  const candidate = scryptSync(plain, salt, 64);
  const expected = Buffer.from(key, 'hex');
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

/* ---------------------------------------------------------- sessions */

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

function makeToken(userId: number): string {
  const exp = Date.now() + MAX_AGE * 1000;
  const payload = `${userId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

function readToken(token: string | undefined): number | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [id, exp, mac] = parts;
  const expected = sign(`${id}.${exp}`);
  if (mac.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  if (Number(exp) < Date.now()) return null;
  const n = Number(id);
  return Number.isFinite(n) ? n : null;
}

export async function login(email: string, password: string): Promise<boolean> {
  const rows = await sql<{ id: number; password_hash: string }[]>`
    select id, password_hash from users where email = ${email.trim().toLowerCase()}`;
  const user = rows[0];
  if (!user || !verifyPassword(password, user.password_hash)) return false;

  const jar = await cookies();
  jar.set(COOKIE, makeToken(user.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  });
  return true;
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/** Returns the signed-in user id, or null. */
export async function currentUser(): Promise<number | null> {
  const jar = await cookies();
  return readToken(jar.get(COOKIE)?.value);
}
