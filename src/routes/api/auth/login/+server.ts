import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db, users } from '$server/db';
import { verifyPassword, createSessionCookie } from '$server/auth-server';
import { logAccess } from '$server/access-log';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
	const { email, password } = await request.json();
	if (!email || !password) error(400, 'Email and password are required');

	const [user] = await db.select().from(users).where(eq(users.email, email));
	if (!user) error(401, 'Invalid email or password');

	const valid = await verifyPassword(user.authHash, password);
	if (!valid) {
		await logAccess({
			actorId: user.id,
			action: 'DECRYPT_ATTEMPT',
			success: false,
			failureReason: 'bad_password',
			ipAddress: getClientAddress()
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
