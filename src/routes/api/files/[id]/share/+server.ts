import { json, error } from '@sveltejs/kit';
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db, encryptedFiles, shareLinks } from '$server/db';
import { requireUser } from '$server/auth';
import { logAccess } from '$server/access-log';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const user = requireUser(locals);
	const body = await request.json();

	const [file] = await db
		.select({ id: encryptedFiles.id })
		.from(encryptedFiles)
		.where(and(eq(encryptedFiles.id, params.id), eq(encryptedFiles.ownerId, user.id)));
	if (!file) error(404, 'File not found');

	const token = nanoid(24);

	await db.insert(shareLinks).values({
		fileId: file.id,
		token,
		wrappedFileKey: body.wrappedFileKey, // password-wrapped on the client
		kdf: body.kdf,
		kdfSalt: body.kdfSalt,
		kdfParams: body.kdfParams,
		wrapIv: body.wrapIv,
		maxDownloads: body.maxDownloads ?? null,
		expiresAt: body.expiresAt ? new Date(body.expiresAt) : null
	});

	await logAccess({ fileId: file.id, actorId: user.id, action: 'SHARE_CREATE', success: true });

	return json({ token, url: `/share/${token}` });
};

export const DELETE: RequestHandler = async ({ params, locals, url }) => {
	const user = requireUser(locals);
	const token = url.searchParams.get('token');
	if (!token) error(400, 'Missing token');

	await db
		.update(shareLinks)
		.set({ revokedAt: new Date() })
		.where(eq(shareLinks.token, token));

	await logAccess({ fileId: params.id, actorId: user.id, action: 'SHARE_REVOKE', success: true });
	return json({ ok: true });
};
