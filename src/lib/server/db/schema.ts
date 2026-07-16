import {
	pgTable,
	uuid,
	text,
	timestamp,
	bigint,
	jsonb,
	boolean,
	integer,
	pgEnum,
	index
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const fileAlgoEnum = pgEnum('file_algo', ['AES-GCM', 'ChaCha20-Poly1305']);
export const keyAlgoEnum = pgEnum('key_algo', ['RSA-OAEP', 'ECDH-P256']);
export const kdfAlgoEnum = pgEnum('kdf_algo', ['PBKDF2', 'Argon2id']);
export const accessActionEnum = pgEnum('access_action', [
	'UPLOAD',
	'DOWNLOAD',
	'DECRYPT_ATTEMPT',
	'SHARE_CREATE',
	'SHARE_REVOKE',
	'DELETE',
	'VIEW_METADATA'
]);

// ---------------------------------------------------------------------------
// Users
// Note: the server stores only a public key (for RSA-OAEP/ECDH key wrapping)
// and an Argon2id/PBKDF2 verifier for auth. It never stores a private key,
// a master encryption key, or plaintext file keys.
// ---------------------------------------------------------------------------

export const users = pgTable('users', {
	id: uuid('id').defaultRandom().primaryKey(),
	email: text('email').notNull().unique(),
	displayName: text('display_name').notNull(),

	// Auth verifier only (Argon2id hash of the login password). This is
	// NEVER the same secret used to derive file encryption keys.
	authHash: text('auth_hash').notNull(),
	authSalt: text('auth_salt').notNull(),
	authKdf: kdfAlgoEnum('auth_kdf').notNull().default('Argon2id'),

	// Public half of the user's asymmetric keypair, used by senders to wrap
	// a per-file symmetric key for this recipient. Generated client-side;
	// the matching private key never leaves the browser unencrypted.
	publicKeyJwk: jsonb('public_key_jwk').notNull(),
	keyAlgo: keyAlgoEnum('key_algo').notNull().default('RSA-OAEP'),

	// The private key, itself encrypted client-side with a key derived from
	// the user's password (Argon2id/PBKDF2), stored only so it can sync
	// across the user's own devices. Server cannot decrypt it.
	wrappedPrivateKey: text('wrapped_private_key').notNull(),
	wrappedPrivateKeyIv: text('wrapped_private_key_iv').notNull(),
	privateKeyKdf: kdfAlgoEnum('private_key_kdf').notNull().default('Argon2id'),
	privateKeyKdfParams: jsonb('private_key_kdf_params').notNull(),

	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	lastLoginAt: timestamp('last_login_at', { withTimezone: true })
});

// ---------------------------------------------------------------------------
// encrypted_files
// The raw ciphertext blob lives in object storage (Vercel Blob / S3); this
// row tracks the storage pointer plus everything needed to reproduce the
// decryption pipeline. No field here can reconstruct plaintext on its own.
// ---------------------------------------------------------------------------

export const encryptedFiles = pgTable(
	'encrypted_files',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		ownerId: uuid('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),

		// Pointer to ciphertext in blob storage — server streams bytes,
		// never holds full file in memory, never inspects content.
		storageKey: text('storage_key').notNull(),
		storageProvider: text('storage_provider').notNull().default('vercel-blob'),
		ciphertextSizeBytes: bigint('ciphertext_size_bytes', { mode: 'number' }).notNull(),

		// File content encryption
		fileAlgo: fileAlgoEnum('file_algo').notNull(),
		fileIv: text('file_iv').notNull(), // base64, 96-bit nonce
		fileAuthTag: text('file_auth_tag'), // base64, separate when not appended to ciphertext
		chunked: boolean('chunked').notNull().default(true),
		chunkSizeBytes: integer('chunk_size_bytes').notNull().default(4194304), // 4 MiB

		// Per-file symmetric key, wrapped (encrypted) for the owner under
		// their public key. Server only ever sees ciphertext of this key.
		wrappedFileKey: text('wrapped_file_key').notNull(),
		keyAlgo: keyAlgoEnum('key_algo').notNull(),

		// SHA-256 of ciphertext, computed client-side, used for integrity
		// verification on download before the browser attempts decryption.
		ciphertextSha256: text('ciphertext_sha256').notNull(),

		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		deletedAt: timestamp('deleted_at', { withTimezone: true })
	},
	(t) => ({
		ownerIdx: index('encrypted_files_owner_idx').on(t.ownerId),
		createdIdx: index('encrypted_files_created_idx').on(t.createdAt)
	})
);

// ---------------------------------------------------------------------------
// file_metadata
// Filename, mime type, etc. are themselves encrypted client-side — the
// server is metadata-blind by design, not just content-blind.
// ---------------------------------------------------------------------------

export const fileMetadata = pgTable('file_metadata', {
	fileId: uuid('file_id')
		.primaryKey()
		.references(() => encryptedFiles.id, { onDelete: 'cascade' }),

	// AES-GCM/ChaCha20 ciphertext of a JSON blob: { name, mimeType, size, ext }
	encryptedBlob: text('encrypted_blob').notNull(),
	iv: text('iv').notNull(),
	algo: fileAlgoEnum('algo').notNull(),

	// Encryption-strength indicator surfaced in the UI, derived from the
	// algorithm + key length combination chosen at upload time. Computed
	// client-side at encrypt time, never trusted as a security control.
	strengthScore: integer('strength_score').notNull(), // 0-100
	strengthLabel: text('strength_label').notNull() // weak | fair | good | strong
});

// ---------------------------------------------------------------------------
// share_links
// Recipient-less link sharing: file key is re-wrapped under a key derived
// from a password the recipient must supply (PBKDF2/Argon2id), so the
// server still never holds a usable key.
// ---------------------------------------------------------------------------

export const shareLinks = pgTable('share_links', {
	id: uuid('id').defaultRandom().primaryKey(),
	fileId: uuid('file_id')
		.notNull()
		.references(() => encryptedFiles.id, { onDelete: 'cascade' }),
	token: text('token').notNull().unique(), // URL-safe nanoid, lookup handle only

	wrappedFileKey: text('wrapped_file_key').notNull(),
	kdf: kdfAlgoEnum('kdf').notNull().default('Argon2id'),
	kdfSalt: text('kdf_salt').notNull(),
	kdfParams: jsonb('kdf_params').notNull(),
	wrapIv: text('wrap_iv').notNull(),

	maxDownloads: integer('max_downloads'),
	downloadCount: integer('download_count').notNull().default(0),
	expiresAt: timestamp('expires_at', { withTimezone: true }),
	revokedAt: timestamp('revoked_at', { withTimezone: true }),

	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// ---------------------------------------------------------------------------
// access_logs
// Append-only audit trail. Logs actions and outcomes, never key material.
// ---------------------------------------------------------------------------

export const accessLogs = pgTable(
	'access_logs',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		fileId: uuid('file_id').references(() => encryptedFiles.id, { onDelete: 'set null' }),
		actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
		shareToken: text('share_token'),

		action: accessActionEnum('action').notNull(),
		success: boolean('success').notNull().default(true),
		failureReason: text('failure_reason'),

		ipAddress: text('ip_address'),
		userAgent: text('user_agent'),

		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => ({
		fileIdx: index('access_logs_file_idx').on(t.fileId),
		createdIdx: index('access_logs_created_idx').on(t.createdAt)
	})
);
