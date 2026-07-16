import { getSodium } from './sodium';
import { FILE_KEY_LENGTH_BITS, type FileAlgo } from './types';

/** Generates a random 256-bit symmetric file key, algorithm-agnostic. */
export function generateFileKey(): Uint8Array {
	return crypto.getRandomValues(new Uint8Array(FILE_KEY_LENGTH_BITS / 8));
}

function randomNonce(bytes: number): Uint8Array {
	return crypto.getRandomValues(new Uint8Array(bytes));
}

/**
 * Encrypts a single chunk (Uint8Array) with the chosen algorithm. Used for
 * both whole small files and per-chunk streaming of large uploads — each
 * chunk gets its own nonce derived from a base nonce + chunk index so a
 * key is never reused with the same nonce.
 */
export async function encryptChunk(
	plaintext: Uint8Array,
	key: Uint8Array,
	algo: FileAlgo,
	nonce: Uint8Array,
	aad?: Uint8Array
): Promise<Uint8Array> {
	if (algo === 'AES-GCM') {
		const cryptoKey = await crypto.subtle.importKey('raw', key as BufferSource, 'AES-GCM', false, [
			'encrypt'
		]);
		const params: AesGcmParams = { name: 'AES-GCM', iv: nonce as BufferSource, tagLength: 128 };
		if (aad) params.additionalData = aad as BufferSource;
		const ct = await crypto.subtle.encrypt(params, cryptoKey, plaintext as BufferSource);
		return new Uint8Array(ct);
	}

	// ChaCha20-Poly1305 (IETF variant, 96-bit nonce) via libsodium.
	const sodium = await getSodium();
	return sodium.crypto_aead_chacha20poly1305_ietf_encrypt(plaintext, aad ?? null, null, nonce, key);
}

export async function decryptChunk(
	ciphertext: Uint8Array,
	key: Uint8Array,
	algo: FileAlgo,
	nonce: Uint8Array,
	aad?: Uint8Array
): Promise<Uint8Array> {
	if (algo === 'AES-GCM') {
		const cryptoKey = await crypto.subtle.importKey('raw', key as BufferSource, 'AES-GCM', false, [
			'decrypt'
		]);
		const params: AesGcmParams = { name: 'AES-GCM', iv: nonce as BufferSource, tagLength: 128 };
		if (aad) params.additionalData = aad as BufferSource;
		const pt = await crypto.subtle.decrypt(params, cryptoKey, ciphertext as BufferSource);
		return new Uint8Array(pt);
	}

	const sodium = await getSodium();
	return sodium.crypto_aead_chacha20poly1305_ietf_decrypt(null, ciphertext, aad ?? null, nonce, key);
}

/** Derives a per-chunk nonce from a 64-bit base + 32-bit big-endian counter. */
export function deriveChunkNonce(baseNonce: Uint8Array, chunkIndex: number): Uint8Array {
	const nonce = baseNonce.slice(0, 12);
	const view = new DataView(nonce.buffer, nonce.byteOffset, nonce.byteLength);
	const existing = view.getUint32(8, false);
	view.setUint32(8, (existing ^ chunkIndex) >>> 0, false);
	return nonce;
}

export function newBaseNonce(): Uint8Array {
	return randomNonce(12);
}

/** Convenience wrapper for small files / metadata blobs (no chunking). */
export async function encryptBlob(
	plaintext: Uint8Array,
	key: Uint8Array,
	algo: FileAlgo
): Promise<{ ciphertext: Uint8Array; iv: Uint8Array }> {
	const iv = newBaseNonce();
	const ciphertext = await encryptChunk(plaintext, key, algo, iv);
	return { ciphertext, iv };
}

export async function decryptBlob(
	ciphertext: Uint8Array,
	key: Uint8Array,
	algo: FileAlgo,
	iv: Uint8Array
): Promise<Uint8Array> {
	return decryptChunk(ciphertext, key, algo, iv);
}

/** SHA-256 over ciphertext bytes, used for client-side integrity checks. */
export async function sha256Hex(data: Uint8Array): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', data as BufferSource);
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
