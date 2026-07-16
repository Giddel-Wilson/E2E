import { getStore } from '@netlify/blobs';
import { env } from '$env/dynamic/private';

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
