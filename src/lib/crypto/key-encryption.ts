import { RSA_MODULUS_LENGTH, type KeyAlgo, type WrappedKey } from './types';

// ---------------------------------------------------------------------------
// Keypair generation (client-side only; private key never sent to server
// in plaintext — see crypto/private-key.ts for password-wrapping it)
// ---------------------------------------------------------------------------

export async function generateRsaKeypair(): Promise<CryptoKeyPair> {
	return crypto.subtle.generateKey(
		{
			name: 'RSA-OAEP',
			modulusLength: RSA_MODULUS_LENGTH,
			publicExponent: new Uint8Array([1, 0, 1]),
			hash: 'SHA-256'
		},
		true,
		['encrypt', 'decrypt']
	);
}

export async function generateEcdhKeypair(): Promise<CryptoKeyPair> {
	return crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
		'deriveKey',
		'deriveBits'
	]);
}

// ---------------------------------------------------------------------------
// Wrapping a per-file symmetric key under a recipient's public key
// ---------------------------------------------------------------------------

export async function wrapFileKeyRsa(fileKey: Uint8Array, recipientPublicKey: CryptoKey): Promise<WrappedKey> {
	const wrapped = await crypto.subtle.encrypt(
		{ name: 'RSA-OAEP' },
		recipientPublicKey,
		fileKey as BufferSource
	);
	return { wrapped: new Uint8Array(wrapped), algo: 'RSA-OAEP' };
}

export async function unwrapFileKeyRsa(wrapped: Uint8Array, privateKey: CryptoKey): Promise<Uint8Array> {
	const fileKey = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, wrapped as BufferSource);
	return new Uint8Array(fileKey);
}

/**
 * ECDH key wrapping: generate an ephemeral keypair, derive a shared secret
 * with the recipient's public key, use that as an AES-KW/AES-GCM key to
 * wrap the file key. The ephemeral public key travels alongside the
 * wrapped key so the recipient can redo the ECDH derivation.
 */
export async function wrapFileKeyEcdh(
	fileKey: Uint8Array,
	recipientPublicKey: CryptoKey
): Promise<WrappedKey> {
	const ephemeral = await generateEcdhKeypair();
	const sharedBits = await crypto.subtle.deriveBits(
		{ name: 'ECDH', public: recipientPublicKey },
		ephemeral.privateKey,
		256
	);
	const wrapKey = await crypto.subtle.importKey('raw', sharedBits, 'AES-GCM', false, ['encrypt']);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, wrapKey, fileKey as BufferSource);
	const ephemeralPublicKeyJwk = await crypto.subtle.exportKey('jwk', ephemeral.publicKey);

	return { wrapped: new Uint8Array(wrapped), algo: 'ECDH-P256', iv, ephemeralPublicKeyJwk };
}

export async function unwrapFileKeyEcdh(
	wrappedKey: WrappedKey,
	recipientPrivateKey: CryptoKey
): Promise<Uint8Array> {
	if (!wrappedKey.ephemeralPublicKeyJwk || !wrappedKey.iv) {
		throw new Error('Malformed ECDH-wrapped key: missing ephemeral public key or IV');
	}
	const ephemeralPublicKey = await crypto.subtle.importKey(
		'jwk',
		wrappedKey.ephemeralPublicKeyJwk,
		{ name: 'ECDH', namedCurve: 'P-256' },
		false,
		[]
	);
	const sharedBits = await crypto.subtle.deriveBits(
		{ name: 'ECDH', public: ephemeralPublicKey },
		recipientPrivateKey,
		256
	);
	const wrapKey = await crypto.subtle.importKey('raw', sharedBits, 'AES-GCM', false, ['decrypt']);
	const fileKey = await crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv: wrappedKey.iv as BufferSource },
		wrapKey,
		wrappedKey.wrapped as BufferSource
	);
	return new Uint8Array(fileKey);
}

export async function wrapFileKey(
	fileKey: Uint8Array,
	algo: KeyAlgo,
	recipientPublicKey: CryptoKey
): Promise<WrappedKey> {
	return algo === 'RSA-OAEP'
		? wrapFileKeyRsa(fileKey, recipientPublicKey)
		: wrapFileKeyEcdh(fileKey, recipientPublicKey);
}

export async function unwrapFileKey(
	wrappedKey: WrappedKey,
	privateKey: CryptoKey
): Promise<Uint8Array> {
	return wrappedKey.algo === 'RSA-OAEP'
		? unwrapFileKeyRsa(wrappedKey.wrapped, privateKey)
		: unwrapFileKeyEcdh(wrappedKey, privateKey);
}
