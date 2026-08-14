const w = window as Window & {
  globalThis?: unknown;
  queueMicrotask?: (cb: () => void) => void;
  WeakRef?: unknown;
  FinalizationRegistry?: unknown;
};

if (typeof globalThis === 'undefined') w.globalThis = window;

function define(target: object, name: string, value: unknown) {
  Object.defineProperty(target, name, { value, configurable: true, writable: true });
}

if (typeof (Object as { hasOwn?: unknown }).hasOwn !== 'function') {
  define(Object, 'hasOwn', function (obj: object, prop: PropertyKey) {
    return Object.prototype.hasOwnProperty.call(obj, prop);
  });
}
if (typeof w.queueMicrotask !== 'function') {
  w.queueMicrotask = function (cb: () => void) {
    Promise.resolve().then(cb);
  };
}
if (typeof (Promise as { allSettled?: unknown }).allSettled !== 'function') {
  define(Promise, 'allSettled', function (values: unknown[]) {
    return Promise.all(
      values.map((value) =>
        Promise.resolve(value).then(
          (ok) => ({ status: 'fulfilled', value: ok }),
          (reason) => ({ status: 'rejected', reason })
        )
      )
    );
  });
}
if (typeof (String.prototype as String & { replaceAll?: unknown }).replaceAll !== 'function') {
  define(String.prototype, 'replaceAll', function (this: string, search: string, replacement: string) {
    return this.split(search).join(replacement);
  });
}
if (typeof w.WeakRef === 'undefined') {
  w.WeakRef = function WeakRef(this: { deref: () => object }, target: object) {
    this.deref = function () {
      return target;
    };
  };
}
if (typeof w.FinalizationRegistry === 'undefined') {
  w.FinalizationRegistry = function FinalizationRegistry() {
    return { register: function () {}, unregister: function () { return false; } };
  };
}

export {};
