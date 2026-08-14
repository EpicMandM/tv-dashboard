<script lang="ts">
  let { greeting, text }: { greeting: string; text: string } = $props();
</script>

<section class="summary">
  <h1 class="greeting">{greeting}</h1>
  <p class="summary-text">{text}</p>
</section>
