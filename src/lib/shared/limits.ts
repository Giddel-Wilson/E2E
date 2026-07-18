/**
 * Hard cap on individual file size, enforced on both the client (before
 * encryption starts) and the server (at upload init, defense in depth).
 * Chunking means there's no *technical* ceiling, but an unbounded size
 * is an easy abuse/cost vector on serverless compute + blob storage.
 */
export const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
