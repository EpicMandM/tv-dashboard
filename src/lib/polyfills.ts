const root = window as unknown as Window & {
  globalThis?: unknown;
  queueMicrotask?: (callback: () => void) => void;
  WeakRef?: unknown;
  FinalizationRegistry?: unknown;
};

// Chromium 69 (Tizen 5.5) has no globalThis. Svelte 5 reads it at runtime.
if (typeof globalThis === 'undefined') {
  root.globalThis = window;
}

function define(target: object, name: string, value: unknown) {
  Object.defineProperty(target, name, {
    value,
    configurable: true,
    writable: true
  });
}

if (typeof (Object as { hasOwn?: unknown }).hasOwn !== 'function') {
  define(Object, 'hasOwn', function (obj: object, prop: PropertyKey) {
    return Object.prototype.hasOwnProperty.call(obj, prop);
  });
}

if (typeof root.queueMicrotask !== 'function') {
  root.queueMicrotask = function (callback: () => void) {
    Promise.resolve().then(callback);
  };
}

if (typeof (Promise as { allSettled?: unknown }).allSettled !== 'function') {
  define(Promise, 'allSettled', function (values: unknown[]) {
    return Promise.all(
      values.map((value) =>
        Promise.resolve(value).then(
          (fulfilled) => ({ status: 'fulfilled', value: fulfilled }),
          (reason) => ({ status: 'rejected', reason })
        )
      )
    );
  });
}

const stringProto = String.prototype as String & { replaceAll?: unknown };
if (typeof stringProto.replaceAll !== 'function') {
  define(String.prototype, 'replaceAll', function (this: string, search: string, replacement: string) {
    return this.split(search).join(replacement);
  });
}

if (typeof root.WeakRef === 'undefined') {
  root.WeakRef = function WeakRef(this: { deref: () => object }, target: object) {
    this.deref = function () {
      return target;
    };
  };
}

if (typeof root.FinalizationRegistry === 'undefined') {
  root.FinalizationRegistry = function FinalizationRegistry() {
    return {
      register: function () {},
      unregister: function () {
        return false;
      }
    };
  };
}

export {};
