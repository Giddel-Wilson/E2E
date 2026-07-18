import { deriveKey, DEFAULT_ARGON2ID_PARAMS } from './kdf';
import type { KdfParams } from './types';
import { toBase64, fromBase64 } from './index';

/**
 * Exports a private key to JWK, encrypts it with a key derived from the
 * user's password (Argon2id by default), and returns everything needed
 * to store it server-side. The server only ever sees this ciphertext —
 * it cannot derive the wrapping key without the password.
 */
export async function wrapPrivateKey(
	privateKey: CryptoKey,
	password: string,
	kdfParams: KdfParams = DEFAULT_ARGON2ID_PARAMS
) {
	const jwk = await crypto.subtle.exportKey('jwk', privateKey);
	const plaintext = new TextEncoder().encode(JSON.stringify(jwk));

	const { key, salt } = await deriveKey(password, kdfParams);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const wrapKey = await crypto.subtle.importKey('raw', key as BufferSource, 'AES-GCM', false, ['encrypt']);
	const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, wrapKey, plaintext as BufferSource);

	return {
		wrappedPrivateKey: toBase64(new Uint8Array(ciphertext)),
		wrappedPrivateKeyIv: toBase64(iv),
		privateKeyKdf: kdfParams.kdf,
		privateKeyKdfParams: { ...kdfParams, salt: toBase64(salt) }
	};
}

/**
 * Reverses wrapPrivateKey: re-derives the wrapping key from the password
 * the user just typed, decrypts the JWK, and imports it as a non-
 * extractable CryptoKey held only in memory for this session.
 */
export async function unwrapPrivateKey(
	wrappedPrivateKey: string,
	wrappedPrivateKeyIv: string,
	password: string,
	kdfParams: KdfParams & { salt: string },
	algo: 'RSA-OAEP' | 'ECDH-P256'
): Promise<CryptoKey> {
	const salt = fromBase64(kdfParams.salt);
	const { key } = await deriveKey(password, kdfParams, salt);
	const unwrapKey = await crypto.subtle.importKey('raw', key as BufferSource, 'AES-GCM', false, ['decrypt']);

	const iv = fromBase64(wrappedPrivateKeyIv);
	const ciphertext = fromBase64(wrappedPrivateKey);

	let plaintext: ArrayBuffer;
	try {
		plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, unwrapKey, ciphertext as BufferSource);
	} catch {
		throw new Error('Incorrect password — could not unlock your private key');
	}

	const jwk = JSON.parse(new TextDecoder().decode(plaintext));

	return crypto.subtle.importKey(
		'jwk',
		jwk,
		algo === 'RSA-OAEP' ? { name: 'RSA-OAEP', hash: 'SHA-256' } : { name: 'ECDH', namedCurve: 'P-256' },
		false,
		algo === 'RSA-OAEP' ? ['decrypt'] : ['deriveBits']
	);
}

export async function importPublicKey(jwk: JsonWebKey, algo: 'RSA-OAEP' | 'ECDH-P256'): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		'jwk',
		jwk,
		algo === 'RSA-OAEP' ? { name: 'RSA-OAEP', hash: 'SHA-256' } : { name: 'ECDH', namedCurve: 'P-256' },
		true,
		algo === 'RSA-OAEP' ? ['encrypt'] : []
	);
}

/**
 * Change-password flow: decrypts the private key with the CURRENT
 * password and re-wraps it under the NEW one. The in-memory `keyStore`
 * key can't be reused here — it was imported non-extractable on purpose
 * (see unwrapPrivateKey), so re-wrapping always requires the current
 * password again. That's also just good practice: changing a password
 * should always require proving you know the current one.
 */
export async function reWrapPrivateKeyWithNewPassword(
	wrappedPrivateKey: string,
	wrappedPrivateKeyIv: string,
	currentPassword: string,
	currentKdfParams: KdfParams & { salt: string },
	newPassword: string,
	algo: 'RSA-OAEP' | 'ECDH-P256',
	newKdfParams: KdfParams = DEFAULT_ARGON2ID_PARAMS
) {
	const salt = fromBase64(currentKdfParams.salt);
	const { key } = await deriveKey(currentPassword, currentKdfParams, salt);
	const unwrapKey = await crypto.subtle.importKey('raw', key as BufferSource, 'AES-GCM', false, ['decrypt']);

	const iv = fromBase64(wrappedPrivateKeyIv);
	const ciphertext = fromBase64(wrappedPrivateKey);

	let plaintext: ArrayBuffer;
	try {
		plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, unwrapKey, ciphertext as BufferSource);
	} catch {
		throw new Error('Current password is incorrect');
	}

	const jwk = JSON.parse(new TextDecoder().decode(plaintext));

	// Re-import as extractable so wrapPrivateKey can export it again under
	// the new password. The non-extractable key used for normal app
	// operation (in keyStore) is untouched — this is a separate, one-off
	// key object that only exists for the duration of this function.
	const extractableKey = await crypto.subtle.importKey(
		'jwk',
		jwk,
		algo === 'RSA-OAEP' ? { name: 'RSA-OAEP', hash: 'SHA-256' } : { name: 'ECDH', namedCurve: 'P-256' },
		true,
		algo === 'RSA-OAEP' ? ['decrypt'] : ['deriveBits']
	);

	return wrapPrivateKey(extractableKey, newPassword, newKdfParams);
}
