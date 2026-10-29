/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Версия проекта из корневого package.json (подставляется в vite.config.ts). */
  readonly VITE_APP_VERSION: string;
}
