import { getStore } from '@netlify/blobs';
import { env } from '$env/dynamic/private';

/** SHA-256 hex digest, server-side. WebCrypto is available globally in the Node 20 runtime. */
export async function sha256Hex(data: Uint8Array): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', data as BufferSource);
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Returns the 'files' blob store. Inside `netlify dev` or a deployed
 * Netlify Function, context (siteID/token) is auto-injected and no config
 * is needed. Running the Vite dev server directly (`bun dev`/`vite dev`)
 * has no such context, so we fall back to manually supplied credentials
 * from NETLIFY_SITE_ID / NETLIFY_AUTH_TOKEN when present.
 */
export function filesStore() {
	if (env.NETLIFY_SITE_ID && env.NETLIFY_AUTH_TOKEN) {
		return getStore({
			name: 'files',
			siteID: env.NETLIFY_SITE_ID,
			token: env.NETLIFY_AUTH_TOKEN
		});
	}
	return getStore('files');
}
