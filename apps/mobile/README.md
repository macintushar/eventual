# Eventual for iPhone and Android

The native Eventual app: Expo / React Native for iOS and Android, built on the same `@eventual/sdk` as the web app. It isn't in the App Store or Play Store yet, so you build it locally. Start commands below from the repository root.

On first launch the app uses hosted Eventual (`https://eventual.macintushar.xyz`). To use your own instance, tap **Change** next to the server on the sign-in screen and enter its address.

## Local development

```sh
bun install
bun run --cwd apps/mobile ios       # builds locally with Xcode, launches Simulator + Metro
bun run --cwd apps/mobile android   # requires Android SDK + emulator/device
bun run --cwd apps/mobile dev       # Metro only, for an already installed development build
bun run --cwd apps/mobile typecheck
bun run --cwd apps/mobile export    # bundle both native platforms without building binaries
```

For a specific iOS device, append `--device` to the iOS command and choose a simulator or attached phone. Physical iOS devices also require local signing configuration. No EAS account or cloud build is used.

Native `ios/` and `android/` directories are generated and ignored. Change app configuration/plugins in `app.json`, then regenerate native projects when needed; don't keep hand-edited native changes in ignored files. Expo's template platform minimums are retained for now; the proposed iOS 17 / Android 11 product minimums are not locked in by this scaffold.

## Included

- Expo Router tabs: Groups, Activity, Account, with native glass navigation and a separate quick-actions button on supported iOS versions.
- Bundled Inter Tight / Instrument Sans, semantic light/dark colors, safe areas, scalable text.
- Persisted server selection, capability checks, secure sessions, email/password authentication, password reset, and server-configured social sign-in.
- Groups, expense creation/editing/search/sorting, split previews, free-form payments, balances, members, invitations, activity, recurring expenses, bulk re-split, and reviewed guest merges.
- Group settings, category rules, reminders, report export, profile/photo, account email/sign-in settings, API keys, and integrations/help.
- Offline/session recovery, unsaved-expense prompts, UPI handoff with clipboard fallback and explicit payment confirmation.
- Hosted-only native push registration, preferences, server delivery, and notification routing. Custom servers remain usable without push.
- Root Turbo typechecking and Biome coverage. Native builds stay explicit local commands and do not join the web deployment build.

## Status

Not in the App Store or Play Store. Local iOS builds and the main flows are tested in the Simulator; Android and physical devices are not yet. The launch-invite replay fix still needs a Simulator retest after switching servers.

Release follow-ups:

- Run a local Android build and emulator pass, then physical-device tests including UPI handoff.
- Verify real push delivery with APNs/FCM credentials and the hosted job schedule; see [push deployment notes](../web/PUSH.md). Apply the new database migration before enabling push.
- Verify real Sign in with Apple after configuring the server credentials.
- Verify the deployed web preview with the separate React installations.
- Complete VoiceOver/Dynamic Type accessibility review and store assets/signing setup. Native builds remain local until separately requested otherwise.
- Follow up on cross-server invite prompts, invited-email prefill, and native guest-claim support (currently handed off to the browser).

Run mobile policy tests with `bun test apps/mobile/src` from the root, alongside workspace typechecks and `bun run check`.

## Dependency layout

The web app uses React/React DOM 19.2.8 at the workspace root. Mobile keeps its Expo-compatible 19.2.3 copies in its own `node_modules`; `metro.config.js` resolves React imports, including those from hoisted dependencies, to those mobile copies. This app targets iOS and Android only.

The root `bunfig.toml` uses Bun's hoisted linker to avoid duplicate native module installations with Bun 1.3.14. Run installs from the repository root. See [Bun linker configuration](https://bun.com/docs/pm/isolated-installs) and [Expo monorepo guidance](https://docs.expo.dev/guides/monorepos/).
