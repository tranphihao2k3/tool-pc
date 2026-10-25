# Auto-update guide (Task 11)

PC Manager Pro ships with built-in auto-update via GitHub Releases using
[`tauri-plugin-updater`](https://v2.tauri.app/plugin/updater/).

## How it works

1. **User clicks "Check for updates"** in Settings → About tab
2. Frontend calls `check_for_update` Rust command
3. Rust queries `https://github.com/<OWNER>/<REPO>/releases/latest/download/latest.json`
4. If a newer version is found, the dialog shows release notes + "Download and install" button
5. User clicks → `download_and_install_update` is invoked
6. Plugin downloads the `.msi`/`.exe`, verifies signature, runs the installer in passive mode
7. Windows installer restarts the app automatically

## One-time setup

### 1. Generate a signing keypair

```bash
node scripts/gen-signer.mjs --password MY_PASSWORD
```

This creates `~/.tauri/pc-manager-pro.key` (private — **DO NOT COMMIT**)
and writes the public key into `src-tauri/tauri.conf.json` under
`plugins.updater.pubkey`.

### 2. Configure the updater endpoint

Edit `src-tauri/tauri.conf.json` and replace `<OWNER>` / `<REPO>` with
your GitHub namespace and repository name:

```json
"updater": {
  "endpoints": [
    "https://github.com/<OWNER>/<REPO>/releases/latest/download/latest.json"
  ],
  "pubkey": "<generated-public-key>"
}
```

### 3. Add secrets to GitHub

Repository → Settings → Secrets and variables → Actions → New repository secret:

| Secret name                        | Value                                          |
|------------------------------------|------------------------------------------------|
| `TAURI_SIGNER_PRIVATE_KEY`         | Base64 contents of `~/.tauri/pc-manager-pro.key` |
| `TAURI_SIGNER_PRIVATE_KEY_PASSWORD`| Password from step 1                            |

### 4. Push a release tag

```bash
# Update version in package.json AND src-tauri/Cargo.toml AND src-tauri/tauri.conf.json
git tag v0.1.1
git push --tags
```

The workflow at `.github/workflows/release.yml` runs automatically:
builds the signed `.msi` and `.exe`, uploads them as a **draft** GitHub Release,
and includes the `latest.json` manifest required by the updater plugin.

When you publish the draft release, the in-app updater will detect it on
the next check.

## Local testing

In dev mode the updater is **disabled** (it only works in production builds).
To smoke-test:

1. `npm run tauri:build` → produces signed `.msi` and `latest.json` in
   `src-tauri/target/release/bundle/{msi,nsis,updater}/`
2. Install the `.msi` from the bundle output
3. Edit a small change, bump version to `0.1.1`, rebuild
4. Create a local GitHub release tagged `v0.1.1` and attach the new artifacts
5. Open the installed app → Settings → About → "Check for updates" → see 0.1.1
6. Click "Download and install" → app restarts with the new version

## Manual release without GitHub Action

If you prefer to build locally and upload manually:

```bash
# 1. Set the env vars so the updater signs the artifacts
export TAURI_SIGNER_PRIVATE_KEY="$(cat ~/.tauri/pc-manager-pro.key)"
export TAURI_SIGNER_PRIVATE_KEY_PASSWORD="MY_PASSWORD"

# 2. Build
node scripts/build-release.mjs

# 3. Upload to a new GitHub release (draft) and publish
gh release create v0.1.1 \
  src-tauri/target/release/bundle/msi/*.msi \
  src-tauri/target/release/bundle/nsis/*.exe \
  src-tauri/target/release/bundle/updater/*.json \
  --title "PC Manager Pro v0.1.1" \
  --draft
```

## Notes

- `latest.json` is generated automatically by `tauri build` and contains the
  download URL, signature, and version of each platform's installer.
- The app will not auto-update in dev mode — only when installed via the
  `.msi` or `.exe` installer.
- The Windows installer uses `passive` install mode (no UI), so the user
  sees only the progress bar inside the app, not a separate installer window.
- The endpoint URL must use HTTPS and be reachable from the user's machine.
