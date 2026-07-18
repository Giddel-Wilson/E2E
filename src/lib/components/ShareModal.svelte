<script lang="ts">
	import { Loader2, Copy, Check, Trash2, Link2 } from 'lucide-svelte';
	import { createShareLink } from '$crypto/share-pipeline';
	import type { EncryptedFileRecord } from '$crypto/download-pipeline';

	let {
		open,
		record,
		ownerPrivateKey,
		onClose
	}: {
		open: boolean;
		record: EncryptedFileRecord | null;
		ownerPrivateKey: CryptoKey;
		onClose: () => void;
	} = $props();

	interface ShareLinkRow {
		id: string;
		token: string;
		maxDownloads: number | null;
		downloadCount: number;
		expiresAt: string | null;
		revokedAt: string | null;
		createdAt: string;
	}

	let password = $state('');
	let confirmPassword = $state('');
	let expiryDays = $state<number | ''>('');
	let maxDownloads = $state<number | ''>('');
	let busy = $state(false);
	let errorMsg = $state<string | null>(null);
	let createdUrl = $state<string | null>(null);
	let copied = $state(false);
	let links = $state<ShareLinkRow[]>([]);
	let revokingToken = $state<string | null>(null);

	async function loadLinks() {
		if (!record) return;
		const res = await fetch(`/api/files/${record.id}/share`);
		if (res.ok) links = (await res.json()).links;
	}

	$effect(() => {
		if (open && record) {
			createdUrl = null;
			password = '';
			confirmPassword = '';
			errorMsg = null;
			loadLinks();
		}
	});

	async function handleCreate(e: Event) {
		e.preventDefault();
		if (!record) return;
		errorMsg = null;

		if (password.length < 8) {
			errorMsg = 'Share password must be at least 8 characters.';
			return;
		}
		if (password !== confirmPassword) {
			errorMsg = 'Passwords do not match.';
			return;
		}

		busy = true;
		try {
			const expiresAt =
				expiryDays === '' ? null : new Date(Date.now() + Number(expiryDays) * 86_400_000).toISOString();
			const result = await createShareLink(record, ownerPrivateKey, password, {
				maxDownloads: maxDownloads === '' ? null : Number(maxDownloads),
				expiresAt
			});
			createdUrl = `${window.location.origin}${result.url}`;
			password = '';
			confirmPassword = '';
			await loadLinks();
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Failed to create share link';
		} finally {
			busy = false;
		}
	}

	async function copyLink() {
		if (!createdUrl) return;
		await navigator.clipboard.writeText(createdUrl);
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}

	async function revoke(token: string) {
		if (!record) return;
		revokingToken = token;
		try {
			await fetch(`/api/files/${record.id}/share?token=${encodeURIComponent(token)}`, { method: 'DELETE' });
			await loadLinks();
		} finally {
			revokingToken = null;
		}
	}

	function linkStatus(link: ShareLinkRow): { label: string; active: boolean } {
		if (link.revokedAt) return { label: 'Revoked', active: false };
		if (link.expiresAt && new Date(link.expiresAt) < new Date()) return { label: 'Expired', active: false };
		if (link.maxDownloads !== null && link.downloadCount >= link.maxDownloads) {
			return { label: 'Limit reached', active: false };
		}
		return { label: 'Active', active: true };
	}
</script>

