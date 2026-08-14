const SAMSUNG_BACK = 10009;
const SAMSUNG_EXIT = 10182;

function exitApp(): void {
  const app = window.tizen && window.tizen.application
    ? window.tizen.application.getCurrentApplication()
    : null;

  if (app) {
    app.exit();
  }
}

export function initTizen(): () => void {
  const input = window.tizen && window.tizen.tvinputdevice;
  if (input) {
    try {
      input.registerKey('Exit');
    } catch {
      // Already registered, or this profile does not expose the key.
    }
  }

  const onHwKey = (event: Event) => {
    const keyName = (event as Event & { keyName?: string }).keyName;
    if (keyName === 'back' || keyName === 'Back') {
      event.preventDefault();
      exitApp();
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.keyCode === SAMSUNG_BACK || event.keyCode === SAMSUNG_EXIT) {
      event.preventDefault();
      exitApp();
    }
  };

  window.addEventListener('tizenhwkey', onHwKey);
  window.addEventListener('keydown', onKeyDown);

  return () => {
    window.removeEventListener('tizenhwkey', onHwKey);
    window.removeEventListener('keydown', onKeyDown);
  };
}
