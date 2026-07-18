<script lang="ts">
	import { AlertTriangle } from 'lucide-svelte';

	let {
		open,
		title,
		description,
		confirmLabel = 'Confirm',
		cancelLabel = 'Cancel',
		danger = false,
		busy = false,
		onConfirm,
		onCancel
	}: {
		open: boolean;
		title: string;
		description: string;
		confirmLabel?: string;
		cancelLabel?: string;
		danger?: boolean;
		busy?: boolean;
		onConfirm: () => void;
		onCancel: () => void;
	} = $props();

	let confirmButton: HTMLButtonElement | undefined = $state();

	$effect(() => {
		if (open) confirmButton?.focus();
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onCancel();
	}
</script>

<svelte:window onkeydown={open ? handleKeydown : undefined} />

{#if open}
	<div class="fixed inset-0 z-50 flex items-center justify-center px-4">
		<!-- Backdrop -->
		<button
			type="button"
			class="absolute inset-0 bg-black/70 cursor-default"
			style="backdrop-filter: blur(2px);"
			aria-label="Close dialog"
			onclick={onCancel}
		></button>

		<!-- Dialog -->
		<div
			role="alertdialog"
			aria-modal="true"
			aria-labelledby="modal-title"
			aria-describedby="modal-description"
			class="relative w-full max-w-sm rounded-[var(--radius-lg)] border p-6 shadow-2xl"
			style="border-color: var(--color-border-strong); background: var(--color-surface-2);"
		>
			<div class="flex items-start gap-3">
				{#if danger}
					<div
						class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
						style="background: var(--color-danger-bg);"
					>
						<AlertTriangle class="h-4.5 w-4.5" style="color: var(--color-danger)" aria-hidden="true" />
					</div>
				{/if}
				<div class="min-w-0">
					<h2 id="modal-title" class="font-semibold tracking-tight">{title}</h2>
					<p id="modal-description" class="mt-1.5 text-sm text-[var(--color-text-secondary)]">
						{description}
					</p>
				</div>
			</div>

			<div class="mt-6 flex justify-end gap-2">
				<button
					type="button"
					onclick={onCancel}
					disabled={busy}
					class="flex h-10 items-center rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 text-sm font-medium text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
				>
					{cancelLabel}
				</button>
				<button
					bind:this={confirmButton}
					type="button"
					onclick={onConfirm}
					disabled={busy}
					class="flex h-10 items-center rounded-[var(--radius-md)] px-4 text-sm font-medium cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
					style="
						background: {danger ? 'var(--color-danger)' : 'var(--color-accent)'};
						color: var(--color-bg);
					"
				>
					{confirmLabel}
				</button>
			</div>
		</div>
	</div>
{/if}
