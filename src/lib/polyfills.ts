const w = window as Window & {
  globalThis?: unknown;
  queueMicrotask?: (cb: () => void) => void;
};

if (typeof globalThis === 'undefined') w.globalThis = window;

if (typeof w.queueMicrotask !== 'function') {
  w.queueMicrotask = function (cb: () => void) {
    Promise.resolve().then(cb);
  };
}
if (typeof (String.prototype as String & { replaceAll?: unknown }).replaceAll !== 'function') {
  Object.defineProperty(String.prototype, 'replaceAll', {
    value: function (this: string, search: string, replacement: string) {
      return this.split(search).join(replacement);
    },
    configurable: true,
    writable: true
  });
}

export {};
