import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db, shareLinks, encryptedFiles } from '$server/db';
import { filesStore } from '$server/blob-store';
import { logAccess } from '$server/access-log';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, getClientAddress }) => {
	const [link] = await db.select().from(shareLinks).where(eq(shareLinks.token, params.token));
	if (!link) error(404, 'This link does not exist');
	if (link.revokedAt) error(410, 'This link has been revoked');
	if (link.expiresAt && link.expiresAt < new Date()) error(410, 'This link has expired');
	if (link.maxDownloads !== null && link.downloadCount >= link.maxDownloads) {
		error(410, 'This link has reached its download limit');
	}

	const [file] = await db
		.select({ id: encryptedFiles.id, ownerId: encryptedFiles.ownerId, totalChunks: encryptedFiles.totalChunks })
		.from(encryptedFiles)
		.where(eq(encryptedFiles.id, link.fileId));
	if (!file) error(404, 'File not found');

	const chunkIndex = Number(params.index);
	if (Number.isNaN(chunkIndex) || chunkIndex < 0 || chunkIndex >= file.totalChunks) {
		error(400, 'Invalid chunk index');
	}

	const store = filesStore();
	const key = `${file.ownerId}/${file.id}/chunk-${chunkIndex}`;
	const chunk = await store.get(key, { type: 'arrayBuffer' });
	if (!chunk) error(404, 'Chunk not found');

	// Count once per completed download attempt (on the first chunk),
	// not once per chunk request — otherwise a 50-chunk file would burn
	// through a "max 1 download" link on its own first fetch.
	if (chunkIndex === 0) {
		await db.update(shareLinks).set({ downloadCount: link.downloadCount + 1 }).where(eq(shareLinks.id, link.id));
		await logAccess({
			fileId: file.id,
			shareToken: link.token,
			action: 'DOWNLOAD',
			success: true,
			ipAddress: getClientAddress()
		});
	}

	return json({ chunk: Buffer.from(new Uint8Array(chunk)).toString('base64') });
};
