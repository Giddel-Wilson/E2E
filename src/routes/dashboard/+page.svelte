<script lang="ts">
	import { FileLock2, Download, Share2, Trash2, KeyRound } from 'lucide-svelte';
	import EncryptUploader from '$lib/components/EncryptUploader.svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import { keyStore } from '$lib/stores/key-store.svelte';

	let { data } = $props();
	// `data.files` shape is illustrative; in the real load function
	// (+page.ts, client-side) raw encryptedBlob/iv are fetched from the API
	// and decrypted in-browser with keyStore.privateKey — the SSR layer
	// never touches plaintext filenames either.
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
				{#if keyStore.isUnlocked && keyStore.publicKey}
					<EncryptUploader recipientPublicKey={keyStore.publicKey} />
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
			<ul class="mt-4 divide-y divide-[var(--color-border)] rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]">
				{#each data?.files ?? [] as f (f.id)}
					<li class="flex items-center justify-between gap-4 px-5 py-4">
						<div class="flex items-center gap-3 min-w-0">
							<FileLock2 class="h-4 w-4 shrink-0" style="color: var(--color-text-tertiary)" aria-hidden="true" />
							<div class="min-w-0">
								<p class="truncate text-sm font-medium">{f.encryptedName}</p>
								<p class="font-mono-data text-xs text-[var(--color-text-tertiary)]">
									{f.fileAlgo} · {f.sizeLabel} · {f.createdAtLabel}
								</p>
							</div>
						</div>
						<div class="flex items-center gap-1.5 shrink-0">
							<button
								class="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] cursor-pointer"
								aria-label="Download and decrypt {f.encryptedName}"
							>
								<Download class="h-4 w-4" aria-hidden="true" />
							</button>
							<button
								class="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] cursor-pointer"
								aria-label="Create share link for {f.encryptedName}"
							>
								<Share2 class="h-4 w-4" aria-hidden="true" />
							</button>
							<button
								class="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] cursor-pointer"
								aria-label="Delete {f.encryptedName}"
							>
								<Trash2 class="h-4 w-4" aria-hidden="true" />
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
