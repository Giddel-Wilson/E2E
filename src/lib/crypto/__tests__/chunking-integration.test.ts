import { describe, it, expect } from 'vitest';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import {
	generateFileKey,
	newBaseNonce,
	deriveChunkNonce,
	encryptChunk,
	decryptChunk,
	sha256Hex
} from '../file-encryption';
import { CHUNK_SIZE_BYTES } from '../types';

describe.each(['AES-GCM', 'ChaCha20-Poly1305'] as const)(
	'multi-chunk round trip (%s) — mirrors upload/download chunking logic',
	(algo) => {
		it('reconstructs a multi-chunk file byte-for-byte and passes hash verification', async () => {
			// A file just over 2 chunk boundaries — exercises chunk ordering,
			// nonce derivation across indices, and reassembly the same way
			// upload-pipeline.ts / download-pipeline.ts do it for real files.
			const chunkSize = 1024; // small chunk size so the test stays fast
			const totalSize = chunkSize * 2 + 137; // 3 chunks, last one partial
			const original = crypto.getRandomValues(new Uint8Array(totalSize));

			const fileKey = generateFileKey();
			const baseNonce = newBaseNonce();
			const totalChunks = Math.ceil(totalSize / chunkSize);

			// --- "upload" side ---
			const cipherChunks: Uint8Array[] = [];
			for (let i = 0; i < totalChunks; i++) {
				const start = i * chunkSize;
				const end = Math.min(start + chunkSize, totalSize);
				const plainChunk = original.slice(start, end);
				const nonce = deriveChunkNonce(baseNonce, i);
				cipherChunks.push(await encryptChunk(plainChunk, fileKey, algo, nonce));
			}
			const uploadedCombined = new Uint8Array(cipherChunks.reduce((n, c) => n + c.length, 0));
			let off = 0;
			for (const c of cipherChunks) {
				uploadedCombined.set(c, off);
				off += c.length;
			}
			const uploadHash = await sha256Hex(uploadedCombined);

			// --- "download" side: fetch chunks (simulated as the same array,
			// as if round-tripped through storage), verify, then decrypt ---
			const fetchedCombined = new Uint8Array(cipherChunks.reduce((n, c) => n + c.length, 0));
			off = 0;
			for (const c of cipherChunks) {
				fetchedCombined.set(c, off);
				off += c.length;
			}
			const downloadHash = await sha256Hex(fetchedCombined);
			expect(downloadHash).toBe(uploadHash); // integrity check must pass

			const plainChunks: Uint8Array[] = [];
			for (let i = 0; i < cipherChunks.length; i++) {
				const nonce = deriveChunkNonce(baseNonce, i);
				plainChunks.push(await decryptChunk(cipherChunks[i], fileKey, algo, nonce));
			}
			const reconstructed = new Uint8Array(plainChunks.reduce((n, c) => n + c.length, 0));
			off = 0;
			for (const c of plainChunks) {
				reconstructed.set(c, off);
				off += c.length;
			}

			expect(reconstructed).toEqual(original);
		});

		it('the hash check correctly REJECTS a file if even one chunk differs from what was uploaded', async () => {
			const chunkSize = 1024;
			const original = crypto.getRandomValues(new Uint8Array(chunkSize * 2));
			const fileKey = generateFileKey();
			const baseNonce = newBaseNonce();

			const cipherChunks: Uint8Array[] = [];
			for (let i = 0; i < 2; i++) {
				const chunk = original.slice(i * chunkSize, (i + 1) * chunkSize);
				cipherChunks.push(await encryptChunk(chunk, fileKey, algo, deriveChunkNonce(baseNonce, i)));
			}
			const uploadedCombined = new Uint8Array(cipherChunks.flatMap((c) => [...c]));
			const uploadHash = await sha256Hex(uploadedCombined);

			// Simulate storage returning a corrupted second chunk.
			const corrupted = [...cipherChunks];
			corrupted[1] = new Uint8Array(corrupted[1]);
			corrupted[1][0] ^= 0xff;
			const fetchedCombined = new Uint8Array(corrupted.flatMap((c) => [...c]));
			const downloadHash = await sha256Hex(fetchedCombined);

			expect(downloadHash).not.toBe(uploadHash);
		});
	}
);

describe('raw ciphertext export as a zip archive', () => {
	it('bundles ciphertext + manifest and both extract back out correctly', () => {
		const ciphertext = crypto.getRandomValues(new Uint8Array(256));
		const manifest = { fileId: 'abc-123', note: 'test manifest' };
		const manifestBytes = strToU8(JSON.stringify(manifest));

		const zipped = zipSync({ 'file.enc': ciphertext, 'manifest.json': manifestBytes }, { level: 0 });
		const unzipped = unzipSync(zipped);

		expect(unzipped['file.enc']).toEqual(ciphertext);
		expect(JSON.parse(strFromU8(unzipped['manifest.json']))).toEqual(manifest);
	});
});
