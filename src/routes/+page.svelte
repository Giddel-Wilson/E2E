<script lang="ts">
	import { ShieldCheck, Lock, KeyRound, Eye, ArrowRight } from 'lucide-svelte';
</script>

<svelte:head>
	<title>EndToEnd Encrypt — files encrypted before they ever leave your device</title>
</svelte:head>

<div class="min-h-dvh bg-[var(--color-bg)] text-[var(--color-text-primary)]">
	<header class="border-b border-[var(--color-border)]">
		<div class="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
			<div class="flex items-center gap-2">
				<ShieldCheck class="h-5 w-5" style="color: var(--color-accent)" aria-hidden="true" />
				<span class="font-semibold tracking-tight">EndToEnd Encrypt</span>
			</div>
			<nav class="flex items-center gap-3 text-sm">
				<a href="/login" class="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">Sign in</a>
				<a
					href="/register"
					class="rounded-[var(--radius-md)] px-3.5 py-2 font-medium transition-opacity duration-150 hover:opacity-90"
					style="background: var(--color-accent); color: var(--color-bg);"
				>
					Create vault
				</a>
			</nav>
		</div>
	</header>

	<main>
		<!-- Hero -->
		<section class="mx-auto max-w-3xl px-6 pt-20 pb-16 text-center">
			<div
				class="mx-auto mb-6 flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-mono-data"
				style="border-color: var(--color-border); color: var(--color-text-tertiary);"
			>
				<Lock class="h-3 w-3" style="color: var(--color-accent)" aria-hidden="true" />
				zero-knowledge by design
			</div>
			<h1 class="text-4xl font-semibold tracking-tight sm:text-5xl">
				We can't read your files.<br />That's the whole point.
			</h1>
			<p class="mx-auto mt-5 max-w-xl text-base text-[var(--color-text-secondary)]">
				Every file is encrypted in your browser before it's uploaded. We store ciphertext, wrapped
				keys, and nothing else — not your plaintext, not your filenames, not your encryption keys.
			</p>
			<div class="mt-8 flex items-center justify-center gap-3">
				<a
					href="/register"
					class="flex h-11 items-center gap-2 rounded-[var(--radius-md)] px-5 text-sm font-medium transition-opacity duration-150 hover:opacity-90"
					style="background: var(--color-accent); color: var(--color-bg);"
				>
					Create your vault
					<ArrowRight class="h-4 w-4" aria-hidden="true" />
				</a>
				<a
					href="/login"
					class="flex h-11 items-center rounded-[var(--radius-md)] border border-[var(--color-border)] px-5 text-sm font-medium text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]"
				>
					Sign in
				</a>
			</div>
		</section>

		<!-- How it works -->
		<section class="border-t border-[var(--color-border)] bg-[var(--color-surface)] py-16">
			<div class="mx-auto max-w-5xl px-6">
				<h2 class="text-center text-sm font-medium tracking-wide text-[var(--color-text-tertiary)] uppercase">
					How it works
				</h2>
				<div class="mt-8 grid gap-6 sm:grid-cols-3">
					<div class="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-6">
						<div
							class="flex h-10 w-10 items-center justify-center rounded-full"
							style="background: var(--color-accent-bg);"
						>
							<Lock class="h-4.5 w-4.5" style="color: var(--color-accent)" aria-hidden="true" />
						</div>
						<h3 class="mt-4 font-medium">Encrypt locally</h3>
						<p class="mt-1.5 text-sm text-[var(--color-text-tertiary)]">
							Pick AES-256-GCM or ChaCha20-Poly1305. Your browser encrypts the file in 4&nbsp;MiB
							chunks before anything is sent.
						</p>
					</div>
					<div class="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-6">
						<div
							class="flex h-10 w-10 items-center justify-center rounded-full"
							style="background: var(--color-accent-bg);"
						>
							<KeyRound class="h-4.5 w-4.5" style="color: var(--color-accent)" aria-hidden="true" />
						</div>
						<h3 class="mt-4 font-medium">Wrap the key</h3>
						<p class="mt-1.5 text-sm text-[var(--color-text-tertiary)]">
							A fresh key per file is wrapped under your public key (RSA-OAEP or ECDH). We only
							ever store the wrapped ciphertext.
						</p>
					</div>
					<div class="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-6">
						<div
							class="flex h-10 w-10 items-center justify-center rounded-full"
							style="background: var(--color-accent-bg);"
						>
							<Eye class="h-4.5 w-4.5" style="color: var(--color-accent)" aria-hidden="true" />
						</div>
						<h3 class="mt-4 font-medium">We stay blind</h3>
						<p class="mt-1.5 text-sm text-[var(--color-text-tertiary)]">
							Filenames and metadata are encrypted too. Every access is logged, but the log
							never contains key material or content.
						</p>
					</div>
				</div>
			</div>
		</section>
	</main>

	<footer class="border-t border-[var(--color-border)] py-8">
		<div class="mx-auto max-w-5xl px-6 text-center text-xs text-[var(--color-text-tertiary)]">
			EndToEnd Encrypt — client-side encrypted file storage.
		</div>
	</footer>
</div>
