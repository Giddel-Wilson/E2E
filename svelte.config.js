import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// svelte.config.js runs in plain Node during `vite dev`/`vite build`, not
// inside the app itself, so this checks NODE_ENV directly rather than
// importing `dev` from $app/environment. Keeping CSP production-only
// preserves the original intent: it shouldn't risk interfering with
// Vite's dev-mode HMR for no real security benefit, since dev builds
// aren't what's exposed to the internet.
const isProd = process.env.NODE_ENV === 'production';

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
		},
		// CSP is defined here (not as a manually-built header string in
		// hooks.server.ts) specifically so SvelteKit can compute the correct
		// hash/nonce for its own inline hydration script on every page. That
		// script's content differs per page (it embeds that page's load
		// data), so a single hardcoded hash could never cover every route —
		// this is the one part of the CSP that has to be framework-managed.
		csp: isProd
			? {
					mode: 'auto',
					directives: {
						'default-src': ['self'],
						// 'wasm-unsafe-eval' (not the much broader 'unsafe-eval')
					// is required because libsodium-wrappers-sumo compiles a
					// WebAssembly module at runtime — used for both
					// ChaCha20-Poly1305 and Argon2id, so this is needed on
					// essentially every auth flow (Argon2id is the default
					// password-based KDF for wrapping the private key,
					// independent of which file-encryption algorithm a user
					// picked). 'wasm-unsafe-eval' permits WASM compilation
					// only — it does NOT enable eval()/new Function(), so it
					// doesn't reopen the XSS risk 'unsafe-eval' would.
					'script-src': ['self', 'wasm-unsafe-eval'],
						// 'unsafe-inline' kept for style-src: components use
						// inline style="" attributes for CSS-variable-driven
						// theming (e.g. dynamic strength-indicator colors)
						// rather than a compiled stylesheet. Tightening this
						// to hashes is a reasonable next step if that pattern
						// is replaced with class-based styling.
						'style-src': ['self', 'unsafe-inline'],
						'img-src': ['self', 'data:'],
						'connect-src': ['self'],
						'object-src': ['none'],
						'base-uri': ['self'],
						'frame-ancestors': ['none'],
						'form-action': ['self']
					}
				}
			: undefined
	}
};

export default config;
