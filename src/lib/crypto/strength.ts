import { kdfStrengthScore } from './kdf';
import type { FileAlgo, KdfParams, KeyAlgo, StrengthRating } from './types';

const FILE_ALGO_BITS: Record<FileAlgo, number> = {
	'AES-GCM': 256,
	'ChaCha20-Poly1305': 256
};

const KEY_ALGO_BITS: Record<KeyAlgo, number> = {
	'RSA-OAEP': 4096, // modulus length, not directly comparable to symmetric bits
	'ECDH-P256': 256 // ~128-bit security level, included for transparency
};

/**
 * Combines file-cipher strength, key-wrap strength, and (optionally) KDF
 * strength into a single 0-100 score shown as the visual strength
 * indicator during encryption. This is informational only — it never
 * gates whether an upload proceeds.
 */
export function computeStrengthRating(
	fileAlgo: FileAlgo,
	keyAlgo: KeyAlgo,
	kdfParams?: KdfParams
): StrengthRating {
	const reasons: string[] = [];

	let score = 50; // both supported file ciphers are 256-bit AEAD, solid baseline
	reasons.push(`${fileAlgo} (256-bit, authenticated)`);

	if (keyAlgo === 'RSA-OAEP') {
		score += 15;
		reasons.push('RSA-OAEP 4096-bit key wrap');
	} else {
		score += 18; // ECDH P-256 + AES-GCM wrap is comparably strong with smaller keys
		reasons.push('ECDH P-256 key wrap (ECIES-style)');
	}

	if (kdfParams) {
		const kdfScore = kdfStrengthScore(kdfParams);
		score += Math.round(kdfScore * 0.25);
		reasons.push(
			kdfParams.kdf === 'Argon2id'
				? `Argon2id (${kdfParams.memoryKib / 1024} MiB, t=${kdfParams.iterations})`
				: `PBKDF2-SHA256 (${kdfParams.iterations.toLocaleString()} iterations)`
		);
	}

	score = Math.max(0, Math.min(100, score));

	const label: StrengthRating['label'] =
		score >= 85 ? 'strong' : score >= 70 ? 'good' : score >= 50 ? 'fair' : 'weak';

	return {
		score,
		label,
		bits: FILE_ALGO_BITS[fileAlgo] + (kdfParams ? 0 : 0),
		reasons
	};
}

export function strengthColorVar(label: StrengthRating['label']): string {
	switch (label) {
		case 'strong':
			return 'var(--color-strength-strong)';
		case 'good':
			return 'var(--color-strength-good)';
		case 'fair':
			return 'var(--color-strength-fair)';
		default:
			return 'var(--color-strength-weak)';
	}
}
