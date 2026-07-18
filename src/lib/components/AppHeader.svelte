<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { ShieldCheck } from 'lucide-svelte';
	import { keyStore } from '$lib/stores/key-store.svelte';

	const links = [
		{ href: '/dashboard', label: 'Vault' },
		{ href: '/dashboard/logs', label: 'Access logs' },
		{ href: '/settings/keys', label: 'Keys' },
		{ href: '/settings/account', label: 'Account' }
	];

	async function signOut() {
		keyStore.lock();
		await fetch('/api/auth/logout', { method: 'POST' });
		await goto('/login');
	}
</script>

<header class="border-b border-[var(--color-border)]">
	<div class="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
		<a href="/dashboard" class="flex items-center gap-2">
			<ShieldCheck class="h-5 w-5" style="color: var(--color-accent)" aria-hidden="true" />
			<span class="font-semibold tracking-tight">EndToEnd Encrypt</span>
		</a>
		<nav class="flex items-center gap-4 text-sm text-[var(--color-text-secondary)]">
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
	</div>
</header>