{#if open && record}
	<div class="fixed inset-0 z-50 flex items-center justify-center px-4">
		<button
			type="button"
			class="absolute inset-0 bg-black/70 cursor-default"
			style="backdrop-filter: blur(2px);"
			aria-label="Close dialog"
			onclick={onClose}
		></button>

		<div
			role="dialog"
			aria-modal="true"
			class="relative w-full max-w-md rounded-[var(--radius-lg)] border p-6 shadow-2xl max-h-[85vh] overflow-y-auto"
			style="border-color: var(--color-border-strong); background: var(--color-surface-2);"
		>
			<div class="flex items-center gap-2">
				<Link2 class="h-4.5 w-4.5" style="color: var(--color-accent)" aria-hidden="true" />
				<h2 class="font-semibold tracking-tight">Share link</h2>
			</div>
			<p class="mt-1.5 text-sm text-[var(--color-text-secondary)]">
				Anyone with the link and this password can decrypt the file. Choose a password you'll
				share through a different channel than the link itself.
			</p>

			{#if createdUrl}
				<div class="mt-5 space-y-2">
					<p class="text-sm font-medium text-[var(--color-text-secondary)]">Link created</p>
					<div class="flex items-center gap-2">
						<input
							readonly
							value={createdUrl}
							class="h-10 flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 font-mono-data text-xs"
						/>
						<button
							type="button"
							onclick={copyLink}
							class="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] cursor-pointer hover:border-[var(--color-border-strong)]"
							aria-label="Copy link"
						>
							{#if copied}
								<Check class="h-4 w-4" style="color: var(--color-accent)" aria-hidden="true" />
							{:else}
								<Copy class="h-4 w-4" aria-hidden="true" />
							{/if}
						</button>
					</div>
					<p class="text-xs text-[var(--color-text-tertiary)]">
						This is the only time the link is shown here in full — it's also listed (without the
						password) below.
					</p>
					<button
						type="button"
						onclick={() => (createdUrl = null)}
						class="text-xs underline cursor-pointer"
						style="color: var(--color-accent)"
					>
						Create another link
					</button>
				</div>
			{:else}
				<form class="mt-5 space-y-3" onsubmit={handleCreate}>
					<div class="space-y-1.5">
						<label for="share-password" class="text-sm font-medium text-[var(--color-text-secondary)]">
							Share password
						</label>
						<input
							id="share-password"
							type="password"
							required
							minlength="8"
							bind:value={password}
							class="h-10 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm outline-none focus:border-[var(--color-accent)]"
						/>
					</div>
					<div class="space-y-1.5">
						<label for="share-password-confirm" class="text-sm font-medium text-[var(--color-text-secondary)]">
							Confirm password
						</label>
						<input
							id="share-password-confirm"
							type="password"
							required
							bind:value={confirmPassword}
							class="h-10 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm outline-none focus:border-[var(--color-accent)]"
						/>
					</div>
					<div class="grid grid-cols-2 gap-3">
						<div class="space-y-1.5">
							<label for="expiry" class="text-sm font-medium text-[var(--color-text-secondary)]">Expires (days)</label>
							<input
								id="expiry"
								type="number"
								min="1"
								placeholder="Never"
								bind:value={expiryDays}
								class="h-10 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm outline-none focus:border-[var(--color-accent)]"
							/>
						</div>
						<div class="space-y-1.5">
							<label for="max-downloads" class="text-sm font-medium text-[var(--color-text-secondary)]">Max downloads</label>
							<input
								id="max-downloads"
								type="number"
								min="1"
								placeholder="Unlimited"
								bind:value={maxDownloads}
								class="h-10 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm outline-none focus:border-[var(--color-accent)]"
							/>
						</div>
					</div>

					{#if errorMsg}
						<div
							class="rounded-[var(--radius-md)] border px-3 py-2.5 text-sm"
							style="border-color: var(--color-danger); background: var(--color-danger-bg); color: var(--color-danger);"
							role="alert"
						>
							{errorMsg}
						</div>
					{/if}

					<button
						type="submit"
						disabled={busy}
						class="flex h-10 w-full items-center justify-center gap-2 rounded-[var(--radius-md)] text-sm font-medium cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
						style="background: var(--color-accent); color: var(--color-bg);"
					>
						{#if busy}<Loader2 class="h-4 w-4 animate-spin" aria-hidden="true" />{/if}
						Create link
					</button>
				</form>
			{/if}

			{#if links.length > 0}
				<div class="mt-6 border-t border-[var(--color-border)] pt-4">
					<p class="text-sm font-medium text-[var(--color-text-secondary)]">Existing links</p>
					<ul class="mt-2 space-y-2">
						{#each links as link (link.id)}
							{@const status = linkStatus(link)}
							<li class="flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2">
								<div class="min-w-0">
									<p class="font-mono-data text-xs truncate">{link.token.slice(0, 12)}…</p>
									<p class="text-xs text-[var(--color-text-tertiary)]">
										<span style="color: {status.active ? 'var(--color-accent)' : 'var(--color-text-tertiary)'}">{status.label}</span>
										· {link.downloadCount}{link.maxDownloads ? `/${link.maxDownloads}` : ''} downloads
									</p>
								</div>
								{#if status.active}
									<button
										type="button"
										onclick={() => revoke(link.token)}
										disabled={revokingToken === link.token}
										class="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
										aria-label="Revoke this link"
									>
										{#if revokingToken === link.token}
											<Loader2 class="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
										{:else}
											<Trash2 class="h-3.5 w-3.5" aria-hidden="true" />
										{/if}
									</button>
								{/if}
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			<div class="mt-6 flex justify-end">
				<button
					type="button"
					onclick={onClose}
					class="flex h-10 items-center rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 text-sm font-medium text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)] cursor-pointer"
				>
					Close
				</button>
			</div>
		</div>
	</div>
{/if}
