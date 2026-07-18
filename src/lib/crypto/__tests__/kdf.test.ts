import { describe, it, expect } from 'vitest';
import { deriveKey, DEFAULT_PBKDF2_PARAMS, DEFAULT_ARGON2ID_PARAMS } from '../kdf';
import { generateFileKey } from '../file-encryption';
import { wrapKeyWithPassword, unwrapKeyWithPassword } from '../password-wrap';

// Argon2id is intentionally memory-hard/slow; use lighter params in tests
// so the suite stays fast without testing a different code path.
const FAST_ARGON2ID = { kdf: 'Argon2id' as const, memoryKib: 8192, iterations: 1, parallelism: 1 };
const FAST_PBKDF2 = { kdf: 'PBKDF2' as const, iterations: 10_000, hash: 'SHA-256' as const };

describe('deriveKey', () => {
	it('PBKDF2: same password + salt produces the same key', async () => {
		const { key: keyA, salt } = await deriveKey('correct horse battery staple', FAST_PBKDF2);
		const { key: keyB } = await deriveKey('correct horse battery staple', FAST_PBKDF2, salt);
		expect(keyA).toEqual(keyB);
	});

	it('PBKDF2: different passwords produce different keys', async () => {
		const salt = crypto.getRandomValues(new Uint8Array(16));
		const { key: keyA } = await deriveKey('password one', FAST_PBKDF2, salt);
		const { key: keyB } = await deriveKey('password two', FAST_PBKDF2, salt);
		expect(keyA).not.toEqual(keyB);
	});

	it('Argon2id: same password + salt produces the same key', async () => {
		const { key: keyA, salt } = await deriveKey('correct horse battery staple', FAST_ARGON2ID);
		const { key: keyB } = await deriveKey('correct horse battery staple', FAST_ARGON2ID, salt);
		expect(keyA).toEqual(keyB);
	}, 15_000);

	it('Argon2id: different salts produce different keys for the same password', async () => {
		const { key: keyA } = await deriveKey('same password', FAST_ARGON2ID);
		const { key: keyB } = await deriveKey('same password', FAST_ARGON2ID);
		expect(keyA).not.toEqual(keyB); // random salt each call
	}, 15_000);
});

describe('password-wrap round trip', () => {
	it('wraps and unwraps a file key with the correct password', async () => {
		const fileKey = generateFileKey();
		const wrapped = await wrapKeyWithPassword(fileKey, 'share-link-password', FAST_ARGON2ID);
		const unwrapped = await unwrapKeyWithPassword(wrapped, 'share-link-password');
		expect(unwrapped).toEqual(fileKey);
	}, 15_000);

	it('fails with the wrong password', async () => {
		const fileKey = generateFileKey();
		const wrapped = await wrapKeyWithPassword(fileKey, 'correct-password', FAST_ARGON2ID);
		await expect(unwrapKeyWithPassword(wrapped, 'wrong-password')).rejects.toThrow();
	}, 15_000);
});

describe('default KDF params', () => {
	it('meet the OWASP-recommended floor', () => {
		expect(DEFAULT_PBKDF2_PARAMS.iterations).toBeGreaterThanOrEqual(600_000);
		expect(DEFAULT_ARGON2ID_PARAMS.memoryKib).toBeGreaterThanOrEqual(19_456); // ~19 MiB OWASP minimum
	});
});
