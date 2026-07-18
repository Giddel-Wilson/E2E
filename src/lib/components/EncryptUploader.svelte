<script lang="ts">
	import { ShieldCheck, UploadCloud, Lock, Loader2 } from 'lucide-svelte';
	import StrengthIndicator from './StrengthIndicator.svelte';
	import { computeStrengthRating } from '$crypto/strength';
	import { encryptAndUploadFile, type UploadProgress } from '$crypto/upload-pipeline';
	import type { FileAlgo, KeyAlgo } from '$crypto/types';
	import { MAX_FILE_SIZE_BYTES, formatBytes } from '$lib/shared/limits';

	// recipientKeyAlgo is NOT a free choice — it must match the actual
	// algorithm of recipientPublicKey (RSA-OAEP vs ECDH use incompatible
	// math), so it's a required prop derived from the account's real
	// keypair rather than a selector in this component.
	let {
		recipientPublicKey,
		recipientKeyAlgo,
		onUploaded
	}: {
		recipientPublicKey: CryptoKey;
		recipientKeyAlgo: KeyAlgo;
		onUploaded?: (fileId: string) => void;
	} = $props();

	let isDragging = $state(false);
	let fileAlgo = $state<FileAlgo>('AES-GCM');
	let progress = $state<UploadProgress | null>(null);
	let errorMsg = $state<string | null>(null);
	let fileInput: HTMLInputElement;

	const rating = $derived(computeStrengthRating(fileAlgo, recipientKeyAlgo));

	async function handleFiles(files: FileList | null) {
		if (!files || files.length === 0) return;
		const file = files[0];
		errorMsg = null;

		if (file.size > MAX_FILE_SIZE_BYTES) {
			errorMsg = `File is ${formatBytes(file.size)}, which is over the ${formatBytes(MAX_FILE_SIZE_BYTES)} limit.`;
			return;
		}

		try {
			const result = await encryptAndUploadFile({
				file,
				recipientPublicKey,
				choice: { fileAlgo, keyAlgo: recipientKeyAlgo },
				onProgress: (p) => (progress = p)
			});
			onUploaded?.(result.fileId);
			setTimeout(() => (progress = null), 1200);
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Encryption or upload failed';
			progress = null;
		}
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		isDragging = false;
		handleFiles(e.dataTransfer?.files ?? null);
	}
</script>

<div class="space-y-5">
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
		<fieldset class="space-y-2">
			<legend class="text-sm font-medium text-[var(--color-text-secondary)]">File encryption</legend>
			<div class="flex gap-2" role="radiogroup" aria-label="File encryption algorithm">
				{#each ['AES-GCM', 'ChaCha20-Poly1305'] as algo (algo)}
					<button
						type="button"
						role="radio"
						aria-checked={fileAlgo === algo}
						onclick={() => (fileAlgo = algo as FileAlgo)}
						class="min-h-11 flex-1 rounded-[var(--radius-md)] border px-3 py-2 text-sm font-mono-data transition-colors duration-150 cursor-pointer"
						style="
							border-color: {fileAlgo === algo ? 'var(--color-accent)' : 'var(--color-border)'};
							background: {fileAlgo === algo ? 'var(--color-accent-bg)' : 'var(--color-surface-2)'};
							color: {fileAlgo === algo ? 'var(--color-accent)' : 'var(--color-text-secondary)'};
						"
					>
						{algo}
					</button>
				{/each}
			</div>
		</fieldset>

		<div class="space-y-2">
			<p class="text-sm font-medium text-[var(--color-text-secondary)]">Key encryption</p>
			<div
				class="flex min-h-11 items-center gap-2 rounded-[var(--radius-md)] border px-3 py-2 text-sm font-mono-data"
				style="border-color: var(--color-border); background: var(--color-surface-2); color: var(--color-text-secondary);"
			>
				<Lock class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
				{recipientKeyAlgo === 'ECDH-P256' ? 'ECDH (P-256)' : recipientKeyAlgo}
				<span class="ml-auto text-xs text-[var(--color-text-tertiary)]">from your account key</span>
			</div>
		</div>
	</div>

	<StrengthIndicator {rating} />

	<!-- Drop zone -->
	<button
		type="button"
		class="group relative flex w-full flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border-2 border-dashed px-6 py-14 text-center cursor-pointer transition-[border-color,background-color] duration-200"
		style="
			border-color: {isDragging ? 'var(--color-accent)' : 'var(--color-border)'};
			background: {isDragging ? 'var(--color-accent-bg)' : 'var(--color-surface)'};
		"
		ondragover={(e) => {
			e.preventDefault();
			isDragging = true;
		}}
		ondragleave={() => (isDragging = false)}
		ondrop={onDrop}
		onclick={() => fileInput.click()}
		aria-label="Drag and drop a file here, or click to choose a file to encrypt and upload"
	>
		<input
			bind:this={fileInput}
			type="file"
			class="sr-only"
			onchange={(e) => handleFiles((e.target as HTMLInputElement).files)}
		/>

		{#if progress}
			<Loader2 class="h-9 w-9 animate-spin" style="color: var(--color-accent)" aria-hidden="true" />
			<div class="w-full max-w-xs space-y-1.5">
				<p class="font-mono-data text-sm text-[var(--color-text-secondary)]">
					{progress.phase === 'encrypting' ? 'Encrypting in your browser…' : progress.phase === 'uploading' ? 'Uploading ciphertext…' : 'Done'}
				</p>
				<div class="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-3)]">
					<div
						class="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-300"
						style="width: {progress.percent}%; transition-timing-function: var(--ease-standard);"
					></div>
				</div>
			</div>
		{:else}
			<div
				class="flex h-14 w-14 items-center justify-center rounded-full transition-transform duration-200 group-hover:scale-105"
				style="background: var(--color-accent-bg);"
			>
				<UploadCloud class="h-6 w-6" style="color: var(--color-accent)" aria-hidden="true" />
			</div>
			<div>
				<p class="font-medium">Drop a file to encrypt &amp; upload</p>
				<p class="mt-1 text-sm text-[var(--color-text-tertiary)]">
					Encrypted entirely in your browser — we never see the plaintext or your keys.
				</p>
			</div>
			<div class="flex items-center gap-1.5 text-xs text-[var(--color-text-tertiary)]">
				<Lock class="h-3.5 w-3.5" aria-hidden="true" />
				<span>Zero-knowledge upload · up to {formatBytes(MAX_FILE_SIZE_BYTES)}</span>
			</div>
		{/if}
	</button>

	{#if errorMsg}
		<div
			class="flex items-start gap-2 rounded-[var(--radius-md)] border px-3 py-2.5 text-sm"
			style="border-color: var(--color-danger); background: var(--color-danger-bg); color: var(--color-danger);"
			role="alert"
		>
			{errorMsg}
		</div>
	{/if}

	{#if progress?.phase === 'done'}
		<div
			class="flex items-center gap-2 rounded-[var(--radius-md)] border px-3 py-2.5 text-sm"
			style="border-color: var(--color-accent); background: var(--color-accent-bg); color: var(--color-accent);"
		>
			<ShieldCheck class="h-4 w-4" aria-hidden="true" />
			Encrypted and uploaded successfully.
		</div>
	{/if}
</div>
