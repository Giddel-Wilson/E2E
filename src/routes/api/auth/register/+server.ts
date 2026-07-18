import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db, users } from '$server/db';
import { hashPassword, createSessionCookie } from '$server/auth-server';
import { parseBody } from '$server/validate';
import { registerSchema } from '$server/schemas';
import type { RequestHandler } from './$types';

/**
 * Expects the browser to have already, client-side:
 *  1. generated an RSA-OAEP or ECDH keypair
 *  2. derived a wrapping key from the same password via Argon2id/PBKDF2
 *  3. encrypted the private key with that wrapping key
 *
 * This endpoint never sees a private key in usable form — only the
 * already-wrapped ciphertext plus the public key.
 */
export const POST: RequestHandler = async ({ request, cookies }) => {
	const {
		email,
		displayName,
		password,
		publicKeyJwk,
		keyAlgo,
		wrappedPrivateKey,
		wrappedPrivateKeyIv,
		privateKeyKdf,
		privateKeyKdfParams
	} = parseBody(registerSchema, await request.json());

	const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
	if (existing) error(409, 'An account with that email already exists');

	const authHash = await hashPassword(password);

	const [user] = await db
		.insert(users)
		.values({
			email,
			displayName: displayName || email.split('@')[0],
			authHash,
			authSalt: '', // unused: @node-rs/argon2 embeds its own salt in the hash string
			authKdf: 'Argon2id',
			publicKeyJwk,
			keyAlgo,
			wrappedPrivateKey,
			wrappedPrivateKeyIv,
			privateKeyKdf,
			privateKeyKdfParams
		})
		.returning({ id: users.id, email: users.email });

	await createSessionCookie(cookies, user.id, user.email);

	return json({ id: user.id, email: user.email });
};
