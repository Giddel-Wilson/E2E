import { error } from '@sveltejs/kit';
import { eq, and } from 'drizzle-orm';
import { db, encryptedFiles } from '$server/db';
import { requireUser } from '$server/auth';
import { filesStore } from '$server/blob-store';
import type { RequestHandler } from './$types';

/**
 * Streams back one ciphertext chunk. The server reads bytes from blob
 * storage and passes them straight through — it never decrypts, never
 * inspects content, and only checks that the requesting user owns the
 * file before releasing the chunk.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	const user = requireUser(locals);
	const chunkIndex = Number(params.index);

	const [file] = await db
		.select({ id: encryptedFiles.id, totalChunks: encryptedFiles.totalChunks })
		.from(encryptedFiles)
		.where(and(eq(encryptedFiles.id, params.id), eq(encryptedFiles.ownerId, user.id)));

	if (!file) error(404, 'File not found');
	if (Number.isNaN(chunkIndex) || chunkIndex < 0 || chunkIndex >= file.totalChunks) {
		error(400, 'Invalid chunk index');
	}

	const store = filesStore();
	const key = `${user.id}/${file.id}/chunk-${chunkIndex}`;
	const chunk = await store.get(key, { type: 'arrayBuffer' });

	if (!chunk) error(404, 'Chunk not found');

	return new Response(chunk, { headers: { 'Content-Type': 'application/octet-stream' } });
};
