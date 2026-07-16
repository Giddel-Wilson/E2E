import { hash, verify } from '@node-rs/argon2';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '$env/dynamic/private';
import type { Cookies } from '@sveltejs/kit';

const SESSION_COOKIE = 'e2e_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function secretKey() {
	if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 16) {
		throw new Error('SESSION_SECRET is not set (or too short) — set it in your env vars');
	}
	return new TextEncoder().encode(env.SESSION_SECRET);
}

/**
 * Argon2id hash of the LOGIN password — a standard server-side auth
 * verifier. This is intentionally a separate secret from any key used to
 * wrap a user's private key client-side (see crypto/private-key.ts); the
 * server only ever needs this one to authenticate a session.
 */
export async function hashPassword(password: string): Promise<string> {
	return hash(password, { algorithm: 2 /* Argon2id */, memoryCost: 19456, timeCost: 2, parallelism: 1 });
}

export async function verifyPassword(hashStr: string, password: string): Promise<boolean> {
	return verify(hashStr, password);
}

export async function createSessionCookie(cookies: Cookies, userId: string, email: string) {
	const token = await new SignJWT({ sub: userId, email })
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuedAt()
		.setExpirationTime(`${SESSION_TTL_SECONDS}s`)
		.sign(secretKey());

	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
		maxAge: SESSION_TTL_SECONDS
	});
}

export function clearSessionCookie(cookies: Cookies) {
	cookies.delete(SESSION_COOKIE, { path: '/' });
}

export async function readSessionCookie(
	cookies: Cookies
): Promise<{ id: string; email: string } | null> {
	const token = cookies.get(SESSION_COOKIE);
	if (!token) return null;
	try {
		const { payload } = await jwtVerify(token, secretKey());
		return { id: payload.sub as string, email: payload.email as string };
	} catch {
		return null;
	}
}
