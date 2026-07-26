import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({
			runtime: 'nodejs20.x',
			// Encryption happens client-side; uploads/downloads are streamed
			// in 2 MiB chunks (see crypto/types.ts), so each invocation
			// stays well under Vercel's 4.5MB request/response body limit.
			memory: 1024,
			maxDuration: 60
		}),
		alias: {
			$crypto: 'src/lib/crypto',
			$server: 'src/lib/server'
		}
	}
};

export default config;
