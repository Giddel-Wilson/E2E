import { describe, it, expect } from 'vitest';
import {
	generateFileKey,
	newBaseNonce,
	deriveChunkNonce,
	encryptChunk,
	decryptChunk,
	encryptBlob,
	decryptBlob,
	sha256Hex
} from '../file-encryption';

describe.each(['AES-GCM', 'ChaCha20-Poly1305'] as const)('file-encryption (%s)', (algo) => {
	it('round-trips a single chunk', async () => {
		const key = generateFileKey();
		const nonce = newBaseNonce();
		const plaintext = new TextEncoder().encode('hello, this is a test file payload');

		const ciphertext = await encryptChunk(plaintext, key, algo, nonce);
		expect(ciphertext).not.toEqual(plaintext);

		const decrypted = await decryptChunk(ciphertext, key, algo, nonce);
		expect(new TextDecoder().decode(decrypted)).toBe('hello, this is a test file payload');
	});

	it('round-trips multiple chunks with derived nonces, in any read order', async () => {
		const key = generateFileKey();
		const baseNonce = newBaseNonce();
		const chunks = ['chunk zero', 'chunk one', 'chunk two'].map((s) => new TextEncoder().encode(s));

		const encrypted = await Promise.all(
			chunks.map((c, i) => encryptChunk(c, key, algo, deriveChunkNonce(baseNonce, i)))
		);

		for (let i = 0; i < chunks.length; i++) {
			const decrypted = await decryptChunk(encrypted[i], key, algo, deriveChunkNonce(baseNonce, i));
			expect(new TextDecoder().decode(decrypted)).toBe(new TextDecoder().decode(chunks[i]));
		}
	});

	it('fails to decrypt with the wrong key', async () => {
		const key = generateFileKey();
		const wrongKey = generateFileKey();
		const nonce = newBaseNonce();
		const ciphertext = await encryptChunk(new TextEncoder().encode('secret'), key, algo, nonce);

		await expect(decryptChunk(ciphertext, wrongKey, algo, nonce)).rejects.toThrow();
	});

	it('fails to decrypt if ciphertext is tampered with', async () => {
		const key = generateFileKey();
		const nonce = newBaseNonce();
		const ciphertext = await encryptChunk(new TextEncoder().encode('secret payload'), key, algo, nonce);
		const tampered = new Uint8Array(ciphertext);
		tampered[0] ^= 0xff; // flip a bit

		await expect(decryptChunk(tampered, key, algo, nonce)).rejects.toThrow();
	});

	it('encryptBlob/decryptBlob round-trip (used for metadata)', async () => {
		const key = generateFileKey();
		const plaintext = new TextEncoder().encode(JSON.stringify({ name: 'report.pdf', size: 1234 }));

		const { ciphertext, iv } = await encryptBlob(plaintext, key, algo);
		const decrypted = await decryptBlob(ciphertext, key, algo, iv);

		expect(JSON.parse(new TextDecoder().decode(decrypted))).toEqual({ name: 'report.pdf', size: 1234 });
	});
});

describe('sha256Hex', () => {
	it('is deterministic for the same input', async () => {
		const data = new TextEncoder().encode('consistent input');
		const a = await sha256Hex(data);
		const b = await sha256Hex(data);
		expect(a).toBe(b);
		expect(a).toHaveLength(64);
	});

	it('differs for different input', async () => {
		const a = await sha256Hex(new TextEncoder().encode('input A'));
		const b = await sha256Hex(new TextEncoder().encode('input B'));
		expect(a).not.toBe(b);
	});
});
