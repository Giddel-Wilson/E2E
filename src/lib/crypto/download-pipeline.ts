import { fromBase64 } from './encoding';
import { unwrapFileKey } from './key-encryption';
import { decryptBlob, decryptChunk, deriveChunkNonce, sha256Hex } from './file-encryption';
import type { FileAlgo, KeyAlgo } from './types';

/** Shape returned by GET /api/files (list). */
export interface EncryptedFileRecord {
	id: string;
	fileAlgo: FileAlgo;
	fileIv: string; // base64
	keyAlgo: KeyAlgo;
	wrappedFileKey: string; // base64
	keyWrapIv: string | null; // base64, ECDH only
	keyWrapEphemeralPublicKeyJwk: JsonWebKey | null; // ECDH only
	totalChunks: number;
	ciphertextSha256?: string;
	createdAt?: string;
	metadata: { encryptedBlob: string; iv: string; algo: FileAlgo; strengthLabel?: string } | null;
}

export interface DecryptedMetadata {
	name: string;
	mimeType: string;
	size: number;
}

export interface DownloadProgress {
	phase: 'fetching' | 'verifying' | 'decrypting' | 'done';
	percent: number;
}

/** How to fetch one ciphertext chunk. Defaults to the authenticated per-user
 * route; the public share flow supplies a different one pointing at
 * /api/share/[token]/chunks/[index] instead. */
export type ChunkFetcher = (index: number) => Promise<Response>;

function defaultChunkFetcher(fileId: string): ChunkFetcher {
	return (index) => fetch(`/api/files/${fileId}/chunks/${index}`);
}

/**
 * Unwraps the per-file symmetric key using the caller's private key. Same
 * algorithm the file was wrapped with at upload time — RSA-OAEP needs only
 * the private key; ECDH needs the stored ephemeral public key + wrap IV to
 * redo the shared-secret derivation.
 */
export async function unwrapRecordFileKey(
	record: EncryptedFileRecord,
	privateKey: CryptoKey
): Promise<Uint8Array> {
	if (record.keyAlgo === 'RSA-OAEP') {
		return unwrapFileKey({ wrapped: fromBase64(record.wrappedFileKey), algo: 'RSA-OAEP' }, privateKey);
	}

	if (!record.keyWrapIv || !record.keyWrapEphemeralPublicKeyJwk) {
		throw new Error('Missing ECDH wrap material for this file — it may have been uploaded incorrectly');
	}

	return unwrapFileKey(
		{
			wrapped: fromBase64(record.wrappedFileKey),
			algo: 'ECDH-P256',
			iv: fromBase64(record.keyWrapIv),
			ephemeralPublicKeyJwk: record.keyWrapEphemeralPublicKeyJwk
		},
		privateKey
	);
}

/** Decrypts just the filename/mime/size blob — cheap, used for file listings. */
export async function decryptRecordMetadata(
	record: EncryptedFileRecord,
	fileKey: Uint8Array
): Promise<DecryptedMetadata | null> {
	if (!record.metadata) return null;
	const plaintext = await decryptBlob(
		fromBase64(record.metadata.encryptedBlob),
		fileKey,
		record.metadata.algo,
		fromBase64(record.metadata.iv)
	);
	return JSON.parse(new TextDecoder().decode(plaintext));
}

/**
 * Fetches every ciphertext chunk and verifies the combined hash against
 * the stored SHA-256 before returning anything to the caller. Shared by
 * both the decrypt-and-download flow and the raw-ciphertext export, so
 * integrity is enforced identically in both places.
 */
