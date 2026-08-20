import {
  getDashboard,
  isAbortError,
  loadCache,
  runAction,
  sameView,
  saveCache,
  SEED
} from './lib/tv';

const SNAPSHOT_MS = 15 * 1000;
const POLL_MS = 2000;
const ACK_MS = 15 * 1000;
const WAIT_MS = 11 * 60 * 1000;
const BACK = 10009;
const EXIT = 10182;

export function startApp() {
  const root = document.getElementById('app');
  if (!root) throw new Error('Missing #app');

  const initial = loadCache() || SEED;
  let dashboard = initial;
  let selectedId = initial.actions[0] ? initial.actions[0].id : '';
  let connection = 'updating';
  let runningId = null;
  let notice = '';
  let nowMs = Date.now();
  let scale = 1;

  let gen = 0;
  let refreshInFlight = false;
  let waiting = false;
  let abort = new AbortController();

  const viewport = document.createElement('div');
  viewport.className = 'viewport';
  const stage = document.createElement('div');
  stage.className = 'stage';
  const top = document.createElement('header');
  top.className = 'top';
  const clockEl = document.createElement('time');
  clockEl.className = 'clock';
  const statusEl = document.createElement('div');
  statusEl.className = 'status';
  const summaryEl = document.createElement('section');
  summaryEl.className = 'summary';
  const actionsWrap = document.createElement('div');
  actionsWrap.className = 'actions-wrap';
  const actionsEl = document.createElement('div');
  actionsEl.className = 'actions';

  top.appendChild(clockEl);
  top.appendChild(statusEl);
  actionsWrap.appendChild(actionsEl);
  stage.appendChild(top);
  stage.appendChild(summaryEl);
  stage.appendChild(actionsWrap);
  viewport.appendChild(stage);
  root.appendChild(viewport);

  function escapeHtml(value) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function clockText() {
    const d = new Date(nowMs);
    const h = d.getHours();
    const m = d.getMinutes();
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  function statusView(dashStatus, conn) {
    if (dashStatus === 'running') return { cls: 'updating', label: 'Готовлю' };
    if (dashStatus === 'error') return { cls: 'offline', label: 'Ошибка' };
    if (dashStatus === 'degraded') return { cls: 'degraded', label: 'Частично' };
    if (conn === 'updating') return { cls: 'updating', label: 'Обновление' };
    if (conn === 'offline') return { cls: 'offline', label: 'Нет сети' };
    return { cls: 'online', label: 'Онлайн' };
  }

  function hasId(actions, id) {
    for (let i = 0; i < actions.length; i += 1) {
      const action = actions[i];
      if (action && action.id === id) return true;
    }
    return false;
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
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

  // Clock/status/scale only — never rebuild action buttons (preserves D-pad focus).
  function paintChrome() {
    const status = statusView(dashboard.status, connection);
    stage.style.transform = scale === 1 ? '' : 'scale(' + scale + ')';
    clockEl.textContent = clockText();
    statusEl.className = 'status is-' + status.cls;
    statusEl.innerHTML =
      '<span class="status-dot"></span><span>' +
      escapeHtml(status.label) +
      '</span>' +
      (notice ? '<span class="status-notice">' + escapeHtml(notice) + '</span>' : '');
  }

  function paintContent() {
    if (dashboard.columns && dashboard.columns.length) {
      let colsHtml = '';
      for (let i = 0; i < dashboard.columns.length; i += 1) {
        const column = dashboard.columns[i];
        if (!column) continue;
        let itemsHtml = '';
        for (let j = 0; j < column.items.length; j += 1) {
          const item = column.items[j];
          if (item === undefined) continue;
          itemsHtml += '<li>' + escapeHtml(item) + '</li>';
        }
        colsHtml +=
          '<section class="digest-col"><h2>' +
          escapeHtml(column.title) +
          '</h2><ul class="digest-items">' +
          itemsHtml +
          '</ul></section>';
      }
      summaryEl.innerHTML =
        '<div class="digest" style="grid-template-columns: repeat(' +
        String(dashboard.columns.length) +
        ', minmax(0, 1fr))">' +
        colsHtml +
        '</div>';
    } else {
      summaryEl.innerHTML = '<p class="summary-text">' + escapeHtml(dashboard.summary) + '</p>';
    }

    let buttons = '';
    for (let i = 0; i < dashboard.actions.length; i += 1) {
      const action = dashboard.actions[i];
      if (!action) continue;
      const classes =
        (action.id === selectedId ? ' is-selected' : '') +
        (action.id === runningId ? ' is-running' : '');
      buttons +=
        '<button type="button" data-action-id="' +
        escapeHtml(action.id) +
        '" class="' +
        classes.trim() +
        '">' +
        escapeHtml(action.title) +
        '</button>';
    }
    actionsEl.innerHTML = buttons;
  }

  function paint() {
    paintChrome();
    paintContent();
  }

  function syncActionClasses() {
    const nodes = actionsEl.children;
    for (let i = 0; i < nodes.length; i += 1) {
      const button = nodes[i];
      if (!(button instanceof HTMLButtonElement)) continue;
      const id = button.getAttribute('data-action-id') || '';
      button.className = (
        (id === selectedId ? 'is-selected' : '') +
        (id === runningId ? ' is-running' : '')
      ).trim();
    }
  }

  function focusSelected() {
    return new Promise(function (resolve) {
      window.setTimeout(function () {
        const button = actionsWrap.querySelector('[data-action-id="' + selectedId + '"]');
        if (button instanceof HTMLButtonElement) button.focus();
        resolve();
      }, 0);
    });
  }

  function apply(next) {
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
    paint();
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
  async function waitForSettle(myGen, id, previous, seenRunning) {
    const started = Date.now();
    const deadline = started + WAIT_MS;
    while (myGen === gen && Date.now() < deadline) {
      let next;
      try {
        next = await getDashboard(abort.signal);
      } catch (err) {
        if (myGen !== gen || isAbortError(err)) return;
        await sleep(POLL_MS);
        continue;
      }
      if (myGen !== gen) return;
      apply(next);
      if (next.status === 'running') {
        seenRunning = true;
        connection = 'updating';
        runningId = next.action || id;
        paintChrome();
        syncActionClasses();
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
        notice = next.status === 'error' ? 'Не удалось обновить' : '';
        paintChrome();
        syncActionClasses();
        return;
      }
      await sleep(POLL_MS);
    }
    if (myGen !== gen) return;
    notice = 'Всё ещё готовится';
    connection = 'online';
    runningId = null;
    paintChrome();
    syncActionClasses();
  }

  async function refresh(silent) {
    if (refreshInFlight || waiting) return;
    refreshInFlight = true;
    if (!silent) {
      connection = 'updating';
      paintChrome();
    }
    try {
      const next = await getDashboard(abort.signal);
      apply(next);
      if (next.status === 'running') {
        connection = 'updating';
        runningId = next.action || runningId;
        paintChrome();
        syncActionClasses();
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
        paintChrome();
        syncActionClasses();
      }
    } catch (err) {
      if (isAbortError(err)) return;
      connection = 'offline';
      paintChrome();
    } finally {
      refreshInFlight = false;
    }
  }

  async function onRun(id) {
    if (runningId && id !== 'home') return;
    const myGen = bump();
    selectedId = id;
    runningId = id === 'home' ? runningId : id;
    notice = '';
    connection = 'updating';
    paintChrome();
    syncActionClasses();
    const previous = dashboard;
    waiting = true;
    try {
      await runAction(id, abort.signal);
      if (myGen !== gen) return;
      await waitForSettle(myGen, id, previous, false);
    } catch (err) {
      if (myGen !== gen || isAbortError(err)) return;
      notice = 'Не удалось выполнить';
      connection = 'offline';
      runningId = null;
      paintChrome();
      syncActionClasses();
    } finally {
      if (myGen === gen) waiting = false;
      await focusSelected();
    }
  }

  function moveSelection(dx, dy) {
    const actions = dashboard.actions;
    let index = 0;
    for (let i = 0; i < actions.length; i += 1) {
      const action = actions[i];
      if (action && action.id === selectedId) index = i;
    }
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
      syncActionClasses();
      void focusSelected();
    }
  }

  function onKeydown(event) {
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
    stage.style.transform = scale === 1 ? '' : 'scale(' + scale + ')';
  }

  function onActionsClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest('[data-action-id]');
    if (!(button instanceof HTMLButtonElement)) return;
    const id = button.getAttribute('data-action-id');
    if (id) void onRun(id);
  }

  function armClock() {
    window.setTimeout(function () {
      nowMs = Date.now();
      paintChrome();
      armClock();
    }, 60000 - (Date.now() % 60000) + 30);
  }

  function onHwKey(event) {
    const keyName = event.keyName;
    if (keyName === 'back' || keyName === 'Back' || keyName === 'Exit') {
      event.preventDefault();
    }
  }

  function onForeground() {
    if (document.visibilityState === 'hidden') return;
    coverTvWindow();
    nowMs = Date.now();
    paintChrome();
    void refresh(false);
  }

  actionsEl.addEventListener('click', onActionsClick);
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('resize', fitScale);
  window.addEventListener('tizenhwkey', onHwKey);
  document.addEventListener('visibilitychange', onForeground);
  window.addEventListener('pageshow', onForeground);
  window.addEventListener('focus', onForeground);

  coverTvWindow();
  const input = window.tizen && window.tizen.tvinputdevice;
  if (input) {
    try {
      input.registerKey('Exit');
    } catch {}
  }

  fitScale();
  armClock();
  paint();
  void refresh(false).then(function () {
    void focusSelected();
  });
  window.setInterval(function () {
    void refresh(true);
  }, SNAPSHOT_MS);
}
