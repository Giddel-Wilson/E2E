import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db, users } from '$server/db';
import { requireUser } from '$server/auth';
import { hashPassword, verifyPassword } from '$server/auth-server';
import { parseBody } from '$server/validate';
import { changePasswordSchema } from '$server/schemas';
import { logAccess } from '$server/access-log';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals, getClientAddress }) => {
	const sessionUser = requireUser(locals);
	const { currentPassword, newPassword, wrappedPrivateKey, wrappedPrivateKeyIv, privateKeyKdf, privateKeyKdfParams } =
		parseBody(changePasswordSchema, await request.json());

	const [user] = await db.select({ authHash: users.authHash }).from(users).where(eq(users.id, sessionUser.id));
	if (!user) error(404, 'Account not found');

	const valid = await verifyPassword(user.authHash, currentPassword);
	if (!valid) {
		await logAccess({
			actorId: sessionUser.id,
			action: 'DECRYPT_ATTEMPT',
			success: false,
			failureReason: 'bad_current_password',
			ipAddress: getClientAddress()
		});
		error(401, 'Current password is incorrect');
	}

	const newAuthHash = await hashPassword(newPassword);

	await db
		.update(users)
		.set({
			authHash: newAuthHash,
			wrappedPrivateKey,
			wrappedPrivateKeyIv,
			privateKeyKdf,
			privateKeyKdfParams
		})
		.where(eq(users.id, sessionUser.id));

	return json({ ok: true });
};
