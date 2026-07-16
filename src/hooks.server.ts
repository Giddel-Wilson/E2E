import type { Handle } from '@sveltejs/kit';
import { readSessionCookie } from '$server/auth-server';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = await readSessionCookie(event.cookies);
	return resolve(event);
};
