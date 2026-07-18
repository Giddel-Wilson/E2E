import { and, eq, gt, sql } from 'drizzle-orm';
import { db, accessLogs } from './db';

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_FAILED_ATTEMPTS = 8;

/**
 * Counts failed login attempts from an IP in the trailing window, using
 * the existing access_logs table rather than a separate in-memory store
 * — serverless functions don't share memory across invocations, so an
 * in-process counter would silently reset on every cold start. This
 * covers both wrong-password attempts on real accounts and attempts
 * against emails that don't exist (both get logged the same way).
 */
export async function recentFailedLoginCount(ipAddress: string): Promise<number> {
	const since = new Date(Date.now() - WINDOW_MS);
	const [row] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(accessLogs)
		.where(
			and(
				eq(accessLogs.ipAddress, ipAddress),
				eq(accessLogs.action, 'DECRYPT_ATTEMPT'),
				eq(accessLogs.success, false),
				gt(accessLogs.createdAt, since)
			)
		);
	return row?.count ?? 0;
}

export const LOGIN_RATE_LIMIT = { windowMinutes: WINDOW_MS / 60_000, maxAttempts: MAX_FAILED_ATTEMPTS };
