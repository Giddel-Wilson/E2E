import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { env } from '$env/dynamic/private';
import * as schema from './schema';

if (!env.DATABASE_URL) {
	throw new Error('DATABASE_URL is not set. Add it in Vercel project env vars or .env');
}

const sql = neon(env.DATABASE_URL);

export const db = drizzle(sql, { schema });
export * from './schema';
