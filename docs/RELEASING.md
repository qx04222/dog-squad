# Dog Squad release runbook

Dog Squad has two independent signed channels:

- App releases ship the Electron engine, UI and bundled campaign as a macOS ZIP/DMG. `app-publisher-2026` signs a small update manifest; the ZIP bytes are bound by exact size and SHA-256.
- Content releases ship data-only `.dogpack` files. `publisher-2026` signs the content and catalog. Content validation uses `CONTENT_API_VERSION`, which remains `6.0.0` even though the public product version restarted at `1.0.0`.

The bundle ID (`com.dogsquad.game`), save key (`dog-squad-v4`) and level IDs are permanent compatibility identifiers. Do not change them for a marketing version reset.

## Version and epoch policy

`package.json` and `src/content.js` expose the user-facing semantic version. `desktop/release-config.json.releaseEpoch` is a separate, strictly increasing integer used only to order app releases.

| Public release | releaseEpoch |
| --- | ---: |
| isolated 0.9.9 update fixture, never published | 1 |
| 1.0.0 | 2 |
| next app release | 3 |

Never reuse an epoch or publish different bytes at an existing version/tag. The former local 6.0 build has no custom updater and therefore requires one manual installation of public 1.0. After that bootstrap, later releases can be downloaded, verified and installed in-app.

## Build and test

Use a clean dependency install and run all validation before signing a manifest:

```sh
npm ci
npm test
npm run check
npm run build
node scripts/native-build.cjs
```

The public community build is ad-hoc code signed and independently authenticated by the embedded Ed25519 app-release key. It is not Apple notarized, so first launch on another Mac can still show Gatekeeper friction. A Developer ID/notarized build remains the preferred future distribution tier; the Ed25519 manifest is still required for this updater.

Confirm `dist/mac/Dog-Squad-VERSION-arm64.zip` contains one `Dog Squad.app` root, has bundle ID `com.dogsquad.game`, has the same `CFBundleShortVersionString`, includes arm64, and passes:

```sh
codesign --verify --deep --strict "Dog Squad.app"
```

Install the DMG on a clean macOS account and verify launch, local save continuity, all three sprite atlases, one playable mission and offline reopen. A green unit suite does not replace this check.

## Sign the app manifest

The app updater private key must remain outside the repository with mode `0600`. Pass its path as an environment variable or secret-mounted file. Never print it, copy it into an artifact or store it in GitHub Actions without an approved secret-management decision.

```sh
node scripts/app-release.cjs \
  --artifact "dist/mac/Dog-Squad-1.0.0-arm64.zip" \
  --version 1.0.0 \
  --epoch 2 \
  --key "$DOG_SQUAD_APP_UPDATE_PRIVATE_KEY" \
  --key-id app-publisher-2026 \
  --output "site/updates/app.json" \
  --notes "Dog Squad public 1.0"
```

The command refuses a private key inside the project or with group/other permissions, enforces the exact GitHub asset name and URL, hashes the final ZIP, and writes a signed envelope. It never prints private key material.

## Publish order

1. Create tag `vVERSION` and a GitHub Release in `qx04222/dog-squad`.
2. Upload the final ZIP and DMG. Do not mutate either asset after this point.
3. Verify the public ZIP URL, byte size and SHA-256 against the decoded signed manifest.
4. Publish the already-signed `site/updates/app.json` to GitHub Pages last.
5. Fetch the Pages URL without credentials and follow the real GitHub release redirect. Confirm the client accepts the response and downloaded ZIP.
6. From the prior installed version, check, download, choose restart outside combat, observe the new version health handshake, then verify saves and settings.
7. Repeat with an intentionally broken candidate in an isolated copy to preserve evidence that the old bundle is restored.

The client checks about five seconds after startup and every six hours. It downloads in the background when automatic updates are enabled, but only installs after the player chooses restart outside combat. It accepts only the fixed Pages manifest, the exact `qx04222/dog-squad` release path and one redirect to `release-assets.githubusercontent.com`.

## Installer recovery evidence

The detached helper waits for the old PID to exit, swaps bundles on the same filesystem, verifies the new code signature, and starts the exact new executable. The trusted renderer reports health only after game bootstrap, a successful draw and all pet, enemy and boss atlases are ready. The helper keeps observing the new PID for three seconds after health.

Missing health, early exit or exit during that stability window stops the new PID and restores the old bundle. The helper writes a bounded receipt under the app user-data `app-updates` directory. Preserve the receipt and both bundles when a rollback move itself fails. The updater never reads, moves or deletes save files.

If the app is running from a read-only DMG, or the parent of the installed `.app` is not writable, automatic replacement stops before the current app is moved. The verified ZIP remains available, and the player must install manually. Test this path on the final package.

## Signing key rotation and compromise

Keep app and content keys separate. Back up each private key in an encrypted offline location with access limited to the publisher.

For a planned app-key rotation, first release an app signed by the old trusted key that embeds both old and new public keys. After that release is broadly installed, sign later manifests with the new key. Keep the old public key during a documented transition, then remove it in a later app release.

If an app signing key may be compromised, stop publishing manifests immediately. Do not use the compromised key to establish a replacement as if the chain were still trustworthy. Publish a fresh manually installed bootstrap with a new embedded public key, document the incident, revoke the old key in code, and require users to verify the new download through the public repository and published checksums.

Content-key rotation follows the same two-step trust overlap, but cannot authorize an app update. An app key cannot sign `.dogpack` content unless its public key is also deliberately placed in `contentPublicKeys`.

## Release gate

Do not call automatic updates complete until all of these have current evidence:

- full tests and release preflight pass on the integrated source;
- final ZIP passes path, expansion-size, symlink, bundle, architecture and code-signature validation;
- signed Pages manifest and GitHub redirect work over the public network;
- installed prior version completes a real update and retains its save;
- missing-health candidate rolls back to the prior app;
- read-only or non-writable install location leaves the prior app intact;
- DMG first launch behavior is recorded on a clean Mac, including the lack or presence of Apple notarization.

## Forks and independent publishers

The example configuration intentionally contains placeholders and cannot pass release preflight until filled. A fork must also replace the fixed repository identity and bundle identity in `desktop/app-update.cjs` and the fixed asset URL in `scripts/app-release.cjs`, along with its application ID, signing public keys, and Pages URLs. Do not point a fork at the original project's update channel: an update must belong to the exact app and publisher the player installed.

## Content catalog

The initial public content feed is a signed empty catalog: `{"schema":1,"type":"catalog","version":1,"packs":[]}`. The built-in campaign does not need an external pack. To release a chapter, validate and sign its data with `scripts/pack-sign.cjs`, host the resulting file on the same HTTPS origin as the catalog, add its stable ID, semantic version, URL and SHA-256 to `packs`, increment the catalog version, then sign the catalog. Publish the pack before the catalog. Never upload the private key. Content examples in `content/expansions/` are authoring templates, not automatically installed DLC.
