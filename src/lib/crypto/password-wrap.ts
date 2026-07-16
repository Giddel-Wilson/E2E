import { deriveKey } from './kdf';
import type { KdfParams, PasswordWrappedKey } from './types';

/** Wraps a raw file key under a key derived from a share-link password. */
export async function wrapKeyWithPassword(
	fileKey: Uint8Array,
	password: string,
	kdfParams: KdfParams
): Promise<PasswordWrappedKey> {
	const { key, salt } = await deriveKey(password, kdfParams);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const cryptoKey = await crypto.subtle.importKey('raw', key as BufferSource, 'AES-GCM', false, ['encrypt']);
	const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, cryptoKey, fileKey as BufferSource);
	return { wrapped: new Uint8Array(wrapped), iv, salt, kdfParams };
}

export async function unwrapKeyWithPassword(
	payload: PasswordWrappedKey,
	password: string
): Promise<Uint8Array> {
	const { key } = await deriveKey(password, payload.kdfParams, payload.salt);
	const cryptoKey = await crypto.subtle.importKey('raw', key as BufferSource, 'AES-GCM', false, ['decrypt']);
	const fileKey = await crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv: payload.iv as BufferSource },
		cryptoKey,
		payload.wrapped as BufferSource
	);
	return new Uint8Array(fileKey);
}
