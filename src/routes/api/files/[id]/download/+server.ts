import { json, error } from '@sveltejs/kit';
import { eq, and, isNull } from 'drizzle-orm';
import { db, encryptedFiles, fileMetadata } from '$server/db';
import { requireUser } from '$server/auth';
import { logAccess } from '$server/access-log';
import type { RequestHandler } from './$types';

/**
 * Returns everything the browser needs to fetch ciphertext chunk URLs and
 * decrypt them locally: algo, iv, wrapped key, chunk URLs, integrity hash.
 * The server itself performs no decryption at any point.
 */
export const GET: RequestHandler = async ({ params, locals, getClientAddress, request }) => {
	const user = requireUser(locals);

	const [file] = await db
		.select()
		.from(encryptedFiles)
		.where(and(eq(encryptedFiles.id, params.id), eq(encryptedFiles.ownerId, user.id), isNull(encryptedFiles.deletedAt)));

	if (!file) {
		await logAccess({
			fileId: params.id,
			actorId: user.id,
			action: 'DOWNLOAD',
			success: false,
			failureReason: 'not_found_or_forbidden'
		});
		error(404, 'File not found');
	}

	const [meta] = await db.select().from(fileMetadata).where(eq(fileMetadata.fileId, file.id));

	await logAccess({
		fileId: file.id,
		actorId: user.id,
		action: 'DOWNLOAD',
		success: true,
		ipAddress: getClientAddress(),
		userAgent: request.headers.get('user-agent') ?? undefined
	});

	return json({
		fileId: file.id,
		storageKey: file.storageKey,
		fileAlgo: file.fileAlgo,
		fileIv: file.fileIv,
		keyAlgo: file.keyAlgo,
		wrappedFileKey: file.wrappedFileKey,
		keyWrapIv: file.keyWrapIv,
		keyWrapEphemeralPublicKeyJwk: file.keyWrapEphemeralPublicKeyJwk,
		totalChunks: file.totalChunks,
		ciphertextSha256: file.ciphertextSha256,
		chunkSizeBytes: file.chunkSizeBytes,
		metadata: meta
			? { encryptedBlob: meta.encryptedBlob, iv: meta.iv, algo: meta.algo, strengthLabel: meta.strengthLabel }
			: null
	});
};
