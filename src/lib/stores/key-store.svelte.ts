// Holds the user's unlocked CryptoKey objects for the lifetime of the tab
// only. Deliberately NOT persisted to localStorage/sessionStorage/cookies —
// losing it on refresh is the point: re-unlocking requires the password
// again, which is what keeps the private key off disk in plaintext form.

import type { KeyAlgo } from '$crypto/types';

interface UnlockedKeyState {
	privateKey: CryptoKey | null;
	publicKey: CryptoKey | null;
	publicKeyJwk: JsonWebKey | null;
	keyAlgo: KeyAlgo | null;
}

let state = $state<UnlockedKeyState>({
	privateKey: null,
	publicKey: null,
	publicKeyJwk: null,
	keyAlgo: null
});

export const keyStore = {
	get privateKey() {
		return state.privateKey;
	},
	get publicKey() {
		return state.publicKey;
	},
	get publicKeyJwk() {
		return state.publicKeyJwk;
	},
	get keyAlgo() {
		return state.keyAlgo;
	},
	get isUnlocked() {
		return state.privateKey !== null && state.publicKey !== null;
	},
	set(next: UnlockedKeyState) {
		state = next;
	},
	lock() {
		state = { privateKey: null, publicKey: null, publicKeyJwk: null, keyAlgo: null };
	}
};
