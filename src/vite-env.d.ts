/// <reference types="svelte" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface TizenApplication {
  exit(): void;
}

interface TizenInputDevice {
  registerKey(keyName: string): void;
}

interface Tizen {
  application?: {
    getCurrentApplication(): TizenApplication;
  };
  tvinputdevice?: TizenInputDevice;
}

interface Window {
  tizen?: Tizen;
}

interface WindowEventMap {
  tizenhwkey: Event;
}
