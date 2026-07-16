import { json } from '@sveltejs/kit';
import { eq, desc } from 'drizzle-orm';
import { db, accessLogs } from '$server/db';
import { requireUser } from '$server/auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url }) => {
	const user = requireUser(locals);
	const limit = Math.min(Number(url.searchParams.get('limit') ?? '50'), 200);

	const rows = await db
		.select({
			id: accessLogs.id,
			fileId: accessLogs.fileId,
			action: accessLogs.action,
			success: accessLogs.success,
			failureReason: accessLogs.failureReason,
			ipAddress: accessLogs.ipAddress,
			userAgent: accessLogs.userAgent,
			createdAt: accessLogs.createdAt
		})
		.from(accessLogs)
		.where(eq(accessLogs.actorId, user.id))
		.orderBy(desc(accessLogs.createdAt))
		.limit(limit);

	return json({ logs: rows });
};