async function fetchAndVerifyChunks(
	record: EncryptedFileRecord,
	fetchChunk: ChunkFetcher,
	onProgress?: (p: DownloadProgress) => void
): Promise<Uint8Array[]> {
	const cipherChunks: Uint8Array[] = [];

	for (let i = 0; i < record.totalChunks; i++) {
		onProgress?.({ phase: 'fetching', percent: (i / record.totalChunks) * 45 });
		const res = await fetchChunk(i);
		if (!res.ok) throw new Error(`Failed to fetch chunk ${i} of ${record.totalChunks}`);
		cipherChunks.push(new Uint8Array(await res.arrayBuffer()));
	}

	// A missing hash means the upload's finalize step never completed —
	// treat that as untrustworthy rather than silently skipping
	// verification, which is exactly what let a corrupted file through
	// undetected before this fix.
	if (!record.ciphertextSha256) {
		throw new Error(
			'This file has no integrity hash on record, which means its upload never finished. It cannot be safely decrypted — delete it and upload it again.'
		);
	}

	onProgress?.({ phase: 'verifying', percent: 50 });
	const combined = new Uint8Array(cipherChunks.reduce((n, c) => n + c.length, 0));
	let offset = 0;
	for (const c of cipherChunks) {
		combined.set(c, offset);
		offset += c.length;
	}
	const actualHash = await sha256Hex(combined);
	if (actualHash !== record.ciphertextSha256) {
		throw new Error('Integrity check failed — ciphertext hash does not match. File may be corrupted or tampered with.');
	}

	return cipherChunks;
}

/**
 * Fetches every ciphertext chunk for a file, verifies integrity, decrypts
 * each chunk, and returns the reassembled plaintext as a Blob ready to
 * save. Runs entirely in the browser — the server only ever handed back
 * ciphertext bytes. `fetchChunk` defaults to the authenticated per-file
 * route; pass a different one for the public share flow.
 */
export async function downloadAndDecryptFile(
	record: EncryptedFileRecord,
	fileKey: Uint8Array,
	fetchChunk: ChunkFetcher = defaultChunkFetcher(record.id),
	onProgress?: (p: DownloadProgress) => void
): Promise<{ blob: Blob; metadata: DecryptedMetadata | null }> {
	const baseNonce = fromBase64(record.fileIv);
	const cipherChunks = await fetchAndVerifyChunks(record, fetchChunk, onProgress);

	const plainChunks: Uint8Array[] = [];
	for (let i = 0; i < cipherChunks.length; i++) {
		onProgress?.({ phase: 'decrypting', percent: 50 + (i / cipherChunks.length) * 45 });
		const nonce = deriveChunkNonce(baseNonce, i);
		plainChunks.push(await decryptChunk(cipherChunks[i], fileKey, record.fileAlgo, nonce));
	}

	const metadata = await decryptRecordMetadata(record, fileKey);
	const blob = new Blob(plainChunks as BlobPart[], { type: metadata?.mimeType || 'application/octet-stream' });

	onProgress?.({ phase: 'done', percent: 100 });
	return { blob, metadata };
}

/**
 * Downloads the file WITHOUT decrypting it — verified ciphertext plus a
 * manifest with everything needed to decrypt it later (offline, or with a
 * different tool). Useful for archival, or handing someone an encrypted
 * copy without granting them decrypt access at the same time.
 */
export async function downloadRawCiphertext(
	record: EncryptedFileRecord,
	fetchChunk: ChunkFetcher = defaultChunkFetcher(record.id),
	onProgress?: (p: DownloadProgress) => void
): Promise<{ ciphertext: Blob; manifest: Blob }> {
	const cipherChunks = await fetchAndVerifyChunks(record, fetchChunk, onProgress);
	const combined = new Uint8Array(cipherChunks.reduce((n, c) => n + c.length, 0));
	let offset = 0;
	for (const c of cipherChunks) {
		combined.set(c, offset);
		offset += c.length;
	}

	const manifest = {
		fileId: record.id,
		fileAlgo: record.fileAlgo,
		fileIv: record.fileIv,
		keyAlgo: record.keyAlgo,
		wrappedFileKey: record.wrappedFileKey,
		keyWrapIv: record.keyWrapIv,
		keyWrapEphemeralPublicKeyJwk: record.keyWrapEphemeralPublicKeyJwk,
		ciphertextSha256: record.ciphertextSha256,
		totalChunks: record.totalChunks,
		metadata: record.metadata,
		note: 'This manifest plus the matching .enc file are needed to decrypt this file later. The wrapped key inside is still encrypted and useless without the owning account\'s private key.'
	};

	onProgress?.({ phase: 'done', percent: 100 });
	return {
		ciphertext: new Blob([combined as BlobPart], { type: 'application/octet-stream' }),
		manifest: new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' })
	};
}

/** Triggers a browser save-as for a Blob. */
export function triggerBrowserDownload(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}
