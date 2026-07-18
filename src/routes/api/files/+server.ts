import { json } from '@sveltejs/kit';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { db, encryptedFiles, fileMetadata } from '$server/db';
import { requireUser } from '$server/auth';
import type { RequestHandler } from './$types';

/**
 * Returns every non-deleted file the current user owns, with everything
 * needed to decrypt filenames and content client-side. No plaintext
 * filename, mime type, or key material in usable form ever appears here —
 * the browser decrypts `metadata.encryptedBlob` locally with the unlocked
 * private key to get the real name.
 */
export const GET: RequestHandler = async ({ locals }) => {
	const user = requireUser(locals);

	const rows = await db
		.select({
			id: encryptedFiles.id,
			fileAlgo: encryptedFiles.fileAlgo,
			fileIv: encryptedFiles.fileIv,
			keyAlgo: encryptedFiles.keyAlgo,
			wrappedFileKey: encryptedFiles.wrappedFileKey,
			keyWrapIv: encryptedFiles.keyWrapIv,
			keyWrapEphemeralPublicKeyJwk: encryptedFiles.keyWrapEphemeralPublicKeyJwk,
			totalChunks: encryptedFiles.totalChunks,
			chunkSizeBytes: encryptedFiles.chunkSizeBytes,
			ciphertextSizeBytes: encryptedFiles.ciphertextSizeBytes,
			ciphertextSha256: encryptedFiles.ciphertextSha256,
			createdAt: encryptedFiles.createdAt,
			metaBlob: fileMetadata.encryptedBlob,
			metaIv: fileMetadata.iv,
			metaAlgo: fileMetadata.algo,
			strengthLabel: fileMetadata.strengthLabel,
			strengthScore: fileMetadata.strengthScore
		})
		.from(encryptedFiles)
		.leftJoin(fileMetadata, eq(fileMetadata.fileId, encryptedFiles.id))
		.where(and(eq(encryptedFiles.ownerId, user.id), isNull(encryptedFiles.deletedAt)))
		.orderBy(desc(encryptedFiles.createdAt));

	const files = rows.map((r) => ({
		id: r.id,
		fileAlgo: r.fileAlgo,
		fileIv: r.fileIv,
		keyAlgo: r.keyAlgo,
		wrappedFileKey: r.wrappedFileKey,
		keyWrapIv: r.keyWrapIv,
		keyWrapEphemeralPublicKeyJwk: r.keyWrapEphemeralPublicKeyJwk,
		totalChunks: r.totalChunks,
		chunkSizeBytes: r.chunkSizeBytes,
		ciphertextSizeBytes: r.ciphertextSizeBytes,
		ciphertextSha256: r.ciphertextSha256,
		createdAt: r.createdAt,
		metadata: r.metaBlob
			? { encryptedBlob: r.metaBlob, iv: r.metaIv, algo: r.metaAlgo, strengthLabel: r.strengthLabel, strengthScore: r.strengthScore }
			: null
	}));

	return json({ files });
};
