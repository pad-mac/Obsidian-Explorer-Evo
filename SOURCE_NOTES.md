# Source notes

This repository snapshot is the source tree for Grid Explorer NativeNav v11.

- `src/` is the authoritative implementation.
- `styles.css` is source CSS used directly by the plugin.
- `manifest.json`, `package.json`, `package-lock.json`, `tsconfig.json`, and `esbuild.config.mjs` define the plugin/build environment.
- `NATIVE_NAVIGATION_REWRITE.md` documents the major architectural rewrite and subsequent additions.
- `main.js` is intentionally not included in this GitHub/source archive because it is generated build output. Use the project build scripts to produce it.
- `bundle_without_esbuild.py` is retained because it was used as a platform-independent fallback bundling path during development.

For agentic editing, modify the TypeScript files under `src/` rather than generated JavaScript.
