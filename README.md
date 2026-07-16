# EndToEnd Encrypt

Secure file storage and sharing with client-side encryption. Files are
encrypted **in the browser** before a single byte leaves the device — the
server, the database, and blob storage only ever hold ciphertext.

## Stack

- SvelteKit 5 (Svelte 5 runes) + TypeScript
- Tailwind CSS v4
- Neon Postgres (serverless driver, `drizzle-orm`)
- Netlify Blobs (ciphertext storage) + Netlify Functions (`adapter-netlify`)
- WebCrypto (AES-GCM, RSA-OAEP, ECDH-P256, PBKDF2) + libsodium-wrappers-sumo (ChaCha20-Poly1305, Argon2id)

## Encryption model

| Layer | Options | Where |
|---|---|---|
| File content | AES-256-GCM, ChaCha20-Poly1305 | browser, per-chunk (4 MiB) |
| Key wrapping | RSA-OAEP (4096-bit), ECDH (P-256, ECIES-style) | browser |
| Password-based | PBKDF2-SHA256 (600k iter), Argon2id (64 MiB, t=3) | browser, used for share links + private-key wrapping |

Every file gets a fresh random 256-bit symmetric key. That key is wrapped
under the recipient's public key (RSA-OAEP or ECDH) before upload — the
server stores only the wrapped (ciphertext) key. Filenames and MIME types
are encrypted into `file_metadata` separately, so the server is
**metadata-blind**, not just content-blind. See inline comments in
`src/lib/server/db/schema.ts` for the full data-model rationale.

## Project layout

```
src/lib/crypto/         client-side encryption primitives (never imported server-side)
  file-encryption.ts     AES-GCM / ChaCha20-Poly1305, chunked
  key-encryption.ts       RSA-OAEP / ECDH-P256 key wrapping
  kdf.ts                  PBKDF2 / Argon2id
  password-wrap.ts        share-link password wrapping
  strength.ts              UI strength-indicator scoring
  upload-pipeline.ts       orchestrates encrypt -> chunk -> upload

src/lib/server/db/        Drizzle schema + Neon client
src/routes/api/files/     upload / download / share endpoints (ciphertext only)
src/lib/components/       EncryptUploader.svelte, StrengthIndicator.svelte
```

## Setup

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL, BLOB_READ_WRITE_TOKEN, SESSION_SECRET
npm run db:push        # push schema to Neon
npm run dev
```

## Deploy to Netlify

1. Install the CLI if you don't have it: `bun add -g netlify-cli`
2. `netlify link` (or `netlify init` for a brand new site) from the project root.
3. Add env vars in Site configuration → Environment variables: `DATABASE_URL`, `SESSION_SECRET`. No blob token needed — Netlify Blobs auto-provisions per-site storage with zero manual config.
4. For local dev, run `netlify dev` instead of `bun dev` — it wraps Vite and injects the Netlify context (including Blobs access) automatically.
5. `netlify deploy --prod`. `adapter-netlify` ships routes as standard Node-runtime Netlify Functions (not Edge Functions — the native `@node-rs/argon2` binary and `libsodium-wrappers-sumo` both need full Node). Large-file uploads stay within per-invocation limits because the client streams encrypted chunks (4 MiB) rather than one large request.

Netlify Blobs are private by default (unlike Vercel Blob's public-URL model), so ciphertext is only ever readable through your own authenticated `/api/files/[id]/download` route — worth keeping in mind once that route is built out.

## Auth & key flow (now wired up)

- `/register` — generates an RSA-OAEP or ECDH keypair in-browser, derives an Argon2id wrapping key from the chosen password, encrypts the private key with it, and submits `{publicKeyJwk, wrappedPrivateKey, ...}` alongside a normal Argon2id auth-password hash (`@node-rs/argon2`, server-side). Sets an HttpOnly JWT session cookie (`jose`).
- `/login` — verifies the auth password server-side, then the response carries the *wrapped* private key back to the browser, which re-derives the same Argon2id key from the password just typed and unwraps it locally.
- `src/lib/stores/key-store.svelte.ts` — holds the unlocked `CryptoKey` objects in memory only, for the current tab. Refreshing the page locks it again by design; `/settings/keys` re-unlocks by re-fetching wrapped material from `/api/auth/keys` and re-deriving the key from a re-entered password.
- `src/hooks.server.ts` — verifies the session cookie on every request and populates `locals.user`; `src/routes/dashboard/+layout.server.ts` (and `settings/+layout.server.ts`) redirect to `/login` if absent.

Note the two distinct secrets per user, both from the same password but never interchangeable: the **auth verifier** (`authHash`, plain Argon2id hash the server can check) and the **key-wrapping key** (derived independently in-browser via `crypto/kdf.ts`, never sent to the server). A leaked `authHash` lets someone log in; it does not let them decrypt anything.

## Not yet wired up (left as next steps)

- `src/routes/share/[token]` — public share-link page (password prompt → `unwrapKeyWithPassword` → decrypt)
- Chunk reassembly/decryption helper mirroring `upload-pipeline.ts` for downloads
- `src/routes/dashboard/+page.ts` — client load function that fetches file list + decrypts `file_metadata` blobs with `keyStore.privateKey`
- `src/routes/dashboard/logs/+page.svelte` — access-log viewer (table over `access_logs`)
