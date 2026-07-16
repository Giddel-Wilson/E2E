import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
	const res = await fetch('/api/access-logs');
	const { logs } = res.ok ? await res.json() : { logs: [] };
	return { logs };
};
