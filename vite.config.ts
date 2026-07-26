import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	optimizeDeps: {
		exclude: ['argon2-browser']
	},
	server: {
		// Fail loudly if 5173 is already taken instead of silently trying
		// the next port — a silent port switch is a confusing thing to
		// debug later (e.g. any reverse proxy or tooling configured to
		// expect 5173 specifically would otherwise fail in a way that
		// looks unrelated to the actual cause).
		strictPort: true
	},
	worker: {
		format: 'es'
	}
});
