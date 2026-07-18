import { json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { db } from '$server/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		await db.execute(sql`select 1`);
		return json({ status: 'ok', db: 'ok', time: new Date().toISOString() });
	} catch {
		return json({ status: 'error', db: 'unreachable', time: new Date().toISOString() }, { status: 503 });
	}
};
