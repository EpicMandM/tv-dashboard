<script lang="ts">
  let {
    state,
    label,
    notice
  }: {
    state: 'online' | 'updating' | 'offline';
    label: string;
    notice: string;
  } = $props();
</script>

<div class={'status is-' + state}>
  <span class="status-dot"></span>
  <span>{label}</span>
  {#if notice}
    <span class="status-notice">{notice}</span>
  {/if}
</div>
