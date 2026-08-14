// GET /tv = screen. POST /actions/:id → 204.
// home = back. Cached id switches the snapshot. Else host writes running, then the result.

export type TvAction = { id: string; title: string };
export type DigestColumn = { title: string; items: string[] };
export type DashboardStatus = 'ready' | 'running' | 'error' | 'degraded';
export type Dashboard = {
  summary: string;
  actions: TvAction[];
  status: DashboardStatus;
  action?: string;
  columns?: DigestColumn[];
};

export const SEED: Dashboard = {
  summary:
    'Сегодня нет срочных дел. Можно спокойно спланировать завтра и проверить, что прошло мимо внимания.',
  actions: [
    { id: 'plan-tomorrow', title: 'План на завтра' },
    { id: 'what-missed', title: 'Что я упустил?' }
  ],
  status: 'ready'
};

const CACHE = 'tv-dashboard-v4';
const TIMEOUT_MS = 8000;

export function isDashboard(value: unknown): value is Dashboard {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  if (typeof p.summary !== 'string' || p.summary.length > 800) return false;
  if (p.status !== 'ready' && p.status !== 'running' && p.status !== 'error' && p.status !== 'degraded') {
    return false;
  }
  if (p.action !== undefined && (typeof p.action !== 'string' || p.action.length > 64)) return false;
  if (p.columns !== undefined && p.columns !== null) {
    if (!Array.isArray(p.columns) || p.columns.length > 3) return false;
    const titles: Record<string, true> = {};
    for (let i = 0; i < p.columns.length; i += 1) {
      const col = p.columns[i] as { title?: unknown; items?: unknown };
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
  const seen: Record<string, true> = {};
  for (let i = 0; i < p.actions.length; i += 1) {
    const a = p.actions[i] as { id?: unknown; title?: unknown };
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

export function loadCache(): Dashboard | null {
  try {
    const raw = localStorage.getItem(CACHE);
    if (!raw) return null;
    const data: unknown = JSON.parse(raw);
    return isDashboard(data) && data.status !== 'running' ? data : null;
  } catch {
    return null;
  }
}

export function saveCache(data: Dashboard): void {
  if (data.status === 'running') return;
  try {
    localStorage.setItem(CACHE, JSON.stringify(data));
  } catch {}
}

export function isAbortError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError';
}

function apiUrl(path: string): string {
  return String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '') + path;
}

async function request(path: string, init?: RequestInit): Promise<Response> {
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

export async function getDashboard(signal?: AbortSignal): Promise<Dashboard> {
  const data: unknown = await (await request('/tv', signal ? { signal } : undefined)).json();
  if (!isDashboard(data)) throw new Error('Invalid dashboard payload');
  return data;
}

export async function runAction(id: string, signal?: AbortSignal): Promise<void> {
  await request('/actions/' + encodeURIComponent(id), { method: 'POST', signal });
}
