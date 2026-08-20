import './lib/polyfills';
import './app.css';
import { startApp } from './app';

function bootError(message) {
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

try {
  startApp();
} catch (err) {
  bootError(err && err.stack ? String(err.stack) : String(err));
}
