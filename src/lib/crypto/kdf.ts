import { getSodium } from './sodium';
import type { KdfParams, KdfParamsArgon2id, KdfParamsPBKDF2 } from './types';

export const DEFAULT_PBKDF2_PARAMS: KdfParamsPBKDF2 = {
	kdf: 'PBKDF2',
	iterations: 600_000, // OWASP 2024 minimum recommendation for PBKDF2-HMAC-SHA256
	hash: 'SHA-256'
};

export const DEFAULT_ARGON2ID_PARAMS: KdfParamsArgon2id = {
	kdf: 'Argon2id',
	memoryKib: 65536, // 64 MiB
	iterations: 3,
	parallelism: 4
};

function randomSalt(bytes = 16): Uint8Array {
	return crypto.getRandomValues(new Uint8Array(bytes));
}

/** Derives a raw 256-bit key from a password, never logged or persisted. */
export async function deriveKey(
	password: string,
	params: KdfParams,
	salt?: Uint8Array
): Promise<{ key: Uint8Array; salt: Uint8Array }> {
	const usedSalt = salt ?? randomSalt(params.kdf === 'Argon2id' ? 16 : 16);

	if (params.kdf === 'PBKDF2') {
		const keyMaterial = await crypto.subtle.importKey(
			'raw',
			new TextEncoder().encode(password),
			'PBKDF2',
			false,
			['deriveBits']
		);
		const bits = await crypto.subtle.deriveBits(
			{
				name: 'PBKDF2',
				salt: usedSalt as BufferSource,
				iterations: params.iterations,
				hash: params.hash
			},
			keyMaterial,
			256
		);
		return { key: new Uint8Array(bits), salt: usedSalt };
	}

	// Argon2id via libsodium's crypto_pwhash. Memory/iteration costs are
	// mapped from generic params onto libsodium's opslimit/memlimit.
	const sodium = await getSodium();
	const key = sodium.crypto_pwhash(
		32,
		password,
		usedSalt.slice(0, sodium.crypto_pwhash_SALTBYTES),
		params.iterations,
		params.memoryKib * 1024,
		sodium.crypto_pwhash_ALG_ARGON2ID13
	);
	return { key, salt: usedSalt.slice(0, sodium.crypto_pwhash_SALTBYTES) };
}

/** Rough KDF strength estimate used by the strength indicator, 0-100. */
export function kdfStrengthScore(params: KdfParams): number {
	if (params.kdf === 'Argon2id') {
		// Argon2id is memory-hard; weight memory cost heavily.
		const memScore = Math.min(40, (params.memoryKib / 65536) * 30);
		const iterScore = Math.min(15, params.iterations * 4);
		return Math.round(40 + memScore / 2 + iterScore);
	}
	// PBKDF2 has no memory hardness, so cap its contribution lower even at
	// high iteration counts — it's weaker against GPU/ASIC attacks.
	const iterScore = Math.min(25, (params.iterations / 600_000) * 25);
	return Math.round(35 + iterScore);
}
