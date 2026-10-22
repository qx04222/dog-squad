# Third-party notices

Dog Squad's own code is MIT-licensed. Project illustrations and story text have the separate license in `LICENSE-ASSETS.md`.

The desktop distribution bundles Electron and its runtime components. Their licenses and notices remain included in the application distribution, including Electron's `LICENSE` and Chromium's `LICENSES.chromium.html`. Do not remove these files when redistributing a modified app.

| Direct dependency | Role | Declared license |
| --- | --- | --- |
| Electron 45.0.0 | Desktop runtime | MIT; bundled components have additional notices |
| electron-builder 26.15.3 | Development/packaging | MIT |

The exact dependency graph is locked in `package-lock.json`. Transitive dependencies retain the license and copyright notices in their own packages. A lockfile is a version inventory, not a replacement for those licenses.

The browser game uses system fonts, project-authored procedural sound, and the illustrated assets documented in `assets/PROVENANCE.md`; it does not load a third-party music library, remote font, analytics script, or CDN at runtime.
