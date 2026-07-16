<script lang="ts">
	import type { StrengthRating } from '$crypto/types';
	import { strengthColorVar } from '$crypto/strength';

	let { rating }: { rating: StrengthRating | null } = $props();
</script>

{#if rating}
	<div class="space-y-2">
		<div class="flex items-center justify-between text-sm">
			<span class="text-[var(--color-text-secondary)]">Encryption strength</span>
			<span
				class="font-mono-data font-medium capitalize"
				style="color: {strengthColorVar(rating.label)}"
			>
				{rating.label} · {rating.score}/100
			</span>
		</div>

		<div class="h-2 w-full overflow-hidden rounded-full bg-[var(--color-surface-3)]">
			<div
				class="h-full rounded-full transition-[width] duration-500"
				style="width: {rating.score}%; background: {strengthColorVar(
					rating.label
				)}; transition-timing-function: var(--ease-out-strong);"
			></div>
		</div>

		<ul class="flex flex-wrap gap-1.5 pt-1">
			{#each rating.reasons as reason (reason)}
				<li
					class="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1 font-mono-data text-xs text-[var(--color-text-secondary)]"
				>
					{reason}
				</li>
			{/each}
		</ul>
	</div>
{/if}
