# EndToEnd Encrypt

Secure file storage and sharing with client-side encryption. Files are
encrypted **in the browser** before a single byte leaves the device — the
server, the database, and blob storage only ever hold ciphertext.

## Stack

- SvelteKit 5 (Svelte 5 runes) + TypeScript
- Tailwind CSS v4
- Neon Postgres (serverless driver, `drizzle-orm`)
- Render (Node web service, `adapter-node`) + Backblaze B2 (S3-compatible ciphertext storage)
- WebCrypto (AES-GCM, RSA-OAEP, ECDH-P256, PBKDF2) + libsodium-wrappers-sumo (ChaCha20-Poly1305, Argon2id)
- Zod (request validation) · Vitest (crypto round-trip tests)

## Encryption model

| Layer | Options | Where |
|---|---|---|
| File content | AES-256-GCM, ChaCha20-Poly1305 | browser, per-chunk (4 MiB) |
| Key wrapping | RSA-OAEP (4096-bit), ECDH (P-256, ECIES-style) | browser |
| Password-based | PBKDF2-SHA256 (600k iter), Argon2id (64 MiB, t=3) | browser, used for share links + private-key wrapping |

Every file gets a fresh random 256-bit symmetric key. That key is wrapped
under the owner's public key (RSA-OAEP or ECDH) before upload — the server
stores only the wrapped (ciphertext) key. Filenames and MIME types are
encrypted into `file_metadata` separately, so the server is
**metadata-blind**, not just content-blind. See inline comments in
`src/lib/server/db/schema.ts` for the full data-model rationale.

Two distinct secrets come from the same login password but are never
interchangeable: the **auth verifier** (`authHash`, a plain Argon2id hash
the server can check) and the **key-wrapping key** (derived independently
in-browser via `crypto/kdf.ts`, never sent to the server). A leaked
`authHash` lets someone log in; it does not let them decrypt anything.

## Security features

- **Rate limiting** — login lockout after 8 failed attempts from one IP in
  15 minutes (`src/lib/server/rate-limit.ts`), backed by the DB rather than
  in-memory state, so it actually works across stateless serverless
  invocations.
- **Input validation** — every API route that accepts client JSON validates
  it against a Zod schema (`src/lib/server/schemas.ts`) before touching the
  database.
- **Security headers** — CSP, X-Frame-Options, X-Content-Type-Options,
  Referrer-Policy, Permissions-Policy, and HSTS, applied in production only
  (`src/hooks.server.ts` — gated off in dev so Vite's HMR websocket isn't
  broken by CSP).
- **File size cap** — 500 MB, enforced both client-side (before encryption
  starts) and server-side (defense in depth) — see `src/lib/shared/limits.ts`.
- **Ownership checks everywhere** — every file/share/chunk route verifies
  the requesting user actually owns the resource before acting on it,
  including share-link revocation (a real gap that existed briefly during
  development — a revoke request now must also match the file's owner, not
  just the token).
- **Mandatory integrity verification** — download refuses to proceed if a
  file's ciphertext hash is missing, rather than silently skipping the
  check (this exact gap once let a corrupted upload through undetected).
- **Write-then-read verification on every chunk upload** — the server
  reads back what it just stored and compares it against what the client
  sent, *before* acknowledging the chunk as successful. A same-request
  "the write call didn't throw" check only proves blob storage accepted
  the bytes, not that it durably stored the same bytes — this closes that
  gap immediately, while the original file is still available to retry
  with, instead of only surfacing as a broken download later.
- **Password change** — always re-verifies the current password
  server-side and re-wraps the private key client-side; the server never
  sees a usable private key at any point (`/settings/account`).

## Project layout

```
src/lib/crypto/            client-side encryption primitives (never imported server-side)
  file-encryption.ts        AES-GCM / ChaCha20-Poly1305, chunked
  key-encryption.ts         RSA-OAEP / ECDH-P256 key wrapping
  kdf.ts                    PBKDF2 / Argon2id
  password-wrap.ts          share-link password wrapping
  private-key.ts            wrap/unwrap/re-wrap the private key
  strength.ts                UI strength-indicator scoring
  upload-pipeline.ts         orchestrates encrypt -> chunk -> upload
  download-pipeline.ts       orchestrates fetch -> verify -> decrypt (and raw ciphertext export)
  share-pipeline.ts          password-based share-link wrap/unwrap
  __tests__/                 Vitest round-trip + tamper/wrong-key tests

src/lib/server/             server-only helpers (DB, auth, rate limiting, validation)
src/lib/shared/limits.ts    constants safe to import from both client and server
src/routes/api/files/       upload / list / chunks / share / delete (all ciphertext-only)
src/routes/api/share/       public, unauthenticated share-link endpoints
src/routes/share/[token]/   public share-link landing page (password prompt, no account needed)
src/lib/components/         EncryptUploader, StrengthIndicator, ConfirmModal, ShareModal, AppHeader
```

