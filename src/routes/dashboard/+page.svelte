<script lang="ts">
	import { FileLock2, Download, Share2, Trash2, KeyRound, Loader2, AlertCircle, PackageOpen } from 'lucide-svelte';
	import EncryptUploader from '$lib/components/EncryptUploader.svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import ShareModal from '$lib/components/ShareModal.svelte';
	import { keyStore } from '$lib/stores/key-store.svelte';
	import {
		unwrapRecordFileKey,
		decryptRecordMetadata,
		downloadAndDecryptFile,
		downloadRawCiphertext,
		triggerBrowserDownload,
		type EncryptedFileRecord,
		type DecryptedMetadata
	} from '$crypto/download-pipeline';

	let { data } = $props();

	let files = $state<EncryptedFileRecord[]>([]);
	$effect(() => {
		files = data.files ?? [];
	});
	// Decrypted filename/size/mime per file id, filled in as each unlocks.
	let decrypted = $state<Record<string, DecryptedMetadata | 'error'>>({});
	let downloadingId = $state<string | null>(null);
	let downloadingRawId = $state<string | null>(null);
	let deletingId = $state<string | null>(null);
	let downloadError = $state<string | null>(null);

	async function refreshFiles() {
		const res = await fetch('/api/files');
		if (res.ok) files = (await res.json()).files;
	}

	async function decryptAllMetadata() {
		if (!keyStore.privateKey) return;
		for (const f of files) {
			if (decrypted[f.id]) continue;
			try {
				const fileKey = await unwrapRecordFileKey(f, keyStore.privateKey);
				decrypted[f.id] = (await decryptRecordMetadata(f, fileKey)) ?? 'error';
			} catch {
				decrypted[f.id] = 'error';
			}
		}
	}

	// Re-decrypt whenever the file list changes or the key unlocks/locks.
	$effect(() => {
		files;
		keyStore.isUnlocked;
		decryptAllMetadata();
	});

	async function handleDownload(record: EncryptedFileRecord) {
		if (!keyStore.privateKey) return;
		downloadError = null;
		downloadingId = record.id;
		try {
			const fileKey = await unwrapRecordFileKey(record, keyStore.privateKey);
			const { blob, metadata } = await downloadAndDecryptFile(record, fileKey);
			triggerBrowserDownload(blob, metadata?.name ?? 'decrypted-file');
		} catch (e) {
			downloadError = e instanceof Error ? e.message : 'Download failed';
		} finally {
			downloadingId = null;
		}
	}

	/** Downloads verified ciphertext + a decryption manifest, without ever decrypting locally. */
	async function handleDownloadRaw(record: EncryptedFileRecord) {
		downloadError = null;
		downloadingRawId = record.id;
		try {
			const { archive } = await downloadRawCiphertext(record);
			const meta = decrypted[record.id];
			const baseName = meta && meta !== 'error' ? meta.name : record.id;
			triggerBrowserDownload(archive, `${baseName}.enc.zip`);
		} catch (e) {
			downloadError = e instanceof Error ? e.message : 'Download failed';
		} finally {
			downloadingRawId = null;
		}
	}

	let pendingDelete = $state<EncryptedFileRecord | null>(null);
	let sharingRecord = $state<EncryptedFileRecord | null>(null);

	function requestDelete(record: EncryptedFileRecord) {
		pendingDelete = record;
	}

	function cancelDelete() {
		if (deletingId) return; // don't dismiss mid-delete
		pendingDelete = null;
	}

	async function confirmDelete() {
		if (!pendingDelete) return;
		const record = pendingDelete;
		deletingId = record.id;
		downloadError = null;
		try {
			const res = await fetch(`/api/files/${record.id}`, { method: 'DELETE' });
			if (!res.ok) throw new Error('Failed to delete file');
			await refreshFiles();
			pendingDelete = null;
		} catch (e) {
			downloadError = e instanceof Error ? e.message : 'Delete failed';
		} finally {
			deletingId = null;
		}
	}

	function formatSize(bytes: number) {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	function formatDate(iso: string | undefined) {
		if (!iso) return 'unknown date';
		return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
	}
</script>

<svelte:head>
	<title>EndToEnd Encrypt — Vault</title>
</svelte:head>

<div class="min-h-dvh bg-[var(--color-bg)] text-[var(--color-text-primary)]">
	<AppHeader />

	<main class="mx-auto max-w-5xl px-6 py-10 space-y-10">
		<section>
			<h1 class="text-xl font-semibold tracking-tight">Encrypt &amp; upload</h1>
			<p class="mt-1 text-sm text-[var(--color-text-tertiary)]">
				Files are encrypted in your browser before anything leaves your device.
			</p>
			<div class="mt-6 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
				{#if keyStore.isUnlocked && keyStore.publicKey && keyStore.keyAlgo}
					<EncryptUploader
						recipientPublicKey={keyStore.publicKey}
						recipientKeyAlgo={keyStore.keyAlgo}
						onUploaded={refreshFiles}
					/>
				{:else}
					<div class="flex items-center gap-3 text-sm text-[var(--color-text-tertiary)]">
						<KeyRound class="h-5 w-5 shrink-0" aria-hidden="true" />
						<span>
							Your key is locked for this session.
							<a href="/settings/keys?next=/dashboard" class="underline" style="color: var(--color-accent)">Unlock it</a>
							to start encrypting and uploading.
						</span>
					</div>
				{/if}
			</div>
		</section>

		<section>
			<h2 class="text-lg font-semibold tracking-tight">Your files</h2>

			{#if downloadError}
				<div
					class="mt-4 flex items-start gap-2 rounded-[var(--radius-md)] border px-3 py-2.5 text-sm"
					style="border-color: var(--color-danger); background: var(--color-danger-bg); color: var(--color-danger);"
					role="alert"
				>
					<AlertCircle class="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
					{downloadError}
				</div>
			{/if}

			<ul class="mt-4 divide-y divide-[var(--color-border)] rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]">
				{#each files as f (f.id)}
					{@const meta = decrypted[f.id]}
					<li class="flex items-center justify-between gap-4 px-5 py-4">
						<div class="flex items-center gap-3 min-w-0">
							<FileLock2 class="h-4 w-4 shrink-0" style="color: var(--color-text-tertiary)" aria-hidden="true" />
							<div class="min-w-0">
								{#if meta === 'error'}
									<p class="truncate text-sm font-medium text-[var(--color-danger)]">Could not decrypt name</p>
								{:else if meta}
									<p class="truncate text-sm font-medium">{meta.name}</p>
									<p class="font-mono-data text-xs text-[var(--color-text-tertiary)]">
										{f.fileAlgo} · {formatSize(meta.size)} · {formatDate(f.createdAt)}
									</p>
								{:else}
									<p class="truncate text-sm font-medium text-[var(--color-text-tertiary)]">
										{keyStore.isUnlocked ? 'Decrypting…' : 'Locked — unlock your key to view'}
									</p>
								{/if}
							</div>
						</div>
						<div class="flex items-center gap-1.5 shrink-0">
							<button
								onclick={() => handleDownload(f)}
								disabled={!keyStore.isUnlocked || downloadingId === f.id}
								class="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
								aria-label="Download and decrypt {meta && meta !== 'error' ? meta.name : 'file'}"
								title="Download & decrypt"
							>
								{#if downloadingId === f.id}
									<Loader2 class="h-4 w-4 animate-spin" aria-hidden="true" />
								{:else}
									<Download class="h-4 w-4" aria-hidden="true" />
								{/if}
							</button>
							<button
								onclick={() => handleDownloadRaw(f)}
								disabled={downloadingRawId === f.id}
								class="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
								aria-label="Download encrypted copy of {meta && meta !== 'error' ? meta.name : 'file'}"
								title="Download encrypted (.zip: ciphertext + manifest) — stays encrypted, no key needed to fetch it"
							>
								{#if downloadingRawId === f.id}
									<Loader2 class="h-4 w-4 animate-spin" aria-hidden="true" />
								{:else}
									<PackageOpen class="h-4 w-4" aria-hidden="true" />
								{/if}
							</button>
							<button
								onclick={() => (sharingRecord = f)}
								disabled={!keyStore.isUnlocked}
								class="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
								aria-label="Share {meta && meta !== 'error' ? meta.name : 'file'}"
								title="Create share link"
							>
								<Share2 class="h-4 w-4" aria-hidden="true" />
							</button>
							<button
								onclick={() => requestDelete(f)}
								disabled={deletingId === f.id}
								class="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
								aria-label="Delete {meta && meta !== 'error' ? meta.name : 'file'}"
								title="Delete"
							>
								{#if deletingId === f.id}
									<Loader2 class="h-4 w-4 animate-spin" aria-hidden="true" />
								{:else}
									<Trash2 class="h-4 w-4" aria-hidden="true" />
								{/if}
							</button>
						</div>
					</li>
				{:else}
					<li class="px-5 py-10 text-center text-sm text-[var(--color-text-tertiary)]">
						No files yet — drag one above to get started.
					</li>
				{/each}
			</ul>
		</section>
	</main>
</div>

<ConfirmModal
	open={pendingDelete !== null}
	title="Delete this file?"
	description={pendingDelete
		? `"${decrypted[pendingDelete.id] && decrypted[pendingDelete.id] !== 'error' ? (decrypted[pendingDelete.id] as DecryptedMetadata).name : 'This file'}" will be permanently deleted, including its stored ciphertext. This can't be undone.`
		: ''}
	confirmLabel={deletingId ? 'Deleting…' : 'Delete'}
	cancelLabel="Cancel"
	danger
	busy={deletingId !== null}
	onConfirm={confirmDelete}
	onCancel={cancelDelete}
/>

{#if keyStore.privateKey}
	<ShareModal
		open={sharingRecord !== null}
		record={sharingRecord}
		ownerPrivateKey={keyStore.privateKey}
		onClose={() => (sharingRecord = null)}
	/>
{/if}
