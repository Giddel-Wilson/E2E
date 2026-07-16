<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { KeyRound, Loader2, CheckCircle2 } from 'lucide-svelte';
	import { unwrapPrivateKey, importPublicKey } from '$crypto/private-key';
	import { sha256Hex } from '$crypto/file-encryption';
	import { keyStore } from '$lib/stores/key-store.svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';

	let password = $state('');
	let busy = $state(false);
	let errorMsg = $state<string | null>(null);
	let fingerprint = $state<string | null>(null);

	$effect(() => {
		if (keyStore.publicKeyJwk) computeFingerprint();
	});

	async function computeFingerprint() {
		if (!keyStore.publicKeyJwk) return;
		const bytes = new TextEncoder().encode(JSON.stringify(keyStore.publicKeyJwk));
		const hex = await sha256Hex(bytes);
		fingerprint = hex.match(/.{1,4}/g)?.join(' ').slice(0, 49) ?? hex;
	}

	async function handleUnlock(e: Event) {
		e.preventDefault();
		errorMsg = null;
		busy = true;
		try {
			const res = await fetch('/api/auth/keys');
			if (!res.ok) throw new Error('Could not load your key material — try signing in again');
			const user = await res.json();

			const privateKey = await unwrapPrivateKey(
				user.wrappedPrivateKey,
				user.wrappedPrivateKeyIv,
				password,
				user.privateKeyKdfParams,
				user.keyAlgo
			);
			const publicKey = await importPublicKey(user.publicKeyJwk, user.keyAlgo);

			keyStore.set({ privateKey, publicKey, publicKeyJwk: user.publicKeyJwk, keyAlgo: user.keyAlgo });
			password = '';

			const next = page.url.searchParams.get('next');
			if (next) await goto(next);
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Unlock failed';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Encryption keys — EndToEnd Encrypt</title>
</svelte:head>

<div class="min-h-dvh bg-[var(--color-bg)] text-[var(--color-text-primary)]">
	<AppHeader />

	<main class="mx-auto max-w-3xl px-6 py-10">
		<h1 class="text-xl font-semibold tracking-tight">Encryption keys</h1>
		<p class="mt-1 text-sm text-[var(--color-text-tertiary)]">
			Your private key is never stored anywhere in usable form — not on our server, not in your
			browser's storage. It lives only in this tab's memory, re-derived from your password each
			time you sign in or unlock it here. Refreshing the page clears it on purpose: that's what
			keeps it off disk.
		</p>

		<div class="mt-6 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
			{#if keyStore.isUnlocked}
				<div class="flex items-center gap-2" style="color: var(--color-accent)">
					<CheckCircle2 class="h-5 w-5" aria-hidden="true" />
					<span class="font-medium">Key unlocked for this session</span>
				</div>
				<dl class="mt-4 space-y-2 text-sm">
					<div class="flex justify-between gap-4">
						<dt class="text-[var(--color-text-tertiary)]">Algorithm</dt>
						<dd class="font-mono-data">{keyStore.keyAlgo}</dd>
					</div>
					{#if fingerprint}
						<div class="flex flex-col gap-1">
							<dt class="text-[var(--color-text-tertiary)]">Public key fingerprint</dt>
							<dd class="break-all font-mono-data text-xs text-[var(--color-text-secondary)]">{fingerprint}</dd>
						</div>
					{/if}
				</dl>
				<p class="mt-4 text-xs text-[var(--color-text-tertiary)]">
					Share this fingerprint out-of-band with people you exchange files with, so they can
					verify they're encrypting to the right key.
				</p>
			{:else}
				<div class="flex items-center gap-2 text-[var(--color-text-secondary)]">
					<KeyRound class="h-5 w-5" aria-hidden="true" />
					<span class="font-medium">Your key is locked</span>
				</div>
				<p class="mt-1 text-sm text-[var(--color-text-tertiary)]">
					Enter your password to unlock it for this session.
				</p>

				<form class="mt-4 flex gap-2" onsubmit={handleUnlock}>
					<label class="sr-only" for="unlock-password">Password</label>
					<input
						id="unlock-password"
						type="password"
						required
						bind:value={password}
						placeholder="Password"
						class="h-11 flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm outline-none focus:border-[var(--color-accent)]"
					/>
					<button
						type="submit"
						disabled={busy}
						class="flex h-11 items-center gap-2 rounded-[var(--radius-md)] px-4 text-sm font-medium cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
						style="background: var(--color-accent); color: var(--color-bg);"
					>
						{#if busy}
							<Loader2 class="h-4 w-4 animate-spin" aria-hidden="true" />
						{/if}
						Unlock
					</button>
				</form>

				{#if errorMsg}
					<div
						class="mt-3 rounded-[var(--radius-md)] border px-3 py-2.5 text-sm"
						style="border-color: var(--color-danger); background: var(--color-danger-bg); color: var(--color-danger);"
						role="alert"
					>
						{errorMsg}
					</div>
				{/if}
			{/if}
		</div>
	</main>
</div>
