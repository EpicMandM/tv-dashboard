// GET /tv = screen. POST /actions/:id → 204.
// home = back. Cached id switches the snapshot. Else host writes running, then the result.

export const SEED = {
  summary:
    'Сегодня нет срочных дел. Можно спокойно спланировать завтра и проверить, что прошло мимо внимания.',
  actions: [
    { id: 'plan-tomorrow', title: 'План на завтра' },
    { id: 'what-missed', title: 'Что я упустил?' }
  ],
  status: 'ready'
};

const CACHE = 'tv-dashboard-v5';
const TIMEOUT_MS = 8000;

export function isDashboard(value) {
  if (!value || typeof value !== 'object') return false;
  const p = value;
  if (typeof p.summary !== 'string' || p.summary.length > 800) return false;
  if (p.status !== 'ready' && p.status !== 'running' && p.status !== 'error' && p.status !== 'degraded') {
    return false;
  }
  if (p.action !== undefined && (typeof p.action !== 'string' || p.action.length > 64)) return false;
  if (p.columns !== undefined && p.columns !== null) {
    if (!Array.isArray(p.columns) || p.columns.length > 3) return false;
    const titles = {};
    for (let i = 0; i < p.columns.length; i += 1) {
      const col = p.columns[i];
      if (
        !col ||
        typeof col.title !== 'string' ||
        !col.title ||
        col.title.length > 80 ||
        titles[col.title] ||
        !Array.isArray(col.items) ||
        !col.items.length ||
        col.items.length > 12
      ) {
        return false;
      }
      titles[col.title] = true;
      for (let j = 0; j < col.items.length; j += 1) {
        if (typeof col.items[j] !== 'string' || !col.items[j] || col.items[j].length > 220) return false;
      }
    }
  }
  if (!Array.isArray(p.actions) || p.actions.length < 1 || p.actions.length > 4) return false;
  const seen = {};
  for (let i = 0; i < p.actions.length; i += 1) {
    const a = p.actions[i];
    if (
      !a ||
      typeof a.id !== 'string' ||
      !a.id ||
      a.id.length > 64 ||
      typeof a.title !== 'string' ||
      !a.title ||
      a.title.length > 80 ||
      seen[a.id]
    ) {
      return false;
    }
    seen[a.id] = true;
  }
  return true;
}

export function sameView(a, b) {
  if (a.summary !== b.summary) return false;
  if (a.actions.length !== b.actions.length) return false;
  for (let i = 0; i < a.actions.length; i += 1) {
    const left = a.actions[i];
    const right = b.actions[i];
    if (!left || !right || left.id !== right.id || left.title !== right.title) return false;
  }
  const ac = a.columns;
  const bc = b.columns;
  if (!ac && !bc) return true;
  if (!ac || !bc || ac.length !== bc.length) return false;
  for (let i = 0; i < ac.length; i += 1) {
    const colA = ac[i];
    const colB = bc[i];
    if (!colA || !colB || colA.title !== colB.title) return false;
    const ai = colA.items;
    const bi = colB.items;
    if (ai.length !== bi.length) return false;
    for (let j = 0; j < ai.length; j += 1) {
      if (ai[j] !== bi[j]) return false;
    }
  }
  return true;
}

function copyDashboard(data) {
  const actions = [];
  for (let i = 0; i < data.actions.length; i += 1) {
    const action = data.actions[i];
    if (!action) continue;
    actions.push({ id: action.id, title: action.title });
  }
  const out = {
    summary: data.summary,
    actions: actions,
    status: data.status
  };
  if (data.action !== undefined) out.action = data.action;
  if (Array.isArray(data.columns)) {
    const columns = [];
    for (let i = 0; i < data.columns.length; i += 1) {
      const col = data.columns[i];
      if (!col) continue;
      const items = [];
      const src = col.items;
      for (let j = 0; j < src.length; j += 1) {
        const item = src[j];
        if (item !== undefined) items.push(item);
      }
      columns.push({ title: col.title, items: items });
    }
    out.columns = columns;
  }
  return out;
}

export function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return isDashboard(data) && data.status === 'ready' ? copyDashboard(data) : null;
  } catch {
    return null;
  }
}

export function saveCache(data) {
  if (data.status !== 'ready') return;
  try {
    localStorage.setItem(CACHE, JSON.stringify(data));
  } catch {}
}

export function isAbortError(err) {
  return !!err && typeof err === 'object' && err.name === 'AbortError';
}

function apiUrl(path) {
  return String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '') + path;
}

async function request(path, init) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = window.setTimeout(function () {
    timedOut = true;
    controller.abort();
  }, TIMEOUT_MS);
  const extra = init && init.signal;
  function onAbort() {
    controller.abort();
  }
  if (extra) {
    if (extra.aborted) controller.abort();
    else extra.addEventListener('abort', onAbort);
  }
  try {
    const response = await fetch(apiUrl(path), {
      method: init && init.method ? init.method : 'GET',
      body: init ? init.body : undefined,
      signal: controller.signal,
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response;
  } catch (err) {
    if (extra && extra.aborted) throw err;
    if (timedOut && isAbortError(err)) throw new Error('timeout');
    throw err;
  } finally {
    window.clearTimeout(timer);
    if (extra) extra.removeEventListener('abort', onAbort);
  }
}

export async function getDashboard(signal) {
  const data = await (await request('/tv', signal ? { signal } : undefined)).json();
  if (!isDashboard(data)) throw new Error('Invalid dashboard payload');
  return copyDashboard(data);
}

export async function runAction(id, signal) {
  await request('/actions/' + encodeURIComponent(id), { method: 'POST', signal });
}
