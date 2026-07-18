import { json, error } from '@sveltejs/kit';
import { eq, and } from 'drizzle-orm';
import { db, encryptedFiles } from '$server/db';
import { requireUser } from '$server/auth';
import { filesStore } from '$server/blob-store';
import { logAccess } from '$server/access-log';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const user = requireUser(locals);

	const [file] = await db
		.select({ id: encryptedFiles.id, totalChunks: encryptedFiles.totalChunks })
		.from(encryptedFiles)
		.where(and(eq(encryptedFiles.id, params.id), eq(encryptedFiles.ownerId, user.id)));

	if (!file) error(404, 'File not found');

	// Soft-delete first so the file disappears from listings even if blob
	// cleanup below fails partway (e.g. chunks already missing/orphaned).
	await db.update(encryptedFiles).set({ deletedAt: new Date() }).where(eq(encryptedFiles.id, file.id));

	const store = filesStore();
	await Promise.allSettled(
		Array.from({ length: file.totalChunks }, (_, i) => store.delete(`${user.id}/${file.id}/chunk-${i}`))
	);

	await logAccess({ fileId: file.id, actorId: user.id, action: 'DELETE', success: true });

	return json({ ok: true });
};
