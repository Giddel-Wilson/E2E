import {
	S3Client,
	PutObjectCommand,
	GetObjectCommand,
	DeleteObjectCommand,
	NotFound
} from '@aws-sdk/client-s3';
import { env } from '$env/dynamic/private';

/** SHA-256 hex digest, server-side. WebCrypto is available globally in the Node 20 runtime. */
export async function sha256Hex(data: Uint8Array): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', data as BufferSource);
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function requireEnv(name: string): string {
	const value = env[name];
	if (!value) throw new Error(`${name} is not set — required for blob storage`);
	return value;
}

let cachedClient: S3Client | null = null;

function s3Client(): S3Client {
	if (cachedClient) return cachedClient;
	cachedClient = new S3Client({
		region: env.B2_REGION || 'us-west-004', // Backblaze doesn't use AWS regions, but the SDK requires a value — must match your bucket's actual region
		endpoint: requireEnv('B2_ENDPOINT'), // e.g. https://s3.us-west-004.backblazeb2.com
		credentials: {
			accessKeyId: requireEnv('B2_KEY_ID'),
			secretAccessKey: requireEnv('B2_APPLICATION_KEY')
		}
	});
	return cachedClient;
}

/**
 * Same shape as the Netlify Blobs store this replaced (.set/.get/.delete),
 * so every route calling filesStore() needed zero changes when the
 * underlying storage backend moved from Netlify Blobs to Backblaze B2 —
 * only this file's internals changed.
 */
export function filesStore() {
	const client = s3Client();
	const Bucket = requireEnv('B2_BUCKET_NAME');

	return {
		async set(key: string, data: ArrayBuffer): Promise<void> {
			await client.send(
				new PutObjectCommand({
					Bucket,
					Key: key,
					Body: new Uint8Array(data)
				})
			);
		},

		async get(key: string, _opts?: { type: 'arrayBuffer' }): Promise<ArrayBuffer | null> {
			try {
				const res = await client.send(new GetObjectCommand({ Bucket, Key: key }));
				if (!res.Body) return null;
				const bytes = await res.Body.transformToByteArray();
				return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
			} catch (err) {
				if (err instanceof NotFound) return null;
				// The S3 SDK sometimes surfaces a missing key as a generic error
				// with a 404 status rather than throwing NotFound directly,
				// depending on the provider — Backblaze's S3-compatible API
				// included. Treat either shape as "not found".
				if (
					typeof err === 'object' &&
					err !== null &&
					'$metadata' in err &&
					(err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404
				) {
					return null;
				}
				throw err;
			}
		},

		async delete(key: string): Promise<void> {
			await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
		}
	};
}
