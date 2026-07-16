import { error } from '@sveltejs/kit';

export interface SessionUser {
	id: string;
	email: string;
}

/**
 * Reads the authenticated user attached to locals by hooks.server.ts
 * (which verifies the session JWT cookie). Throws 401 if absent.
 */
export function requireUser(locals: App.Locals): SessionUser {
	if (!locals.user) error(401, 'Authentication required');
	return locals.user;
}
