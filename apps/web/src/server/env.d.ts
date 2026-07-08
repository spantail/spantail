// Injected by Vite `define` (and the vitest config) from `git describe` at build
// time. The client declares the same global in src/client/env.d.ts; the server
// tsconfig compiles a separate program, so it needs its own declaration. See
// apps/web/version.ts.
declare const __APP_VERSION__: string;
