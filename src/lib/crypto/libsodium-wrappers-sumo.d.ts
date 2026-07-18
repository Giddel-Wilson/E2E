declare module 'libsodium-wrappers-sumo' {
	const sodium: {
		ready: Promise<void>;
		crypto_pwhash_SALTBYTES: number;
		crypto_pwhash_ALG_ARGON2ID13: number;
		crypto_pwhash(
			keyLength: number,
			password: string,
			salt: Uint8Array,
			opsLimit: number,
			memLimit: number,
			algorithm: number
		): Uint8Array;
		crypto_aead_chacha20poly1305_ietf_encrypt(
			message: Uint8Array,
			additionalData: Uint8Array | null,
			secretNonce: null,
			publicNonce: Uint8Array,
			key: Uint8Array
		): Uint8Array;
		crypto_aead_chacha20poly1305_ietf_decrypt(
			secretNonce: null,
			ciphertext: Uint8Array,
			additionalData: Uint8Array | null,
			publicNonce: Uint8Array,
			key: Uint8Array
		): Uint8Array;
	};
	export default sodium;
}
