<script lang="ts">
	import { Loader2, CheckCircle2 } from 'lucide-svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import { reWrapPrivateKeyWithNewPassword, unwrapPrivateKey } from '$crypto/private-key';
	import { keyStore } from '$lib/stores/key-store.svelte';

	let currentPassword = $state('');
	let newPassword = $state('');
	let confirmPassword = $state('');
	let busy = $state(false);
	let errorMsg = $state<string | null>(null);
	let success = $state(false);

	const tooShort = $derived(newPassword.length > 0 && newPassword.length < 12);
	const mismatch = $derived(confirmPassword.length > 0 && newPassword !== confirmPassword);

	async function handleSubmit(e: Event) {
		e.preventDefault();
		errorMsg = null;
		success = false;

		if (newPassword.length < 12) {
			errorMsg = 'New password must be at least 12 characters.';
			return;
		}
		if (newPassword !== confirmPassword) {
			errorMsg = 'New passwords do not match.';
			return;
		}

		busy = true;
		try {
			const keysRes = await fetch('/api/auth/keys');
			if (!keysRes.ok) throw new Error('Could not load your current key material');
			const user = await keysRes.json();

			const rewrapped = await reWrapPrivateKeyWithNewPassword(
				user.wrappedPrivateKey,
				user.wrappedPrivateKeyIv,
				currentPassword,
				user.privateKeyKdfParams,
				newPassword,
				user.keyAlgo
			);

			const changeRes = await fetch('/api/auth/change-password', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ currentPassword, newPassword, ...rewrapped })
			});
			if (!changeRes.ok) {
				const body = await changeRes.json().catch(() => ({}));
				throw new Error(body.message ?? 'Failed to change password');
			}

			// Re-unlock with the new password so the session stays usable
			// without forcing a fresh sign-in.
			const privateKey = await unwrapPrivateKey(
				rewrapped.wrappedPrivateKey,
				rewrapped.wrappedPrivateKeyIv,
				newPassword,
				rewrapped.privateKeyKdfParams,
				user.keyAlgo
			);
			keyStore.set({
				privateKey,
				publicKey: keyStore.publicKey,
				publicKeyJwk: keyStore.publicKeyJwk,
				keyAlgo: keyStore.keyAlgo
			});

			success = true;
			currentPassword = '';
			newPassword = '';
			confirmPassword = '';
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Failed to change password';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Account — EndToEnd Encrypt</title>
</svelte:head>

<div class="min-h-dvh bg-[var(--color-bg)] text-[var(--color-text-primary)]">
	<AppHeader />

	<main class="mx-auto max-w-md px-6 py-10">
		<h1 class="text-xl font-semibold tracking-tight">Change password</h1>
		<p class="mt-1 text-sm text-[var(--color-text-tertiary)]">
			Your password protects both your login and your private key. Changing it re-encrypts your
			private key with the new password — entirely in your browser.
		</p>

		<form class="mt-6 space-y-4" onsubmit={handleSubmit}>
			<div class="space-y-1.5">
				<label for="current" class="text-sm font-medium text-[var(--color-text-secondary)]">Current password</label>
				<input
					id="current"
					type="password"
					required
					bind:value={currentPassword}
					class="h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm outline-none focus:border-[var(--color-accent)]"
				/>
			</div>

			<div class="space-y-1.5">
				<label for="new" class="text-sm font-medium text-[var(--color-text-secondary)]">New password</label>
				<input
					id="new"
					type="password"
					required
					minlength="12"
					bind:value={newPassword}
					class="h-11 w-full rounded-[var(--radius-md)] border bg-[var(--color-surface)] px-3 text-sm outline-none"
					style="border-color: {tooShort ? 'var(--color-danger)' : 'var(--color-border)'}"
				/>
			</div>

			<div class="space-y-1.5">
				<label for="confirm" class="text-sm font-medium text-[var(--color-text-secondary)]">Confirm new password</label>
				<input
					id="confirm"
					type="password"
					required
					bind:value={confirmPassword}
					class="h-11 w-full rounded-[var(--radius-md)] border bg-[var(--color-surface)] px-3 text-sm outline-none"
					style="border-color: {mismatch ? 'var(--color-danger)' : 'var(--color-border)'}"
				/>
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

			{#if success}
				<div
					class="flex items-center gap-2 rounded-[var(--radius-md)] border px-3 py-2.5 text-sm"
					style="border-color: var(--color-accent); background: var(--color-accent-bg); color: var(--color-accent);"
				>
					<CheckCircle2 class="h-4 w-4" aria-hidden="true" />
					Password changed.
				</div>
			{/if}

			<button
				type="submit"
				disabled={busy}
				class="flex h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-md)] font-medium cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
				style="background: var(--color-accent); color: var(--color-bg);"
			>
				{#if busy}
					<Loader2 class="h-4 w-4 animate-spin" aria-hidden="true" />
				{/if}
				Change password
			</button>
		</form>
	</main>
</div>
