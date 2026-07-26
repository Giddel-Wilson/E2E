export type FileAlgo = 'AES-GCM' | 'ChaCha20-Poly1305';
export type KeyAlgo = 'RSA-OAEP' | 'ECDH-P256';
export type KdfAlgo = 'PBKDF2' | 'Argon2id';

export interface KdfParamsPBKDF2 {
	kdf: 'PBKDF2';
	iterations: number; // OWASP 2024 floor for PBKDF2-HMAC-SHA256: 600,000
	hash: 'SHA-256';
}

export interface KdfParamsArgon2id {
	kdf: 'Argon2id';
	memoryKib: number; // e.g. 65536 = 64 MiB
	iterations: number; // time cost, e.g. 3
	parallelism: number; // e.g. 4
}

export type KdfParams = KdfParamsPBKDF2 | KdfParamsArgon2id;

export interface EncryptedPayload {
	ciphertext: Uint8Array;
	iv: Uint8Array; // 96-bit nonce for both AES-GCM and ChaCha20-Poly1305
	algo: FileAlgo;
}

export interface WrappedKey {
	wrapped: Uint8Array; // ciphertext of the raw symmetric key
	algo: KeyAlgo;
	iv?: Uint8Array; // present for ECDH (AES-KW via derived shared secret)
	ephemeralPublicKeyJwk?: JsonWebKey; // present for ECDH only
}

export interface PasswordWrappedKey {
	wrapped: Uint8Array;
	iv: Uint8Array;
	salt: Uint8Array;
	kdfParams: KdfParams;
}

/** 0-100 score + label surfaced in the UI's encryption-strength indicator. */
export interface StrengthRating {
	score: number;
	label: 'weak' | 'fair' | 'good' | 'strong';
	bits: number;
	reasons: string[];
}

// 2 MiB, not 4 MiB: chunks travel as base64-in-JSON (see upload-pipeline.ts),
// which adds ~33% overhead. 4 MiB chunks would become ~5.3MB encoded —
// over Vercel's hard, non-configurable 4.5MB request/response body limit
// for serverless functions. 2 MiB encodes to ~2.7MB, leaving real margin.
export const CHUNK_SIZE_BYTES = 2 * 1024 * 1024;
export const FILE_KEY_LENGTH_BITS = 256;
export const RSA_MODULUS_LENGTH = 4096;
