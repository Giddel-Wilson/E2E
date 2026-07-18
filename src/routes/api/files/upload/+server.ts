import { json, error } from '@sveltejs/kit';
import { eq, and } from 'drizzle-orm';
import { db, encryptedFiles, fileMetadata } from '$server/db';
import { requireUser } from '$server/auth';
import { logAccess } from '$server/access-log';
import { filesStore } from '$server/blob-store';
import { parseBody } from '$server/validate';
import { uploadInitSchema, uploadFinalizeSchema } from '$server/schemas';
import { MAX_FILE_SIZE_BYTES } from '$lib/shared/limits';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = requireUser(locals);
	const rawBody = await request.json();

	if (rawBody.action === 'init') {
		const body = parseBody(uploadInitSchema, rawBody);

		// Defense in depth — the client already checks this before
		// encrypting, but a client can't be trusted to enforce its own
		// limits, so it's re-checked here against the declared size.
		if (body.ciphertextSizeBytesEstimate > MAX_FILE_SIZE_BYTES + 1024) {
			error(413, `File exceeds the ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB limit`);
		}

		const [row] = await db
			.insert(encryptedFiles)
			.values({
				ownerId: user.id,
				storageKey: '', // set after first chunk lands
				ciphertextSizeBytes: body.ciphertextSizeBytesEstimate,
				fileAlgo: body.fileAlgo,
				fileIv: body.fileIv,
				wrappedFileKey: body.wrappedFileKey,
				keyAlgo: body.keyAlgo,
				keyWrapIv: body.wrapIv ?? null,
				keyWrapEphemeralPublicKeyJwk: body.ephemeralPublicKeyJwk ?? null,
				totalChunks: body.totalChunks,
				ciphertextSha256: '' // set on finalize
			})
			.returning({ id: encryptedFiles.id });

		await db.insert(fileMetadata).values({
			fileId: row.id,
			encryptedBlob: body.metadata.encryptedBlob,
			iv: body.metadata.iv,
			algo: body.metadata.algo,
			strengthScore: body.metadata.strengthScore,
			strengthLabel: body.metadata.strengthLabel
		});

		await logAccess({ fileId: row.id, actorId: user.id, action: 'UPLOAD', success: true });

		return json({ fileId: row.id });
	}

	if (rawBody.action === 'finalize') {
		const { fileId, ciphertextSha256 } = parseBody(uploadFinalizeSchema, rawBody);
		await db
			.update(encryptedFiles)
			.set({ ciphertextSha256 })
			.where(and(eq(encryptedFiles.id, fileId), eq(encryptedFiles.ownerId, user.id)));
		return json({ ok: true });
	}

	error(400, 'Unknown action');
};

export const PUT: RequestHandler = async ({ request, locals }) => {
	const user = requireUser(locals);
	const fileId = request.headers.get('X-File-Id');
	const chunkIndex = Number(request.headers.get('X-Chunk-Index') ?? '0');
	if (!fileId) error(400, 'Missing X-File-Id');
	if (Number.isNaN(chunkIndex) || chunkIndex < 0) error(400, 'Invalid X-Chunk-Index');

	// Verify this file was actually created by the requester before
	// writing anything to blob storage under their namespace.
	const [file] = await db
		.select({ id: encryptedFiles.id })
		.from(encryptedFiles)
		.where(and(eq(encryptedFiles.id, fileId), eq(encryptedFiles.ownerId, user.id)));
	if (!file) error(404, 'Upload session not found — call init first');

	const ciphertext = new Uint8Array(await request.arrayBuffer());

	// Stream this chunk straight to blob storage — the server process
	// never assembles the full plaintext (it never has plaintext at all)
	// and never needs to hold the full ciphertext in memory either.
	// Netlify Blobs are private by default (unlike Vercel Blob's public
	// URLs), so ciphertext chunks are only ever reachable through our own
	// authenticated download route, not a guessable public link.
	const store = filesStore();
	const key = `${user.id}/${fileId}/chunk-${chunkIndex}`;
	await store.set(key, ciphertext.buffer as ArrayBuffer);

	if (chunkIndex === 0) {
		await db
			.update(encryptedFiles)
			.set({ storageKey: `${user.id}/${fileId}` })
			.where(eq(encryptedFiles.id, fileId));
	}

	return json({ ok: true });
};
