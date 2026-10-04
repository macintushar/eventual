# E2E state captures

Run the loading/error gallery on desktop Chromium and Pixel 7:

```sh
bun run test:e2e:states
bunx playwright show-report
```

Open a test's **Attachments** to compare its `*-loading.png` and `*-error.png`.
Images are also saved under `test-results/`. Both output directories are ignored
by Git and replaced by later runs; copy any captures you want to keep before
running another suite. To capture one viewport, use:

```sh
bunx playwright test states.ui.spec.ts --project=mobile
```

The normal E2E command also runs these tests. CI uploads `playwright-report` on
successful and failed runs, retaining the screenshots for seven days.

`states.ui.spec.ts` covers expense search, history continuation, payment history,
group activity, group settings, the expense composer, and the route error boundary.
The first six capture both loading and failure; the route test captures failure.
Every scenario checks recovery through the actual retry control. Pagination also
checks that previously loaded rows survive the failure and recovery.

## How it works

- Uses the existing real authentication and disposable seeded database.
- Intercepts only the target browser API request. A promise gate holds it pending
  until the loading screenshot is taken, then returns HTTP 503 for all attempts,
  including the application's automatic retry.
- Restores the real endpoint before clicking Try again, so recovery is exercised
  against the server rather than a fabricated success response.
- Uses client navigation for the route-boundary case: browser request interception
  cannot affect API reads performed by SSR on a direct page load.
- Captures the viewport with the relevant state scrolled into view, preserving
  dialogs, toasts and the dock. Reduced motion removes transition timing noise.
- Attaches screenshots even on passing tests. These are review artifacts, not
  pixel-diff baselines: assertions check behavior, allowing the current UX to be
  reviewed before locking down its appearance.

The server runs Vite in test/development mode. The route error screenshot therefore
includes the collapsed “Technical detail (development only)” control; production
omits it. This suite covers browser-side failures, not SSR failures on first load.

## Error states

- Failed expense searches show “Couldn't load expenses” and a reason, rather than
  an empty result. Later-page failures preserve loaded rows and offer Try again.
- Settings failures show “Couldn't load settings”, a reason, and Try again.
  Activity, payment history, and composer failures follow the same pattern.
