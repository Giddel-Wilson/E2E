import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	optimizeDeps: {
		exclude: ['argon2-browser']
	},
	server: {
		// If 5173 is already taken (e.g. a stale dev server from an earlier
		// terminal), Vite's default behavior is to silently try the next
		// port instead. That's exactly what breaks `netlify dev`'s proxy —
		// it only ever forwards to 5173, so it fails with a vague "Could
		// not proxy request" instead of a clear "port in use" error. Fail
		// loudly here instead.
		strictPort: true
	},
	worker: {
		format: 'es'
	}
});
