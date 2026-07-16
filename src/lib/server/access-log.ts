import { db, accessLogs } from './db';
import type { InferInsertModel } from 'drizzle-orm';

type LogEntry = Omit<InferInsertModel<typeof accessLogs>, 'id' | 'createdAt'>;

/** Appends an audit log row. Never pass key material, plaintext, or passwords here. */
export async function logAccess(entry: LogEntry) {
	await db.insert(accessLogs).values(entry);
}
