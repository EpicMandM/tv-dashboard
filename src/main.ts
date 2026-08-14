import './lib/polyfills';
import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';

function bootError(message: string) {
  const el = document.getElementById('app') || document.body;
  el.innerHTML =
    '<pre style="color:#f3f7fb;background:#1a1010;font-size:28px;padding:48px;white-space:pre-wrap;line-height:1.35">' +
    String(message).replace(/&/g, '&amp;').replace(/</g, '&lt;') +
    '</pre>';
}

window.onerror = function (msg, src, line, col) {
  bootError(String(msg) + '\n' + String(src) + ':' + String(line) + ':' + String(col));
  return false;
};
window.onunhandledrejection = function (event) {
  const reason = event && event.reason ? event.reason : event;
  bootError(reason && reason.stack ? reason.stack : String(reason));
};

const target = document.getElementById('app');
if (!target) throw new Error('Missing #app');
try {
  mount(App, { target });
} catch (err) {
  bootError(err && (err as Error).stack ? String((err as Error).stack) : String(err));
}
