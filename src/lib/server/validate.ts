import { error } from '@sveltejs/kit';
import type { ZodSchema } from 'zod';

/** Parses `body` against `schema`; throws a SvelteKit 400 with the first validation issue on failure. */
export function parseBody<T>(schema: ZodSchema<T>, body: unknown): T {
	const result = schema.safeParse(body);
	if (!result.success) {
		const issue = result.error.issues[0];
		error(400, issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : 'Invalid request body');
	}
	return result.data;
}
