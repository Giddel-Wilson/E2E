import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db, users } from '$server/db';
import { requireUser } from '$server/auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	const sessionUser = requireUser(locals);
	const [user] = await db
		.select({
			keyAlgo: users.keyAlgo,
			publicKeyJwk: users.publicKeyJwk,
			wrappedPrivateKey: users.wrappedPrivateKey,
			wrappedPrivateKeyIv: users.wrappedPrivateKeyIv,
			privateKeyKdf: users.privateKeyKdf,
			privateKeyKdfParams: users.privateKeyKdfParams
		})
		.from(users)
		.where(eq(users.id, sessionUser.id));

	return json(user);
};
