import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
	const res = await fetch('/api/files');
	const { files } = res.ok ? await res.json() : { files: [] };
	return { files };
};
