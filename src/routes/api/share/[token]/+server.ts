import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db, shareLinks, encryptedFiles, fileMetadata } from '$server/db';
import type { RequestHandler } from './$types';

/**
 * Returns everything a recipient needs to decrypt a shared file, given
 * only the link token and (separately, entered by the recipient) the
 * share password. No account or session required — but the file's real
 * name is still encrypted inside `metadata`, so this response alone
 * reveals nothing about the file's content.
 */
export const GET: RequestHandler = async ({ params }) => {
	const [link] = await db.select().from(shareLinks).where(eq(shareLinks.token, params.token));
	if (!link) error(404, 'This link does not exist');
	if (link.revokedAt) error(410, 'This link has been revoked');
	if (link.expiresAt && link.expiresAt < new Date()) error(410, 'This link has expired');
	if (link.maxDownloads !== null && link.downloadCount >= link.maxDownloads) {
		error(410, 'This link has reached its download limit');
	}

	const [file] = await db.select().from(encryptedFiles).where(eq(encryptedFiles.id, link.fileId));
	if (!file || file.deletedAt) error(404, 'This file is no longer available');

	const [meta] = await db.select().from(fileMetadata).where(eq(fileMetadata.fileId, file.id));

	return json({
		fileId: file.id,
		fileAlgo: file.fileAlgo,
		fileIv: file.fileIv,
		totalChunks: file.totalChunks,
		ciphertextSha256: file.ciphertextSha256,
		wrappedFileKey: link.wrappedFileKey,
		kdf: link.kdf,
		kdfSalt: link.kdfSalt,
		kdfParams: link.kdfParams,
		wrapIv: link.wrapIv,
		metadata: meta ? { encryptedBlob: meta.encryptedBlob, iv: meta.iv, algo: meta.algo } : null
	});
};
