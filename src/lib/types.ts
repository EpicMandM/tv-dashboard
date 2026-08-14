export type TvAction = {
  id: string;
  title: string;
};

export type Dashboard = {
  summary: string;
  actions: TvAction[];
  status: string;
};

export function isDashboard(value: unknown): value is Dashboard {
  if (!value || typeof value !== 'object') return false;

  const payload = value as { summary?: unknown; actions?: unknown; status?: unknown };
  if (typeof payload.summary !== 'string' || typeof payload.status !== 'string') return false;
  if (!Array.isArray(payload.actions)) return false;
  if (payload.actions.length < 1 || payload.actions.length > 4) return false;

  for (let i = 0; i < payload.actions.length; i += 1) {
    const action = payload.actions[i] as { id?: unknown; title?: unknown };
    if (!action || typeof action.id !== 'string' || !action.id) return false;
    if (typeof action.title !== 'string' || !action.title) return false;
  }

  return true;
}
