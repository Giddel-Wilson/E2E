import { describe, it, expect } from 'vitest';
import { generateFileKey } from '../file-encryption';
import {
	generateRsaKeypair,
	generateEcdhKeypair,
	wrapFileKey,
	unwrapFileKey
} from '../key-encryption';

describe('key-encryption RSA-OAEP', () => {
	it('wraps and unwraps a file key round-trip', async () => {
		const { publicKey, privateKey } = await generateRsaKeypair();
		const fileKey = generateFileKey();

		const wrapped = await wrapFileKey(fileKey, 'RSA-OAEP', publicKey);
		const unwrapped = await unwrapFileKey(wrapped, privateKey);

		expect(unwrapped).toEqual(fileKey);
	});

	it('fails to unwrap with a different keypair', async () => {
		const { publicKey } = await generateRsaKeypair();
		const { privateKey: wrongPrivateKey } = await generateRsaKeypair();
		const fileKey = generateFileKey();

		const wrapped = await wrapFileKey(fileKey, 'RSA-OAEP', publicKey);
		await expect(unwrapFileKey(wrapped, wrongPrivateKey)).rejects.toThrow();
	});
}, 30_000); // RSA-4096 keygen is slow

describe('key-encryption ECDH-P256', () => {
	it('wraps and unwraps a file key round-trip', async () => {
		const { publicKey, privateKey } = await generateEcdhKeypair();
		const fileKey = generateFileKey();

		const wrapped = await wrapFileKey(fileKey, 'ECDH-P256', publicKey);
		expect(wrapped.ephemeralPublicKeyJwk).toBeTruthy();
		expect(wrapped.iv).toBeTruthy();

		const unwrapped = await unwrapFileKey(wrapped, privateKey);
		expect(unwrapped).toEqual(fileKey);
	});

	it('fails to unwrap with a different keypair', async () => {
		const { publicKey } = await generateEcdhKeypair();
		const { privateKey: wrongPrivateKey } = await generateEcdhKeypair();
		const fileKey = generateFileKey();

		const wrapped = await wrapFileKey(fileKey, 'ECDH-P256', publicKey);
		await expect(unwrapFileKey(wrapped, wrongPrivateKey)).rejects.toThrow();
	});

	it('produces a different ephemeral key (and ciphertext) on each call', async () => {
		const { publicKey } = await generateEcdhKeypair();
		const fileKey = generateFileKey();

		const wrappedA = await wrapFileKey(fileKey, 'ECDH-P256', publicKey);
		const wrappedB = await wrapFileKey(fileKey, 'ECDH-P256', publicKey);

		expect(wrappedA.wrapped).not.toEqual(wrappedB.wrapped);
	});
});
