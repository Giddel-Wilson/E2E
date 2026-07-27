import sodium from 'libsodium-wrappers-sumo';

let readyPromise: Promise<typeof sodium> | null = null;

/** Lazily initializes libsodium-wrappers-sumo exactly once per session. */
export async function getSodium(): Promise<typeof sodium> {
	if (!readyPromise) {
		readyPromise = sodium.ready.then(() => {
			// TEMP DEBUG — remove after diagnosing dev/prod KDF discrepancy
			if (typeof window !== 'undefined') (window as any).__sodium = sodium;
			return sodium;
		});
	}
	return readyPromise;
}
