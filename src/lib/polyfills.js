const w = window;

if (typeof globalThis === 'undefined') w.globalThis = window;

if (typeof w.queueMicrotask !== 'function') {
  w.queueMicrotask = function (cb) {
    Promise.resolve().then(cb);
  };
}
if (typeof String.prototype.replaceAll !== 'function') {
  Object.defineProperty(String.prototype, 'replaceAll', {
    value: function (search, replacement) {
      return this.split(search).join(replacement);
    },
    configurable: true,
    writable: true
  });
}
