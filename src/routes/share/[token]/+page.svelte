<script lang="ts">
	import { page } from '$app/state';
	import { ShieldCheck, Lock, Loader2, Download, AlertCircle, FileLock2 } from 'lucide-svelte';
	import {
		unwrapShareFileKey,
		shareRecordAsEncryptedFileRecord,
		type ShareRecord
	} from '$crypto/share-pipeline';
	import {
		downloadAndDecryptFile,
		decryptRecordMetadata,
		triggerBrowserDownload,
		type DecryptedMetadata
	} from '$crypto/download-pipeline';

	const token = page.params.token;

	let record = $state<ShareRecord | null>(null);
	let loadError = $state<string | null>(null);
	let loading = $state(true);

	let password = $state('');
	let unlocking = $state(false);
	let unlockError = $state<string | null>(null);
	let metadata = $state<DecryptedMetadata | null>(null);
	let fileKey = $state<Uint8Array | null>(null);

	let downloading = $state(false);
	let downloadError = $state<string | null>(null);
	let downloaded = $state(false);

	async function loadRecord() {
		try {
			const res = await fetch(`/api/share/${token}`);
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.message ?? 'This link is not available');
			}
			record = await res.json();
		} catch (e) {
			loadError = e instanceof Error ? e.message : 'This link is not available';
		} finally {
			loading = false;
		}
	}
	loadRecord();

	async function handleUnlock(e: Event) {
		e.preventDefault();
		if (!record) return;
		unlockError = null;
		unlocking = true;
		try {
			const key = await unwrapShareFileKey(record, password);
			const shared = shareRecordAsEncryptedFileRecord(record);
			const meta = await decryptRecordMetadata(shared, key);
			fileKey = key;
			metadata = meta;
		} catch (e) {
			unlockError = e instanceof Error ? e.message : 'Incorrect password';
		} finally {
			unlocking = false;
		}
	}

	async function handleDownload() {
		if (!record || !fileKey) return;
		downloadError = null;
		downloading = true;
		try {
			const shared = shareRecordAsEncryptedFileRecord(record);
			const { blob, metadata: meta } = await downloadAndDecryptFile(shared, fileKey, (i) =>
				fetch(`/api/share/${token}/chunks/${i}`)
			);
			triggerBrowserDownload(blob, meta?.name ?? 'decrypted-file');
			downloaded = true;
		} catch (e) {
			downloadError = e instanceof Error ? e.message : 'Download failed';
		} finally {
			downloading = false;
		}
	}
</script>

<svelte:head>
	<title>Shared file — EndToEnd Encrypt</title>
</svelte:head>

<div class="flex min-h-dvh items-center justify-center bg-[var(--color-bg)] px-6 py-12 text-[var(--color-text-primary)]">
	<div class="w-full max-w-sm space-y-6">
		<div class="flex items-center gap-2">
			<ShieldCheck class="h-5 w-5" style="color: var(--color-accent)" aria-hidden="true" />
			<span class="font-semibold tracking-tight">EndToEnd Encrypt</span>
		</div>

		{#if loading}
			<div class="flex items-center gap-2 text-sm text-[var(--color-text-tertiary)]">
				<Loader2 class="h-4 w-4 animate-spin" aria-hidden="true" />
				Loading…
			</div>
		{:else if loadError}
			<div
				class="flex items-start gap-2 rounded-[var(--radius-md)] border px-3 py-2.5 text-sm"
				style="border-color: var(--color-danger); background: var(--color-danger-bg); color: var(--color-danger);"
			>
				<AlertCircle class="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
				{loadError}
			</div>
		{:else if !metadata}
			<div>
				<h1 class="text-xl font-semibold tracking-tight">A file has been shared with you</h1>
				<p class="mt-1 text-sm text-[var(--color-text-tertiary)]">
					This link is encrypted end-to-end — the name and content stay hidden until you enter the
					correct password.
				</p>
			</div>

			<form class="space-y-3" onsubmit={handleUnlock}>
				<div class="space-y-1.5">
					<label for="share-password" class="text-sm font-medium text-[var(--color-text-secondary)]">Password</label>
					<input
						id="share-password"
						type="password"
						required
						bind:value={password}
						class="h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm outline-none focus:border-[var(--color-accent)]"
					/>
				</div>

				{#if unlockError}
					<div
						class="rounded-[var(--radius-md)] border px-3 py-2.5 text-sm"
						style="border-color: var(--color-danger); background: var(--color-danger-bg); color: var(--color-danger);"
						role="alert"
					>
						{unlockError}
					</div>
				{/if}

				<button
					type="submit"
					disabled={unlocking}
					class="flex h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-md)] font-medium cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
					style="background: var(--color-accent); color: var(--color-bg);"
				>
					{#if unlocking}
						<Loader2 class="h-4 w-4 animate-spin" aria-hidden="true" />
					{:else}
						<Lock class="h-4 w-4" aria-hidden="true" />
					{/if}
					Unlock
				</button>
			</form>
		{:else}
			<div class="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
				<div class="flex items-center gap-3">
					<FileLock2 class="h-5 w-5 shrink-0" style="color: var(--color-accent)" aria-hidden="true" />
					<div class="min-w-0">
						<p class="truncate font-medium">{metadata.name}</p>
						<p class="font-mono-data text-xs text-[var(--color-text-tertiary)]">
							{(metadata.size / 1024).toFixed(1)} KB
						</p>
					</div>
				</div>

				{#if downloadError}
					<div
						class="mt-4 rounded-[var(--radius-md)] border px-3 py-2.5 text-sm"
						style="border-color: var(--color-danger); background: var(--color-danger-bg); color: var(--color-danger);"
						role="alert"
					>
						{downloadError}
					</div>
				{/if}

				<button
					type="button"
					onclick={handleDownload}
					disabled={downloading}
					class="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-md)] font-medium cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
					style="background: var(--color-accent); color: var(--color-bg);"
				>
					{#if downloading}
						<Loader2 class="h-4 w-4 animate-spin" aria-hidden="true" />
						Decrypting…
					{:else}
						<Download class="h-4 w-4" aria-hidden="true" />
						{downloaded ? 'Download again' : 'Decrypt & download'}
					{/if}
				</button>
			</div>

			<p class="text-center text-xs text-[var(--color-text-tertiary)]">
				Decryption happens entirely in your browser — this site never sees the file's contents.
			</p>
		{/if}
	</div>
</div>
