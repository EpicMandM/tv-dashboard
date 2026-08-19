<script lang="ts">
  import { onMount, tick } from 'svelte';
  import {
    getDashboard,
    isAbortError,
    loadCache,
    runAction,
    sameView,
    saveCache,
    SEED,
    type Dashboard,
    type TvAction
  } from './lib/tv';

  const SNAPSHOT_MS = 15 * 1000;
  const POLL_MS = 2000;
  const ACK_MS = 15 * 1000;
  const WAIT_MS = 11 * 60 * 1000;
  const BACK = 10009;
  const EXIT = 10182;

  const initial = loadCache() || SEED;
  let dashboard = $state.raw(initial);
  let selectedId = $state(initial.actions[0] ? initial.actions[0].id : '');
  let connection = $state<'online' | 'updating' | 'offline'>('updating');
  let runningId = $state<string | null>(null);
  let notice = $state('');
  let nowMs = $state(Date.now());
  let scale = $state(1);
  let actionsRoot: HTMLDivElement | undefined = $state();

  let gen = 0;
  let refreshInFlight = false;
  let waiting = false;
  let stopped = false;
  let abort = new AbortController();

  const clock = $derived.by(() => {
    const d = new Date(nowMs);
    const h = d.getHours();
    const m = d.getMinutes();
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  });

  function statusView(
    dashStatus: Dashboard['status'],
    conn: 'online' | 'updating' | 'offline'
  ): { cls: string; label: string } {
    if (dashStatus === 'running') return { cls: 'updating', label: 'Preparing' };
    if (dashStatus === 'error') return { cls: 'offline', label: 'Error' };
    if (dashStatus === 'degraded') return { cls: 'degraded', label: 'Partial' };
    if (conn === 'updating') return { cls: 'updating', label: 'Updating' };
    if (conn === 'offline') return { cls: 'offline', label: 'Offline' };
    return { cls: 'online', label: 'Online' };
  }
  const status = $derived(statusView(dashboard.status, connection));

  function hasId(actions: TvAction[], id: string) {
    for (let i = 0; i < actions.length; i += 1) if (actions[i].id === id) return true;
    return false;
  }

  function sleep(ms: number) {
    return new Promise<void>(function (resolve) {
      window.setTimeout(resolve, ms);
    });
  }

  function coverTvWindow() {
    const tvwindow = window.tizen && window.tizen.tvwindow;
    if (!tvwindow) return;
    try {
      tvwindow.hide(
        function () {},
        function () {},
        'MAIN'
      );
    } catch {}
  }

  async function focusSelected() {
    await tick();
    if (!actionsRoot) return;
    const button = actionsRoot.querySelector('[data-action-id="' + selectedId + '"]');
    if (button instanceof HTMLButtonElement) button.focus();
  }

  function apply(next: Dashboard) {
    const prev = dashboard;
    const viewSame = sameView(prev, next);
    if (prev.status === next.status && (prev.action || '') === (next.action || '') && viewSame) {
      return;
    }
    const prevId = selectedId;
    dashboard = next;
    saveCache(next);
    if (hasId(next.actions, 'home') && !hasId(prev.actions, 'home')) selectedId = 'home';
    else if (hasId(next.actions, prevId)) selectedId = prevId;
    else if (hasId(next.actions, 'home')) selectedId = 'home';
    else selectedId = next.actions[0] ? next.actions[0].id : '';
    if (!viewSame && next.status !== 'error') notice = '';
    if (selectedId !== prevId) void focusSelected();
  }

  function bump() {
    gen += 1;
    abort.abort();
    abort = new AbortController();
    return gen;
  }

  // Cached id → new snapshot; else host writes running then result; home = back.
  // ACK_MS = give up waiting for a change; WAIT_MS = still-running ceiling.
  async function waitForSettle(myGen: number, id: string, previous: Dashboard, seenRunning: boolean) {
    const started = Date.now();
    const deadline = started + WAIT_MS;
    while (!stopped && myGen === gen && Date.now() < deadline) {
      let next: Dashboard;
      try {
        next = await getDashboard(abort.signal);
      } catch (err) {
        if (stopped || myGen !== gen || isAbortError(err)) return;
        await sleep(POLL_MS);
        continue;
      }
      if (stopped || myGen !== gen) return;
      apply(next);
      if (next.status === 'running') {
        seenRunning = true;
        connection = 'updating';
        runningId = next.action || id;
        await sleep(POLL_MS);
        continue;
      }
      if (
        next.status === 'error' ||
        next.status === 'degraded' ||
        seenRunning ||
        !sameView(next, previous) ||
        Date.now() - started >= ACK_MS
      ) {
        connection = next.status === 'error' ? 'offline' : 'online';
        runningId = null;
        notice = next.status === 'error' ? 'Update failed' : '';
        return;
      }
      await sleep(POLL_MS);
    }
    if (stopped || myGen !== gen) return;
    notice = 'Still preparing';
    connection = 'online';
    runningId = null;
  }

  async function refresh(silent: boolean) {
    if (stopped || refreshInFlight || waiting) return;
    refreshInFlight = true;
    if (!silent) connection = 'updating';
    try {
      const next = await getDashboard(abort.signal);
      if (stopped) return;
      apply(next);
      if (next.status === 'running') {
        connection = 'updating';
        runningId = next.action || runningId;
        const myGen = gen;
        waiting = true;
        try {
          await waitForSettle(myGen, next.action || '', next, true);
        } finally {
          if (myGen === gen) waiting = false;
        }
      } else {
        connection = 'online';
        runningId = null;
      }
    } catch (err) {
      if (stopped || isAbortError(err)) return;
      connection = 'offline';
    } finally {
      refreshInFlight = false;
    }
  }

  async function onRun(id: string) {
    if (stopped || (runningId && id !== 'home')) return;
    const myGen = bump();
    selectedId = id;
    runningId = id === 'home' ? runningId : id;
    notice = '';
    connection = 'updating';
    const previous = dashboard;
    waiting = true;
    try {
      await runAction(id, abort.signal);
      if (stopped || myGen !== gen) return;
      await waitForSettle(myGen, id, previous, false);
    } catch (err) {
      if (stopped || myGen !== gen || isAbortError(err)) return;
      notice = 'Action failed';
      connection = 'offline';
      runningId = null;
    } finally {
      if (myGen === gen) waiting = false;
      await focusSelected();
    }
  }

  function moveSelection(dx: number, dy: number) {
    const actions = dashboard.actions;
    let index = 0;
    for (let i = 0; i < actions.length; i += 1) if (actions[i].id === selectedId) index = i;
    const cols = 2;
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
    if (next && next.id !== selectedId) {
      selectedId = next.id;
      void focusSelected();
    }
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveSelection(-1, 0);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveSelection(1, 0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveSelection(0, -1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveSelection(0, 1);
    } else if (event.key === 'Enter' && !(event.target instanceof HTMLButtonElement)) {
      event.preventDefault();
      if (selectedId) void onRun(selectedId);
    } else if (event.keyCode === BACK || event.keyCode === EXIT) {
      event.preventDefault();
    }
  }

  function fitScale() {
    const next = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    scale = next > 0 ? next : 1;
  }

  onMount(() => {
    fitScale();
    window.addEventListener('resize', fitScale);

    let clockTimer = 0;
    const armClock = () => {
      clockTimer = window.setTimeout(() => {
        nowMs = Date.now();
        armClock();
      }, 60000 - (Date.now() % 60000) + 30);
    };
    armClock();

    coverTvWindow();
    const input = window.tizen && window.tizen.tvinputdevice;
    if (input) {
      try {
        input.registerKey('Exit');
      } catch {}
    }
    const onHwKey = (event: Event) => {
      const keyName = (event as Event & { keyName?: string }).keyName;
      if (keyName === 'back' || keyName === 'Back' || keyName === 'Exit') {
        event.preventDefault();
      }
    };
    window.addEventListener('tizenhwkey', onHwKey);

    void refresh(false).then(function () {
      void focusSelected();
    });
    const snapshotTimer = window.setInterval(function () {
      void refresh(true);
    }, SNAPSHOT_MS);
    const onForeground = () => {
      if (document.visibilityState === 'hidden') return;
      coverTvWindow();
      nowMs = Date.now();
      void refresh(false);
    };
    document.addEventListener('visibilitychange', onForeground);
    window.addEventListener('pageshow', onForeground);
    window.addEventListener('focus', onForeground);

    return () => {
      stopped = true;
      gen += 1;
      waiting = false;
      abort.abort();
      window.removeEventListener('resize', fitScale);
      window.removeEventListener('tizenhwkey', onHwKey);
      window.removeEventListener('pageshow', onForeground);
      window.removeEventListener('focus', onForeground);
      document.removeEventListener('visibilitychange', onForeground);
      window.clearInterval(snapshotTimer);
      window.clearTimeout(clockTimer);
    };
  });
</script>

<svelte:window onkeydown={onKeydown} />

<div class="viewport">
  <div class="stage" style={scale === 1 ? undefined : 'transform: scale(' + scale + ')'}>
    <header class="top">
      <time class="clock">{clock}</time>
      <div class={'status is-' + status.cls}>
        <span class="status-dot"></span>
        <span>{status.label}</span>
        {#if notice}
          <span class="status-notice">{notice}</span>
        {/if}
      </div>
    </header>

    <section class="summary">
      {#if dashboard.columns && dashboard.columns.length}
        <div class="digest" style={'grid-template-columns: repeat(' + dashboard.columns.length + ', minmax(0, 1fr))'}>
          {#each dashboard.columns as column (column.title)}
            <section class="digest-col">
              <h2>{column.title}</h2>
              <ul class="digest-items">
                {#each column.items as item}
                  <li>{item}</li>
                {/each}
              </ul>
            </section>
          {/each}
        </div>
      {:else}
        <p class="summary-text">{dashboard.summary}</p>
      {/if}
    </section>

    <div class="actions-wrap" bind:this={actionsRoot}>
      <div class="actions">
        {#each dashboard.actions as action (action.id)}
          <button
            type="button"
            data-action-id={action.id}
            class:is-selected={action.id === selectedId}
            class:is-running={action.id === runningId}
            onclick={() => onRun(action.id)}
          >
            {action.title}
          </button>
        {/each}
      </div>
    </div>
  </div>
</div>
