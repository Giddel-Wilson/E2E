import { z } from 'zod';

const keyAlgoSchema = z.enum(['RSA-OAEP', 'ECDH-P256']);
const fileAlgoSchema = z.enum(['AES-GCM', 'ChaCha20-Poly1305']);
const kdfAlgoSchema = z.enum(['PBKDF2', 'Argon2id']);
const base64Schema = z.string().min(1).max(50_000);

export const registerSchema = z.object({
	email: z.string().trim().toLowerCase().email().max(320),
	displayName: z.string().trim().min(1).max(80).optional(),
	password: z.string().min(12).max(256),
	publicKeyJwk: z.record(z.unknown()),
	keyAlgo: keyAlgoSchema,
	wrappedPrivateKey: base64Schema,
	wrappedPrivateKeyIv: base64Schema,
	privateKeyKdf: kdfAlgoSchema,
	privateKeyKdfParams: z.record(z.unknown())
});

export const loginSchema = z.object({
	email: z.string().trim().toLowerCase().email().max(320),
	password: z.string().min(1).max(256)
});

export const changePasswordSchema = z.object({
	currentPassword: z.string().min(1).max(256),
	newPassword: z.string().min(12).max(256),
	wrappedPrivateKey: base64Schema,
	wrappedPrivateKeyIv: base64Schema,
	privateKeyKdf: kdfAlgoSchema,
	privateKeyKdfParams: z.record(z.unknown())
});

export const uploadInitSchema = z.object({
	action: z.literal('init'),
	fileAlgo: fileAlgoSchema,
	keyAlgo: keyAlgoSchema,
	fileIv: base64Schema,
	wrappedFileKey: base64Schema,
	wrapIv: base64Schema.nullable().optional(),
	ephemeralPublicKeyJwk: z.record(z.unknown()).nullable().optional(),
	metadata: z.object({
		encryptedBlob: base64Schema,
		iv: base64Schema,
		algo: fileAlgoSchema,
		strengthScore: z.number().int().min(0).max(100),
		strengthLabel: z.enum(['weak', 'fair', 'good', 'strong'])
	}),
	totalChunks: z.number().int().min(1).max(100_000),
	ciphertextSizeBytesEstimate: z.number().int().min(0)
});

export const uploadFinalizeSchema = z.object({
	action: z.literal('finalize'),
	fileId: z.string().uuid(),
	ciphertextSha256: z.string().length(64)
});

export const shareCreateSchema = z.object({
	wrappedFileKey: base64Schema,
	kdf: kdfAlgoSchema,
	kdfSalt: base64Schema,
	kdfParams: z.record(z.unknown()),
	wrapIv: base64Schema,
	maxDownloads: z.number().int().min(1).max(10_000).nullable().optional(),
	expiresAt: z.string().datetime().nullable().optional()
});
