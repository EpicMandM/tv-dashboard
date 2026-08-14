<script lang="ts">
  import type { TvAction } from '../lib/types';

  let {
    actions,
    selectedId,
    runningId,
    onrun
  }: {
    actions: TvAction[];
    selectedId: string;
    runningId: string | null;
    onrun: (id: string) => void;
  } = $props();
</script>

<div class="actions">
  {#each actions as action (action.id)}
    <button
      type="button"
      data-action-id={action.id}
      class:is-selected={action.id === selectedId}
      class:is-running={action.id === runningId}
      onclick={() => onrun(action.id)}
    >
      {action.title}
    </button>
  {/each}
</div>
