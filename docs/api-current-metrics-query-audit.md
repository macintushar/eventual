# Current API metrics and TanStack Query audit

Checked 2026-10-03 around 00:02 UTC using `posthog-cli api` and `sentry-cli`. Source reviewed includes current uncommitted UI changes. Application code was not changed.

## Available measurements

PostHog active project: Macintushar, ID 126781, UTC. No saved governed metrics exist; the following are one-off exploratory calculations, not saved metric definitions. Windows are rolling seven days / 24 hours at query execution.

| Operation / surface | 7-day calls | Failures | p50 ms | p95 ms | Maximum ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| expense.list / rest | 104 | 0 | 13 | 58 | 81 |
| expense.get / rest | 42 | 6 | 13 | 43.4 | 56 |
| expense.create / rest | 22 | 0 | 151 | 228 | 238 |
| activity.mine / rest | 9 | 0 | 15 | 55.4 | 69 |
| activity.group / rest | 8 | 0 | 8.5 | 36.1 | 41 |
| expense.update / rest | 4 | 0 | 145 | 213.5 | 221 |

Last 24 hours: expense.get 7 calls / 0 failures / p95 41.7 ms; expense.list 2 / 0 / 15.8 ms; expense.create 2 / 0 / 198 ms; activity.mine 1 / 0 / 26 ms. These samples are too small for a stable tail-latency conclusion.

The `rest` label also covers UI requests through the shared operation route. It does not mean all those calls came from external API users.

Important limitations:

- `operation_completed` has operation, surface, success and duration, but no environment, route/session correlation, DB time, rows read, response bytes or balance calculation time. This is handler duration, not end-to-end network/UI latency.
- The active project mixes traffic: seven-day pageviews include production hostname 259 (28 distinct visitors), staging 87 and several localhost/127.0.0.1 hosts. Server operation durations cannot be attributed to production from the existing fields.
- Dashboard, composer and group-page aggregate handlers call services directly and bypass `executeOperation`; their cost is missing from `operation_completed`. The nested reads also do not emit operation events.
- `$web_vitals` has not been observed in the last 30 days, so PostHog does not provide a current scrolling/first-render performance baseline.
- PostHog log service discovery returned no services for the last 24 hours. This does not prove that no logs ever existed.
- Sentry issue and log reads both returned HTTP 403 for `macintushar/eventual`. `sentry-cli info` reports only `org:ci`. Current Sentry error/trace/log values remain unavailable; use a read-capable CLI credential to complete that portion. Do not interpret the denied reads as zero errors. SDK traces sample at 10% in production; logs are not explicitly enabled in the checked SDK init.
- Six seven-day expense.get failures are failure telemetry, not necessarily application defects: the event does not capture status/reason. Sentry access is needed to investigate further.

## TanStack Query verdict

The foundations are correct: shared queryOptions factories, detailed expense keys containing group/search/sort/direction/offset/asOf, distinct ordinary/infinite-query keys, one QueryClient per router/request, SSR integration, AbortSignal forwarding, account-cache clearing, 30-second default staleTime and 60-second session staleTime. There is no configured polling loop. Multiple observers using the same key share the query rather than independently fetching on every render.

The problems are cache ownership and broad refresh behavior, not missing query keys.

### Highest-value fixes

1. **Stop the hidden composer observer.** `src/components/composer.tsx:75` enables queries with `open.kind === 'expense'`; close only sets `shown = false`, retaining the kind. After the first expense composer opens, its query remains enabled while hidden and can refetch on focus, reconnect and mutation invalidation. Gate by `shown && open.kind === 'expense'`, preserving the mounted draft/exit animation as needed.
2. **Narrow mutation invalidation.** `src/lib/app-mutation.ts:49` invalidates dashboard, composer, personal activity and group prefixes for virtually every app write. An expense edit needs financial summary/list/detail/activity refresh, but generally not a fresh composer group/member directory; category rules and reminder preferences should not refresh full balance history. Record-ID-only writes fall back to all groups. Return affected group IDs or resolve them from cached detail to target the right group. Inactive queries are marked stale, not all immediately fetched; enabled active observers do refetch.
3. **Give the expense first page one cache owner.** `src/routes/app/groups/$groupId/index.tsx:337` seeds a separate expense query from group-page response. Both contain the same first expense page, but TanStack cannot deduplicate different keys. Group-prefix invalidation can refresh the aggregate and expense list separately. Remove expenses from the aggregate and preload the dedicated query, or synchronize refreshed first-page data into the matching query deliberately. Preserve sort/search/asOf matching.
4. **Fix seeded-data freshness.** The expense seed lacks `initialDataUpdatedAt`. Initial data is created once per cache entry and treated as newly fetched; subsequent changes to `data.expenses` do not automatically synchronize that entry. The group activity seed correctly inherits the parent query's update timestamp; apply that pattern to expense seeding, while recognizing it does not solve duplicate ownership by itself.
5. **Use lightweight dependencies for expense detail and commands.** Expense detail fetches the whole group-page aggregate for group/member/current-user/transfer context; a compact group context plus authoritative balance summary is enough. The new command palette uses full dashboardQueryOptions for group choices: enabled-on-open is good, but a lightweight shared group directory avoids fetching global financial history just to navigate.
6. **Tune expensive queries individually.** Default focus/reconnect refetch is correct but costly for full group/dashboard reads after 30 seconds. Keep financial freshness deliberate; longer freshness is more suitable for group/member selectors, while explicit financial mutations must still invalidate summaries. Do not disable all refetching globally.
7. **Avoid retrying permanent HTTP errors.** Global retry:1 retries missing expense reads and other permanent failures. Use a predicate that avoids 400/401/403/404/422 and only retries transient/network failures where appropriate. Treat conflict responses deliberately. Auth/session requirements remain authoritative.
8. **Bound infinite-feed refresh cost.** Both feeds retain all loaded pages. A stale refetch replays retained pages sequentially. Narrow invalidation and select feed freshness rules; use maxPages only with backward loading/scroll anchoring so eviction does not jump the viewport.

## Loader semantics correction

The comments in router.tsx/query-client.ts imply `ensureQueryData` checks freshness. Installed `@tanstack/query-core/src/queryClient.ts:198` returns any cached data, including stale data, unless `revalidateIfStale` is explicitly enabled; mounted query observers can subsequently refetch. This avoids duplicate fresh loads but means hover-preloading existing stale data does not itself refresh it. Use `fetchQuery` when the loader must await fresh data, or `ensureQueryData({ ...options, revalidateIfStale: true })` for intentional background refresh. Avoid blanket changes that add requests unnecessarily. The session guard already uses fetchQuery with its 60-second freshness window.

## What to instrument next

Add aggregate endpoint timing (dashboard/group page/composer), environment/release, low-cardinality query purpose, DB duration/query count, returned row counts, balance calculation duration and response bytes. Add client request duration and trigger (navigation, load-more, mutation, focus) with correlation IDs; pageview counts cannot prove duplicate request volume. Keep financial values, descriptions and identity information out of performance telemetry.

Validate expected request budgets on fresh navigation, cached revisit, dialog close, window focus and expense save. Specifically assert that a closed composer emits zero requests and one mutation does not independently refresh duplicate first-page owners. Measure cold and warm requests separately, using the same environment/dataset.

References: https://tanstack.com/query/latest/docs/framework/react/guides/infinite-queries and the installed QueryClient implementation. Production baselines cannot be established until environment segmentation and aggregate timing are added.
