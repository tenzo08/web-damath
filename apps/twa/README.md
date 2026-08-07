# Damath — Android APK (sideload, Trusted Web Activity)

A downloadable Android APK, built from the already-deployed PWA rather than a second
native codebase — [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) wraps the
live site in a Trusted Web Activity (a full-screen Chrome instance with no browser
chrome), so the APK always reflects whatever's actually deployed. **Sideload only, by
deliberate choice** — a Play Store listing needs a one-time $25 Google Play developer
account and a formal review process; this is a plain APK download from the site's own
footer instead.

**This pipeline is configuration, not something verified in this environment** — same
scope-down as this project's own `apps/server/Dockerfile`/`apps/web/Dockerfile`
(TASK.md: "not build-verified against a real Docker daemon... the sandbox has no running
daemon") and `vercel.json`/`render.yaml` ("Actual deployment... needs the user's own
hosting accounts and secrets"). Building a real signed APK needs the Android SDK + a JDK,
neither present here, and the manifest below needs a real deployed HTTPS domain, which
this project hasn't been deployed to yet either. Everything here is correct, standard
Bubblewrap/TWA configuration — it just hasn't (and can't, from this environment) been run
for real.

## One-time setup (you, not this pipeline)

1. **Deploy the web app for real** (`vercel.json` is ready — connect the repo to Vercel).
   A Trusted Web Activity must point at a real HTTPS origin; it can't wrap `localhost`.
2. **Replace every `REPLACE_WITH_DEPLOYED_DOMAIN` in `twa-manifest.json`** with that
   domain (e.g. `web-damath.vercel.app`), no scheme for `host`, full `https://` URLs
   elsewhere in the file.
3. **Generate a signing keystore once, locally**, and keep it forever — Android refuses
   to install an "update" signed with a different key than the currently-installed app,
   so the same keystore has to sign every future build:
   ```bash
   keytool -genkeypair -v -keystore android.keystore -alias damath \
     -keyalg RSA -keysize 2048 -validity 10000
   ```
4. **Add these as GitHub Actions repository secrets** (Settings → Secrets and
   variables → Actions), so `.github/workflows/build-apk.yml` can use the same keystore
   on every run without it ever being committed to the repo:
   - `ANDROID_KEYSTORE_BASE64` — `base64 -w0 android.keystore` (or `certutil -encode` on
     Windows), the whole output
   - `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_PASSWORD` — whatever you set in step 3
5. **Digital Asset Links** — once the first build runs, Bubblewrap prints a
   `assetlinks.json` snippet (also derivable from the keystore's SHA-256 fingerprint,
   `keytool -list -v -keystore android.keystore`). Publish it at
   `https://<your-domain>/.well-known/assetlinks.json` (drop it in `apps/web/public/`) —
   without it, the APK still works but opens with a visible browser address bar instead
   of full-screen, since the OS can't verify the app and the site are the same publisher.
6. **Turn the workflow on**: Settings → Secrets and variables → Actions → Variables →
   add `APK_ENABLED` = `true`. Left unset, `build-apk.yml` skips every run rather than
   failing red on a repo that hasn't done steps 1–5 yet.

After that, `.github/workflows/build-apk.yml` handles every future rebuild on its own —
push to `main`, and a fresh APK signed with the same key is published to the repo's
`latest` GitHub Release within a few minutes. (The web app's footer was later
simplified down to just the creator credit — link the release URL from wherever makes
sense once this pipeline is actually turned on.)

## What the APK can and can't do offline

Same as the PWA it wraps (`apps/web/vite.config.ts`'s `VitePWA` config, Milestone 6):
local hot-seat play and vs-the-computer practice mode work with zero network, since the
app shell is precached and the AI runs in a Web Worker. Play Online, tournaments, sign-in,
and the leaderboard all need the live server and degrade to their existing
"can't reach the server" messaging offline — the APK is a wrapper, not a second backend.
