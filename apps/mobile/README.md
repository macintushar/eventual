# Eventual mobile

Expo / React Native scaffold for iOS and Android, using the existing Bun workspace and `@eventual/sdk`. Start commands below from the repository root.

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

- Expo Router tabs: Groups, Activity, Account.
- Bundled Inter Tight / Instrument Sans, semantic light/dark colors, safe areas, scalable text.
- An editable server address with a timed, response-validated health/site check through the shared SDK. HTTPS is required except loopback/emulator addresses in development. The address is kept in memory only.
- Clearly labeled unsigned-in scaffold states; no mock balances or financial writes.
- Root Turbo typechecking and Biome coverage. Native builds stay explicit local commands and do not join the web deployment build.

## Next slices

1. Native session storage and email/password authentication with the existing Better Auth server. Validate OAuth return links and the single-app/custom-server Google strategy before implementing Google sign-in.
2. Persist selected server; add server capability/version negotiation, clean sign-out/server switching, and authenticated SDK headers.
3. Real dashboard/groups, then expense entry, split previews, balances and settlement flows with server-authoritative calculations.
4. Complete the parity inventory: invitations, members, recurring expenses, categories, profile, exports and integrations.
5. Hosted-only push registration/preferences/delivery and notification routing; custom servers stay usable without push.
6. Device QA on both platforms, accessibility, network/expired-session states, and review of the proposed design decisions.

The existing design package is a review draft, not proof that those flows are implemented. Local simulator success does not establish Android or physical-device readiness.

## Dependency layout

`react-dom` is pinned to the Expo-compatible React version to keep Expo Router’s optional web peer from resolving the web workspace’s different React version. This scaffold targets iOS and Android only.

The root `bunfig.toml` uses Bun's hoisted linker to avoid duplicate native module installations with Bun 1.3.14. Run installs from the repository root. See [Bun linker configuration](https://bun.com/docs/pm/isolated-installs) and [Expo monorepo guidance](https://docs.expo.dev/guides/monorepos/).