## Setup

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL, SESSION_SECRET
npm run db:push        # push schema to Neon
npm run dev
npm test                # crypto round-trip tests (24 tests, no DB needed)
npm run check           # svelte-check — type errors across the whole app
```

## Deploy to Vercel

1. **Backblaze B2** (storage): sign up at backblaze.com (no card required for private buckets) → create a bucket, set it **Private** → Account → Application Keys → **Add a New Application Key**, scoped to that bucket → gives you `B2_KEY_ID` and `B2_APPLICATION_KEY`. The bucket's details page shows its **Endpoint** (e.g. `s3.us-west-004.backblazeb2.com`) and region code (e.g. `us-west-004`).
2. **Vercel**: import the GitHub repo at vercel.com/new. `vercel.json` + `adapter-vercel` in `svelte.config.js` are already set up — Vercel auto-detects the SvelteKit framework preset.
3. Add env vars in Project Settings → Environment Variables: `DATABASE_URL`, `SESSION_SECRET`, and the five `B2_*` values from step 1. No `ORIGIN`/`ADDRESS_HEADER`/`BODY_SIZE_LIMIT` needed — those were specific to the previous `adapter-node`/Render setup; `adapter-vercel` already knows how to read client IPs and request origin correctly on Vercel's own infrastructure.
4. For local dev, `npm run dev` works as normal — Backblaze B2 needs no platform-specific wrapper, just the same env vars everywhere.
5. Push to `main` (or run `vercel --prod`) to deploy.

**Why chunks are 2 MiB, not 4 MiB** (`crypto/types.ts`): Vercel Functions have a hard, non-configurable 4.5MB limit on both request and response bodies. Chunks travel as base64-in-JSON (see "why base64" below), which adds ~33% overhead — 4 MiB chunks would encode to ~5.3MB and get rejected with `413: FUNCTION_PAYLOAD_TOO_LARGE` on every single upload and download. 2 MiB chunks encode to ~2.7MB, comfortably under the limit.

Backblaze B2 buckets are private by default, so ciphertext is only ever readable through your own authenticated routes, never a guessable public link.

## Auth & key flow

- `/register` — generates an RSA-OAEP or ECDH keypair in-browser, derives an Argon2id wrapping key from the chosen password, encrypts the private key with it, and submits `{publicKeyJwk, wrappedPrivateKey, ...}` alongside a normal Argon2id auth-password hash (`@node-rs/argon2`, server-side). Sets an HttpOnly JWT session cookie (`jose`).
- `/login` — rate-limited; verifies the auth password server-side, then the response carries the *wrapped* private key back to the browser, which re-derives the same Argon2id key from the password just typed and unwraps it locally.
- `/settings/account` — change password: requires the current password again (the in-memory key is intentionally non-extractable, so this can't be skipped), re-wraps the private key client-side, and updates both the auth hash and wrapped key server-side in one request.
- `src/lib/stores/key-store.svelte.ts` — holds the unlocked `CryptoKey` objects in memory only, for the current tab. Refreshing the page locks it again by design; `/settings/keys` re-unlocks by re-fetching wrapped material from `/api/auth/keys` and re-deriving the key from a re-entered password.
- `src/hooks.server.ts` — verifies the session cookie on every request, populates `locals.user`, and applies security headers in production.

**Cross-device access, and what's actually stored where:** the auth hash *and* the wrapped (still-encrypted) private key both live in Neon — nothing account-related is tied to a specific browser or device. Logging in from any device fetches the same wrapped private key and unwraps it locally. The one thing that's *never* stored anywhere — not in Neon, not in `localStorage`, nowhere — is the password itself or the key derived from it via Argon2id; that has to be recomputed fresh from the password on every device, every session, by design. If that computation ever produces different results for the same password on two different machines/environments, that's a bug in the Argon2id derivation path (e.g. a mismatched `libsodium-wrappers-sumo` version between environments), not a storage/architecture issue.

## Download & decrypt

- `GET /api/files` — lists the current user's files: wrapped keys, IVs, and encrypted metadata blobs only, never plaintext.
- `GET /api/files/[id]/chunks/[index]` — streams back one ciphertext chunk from blob storage, ownership-checked.
- `DELETE /api/files/[id]` — soft-deletes the row and best-effort cleans up blob chunks.
- `src/lib/crypto/download-pipeline.ts` — unwraps the file key, fetches every chunk, verifies the ciphertext SHA-256 before touching plaintext (hard failure if the hash is missing, not a silent skip), decrypts, and hands back a `Blob`. Also exports `downloadRawCiphertext()`, which bundles the ciphertext plus a decryption manifest into a single `.zip` (via `fflate`), without ever decrypting locally.
- The dashboard decrypts each file's name/size client-side as soon as your key is unlocked. Each row has four actions: download & decrypt, download encrypted (raw `.enc` + manifest), share, delete (behind a real confirmation modal, not `window.confirm`).

## Sharing

- Owner side: `ShareModal.svelte` unwraps the file's real key with the owner's private key, re-wraps it under a share password (Argon2id), and posts the wrapped copy to `POST /api/files/[id]/share`. The server never sees the share password or the underlying file key. Links can have an expiry and/or a max-download count, and are listed/revocable from the same modal.
- Recipient side: `/share/[token]` needs no account. It fetches public metadata (`GET /api/share/[token]`, still zero-knowledge — the filename is encrypted and only appears after the correct password unwraps it), then the recipient enters the share password, which re-derives the wrapping key and unwraps the file key entirely client-side. Download count increments once per completed download (on the first chunk fetched), not once per chunk.

## Testing

`npm test` runs Vitest against the crypto primitives directly (no DB, no
server needed) — round-trip encryption for both AES-GCM and
ChaCha20-Poly1305, RSA-OAEP and ECDH key wrapping, PBKDF2/Argon2id
determinism, and password-wrap round-trips. Each suite also asserts that
decryption **fails** with a tampered ciphertext or the wrong key — the
tests that matter most for a security-focused project are the negative
ones, not just the happy path.

## Known gaps / possible next steps

- No automated integration tests against a real Postgres/Blobs instance (the Vitest suite covers crypto correctness only, not the API routes)
- No email verification or password-reset flow
- Share links only support password-based access, not per-recipient public-key sharing (though the schema/crypto primitives for that exist and could be added — see `wrapFileKeyRsa`/`wrapFileKeyEcdh` in `key-encryption.ts`)
- CSP uses `'unsafe-inline'` for styles (see comment in `hooks.server.ts`) because several components use inline `style=""` for CSS-variable-driven theming; tightening this to nonces is possible but not done here
