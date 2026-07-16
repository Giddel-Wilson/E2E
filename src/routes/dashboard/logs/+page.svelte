<script lang="ts">
	import { CheckCircle2, XCircle, ScrollText } from 'lucide-svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';

	let { data } = $props();

	const actionLabels: Record<string, string> = {
		UPLOAD: 'Upload',
		DOWNLOAD: 'Download',
		DECRYPT_ATTEMPT: 'Sign-in attempt',
		SHARE_CREATE: 'Share link created',
		SHARE_REVOKE: 'Share link revoked',
		DELETE: 'File deleted',
		VIEW_METADATA: 'Metadata viewed'
	};

	function formatDate(iso: string) {
		return new Date(iso).toLocaleString(undefined, {
			dateStyle: 'medium',
			timeStyle: 'short'
		});
	}
</script>

<svelte:head>
	<title>Access logs — EndToEnd Encrypt</title>
</svelte:head>

<div class="min-h-dvh bg-[var(--color-bg)] text-[var(--color-text-primary)]">
	<AppHeader />

	<main class="mx-auto max-w-5xl px-6 py-10">
		<h1 class="text-xl font-semibold tracking-tight">Access logs</h1>
		<p class="mt-1 text-sm text-[var(--color-text-tertiary)]">
			Every upload, download, share, and sign-in attempt tied to your account. This is an
			append-only audit trail — it records what happened, never your keys or file content.
		</p>

		<div class="mt-6 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]">
			{#if data.logs.length === 0}
				<div class="flex flex-col items-center gap-2 px-5 py-14 text-center text-sm text-[var(--color-text-tertiary)]">
					<ScrollText class="h-6 w-6" aria-hidden="true" />
					No activity yet.
				</div>
			{:else}
				<ul class="divide-y divide-[var(--color-border)]">
					{#each data.logs as log (log.id)}
						<li class="flex items-center justify-between gap-4 px-5 py-3.5">
							<div class="flex items-center gap-3 min-w-0">
								{#if log.success}
									<CheckCircle2 class="h-4 w-4 shrink-0" style="color: var(--color-accent)" aria-hidden="true" />
								{:else}
									<XCircle class="h-4 w-4 shrink-0" style="color: var(--color-danger)" aria-hidden="true" />
								{/if}
								<div class="min-w-0">
									<p class="text-sm font-medium">
										{actionLabels[log.action] ?? log.action}
										{#if !log.success && log.failureReason}
											<span class="font-mono-data text-xs text-[var(--color-danger)]"> · {log.failureReason}</span>
										{/if}
									</p>
									{#if log.fileId}
										<p class="font-mono-data text-xs text-[var(--color-text-tertiary)]">file {log.fileId.slice(0, 8)}…</p>
									{/if}
								</div>
							</div>
							<div class="shrink-0 text-right">
								<p class="text-xs text-[var(--color-text-tertiary)]">{formatDate(log.createdAt)}</p>
								{#if log.ipAddress}
									<p class="font-mono-data text-xs text-[var(--color-text-tertiary)]">{log.ipAddress}</p>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</main>
</div>
