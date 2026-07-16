import adapter from '@sveltejs/adapter-netlify';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({
			// Standard Node-based Netlify Functions, NOT Edge Functions.
			// Netlify's Edge runtime is Deno-based and can't run
			// @node-rs/argon2 (native binary) or libsodium-wrappers-sumo,
			// both of which need a full Node runtime.
			edge: false,
			split: false
		}),
		alias: {
			$crypto: 'src/lib/crypto',
			$server: 'src/lib/server'
		}
	}
};

export default config;
