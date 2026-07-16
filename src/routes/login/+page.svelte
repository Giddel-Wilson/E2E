<script lang="ts">
	import { goto } from '$app/navigation';
	import { ShieldCheck, Loader2 } from 'lucide-svelte';
	import { unwrapPrivateKey, importPublicKey } from '$crypto/private-key';
	import { keyStore } from '$lib/stores/key-store.svelte';

	let email = $state('');
	let password = $state('');
	let busy = $state(false);
	let stage = $state<'idle' | 'authenticating' | 'unlocking'>('idle');
	let errorMsg = $state<string | null>(null);

	async function handleSubmit(e: Event) {
		e.preventDefault();
		errorMsg = null;
		busy = true;
		try {
			stage = 'authenticating';
			const res = await fetch('/api/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, password })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.message ?? 'Invalid email or password');
			}
			const user = await res.json();

			// Re-derive the wrapping key from the password the user just
			// typed and unlock the private key — entirely in-browser, the
			// server response only ever contained ciphertext.
			stage = 'unlocking';
			const privateKey = await unwrapPrivateKey(
				user.wrappedPrivateKey,
				user.wrappedPrivateKeyIv,
				password,
				user.privateKeyKdfParams,
				user.keyAlgo
			);
			const publicKey = await importPublicKey(user.publicKeyJwk, user.keyAlgo);

			keyStore.set({ privateKey, publicKey, publicKeyJwk: user.publicKeyJwk, keyAlgo: user.keyAlgo });

			await goto('/dashboard');
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Sign in failed';
		} finally {
			busy = false;
			stage = 'idle';
		}
	}
</script>

<svelte:head>
	<title>Sign in — EndToEnd Encrypt</title>
</svelte:head>

<div class="flex min-h-dvh items-center justify-center bg-[var(--color-bg)] px-6 py-12 text-[var(--color-text-primary)]">
	<div class="w-full max-w-sm space-y-6">
		<div class="flex items-center gap-2">
			<ShieldCheck class="h-5 w-5" style="color: var(--color-accent)" aria-hidden="true" />
			<span class="font-semibold tracking-tight">EndToEnd Encrypt</span>
		</div>

		<div>
			<h1 class="text-xl font-semibold tracking-tight">Welcome back</h1>
			<p class="mt-1 text-sm text-[var(--color-text-tertiary)]">
				Your password unlocks your private key locally — it's never sent to us.
			</p>
		</div>

		<form class="space-y-4" onsubmit={handleSubmit}>
			<div class="space-y-1.5">
				<label for="email" class="text-sm font-medium text-[var(--color-text-secondary)]">Email</label>
				<input
					id="email"
					type="email"
					required
					bind:value={email}
					class="h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm outline-none focus:border-[var(--color-accent)]"
				/>
			</div>

			<div class="space-y-1.5">
				<label for="password" class="text-sm font-medium text-[var(--color-text-secondary)]">Password</label>
				<input
					id="password"
					type="password"
					required
					bind:value={password}
					class="h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm outline-none focus:border-[var(--color-accent)]"
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

			<button
				type="submit"
				disabled={busy}
				class="flex h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-md)] font-medium cursor-pointer transition-opacity duration-150 disabled:cursor-not-allowed disabled:opacity-60"
				style="background: var(--color-accent); color: var(--color-bg);"
			>
				{#if busy}
					<Loader2 class="h-4 w-4 animate-spin" aria-hidden="true" />
					{stage === 'authenticating' ? 'Signing in…' : 'Unlocking key…'}
				{:else}
					Sign in
				{/if}
			</button>
		</form>

		<p class="text-center text-sm text-[var(--color-text-tertiary)]">
			Need an account? <a href="/register" class="underline" style="color: var(--color-accent)">Create one</a>
		</p>
	</div>
</div>
