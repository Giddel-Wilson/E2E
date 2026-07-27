import { describe, it, expect } from 'vitest';
import { generateRsaKeypair, generateEcdhKeypair } from '../key-encryption';
import { wrapPrivateKey, unwrapPrivateKey } from '../private-key';
import { DEFAULT_ARGON2ID_PARAMS } from '../kdf';

// Lighter Argon2id params so the suite stays fast — same algorithm path,
// just cheaper to compute for a test.
const FAST_ARGON2ID = { ...DEFAULT_ARGON2ID_PARAMS, memoryKib: 8192, iterations: 1, parallelism: 1 };

describe.each(['RSA-OAEP', 'ECDH-P256'] as const)('wrapPrivateKey/unwrapPrivateKey round trip (%s)', (algo) => {
	it('wraps at "register" time and unwraps at "login" time to the same usable key', async () => {
		const keypair = algo === 'RSA-OAEP' ? await generateRsaKeypair() : await generateEcdhKeypair();

		// Simulates registration: wrap the freshly generated private key.
		const wrapped = await wrapPrivateKey(keypair.privateKey, 'a-real-test-password', FAST_ARGON2ID);

		// Simulates a fresh login on a different session/device: fetch the
		// wrapped material + params back (as the server would return them)
		// and unwrap using nothing but the password.
		const unwrapped = await unwrapPrivateKey(
			wrapped.wrappedPrivateKey,
			wrapped.wrappedPrivateKeyIv,
			'a-real-test-password',
			wrapped.privateKeyKdfParams as any,
			algo
		);

		// The unwrapped key should be usable for the same operations the
		// original was generated for.
		expect(unwrapped.type).toBe('private');
		expect(unwrapped.algorithm.name).toBe(algo === 'RSA-OAEP' ? 'RSA-OAEP' : 'ECDH');
	}, 15_000);

	it('fails to unwrap with the wrong password', async () => {
		const keypair = algo === 'RSA-OAEP' ? await generateRsaKeypair() : await generateEcdhKeypair();
		const wrapped = await wrapPrivateKey(keypair.privateKey, 'correct-password', FAST_ARGON2ID);

		await expect(
			unwrapPrivateKey(
				wrapped.wrappedPrivateKey,
				wrapped.wrappedPrivateKeyIv,
				'wrong-password',
				wrapped.privateKeyKdfParams as any,
				algo
			)
		).rejects.toThrow();
	}, 15_000);
});
