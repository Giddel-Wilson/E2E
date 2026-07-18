import type { Handle } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { readSessionCookie } from '$server/auth-server';

// Applied in production only — a strict CSP can break Vite's dev-mode
// HMR websocket and inline eval, which would make local development
// confusing to debug for no real security benefit (dev builds aren't
// what's exposed to the internet).
const SECURITY_HEADERS: Record<string, string> = {
	'X-Frame-Options': 'DENY',
	'X-Content-Type-Options': 'nosniff',
	'Referrer-Policy': 'strict-origin-when-cross-origin',
	'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
	'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
	// 'unsafe-inline' is kept for style-src because components in this
	// app use inline style="" attributes for CSS-variable-driven theming
	// (e.g. dynamic strength-indicator colors) rather than a compiled
	// stylesheet. Tightening this to nonces/hashes is a reasonable next
	// step if that pattern is replaced with class-based styling.
	'Content-Security-Policy':
		"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
};

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = await readSessionCookie(event.cookies);
	const response = await resolve(event);

	if (!dev) {
		for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
			response.headers.set(key, value);
		}
	}

	return response;
};
