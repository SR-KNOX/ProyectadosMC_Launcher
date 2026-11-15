# PROYECTADOS Launcher — AGENTS.md

Local quick-reference for this repo. It is the only git repository in the workspace;
the parent folder (`Proyecto predeterminado/`) is NOT a repo.

Electron app "Proyectados MC" (game: Minecraft **1.20.1 + Forge 47.4.28**). Public for the
Proyectados MC community; distributed free as an unsigned Windows installer.

Remote: `SR-KNOX/PMC_Launcher_Source` (private; one squashed v2.0.0 snapshot commit).
ALL current 0.3.x work lives ONLY in the uncommitted working tree — **never**
`git checkout .` / `git clean -fd` / force-push.

## Commands

```powershell
npm start      # dev run — opens a real OS window, reads/writes the REAL profile
               # at %APPDATA%/Proyectados MC/profile.json and the game instance at
               # the folder saved there. Don't run it casually on someone else's PC.
npm run build  # electron-builder -> dist/Proyectados MC Setup <version>.exe (NSIS, unsigned)
```

- Use `npm.cmd` / `npx.cmd` on Windows — plain `npm` is blocked by PowerShell execution policy.
- No test runner, no lint, no typecheck. Verification: `node --check <file>` (ESM,
  copy to `.mjs`), plus `tools/packaged-check.js [port]` to probe the packaged app via CDP.
- CI: `.github/workflows/build.yml` builds the Windows installer only on tags `v*`. Node 20.
- Node 20+ required; `npm ci` in CI, not `npm install`.

## Layout / wiring

- `src/main.js` — Electron main process. All system/network/Git work lives here; IPC
  handlers (`instance:status`, `instance:install`, `updates:check`, `updates:apply`, ...).
- `src/ui/index.html` — Opciones: selector de **Rendimiento del juego** (`auto | low | medium | high`);
  toca `state.perfLevel`, se persiste en el perfil y `mc.js` lo aplica a JVM flags y al options.txt.
- `src/preload.js` — the only bridge. Exposes `window.api` (invoke-style) and event
  subscription via `window.api.on(channel, cb)`; channels: `install:progress`,
  `launch:error`, `launch:oom`, `game:launched`, `launch:closed`, `install:error`.
- `src/lib/` — CommonJS. `manifest.js` is the LIVE updater (diff, download, verify,
  apply). `modpack.js` is LEGACY (zip-of-mods flow, do not extend). `net.js` safe-URL
  fetch, `mc.js` Forge/launch, `java.js` Java detection, `zip.js`, `cds.js`.
- `src/ui/` — renderer (ES modules, no bundler). `js/screens/` = view only;
  `js/services/` = system/network logic; `js/ui/` = primitives (toast, news, progress...).
  `app://` protocol serves the UI (file:// breaks ES modules); screens degrade gracefully
  without `window.api` — used for browser QA with a static server (seed localStorage
  `nick`/`folder`/`ram`/`played=1` to skip onboarding).
- Packaging scope: `files: ["src/**/*", "package.json"]` only — docs/tools/scripts never ship.

## Distribution pipeline (mi-server-mods)

Players' update flow (`updates:check/apply` in main):

- Repo `SR-KNOX/mi-server-mods` (PUBLIC). `manifest.json` = version + mods (+ configs,
  which is empty by policy). Mods download from release **assets**; configs served from `main`
  via raw URL. `.pmc-cache.json` (in the instance) caches installed hashes; diff = download
  only what changed; the pack deletes only mods it previously installed (never player-added
  extras). POLICY — **sync is mods-only**: `config: []` is intentional. Configs are the
  player's data; the launcher never downloads/overwrites/repairs any of them, and missing
  config files never trigger "Restaurar". The server (game server) is the authority,
  not the client.
- `logs.json` powers the in-game Logs tab; `releases[0].id` is the unseen cursor
  (`pmc.logsSeen` in localStorage). Adding an entry + bumping `updated` notifies players
  (green dot + "Nuevos cambios" toast).
- Update builds/publish releases from `dist/` + a pack folder; manifest via
  `node tools/generate-manifest.js <pack> [urlBase] [version]`. Never delete release assets
  older packs reference.

## Version bump (all must agree)

`package.json`, `package-lock.json` (2 spots: root + packages[""]), `src/ui/js/config.js`
(`app.version`), `src/ui/index.html` (brand + about `<dd>`), README badges.
Output name derives from `package.json`. Dist artifacts are gitignored (`dist/`).

## Gotchas (bitten before — don't relearn)

- **PowerShell re-encodes UTF-8** into ANSI/mojibake. Never edit text with `Set-Content`/
  `Add-Content`/`-replace`; use Node/Python. The repo shipped double-encoded Spanish
  (`QuÃ©`...) in index.html — always re-check with a byte-level read after edits.
- **CSP meta tag** in `ui/index.html` whitelists every fetch origin. A new API host or CDN
  silently breaks the UI with console errors while other screens work — update `connect-src`.
- **Icons/media/video are binary**; `.gitattributes` in mi-server-mods is `* -text`.
- **screen ≠ file check**: `#navLogs` is a button; the green dot is `#logsDot` (hidden
  attr), toggled by `checkLogs()` on boot; `render()` clears it.
- Launch happens `detached`; `npm start` reads the real profile/instance on the dev machine
  — safe on a dev box, not on a customer's install.
- Installer is **unsigned** — SmartScreen warnings expected for downloaders.
- Electron 45/.builder 26 — do not bump dev majors without updating the CI workflow (node 20).

## File hygiene

`.gitignore` blocks `dist/`, `*.log`, `AUDITORIA*`, `INFORME*`, `LOG_CAMBIOS.md`,
`preview-*.png`. Don't commit reports — and don't ask the agent to keep them either;
delete them. Scratch tooling stays in `tools/` or the OS temp dir, never in `dist/`.
