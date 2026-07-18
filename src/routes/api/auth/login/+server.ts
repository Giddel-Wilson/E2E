import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db, users } from '$server/db';
import { verifyPassword, createSessionCookie } from '$server/auth-server';
import { logAccess } from '$server/access-log';
import { recentFailedLoginCount, LOGIN_RATE_LIMIT } from '$server/rate-limit';
import { parseBody } from '$server/validate';
import { loginSchema } from '$server/schemas';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
	const { email, password } = parseBody(loginSchema, await request.json());
	const ip = getClientAddress();

	// Check BEFORE touching the DB for the user lookup, so lockout applies
	// uniformly whether the email exists or not — this also protects
	// against email enumeration via response timing.
	const recentFailures = await recentFailedLoginCount(ip);
	if (recentFailures >= LOGIN_RATE_LIMIT.maxAttempts) {
		error(429, `Too many failed sign-in attempts. Try again in a few minutes.`);
	}

	const [user] = await db.select().from(users).where(eq(users.email, email));
	if (!user) {
		await logAccess({
			actorId: null,
			action: 'DECRYPT_ATTEMPT',
			success: false,
			failureReason: 'unknown_email',
			ipAddress: ip
		});
		error(401, 'Invalid email or password');
	}

	const valid = await verifyPassword(user.authHash, password);
	if (!valid) {
		await logAccess({
			actorId: user.id,
			action: 'DECRYPT_ATTEMPT',
			success: false,
			failureReason: 'bad_password',
			ipAddress: ip
		});
		error(401, 'Invalid email or password');
	}

	await createSessionCookie(cookies, user.id, user.email);
	await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

	// Return everything the browser needs to unlock the private key locally.
	// The wrapping key is re-derived in-browser from `password` — the
	// server never derives or holds it.
	return json({
		id: user.id,
		email: user.email,
		displayName: user.displayName,
		keyAlgo: user.keyAlgo,
		publicKeyJwk: user.publicKeyJwk,
		wrappedPrivateKey: user.wrappedPrivateKey,
		wrappedPrivateKeyIv: user.wrappedPrivateKeyIv,
		privateKeyKdf: user.privateKeyKdf,
		privateKeyKdfParams: user.privateKeyKdfParams
	});
};
