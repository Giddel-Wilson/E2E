import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db, encryptedFiles, fileMetadata } from '$server/db';
import { requireUser } from '$server/auth';
import { logAccess } from '$server/access-log';
import { filesStore } from '$server/blob-store';
import type { RequestHandler } from './$types';

// In-memory chunk buffer keyed by fileId, scoped to a single invocation.
// On Vercel's serverless runtime this is fine because each upload's PUT
// calls for small files land on the same warm instance in quick
// succession; for very large files chunks are flushed to blob storage
// immediately rather than held in memory (see PUT handler below).
const pendingUploads = new Map<string, { chunksReceived: number; totalChunks: number }>();

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = requireUser(locals);
	const body = await request.json();

	if (body.action === 'init') {
		const [row] = await db
			.insert(encryptedFiles)
			.values({
				ownerId: user.id,
				storageKey: '', // set after first chunk lands
				ciphertextSizeBytes: body.ciphertextSizeBytesEstimate ?? 0,
				fileAlgo: body.fileAlgo,
				fileIv: body.fileIv,
				wrappedFileKey: body.wrappedFileKey,
				keyAlgo: body.keyAlgo,
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

		pendingUploads.set(row.id, { chunksReceived: 0, totalChunks: body.totalChunks });
		await logAccess({ fileId: row.id, actorId: user.id, action: 'UPLOAD', success: true });

		return json({ fileId: row.id });
	}

	if (body.action === 'finalize') {
		const { fileId, ciphertextSha256 } = body;
		await db
			.update(encryptedFiles)
			.set({ ciphertextSha256 })
			.where(eq(encryptedFiles.id, fileId));
		pendingUploads.delete(fileId);
		return json({ ok: true });
	}

	error(400, 'Unknown action');
};

export const PUT: RequestHandler = async ({ request, locals }) => {
	const user = requireUser(locals);
	const fileId = request.headers.get('X-File-Id');
	const chunkIndex = Number(request.headers.get('X-Chunk-Index') ?? '0');
	if (!fileId) error(400, 'Missing X-File-Id');

	const ciphertext = new Uint8Array(await request.arrayBuffer());

	// Stream this chunk straight to blob storage — the server process
	// never assembles the full plaintext (it never has plaintext at all)
	// and never needs to hold the full ciphertext in memory either.
	// Netlify Blobs are private by default (unlike Vercel Blob's public
	// URLs), so ciphertext chunks are only ever reachable through our own
	// authenticated download route, not a guessable public link.
	const store = filesStore();
	const key = `${user.id}/${fileId}/chunk-${chunkIndex}`;
	await store.set(key, ciphertext);

	if (chunkIndex === 0) {
		await db
			.update(encryptedFiles)
			.set({ storageKey: `${user.id}/${fileId}` })
			.where(eq(encryptedFiles.id, fileId));
	}

	const state = pendingUploads.get(fileId);
	if (state) state.chunksReceived += 1;

	return json({ ok: true });
};
