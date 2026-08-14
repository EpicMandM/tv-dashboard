import type { Dashboard } from './types';
import { isDashboard } from './types';

const TIMEOUT_MS = 8000;

function apiBase(): string {
  const raw = import.meta.env.VITE_API_BASE_URL;
  if (!raw) return '';
  return String(raw).replace(/\/+$/, '');
}

function apiUrl(path: string): string {
  return apiBase() + path;
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (init && init.headers) {
      const extra = init.headers as Record<string, string>;
      for (const key in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, key)) {
          headers[key] = extra[key];
        }
      }
    }

    const response = await fetch(apiUrl(path), {
      method: init && init.method ? init.method : 'GET',
      body: init ? init.body : undefined,
      signal: controller.signal,
      headers
    });

    if (!response.ok) {
      throw new Error('HTTP ' + response.status);
    }

    return response;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function getDashboard(): Promise<Dashboard> {
  const response = await request('/tv');
  const data: unknown = await response.json();
  if (!isDashboard(data)) {
    throw new Error('Invalid dashboard payload');
  }
  return data;
}

export async function runAction(id: string): Promise<void> {
  await request('/actions/' + encodeURIComponent(id), { method: 'POST' });
}
