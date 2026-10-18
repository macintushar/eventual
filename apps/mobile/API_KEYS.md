# Mobile API keys

Account → API keys uses the session-only `apiKey.list`, `apiKey.create` and `apiKey.delete` contracts. Presets, custom scopes and the 90-day full-access bound come from the shared schema vocabulary. Pull to refresh retries list failures; create/revoke invalidate the list.

## Secret policy

- Creation calls the SDK directly, never a query/mutation cache. Only parsed key summaries enter the list cache. The full secret is volatile component-owned memory, never a URL parameter, persisted value, log or analytics event.
- Native protection must succeed **before** the full-screen modal mounts or creation is possible. Android uses `FLAG_SECURE` (React Native 0.86 copies this into its modal dialog when mounted); iOS uses Expo's secure-window canvas and maximum app-switcher blur. Secret text is additionally hidden when AppState is not active.
- The modal has no swipe dismissal and blocks the underlying tabs/header. Android back, Cancel and Done share a close policy: an uncopied secret asks for explicit confirmation. Copy feedback follows successful clipboard writing only. Clipboard content is intentionally retained for pasting into a trusted password manager; the app does not read it back or persist another copy.
- Exit/unmount aborts in-flight creation, clears the secret, removes the AppState listener and releases screenshot/app-switcher protection. Late acquisition and partial native failures are also cleaned up. A lost create response is not automatically retried: refresh/revoke an orphan key before creating another.

## Native rebuild required

Installed via SDK 57 `bunx expo install`: `expo-screen-capture ~57.0.4` and `expo-clipboard ~57.0.2`. Verified versioned Expo docs and installed source APIs (`preventScreenCaptureAsync`, `allowScreenCaptureAsync`, `enableAppSwitcherProtectionAsync`, `disableAppSwitcherProtectionAsync`, `setStringAsync`). Both autolink; no app.json changes or screenshot/photo permissions are needed. Existing development binaries must be rebuilt locally with `bun run ios` / `bun run android` in `apps/mobile`. No simulator or build was run for this feature because the guest-merge agent owns it.

## Runtime verification pending after rebuild

On iOS and Android: list active/expired/legacy keys, pull-to-refresh and failed refresh with stale data; create each preset and custom scopes with each allowed expiry; check full access changes Never/1 year to 30 days. Verify the secret appears only once, copy succeeds/pastes the exact key, copy failure does not suppress close confirmation, uncopied Done/Android back asks and Cancel keeps the secret open. Check native screenshot **and screen recording** capture contain no secret, background/app switcher/interruption snapshots contain no secret, and foreground restores the view. Verify screenshots work again after Done, uncopied confirmed close, native protection failure, and forced session sign-out/unmount. Check rapid close/reopen, background during creation, navigation/session expiry during creation (late response must not reappear), revoke Cancel/confirm/failed revoke, immediate list refresh, and revoked credentials receiving 401.
