# InfectedVoices-Windows

Windows shell and signed-installer path for [Infected Voices Core](https://github.com/grimvirusoffical-source/InfectedVoices). Core commit `667ae1cb2edac499b773fb9f688b6b46484a558d` (Cap PR #3, Stress PASS) is the parity source, pinned as a sparse submodule at `core/`. This repository does not fork DSP. The submodule does not check out `vendor/` (the studio DSP archive), `ios/`, `android/`, `assets/`, or EAS.

Free, Basic ($20), and Pro ($40) live in Core. A signed-in account is Free until Basic, Pro, or a 7-day trial. This shell does not reimplement those gates and does not sell a plan.

## /get

Core serves one page at `/get` and `/download`. It does not host an ipa or an aab. There is no Mac .app.

When a signed Windows installer is cut, it is published on GitHub Releases for **this** repository, and its SHA-256 is published beside that asset. Until then [`release/SHA256SUMS.txt`](release/SHA256SUMS.txt) is **UNPROVISIONED**. The script refuses to invent a digest.

The Core tag `Release` (v0.4.0, branch `native/v040-unified-studio`) is a source zipball:

https://github.com/grimvirusoffical-source/InfectedVoices/zipball/Release

That zipball is source, not the Windows installer. Nothing here repackages it as a setup file.

## Shell

The host is a WebView2 window (`shell/`). It loads the synced Core payload from `https://infectedvoices.localhost/` and injects `shell/ShellPreload.js`. The preload sets `window.ivDesktop` to channel `unprovisioned`. It does not contact an update server and does not download a replacement build. Takes and projects stay in the WebView2 user-data folder under `%LOCALAPPDATA%\InfectedVoices`.

`payload/` is local build output and is not committed.

## Sync and build

Requires Node.js 20 or newer. The Windows publish also needs the .NET 8 SDK (Windows desktop workload) and the WebView2 Evergreen Runtime on the machine that runs the app.

```bash
node scripts/sync-core.mjs
node scripts/sync-core.mjs --build
node scripts/build.mjs
```

`sync-core.mjs` checks out the `core/` submodule at `CORE-PIN` with a sparse cone (`scripts`, `download`, `docs`, `browser-src`, `mobile-src`, `studio`). `.gitmodules` sets `update = none`, so a normal clone does not pull DSP, iOS, Android, or EAS.

`--build` checks out `vendor/` at that same pin, runs Core's `npm run build:browser` (which runs `build:web`), copies `browser-dist` to `payload/`, then removes `vendor/` from the worktree. The Capacitor `dist/` tree expects the mobile `ivShell` bridge, so it is not the document root. DSP bytes are not committed here.

On Windows, `build.mjs` publishes an **unsigned** shell to `release/publish/`. That folder is not a Release. On any other OS the same command checks the payload pin and exits without creating an installer.

## Sign and release

Authenticode material stays outside the repo.

- `IV_AUTHENTICODE_PFX` and `IV_AUTHENTICODE_PASSWORD`, or
- `IV_AUTHENTICODE_THUMBPRINT` (certificate already in the Windows certificate store)

```bash
node scripts/build.mjs --sign
node scripts/build.mjs --release
```

`--sign` and `--release` exit with status 2 when a certificate is missing. They do not write a signature, an installer, or a checksum. `--release` also requires Windows, `signtool`, and Inno Setup 6 (`ISCC.exe`). If those are missing it exits 2 and leaves `release/SHA256SUMS.txt` UNPROVISIONED. A folder or zip is not published in place of the installer.

After a real signed `InfectedVoices-Setup.exe` is produced, the script writes that file's SHA-256 into `release/SHA256SUMS.txt`. Cut the GitHub Release from that signed file only.
