/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly FASTMAIL_OAUTH_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
