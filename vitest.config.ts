import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		alias: {
			$crypto: '/src/lib/crypto',
			$server: '/src/lib/server',
			$lib: '/src/lib'
		}
	},
	test: {
		environment: 'node',
		include: ['src/**/*.test.ts']
	}
});
