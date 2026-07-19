import {
	CHUNK_SIZE_BYTES,
	type FileAlgo,
	type KeyAlgo
} from './types';
import {
	deriveChunkNonce,
	encryptBlob,
	encryptChunk,
	generateFileKey,
	newBaseNonce,
	sha256Hex
} from './file-encryption';
import { wrapFileKey } from './key-encryption';
import { computeStrengthRating } from './strength';
import { toBase64 } from './index';

export interface EncryptionChoice {
	fileAlgo: FileAlgo;
	keyAlgo: KeyAlgo;
}

export interface UploadProgress {
	phase: 'encrypting' | 'uploading' | 'done' | 'error';
	percent: number;
	bytesDone: number;
	bytesTotal: number;
}

interface UploadFileOptions {
	file: File;
	recipientPublicKey: CryptoKey;
	choice: EncryptionChoice;
	onProgress?: (p: UploadProgress) => void;
}

/**
 * Encrypts a File in fixed-size chunks (so memory stays bounded for large
 * files) and uploads ciphertext chunks to /api/files/upload as they're
 * produced. Filename/MIME/size are encrypted separately into the
 * file_metadata blob so the server is metadata-blind too.
 */
export async function encryptAndUploadFile({
	file,
	recipientPublicKey,
	choice,
	onProgress
}: UploadFileOptions) {
	const fileKey = generateFileKey();
	const baseNonce = newBaseNonce();
	const totalChunks = Math.ceil(file.size / CHUNK_SIZE_BYTES);

	// 1. Encrypt metadata (filename, mime, size) as its own small blob.
	const metadataPlain = new TextEncoder().encode(
		JSON.stringify({ name: file.name, mimeType: file.type || 'application/octet-stream', size: file.size })
	);
	const { ciphertext: metaCiphertext, iv: metaIv } = await encryptBlob(metadataPlain, fileKey, choice.fileAlgo);

	// 2. Wrap the file key under the recipient's (usually self) public key.
	const wrappedKey = await wrapFileKey(fileKey, choice.keyAlgo, recipientPublicKey);

	const strength = computeStrengthRating(choice.fileAlgo, choice.keyAlgo);

	// 3. Initiate upload — server allocates a blob storage key and a
	// file_id, but receives zero plaintext at any point.
	const initRes = await fetch('/api/files/upload', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			action: 'init',
			fileAlgo: choice.fileAlgo,
			keyAlgo: choice.keyAlgo,
			fileIv: toBase64(baseNonce),
			wrappedFileKey: toBase64(wrappedKey.wrapped),
			wrapIv: wrappedKey.iv ? toBase64(wrappedKey.iv) : null,
			ephemeralPublicKeyJwk: wrappedKey.ephemeralPublicKeyJwk ?? null,
			metadata: {
				encryptedBlob: toBase64(metaCiphertext),
				iv: toBase64(metaIv),
				algo: choice.fileAlgo,
				strengthScore: strength.score,
				strengthLabel: strength.label
			},
			totalChunks,
			ciphertextSizeBytesEstimate: file.size + totalChunks * 16 // + auth tags
		})
	});
	if (!initRes.ok) throw new Error('Failed to initialize upload');
	const { fileId } = await initRes.json();

	// 4. Encrypt + upload each chunk in sequence, reporting progress.
	let bytesDone = 0;
	const ciphertextChunks: Uint8Array[] = [];

	for (let i = 0; i < totalChunks; i++) {
		const start = i * CHUNK_SIZE_BYTES;
		const end = Math.min(start + CHUNK_SIZE_BYTES, file.size);
		const plainChunk = new Uint8Array(await file.slice(start, end).arrayBuffer());

		onProgress?.({ phase: 'encrypting', percent: (bytesDone / file.size) * 50, bytesDone, bytesTotal: file.size });

		const nonce = deriveChunkNonce(baseNonce, i);
		const cipherChunk = await encryptChunk(plainChunk, fileKey, choice.fileAlgo, nonce);
		ciphertextChunks.push(cipherChunk);

		bytesDone += plainChunk.length;
		onProgress?.({ phase: 'uploading', percent: 50 + (bytesDone / file.size) * 40, bytesDone, bytesTotal: file.size });

		const putRes = await fetch(`/api/files/upload`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json', 'X-File-Id': fileId, 'X-Chunk-Index': String(i) },
			body: JSON.stringify({ chunk: toBase64(cipherChunk) })
		});
		if (!putRes.ok) {
			const body = await putRes.json().catch(() => ({}));
			throw new Error(body.message ?? `Failed to upload chunk ${i + 1} of ${totalChunks} — please try again`);
		}
	}

	// 5. Compute ciphertext SHA-256 for integrity verification, finalize.
	const fullCiphertext = new Uint8Array(ciphertextChunks.reduce((n, c) => n + c.length, 0));
	let offset = 0;
	for (const c of ciphertextChunks) {
		fullCiphertext.set(c, offset);
		offset += c.length;
	}
	const ciphertextSha256 = await sha256Hex(fullCiphertext);

	const finalizeRes = await fetch('/api/files/upload', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ action: 'finalize', fileId, ciphertextSha256 })
	});
	if (!finalizeRes.ok) throw new Error('Failed to finalize upload');

	onProgress?.({ phase: 'done', percent: 100, bytesDone: file.size, bytesTotal: file.size });

	return { fileId, strength };
}
