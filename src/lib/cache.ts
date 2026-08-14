import type { Dashboard } from './types';
import { isDashboard } from './types';

const KEY = 'tv-dashboard-v2';

export const SEED_DASHBOARD: Dashboard = {
  summary:
    'Сегодня нет срочных дел. Можно спокойно спланировать завтра и проверить, что прошло мимо внимания.',
  actions: [
    { id: 'plan-tomorrow', title: 'План на завтра' },
    { id: 'what-missed', title: 'Что я упустил?' }
  ],
  status: 'ready'
};

export function loadCache(): Dashboard | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data: unknown = JSON.parse(raw);
    return isDashboard(data) ? data : null;
  } catch {
    return null;
  }
}

export function saveCache(data: Dashboard): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Private mode or quota — keep going with in-memory state.
  }
}
