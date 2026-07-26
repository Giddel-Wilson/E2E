import { json, error } from '@sveltejs/kit';
import { eq, and } from 'drizzle-orm';
import { db, encryptedFiles, fileMetadata } from '$server/db';
import { requireUser } from '$server/auth';
import { logAccess } from '$server/access-log';
import { filesStore, sha256Hex } from '$server/blob-store';
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

	// Chunk bytes arrive as base64 inside JSON rather than a raw binary
	// body — this sidesteps runtime/dev-server edge cases in raw
	// octet-stream body handling (Bun's fetch/Request implementation is
	// not the same codebase as Node's and has had binary-body quirks);
	// base64 text is handled far more uniformly everywhere.
	const { chunk } = await request.json();
	const ciphertext = new Uint8Array(Buffer.from(chunk, 'base64'));

	// Stream this chunk straight to blob storage — the server process
	// never assembles the full plaintext (it never has plaintext at all)
	// and never needs to hold the full ciphertext in memory either.
	// Backblaze B2 buckets are private by default, so ciphertext chunks
	// are only ever reachable through our own authenticated download
	// route, not a guessable public link.
	const store = filesStore();
	const key = `${user.id}/${fileId}/chunk-${chunkIndex}`;
	await store.set(key, ciphertext.buffer as ArrayBuffer);

	// Read back what was actually persisted and compare it against what
	// was sent. A same-request "did the write call succeed" check only
	// proves the server accepted the bytes — it doesn't prove blob
	// storage durably stored the same bytes it was given, which is
	// exactly the kind of gap that let a corrupted file through silently
	// before this check existed. This catches it immediately, while the
	// original file is still available to retry with, instead of only
	// surfacing at download time.
	const readBack = await store.get(key, { type: 'arrayBuffer' });
	const sentHash = await sha256Hex(ciphertext);
	const storedHash = readBack ? await sha256Hex(new Uint8Array(readBack)) : null;

	if (!readBack || storedHash !== sentHash) {
		await store.delete(key).catch(() => {});
		error(502, `Chunk ${chunkIndex} did not store correctly — please retry the upload`);
	}

	if (chunkIndex === 0) {
		await db
			.update(encryptedFiles)
			.set({ storageKey: `${user.id}/${fileId}` })
			.where(eq(encryptedFiles.id, fileId));
	}

	return json({ ok: true });
};
