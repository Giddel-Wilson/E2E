import { json, error } from '@sveltejs/kit';
import { eq, and, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db, encryptedFiles, shareLinks } from '$server/db';
import { requireUser } from '$server/auth';
import { logAccess } from '$server/access-log';
import { parseBody } from '$server/validate';
import { shareCreateSchema } from '$server/schemas';
import type { RequestHandler } from './$types';

/** Lists this file's share links (owner-only) so the dashboard can manage them. */
export const GET: RequestHandler = async ({ params, locals }) => {
	const user = requireUser(locals);

	const [file] = await db
		.select({ id: encryptedFiles.id })
		.from(encryptedFiles)
		.where(and(eq(encryptedFiles.id, params.id), eq(encryptedFiles.ownerId, user.id)));
	if (!file) error(404, 'File not found');

	const links = await db
		.select({
			id: shareLinks.id,
			token: shareLinks.token,
			maxDownloads: shareLinks.maxDownloads,
			downloadCount: shareLinks.downloadCount,
			expiresAt: shareLinks.expiresAt,
			revokedAt: shareLinks.revokedAt,
			createdAt: shareLinks.createdAt
		})
		.from(shareLinks)
		.where(eq(shareLinks.fileId, file.id))
		.orderBy(desc(shareLinks.createdAt));

	return json({ links });
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const user = requireUser(locals);
	const { wrappedFileKey, kdf, kdfSalt, kdfParams, wrapIv, maxDownloads, expiresAt } = parseBody(
		shareCreateSchema,
		await request.json()
	);

	const [file] = await db
		.select({ id: encryptedFiles.id })
		.from(encryptedFiles)
		.where(and(eq(encryptedFiles.id, params.id), eq(encryptedFiles.ownerId, user.id)));
	if (!file) error(404, 'File not found');

	const token = nanoid(24);

	await db.insert(shareLinks).values({
		fileId: file.id,
		token,
		wrappedFileKey, // password-wrapped on the client
		kdf,
		kdfSalt,
		kdfParams,
		wrapIv,
		maxDownloads: maxDownloads ?? null,
		expiresAt: expiresAt ? new Date(expiresAt) : null
	});

	await logAccess({ fileId: file.id, actorId: user.id, action: 'SHARE_CREATE', success: true });

	return json({ token, url: `/share/${token}` });
};

export const DELETE: RequestHandler = async ({ params, locals, url }) => {
	const user = requireUser(locals);
	const token = url.searchParams.get('token');
	if (!token) error(400, 'Missing token');

	// Verify the link both matches this file AND belongs to a file this
	// user owns before revoking — without the ownership join, any signed-in
	// user could revoke any link by guessing/knowing its token.
	const [file] = await db
		.select({ id: encryptedFiles.id })
		.from(encryptedFiles)
		.where(and(eq(encryptedFiles.id, params.id), eq(encryptedFiles.ownerId, user.id)));
	if (!file) error(404, 'File not found');

	const [link] = await db
		.select({ id: shareLinks.id })
		.from(shareLinks)
		.where(and(eq(shareLinks.token, token), eq(shareLinks.fileId, file.id)));
	if (!link) error(404, 'Share link not found');

	await db.update(shareLinks).set({ revokedAt: new Date() }).where(eq(shareLinks.id, link.id));

	await logAccess({ fileId: file.id, actorId: user.id, action: 'SHARE_REVOKE', success: true });
	return json({ ok: true });
};
