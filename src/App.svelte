<script lang="ts">
  import { onMount, tick } from 'svelte';
  import Actions from './components/Actions.svelte';
  import Status from './components/Status.svelte';
  import Summary from './components/Summary.svelte';
  import { getDashboard, runAction } from './lib/api';
  import { loadCache, saveCache, SEED_DASHBOARD } from './lib/cache';
  import { formatClock, greetingForHour, scheduleMinuteTick } from './lib/clock';
  import { initTizen } from './lib/tizen';
  import type { Dashboard } from './lib/types';

  const initialDashboard = loadCache() ?? SEED_DASHBOARD;
  let dashboard = $state.raw(initialDashboard);
  let selectedId = $state(initialDashboard.actions[0] ? initialDashboard.actions[0].id : '');
  let connection = $state<'online' | 'updating' | 'offline'>('updating');
  let runningId = $state<string | null>(null);
  let notice = $state('');
  let nowMs = $state(Date.now());
  let scale = $state(1);
  let actionsRoot: HTMLDivElement | undefined = $state();

  const clock = $derived(formatClock(nowMs));
  const greeting = $derived(greetingForHour(nowMs));
  const statusLabel = $derived(
    connection === 'updating' ? 'Обновление' : connection === 'offline' ? 'Нет сети' : 'Онлайн'
  );

  function fitScale() {
    const next = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    scale = next > 0 ? next : 1;
  }

  async function focusSelected() {
    await tick();
    if (!actionsRoot) return;
    const button = actionsRoot.querySelector('[data-action-id="' + selectedId + '"]');
    if (button instanceof HTMLButtonElement) {
      button.focus();
    }
  }

  function applyDashboard(next: Dashboard) {
    dashboard = next;
    saveCache(next);
    let stillThere = false;
    for (let i = 0; i < next.actions.length; i += 1) {
      if (next.actions[i].id === selectedId) {
        stillThere = true;
        break;
      }
    }
    if (!stillThere) {
      selectedId = next.actions[0] ? next.actions[0].id : '';
    }
  }

  async function refresh() {
    connection = 'updating';
    try {
      const next = await getDashboard();
      applyDashboard(next);
      connection = 'online';
      notice = '';
      await focusSelected();
    } catch {
      connection = 'offline';
    }
  }

  async function onRun(id: string) {
    if (runningId) return;
    selectedId = id;
    runningId = id;
    notice = '';
    try {
      await runAction(id);
      notice = 'Отправлено';
      connection = 'online';
    } catch {
      notice = 'Не удалось выполнить';
      connection = 'offline';
    } finally {
      runningId = null;
      await focusSelected();
    }
  }

  function moveSelection(dx: number, dy: number) {
    const actions = dashboard.actions;
    const cols = 2;
    let index = -1;
    for (let i = 0; i < actions.length; i += 1) {
      if (actions[i].id === selectedId) {
        index = i;
        break;
      }
    }
    if (index < 0) index = 0;

    const col = index % cols;
    const row = (index - col) / cols;
    const rows = Math.ceil(actions.length / cols);
    let nextCol = col + dx;
    let nextRow = row + dy;
    if (nextCol < 0) nextCol = 0;
    if (nextCol > cols - 1) nextCol = cols - 1;
    if (nextRow < 0) nextRow = 0;
    if (nextRow > rows - 1) nextRow = rows - 1;

    let nextIndex = nextRow * cols + nextCol;
    if (nextIndex >= actions.length) nextIndex = actions.length - 1;
    const next = actions[nextIndex];
    if (next) {
      selectedId = next.id;
      void focusSelected();
    }
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveSelection(-1, 0);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveSelection(1, 0);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveSelection(0, -1);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveSelection(0, 1);
    }
  }

  onMount(() => {
    fitScale();
    window.addEventListener('resize', fitScale);

    const stopClock = scheduleMinuteTick(() => {
      nowMs = Date.now();
    });
    const stopTizen = initTizen();

    void refresh();
    void focusSelected();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        nowMs = Date.now();
        void refresh();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('resize', fitScale);
      document.removeEventListener('visibilitychange', onVisibility);
      stopClock();
      stopTizen();
    };
  });
</script>

<svelte:window onkeydown={onKeydown} />

<div class="viewport">
  <div class="stage" style={'transform: scale(' + scale + ')'}>
    <header class="top">
      <time class="clock">{clock}</time>
      <Status state={connection} label={statusLabel} notice={notice} />
    </header>

    <Summary greeting={greeting} text={dashboard.summary} />

    <div bind:this={actionsRoot}>
      <Actions
        actions={dashboard.actions}
        selectedId={selectedId}
        runningId={runningId}
        onrun={onRun}
      />
    </div>
  </div>
</div>
