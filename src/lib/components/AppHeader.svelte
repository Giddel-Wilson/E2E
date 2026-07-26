<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { ShieldCheck, Menu, X } from 'lucide-svelte';
	import { keyStore } from '$lib/stores/key-store.svelte';

	const links = [
		{ href: '/dashboard', label: 'Vault' },
		{ href: '/dashboard/logs', label: 'Access logs' },
		{ href: '/settings/keys', label: 'Keys' },
		{ href: '/settings/account', label: 'Account' }
	];

	let mobileMenuOpen = $state(false);

	async function signOut() {
		mobileMenuOpen = false;
		keyStore.lock();
		await fetch('/api/auth/logout', { method: 'POST' });
		await goto('/login');
	}

	function closeMobileMenu() {
		mobileMenuOpen = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') mobileMenuOpen = false;
	}
</script>

<svelte:window onkeydown={mobileMenuOpen ? handleKeydown : undefined} />

<header class="relative border-b border-[var(--color-border)]">
	<div class="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
		<a href="/dashboard" class="flex items-center gap-2" onclick={closeMobileMenu}>
			<ShieldCheck class="h-5 w-5" style="color: var(--color-accent)" aria-hidden="true" />
			<span class="font-semibold tracking-tight">EndToEnd Encrypt</span>
		</a>

		<!-- Desktop nav -->
		<nav class="hidden items-center gap-4 text-sm text-[var(--color-text-secondary)] sm:flex">
			{#each links as link (link.href)}
				<a
					href={link.href}
					class="hover:text-[var(--color-text-primary)]"
					style={page.url.pathname === link.href ? 'color: var(--color-text-primary)' : ''}
					aria-current={page.url.pathname === link.href ? 'page' : undefined}
				>
					{link.label}
				</a>
			{/each}
			<button type="button" class="cursor-pointer hover:text-[var(--color-text-primary)]" onclick={signOut}>
				Sign out
			</button>
		</nav>

		<!-- Mobile hamburger -->
		<button
			type="button"
			class="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] cursor-pointer sm:hidden"
			onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
			aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
			aria-expanded={mobileMenuOpen}
		>
			{#if mobileMenuOpen}
				<X class="h-5 w-5" aria-hidden="true" />
			{:else}
				<Menu class="h-5 w-5" aria-hidden="true" />
			{/if}
		</button>
	</div>

	<!-- Mobile menu panel -->
	{#if mobileMenuOpen}
		<button
			type="button"
			class="fixed inset-0 top-[65px] z-40 bg-black/50 cursor-default sm:hidden"
			aria-label="Close menu"
			onclick={closeMobileMenu}
		></button>
		<nav
			class="absolute inset-x-0 top-full z-50 flex flex-col border-b border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-2 text-sm sm:hidden"
		>
			{#each links as link (link.href)}
				<a
					href={link.href}
					onclick={closeMobileMenu}
					class="border-b border-[var(--color-border)] py-3 text-[var(--color-text-secondary)] last:border-b-0 hover:text-[var(--color-text-primary)]"
					style={page.url.pathname === link.href ? 'color: var(--color-text-primary)' : ''}
					aria-current={page.url.pathname === link.href ? 'page' : undefined}
				>
					{link.label}
				</a>
			{/each}
			<button
				type="button"
				class="cursor-pointer py-3 text-left text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
				onclick={signOut}
			>
				Sign out
			</button>
		</nav>
	{/if}
</header>
