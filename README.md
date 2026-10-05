# Eventual

Eventual is a TanStack Start expense-sharing app for multi-currency groups. It uses Better Auth organizations, Drizzle ORM, libSQL/Turso, a versioned JSON REST API, and an authenticated MCP endpoint.

## Local setup

```bash
bun install
bun run db:generate
bun run db:migrate
bun run db:seed
bun run dev
```

Supply the variables listed in `.env.example` through your shell or runtime before running these commands. Database commands do not load a specific env file.

The seed prints three login accounts. Their shared password is `eventual123`. Seeding deletes existing users and groups; only run it against a disposable development database.

```text
tushar@eventual.test
mac@eventual.test
arjun@eventual.test
```

Local development uses `TURSO_DATABASE_URL=file:local.db`; no token is needed. Set a secret of at least 32 characters for `BETTER_AUTH_SECRET`.

## Turso Cloud

Provision the database yourself, then replace only the URL and token in the deployment environment:

```bash
turso db create eventual
turso db show eventual --url
turso db tokens create eventual
```

Set `TURSO_DATABASE_URL=libsql://<db>-<org>.turso.io` and `TURSO_AUTH_TOKEN=<token>`, then run `bun run db:migrate`. Never expose these server variables to the browser.

## Vercel Environment

Configure these server-side variables in the Vercel project for each deployment environment:

- `TURSO_DATABASE_URL`: the Turso Cloud database URL, not a local file URL.
- `TURSO_AUTH_TOKEN`: the database access token.
- `BETTER_AUTH_SECRET`: a secret of at least 32 characters.
- `BETTER_AUTH_URL`: the deployed application's HTTPS origin (e.g. `https://app.example.com`). Shared by Better Auth and the Shortcut, MCP, and API URLs shown on Integrations; these URLs do not use the incoming request's host. Defaults to `http://localhost:3000` for local development.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (optional): Google OAuth credentials. Register `http://localhost:3000/api/auth/callback/google` for local development and `https://your-domain.com/api/auth/callback/google` for production in Google Cloud Console. Users can connect or disconnect Google from **Settings → Profile**; Better Auth also links a verified Google identity to an existing account when the email addresses match.
- `STATUS_PAGE_URL` (optional): public status page for this instance, for example `https://status.example.com`. When set, a status callout links to it from the footer, the help contact section, and the error screen. Leave it unset to hide those links. Redeploy after changing it; the public pages that show it are prerendered.

Vercel runs `bun run db:migrate && bun run build` on every deployment, as configured in `vercel.json`. A failed migration stops the deployment. Migrations use the database credentials configured for that deployment environment, including Preview deployments.

The scheduled job runner runs once per day at 00:00 UTC to stay within Vercel Hobby's cron limit. Scheduled reminders and recurring expenses may therefore run up to a day after their due time. Each run works through every job that is due, for up to 50 seconds, rather than a fixed batch.

Vercel project variables are not automatically available in your local shell. Do not run the seed command against production.

## Generated API reference

Test commands: `bun run test` runs unit/service tests; `bun run test:shortcuts` runs shortcut-builder tests. `bun run test:e2e` runs the API, desktop and mobile suites in `tests/e2e`, while `bun run test:e2e:journey` runs the disposable-database journeys in `e2e` using `playwright.journey.config.ts`.

Browse the interactive Scalar API reference at `/api/docs`, powered by the live `/api/openapi.json` endpoint.

The checked-in OpenAPI 3.1 specification is [public/openapi.json](public/openapi.json), served at `/openapi.json`. The existing `/api/openapi.json` endpoint generates the same contracts live, with an absolute server URL for the current origin. Import either JSON document into Swagger UI, Postman, or an OpenAPI-compatible client generator.

```bash
bun run api:docs:generate  # update public/openapi.json after changing contracts
bun run api:docs:check     # fail if the checked-in snapshot is missing or stale
```

Generation uses `src/server/openapi.ts`, the operation registry in `src/server/operations.ts`, and its Zod schemas. It requires no running server, database migrations, or credentials. The snapshot uses a relative `/api` server URL and has no timestamps or environment-specific values. Commit the generated JSON alongside API changes. CI runs the read-only check before tests/build and tells you to regenerate when it differs; it never silently rewrites the snapshot.

This documents versioned REST operations and registered web endpoints, not Better Auth's own `/api/auth/*` routes or MCP protocol messages. Many existing operation response schemas are still `unknown` (rendered as `{}`), so their response fields are not yet fully described. Add explicit output schemas to the registry when building typed external clients; matching the snapshot checks freshness, not full runtime response conformance or backward compatibility.

## Health check

`GET /health` returns `200 {"status":"ok"}` without authentication. It runs a server function and sets `Cache-Control: no-store`. Use it for an external uptime check. It deliberately does not query Turso; monitor database availability separately with provider alerts or a less frequent check that performs a read through the application.

Set `STATUS_PAGE_URL` when that uptime check has a public status page. The site then links to it from the footer (including signed-in pages and screens that otherwise have no footer), the help contact section, and the error screen.

## Behaviour

- Money is stored as integer minor units with its original ISO currency code. INR and USD use 100 minor units per major unit; JPY uses 1 and KWD uses 1,000. No exchange conversion or cross-currency netting happens in the backend.
- Supported currencies and precision live in `src/lib/currencies.ts`: INR, USD, EUR, GBP, AED, AUD, CAD, CHF, CNY, HKD, JPY, KRW, KWD, MYR, NPR, NZD, SAR, SGD, THB and VND. Every currency has an explicit display symbol, including ₹, US$, CA$, £ and €.
- Even splits use member weights and distribute remainder minor units by largest remainder, then ascending user ID.
- Shares and percentages use largest-remainder allocation with user-ID tie breaking.
- Exact inputs must equal the expense total; percentages must equal 10,000 basis points.
- Any paid share locks every editable field and deletion. Clearing the final paid flag unlocks it.
- Balances use unpaid expense shares plus settlement records. Settlement allocations mark complete matching shares paid FIFO and never partially settle a share.
- A settlement moves the balance by its *unallocated* remainder only. The allocated part already moved the balance by marking those shares paid, so counting the raw amount as well would double-count it. Partial and indirect repayments reduce the same-currency net balance even when no complete direct share can be marked paid.
- Positive balance means others owe that member. The simplified debt list greedily pairs largest debtors and creditors separately for each currency.
- Repayments require an explicit currency and cannot exceed the current simplified transfer from the payer to the recipient in that currency. The shared validator in `src/lib/settlements.ts` runs in the UI and again against fresh balances inside the database transaction. Invalid or excessive repayments return `VALIDATION` (HTTP 422). A paid-status toggle cannot bypass this limit; undo a linked settlement before unmarking an allocated share.

### Currency-aware API responses

`GET /api/groups` returns each group's `balances: [{ currency, balanceMinor }]` for the current user, replacing the former single `balanceMinor` total. `GET /api/groups/{groupId}/balances` returns `members` and `transfers` arrays with a `currency` on every row. The same user or pair can have multiple rows, one per currency. Empty groups return empty arrays.

Expense creation accepts `currency` (omitting it defaults to INR for existing clients). Expense updates and settlements require it explicitly. For example, `{"toUserId":"B","currency":"USD","amountMinor":20000}` records a US$200 repayment and can only reduce USD debt. If the current suggested payment is US$200, attempting US$200.01 or US$400 is rejected. INR debt is unaffected.

## Auth emails

Account emails use Resend and React Email: email-verification links, password-reset links, and password-reset security confirmations. Group invitations, balance reminders, and expense/settlement notifications do not send email.

Set these server-only values in `.env.local` (or your deployment environment):

```dotenv
RESEND_API_KEY=re_your_key
EMAIL_FROM="Eventual <accounts@your-verified-domain.com>"
# Optional:
EMAIL_REPLY_TO=support@your-verified-domain.com
```

Verify the sending domain in Resend and set `BETTER_AUTH_URL` to your public HTTPS origin. Restart the app after changing these values. No database migration is needed. Without both Resend settings, verification and invitation emails are disabled; invitations still produce a shareable link, and sign-in does not require verification. When email sending is configured, users must verify their address before signing in. Signup sends a verification link, including signups made directly through `/api/auth/sign-up/email`. Signup and a correct password for an unverified account open `/check-email`, which sends a link on arrival unless one was sent in the last five minutes.

- Sign in → **Forgot your password?** opens `/forgot-password`. Reset links expire after one hour, can be used once, and lead to `/reset-password`. A successful reset revokes existing sessions.
- The login screen carries a "Remember how I signed in last" toggle, off by default. Better Auth's `lastLoginMethod` plugin then marks the button that was used, but only writes its cookie where that toggle is on. Turning the toggle off clears the marker as well, so withdrawing removes the data rather than only refusing new writes. Nothing is stored in the `user` table, so this needs no migration.
- **Settings → Profile** shows email-verification status and a resend action. Verification links expire after one hour and return to `/verify-email`, where verification signs the user in.
- Password-reset requests return the same generic response for unknown accounts and delivery failures. Better Auth also treats verification delivery as a background notification, so a successful request is not proof of delivery. Failures are logged without email content or tokens; check Resend delivery logs and retry after fixing configuration. There is no automatic retry queue.
- Reset and verification requests use Better Auth's per-IP rate limits (three per minute in production). Resend idempotency keys deduplicate retries of the same token within its 24-hour window; token values are hashed before being used as keys. Better Auth keys these limits on the connecting IP, which it reads from `x-forwarded-for` and does not trust when that header holds a chain. If your proxy sends `client, edge` instead of a single address, every visitor shares one bucket, so a handful of attempts anywhere throttles sign-in for everyone; set `advanced.ipAddress.ipAddressHeaders` or `advanced.ipAddress.trustedProxies` if you observe that.
- `bun run email:dev` previews templates on port 3002. HTML and plain-text versions are rendered at send time.

## REST API

Authentication accepts a Better Auth session cookie or a user API key in the `x-api-key` header (or `Authorization: Bearer ev_…`). Legacy `ss_…` bearer keys remain accepted. Create and revoke keys at `/app/settings/api-keys`.

The cookie examples assume `cookies.txt` was produced by signing in through `/api/auth/sign-in/email`.

```bash
BASE=http://localhost:3000
CURL="curl -b cookies.txt -H Content-Type:application/json"
# Or, with a user API key:
# CURL="curl -H x-api-key:$EVENTUAL_API_KEY -H Content-Type:application/json"
```

The UI calls the same `/api/v1/*` endpoints. The operation catalog is available at `/api/openapi.json`. Browser GET responses containing account data use a five-second private cache with cookie and credential variation; writes and session or API-key responses use `no-store`. The UI changes its GET cache URL after a successful write. These private responses are not intended for a shared CDN cache.

Account-only UI endpoints include `GET /api/v1/app/dashboard`, `GET /api/v1/app/composer`, `GET /api/v1/app/groups/{groupId}/page`, `PATCH /api/v1/me/profile`, and `/api/v1/me/api-keys` (GET, POST, DELETE by key ID). They require a session cookie. Public metadata endpoints include `/api/v1/site`, `/api/v1/legal`, and `/api/v1/health`; `GET /api/v1/session` is always uncached.

Each domain endpoint has an example below. Replace IDs as appropriate.

```bash
$CURL "$BASE/api/v1/groups"
$CURL -X POST -d '{"name":"Goa weekend"}' "$BASE/api/v1/groups"
$CURL "$BASE/api/v1/groups/GROUP_ID"
$CURL -X PATCH -d '{"name":"Goa 2027"}' "$BASE/api/v1/groups/GROUP_ID"
$CURL -X DELETE "$BASE/api/v1/groups/GROUP_ID"

$CURL "$BASE/api/v1/groups/GROUP_ID/members"
$CURL -X PATCH -d '{"role":"admin"}' "$BASE/api/v1/groups/GROUP_ID/members/USER_ID"
$CURL -X DELETE "$BASE/api/v1/groups/GROUP_ID/members/USER_ID"
$CURL -X POST "$BASE/api/v1/groups/GROUP_ID/leave"

$CURL "$BASE/api/v1/groups/GROUP_ID/invitations"
$CURL -X POST -d '{"email":"friend@example.com","role":"member"}' "$BASE/api/v1/groups/GROUP_ID/invitations"
$CURL -X DELETE "$BASE/api/v1/invitations/INVITATION_ID"
$CURL "$BASE/api/v1/invitations/INVITATION_ID"
$CURL -X POST "$BASE/api/v1/invitations/INVITATION_ID/accept"
$CURL "$BASE/api/v1/me/invitations"

$CURL "$BASE/api/v1/groups/GROUP_ID/expenses?limit=20&paidBy=USER_ID&participant=USER_ID&from=2026-01-01&to=2026-12-31"
$CURL -X POST -d '{"description":"Dinner","amountMinor":120000,"currency":"INR","paidByUserId":"USER_ID","splitMethod":"even","date":"2026-09-05","participants":[{"userId":"USER_ID","input":null}]}' "$BASE/api/v1/groups/GROUP_ID/expenses"
$CURL -X POST -d '{"amountMinor":10000,"splitMethod":"percent","participants":[{"userId":"A","input":5000},{"userId":"B","input":5000}]}' "$BASE/api/v1/groups/GROUP_ID/expenses/preview"
$CURL "$BASE/api/v1/expenses/EXPENSE_ID"
$CURL -X PATCH -d '{"description":"Updated dinner","amountMinor":120000,"currency":"INR","paidByUserId":"USER_ID","splitMethod":"even","date":"2026-09-05","participants":[{"userId":"USER_ID","input":null}]}' "$BASE/api/v1/expenses/EXPENSE_ID"
$CURL -X DELETE "$BASE/api/v1/expenses/EXPENSE_ID"
$CURL -X POST "$BASE/api/v1/expenses/EXPENSE_ID/shares/USER_ID/paid"
$CURL -X DELETE "$BASE/api/v1/expenses/EXPENSE_ID/shares/USER_ID/paid"

$CURL "$BASE/api/v1/groups/GROUP_ID/balances"
$CURL "$BASE/api/v1/groups/GROUP_ID/settlements"
$CURL -X POST -d '{"toUserId":"USER_ID","currency":"INR","amountMinor":50000,"note":"UPI"}' "$BASE/api/v1/groups/GROUP_ID/settlements"
$CURL -X DELETE "$BASE/api/v1/settlements/SETTLEMENT_ID"
$CURL "$BASE/api/v1/groups/GROUP_ID/activity?limit=30"
$CURL "$BASE/api/v1/me/activity?limit=30"                  # every event involving you, across groups; page with ?cursor=nextCursor
```

Errors use one envelope:

```json
{"error":{"code":"EXPENSE_LOCKED","message":"A paid share must be unmarked before this expense can be changed","details":{"lockedBy":[]}}}
```

Status mapping: `UNAUTHENTICATED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `VALIDATION` 422, `EXPENSE_LOCKED` and `CONFLICT` 409, `INTERNAL` 500.

## MCP

`POST /mcp` exposes `listGroups`, `listExpenses`, `createExpense`, and `getBalances`. It uses the same Better Auth cookie or API key and service layer as REST. Each HTTP request gets an isolated stateless MCP transport. Setup instructions for each client (Claude Code, the Claude app, Cursor, OpenCode, Hermes, OpenClaw) are at `/docs`.

## Observability

Set the Sentry and PostHog variables shown in `.env.example`. The browser variables enable page views and client errors; the server variables enable MCP/product metrics and server errors. Sentry source-map upload additionally requires `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` at build time.

LogTape sends structured logs to the console and the existing Sentry SDK on both client and server. `SENTRY_DSN` enables server logs; `VITE_SENTRY_DSN` enables browser logs. No additional Sentry credentials are needed. Open **Logs** in the Sentry project and filter by `category` (for example `eventual.operations`, `eventual.jobs`, or `eventual.auth-client`). Server logs include a `requestId`, also returned in `X-Request-Id`, and the sink correlates active Sentry traces automatically.

`LOG_LEVEL` and `VITE_LOG_LEVEL` control the server and browser minimum levels (default: `info` in production, `debug` in development). Set both to `debug` to include navigation, query-cache success, and background diagnostics. Database execution times and statement types are available at `info`. All enabled levels go to Sentry Logs; debug/info records also become breadcrumbs, and error/fatal records create issues. These settings require a rebuild for the browser. Without a DSN, logs remain available in the console.

Coverage includes HTTP/auth requests, REST/MCP domain operations, React Query reads and writes, auth client flows and SDK diagnostics, route boundaries, background work, job retries/exhaustion, email and notification delivery, analytics dispatch, clipboard failures, and database migration/seed scripts. Seed completion logs contain the account count; development credentials remain defined in `src/db/seed.ts` and are no longer printed. Domain logging lives at the operation boundary, so every registered operation is covered. Database execution logs include `durationMs`, `driverMethod`, success, and statement type/parameter count where available, at `info` level. They measure driver round trips (including network time), cover transactions and batches, and exclude SQL and bound values. Batch durations cover the whole batch, not individual statements. Logs exclude request/response bodies, URLs, query strings, credentials, email addresses, and financial contents. Both sinks redact sensitive properties and interpolated values; logged exceptions preserve stack frames while replacing their messages. Use static message templates and operational metadata when adding logs with `getAppLogger()`; never pass user content.

PostHog receives only an authenticated user ID and these allow-listed, count-oriented properties:

- `mcp_request_completed`: normalized MCP method, success, authentication state, and duration.
- `mcp_tool_called`: tool name, success, and duration.
- `product_mutation_completed`: web mutation action and surface.

MCP parameters, tool results, transaction descriptions, amounts, group IDs, and other transaction data are never sent. Sentry MCP monitoring also has input and output recording disabled, and session replay masks all text and blocks media.

Recommended PostHog insights:

- **MCP requests:** total `mcp_request_completed`, broken down by `method` and `success`.
- **MCP users:** unique users of `mcp_request_completed`, filtered to `authenticated = true`.
- **MCP tool adoption:** total `mcp_tool_called`, broken down by `tool_name`.
- **Transactions logged through MCP:** total `mcp_tool_called`, filtered to `tool_name = createExpense` and `success = true`.
- **MCP reliability:** failure percentage and p95 `duration_ms` for `mcp_tool_called`, broken down by `tool_name`.
- **Web feature adoption:** total `product_mutation_completed`, broken down by `action`.

## Privacy policy and terms

`/privacy` and `/terms` are written for whoever runs the instance. Set `LEGAL_OPERATOR_NAME` (e.g. `Jane Doe`) to name the operator and `LEGAL_GOVERNING_LAW` (e.g. `India`) to name the law governing the terms. Set `LEGAL_CONTACT_EMAIL` to publish an address for privacy, deletion and security requests; without it, the pages ask people to contact the operator directly. Set `LEGAL_DATA_LOCATION` (e.g. `India`) to state where the database is stored. Left empty, the pages describe an independently run open-source instance. The privacy policy lists only the service providers this instance is configured to use: Vercel (when `VERCEL` is set), Turso (a `libsql://` database), Resend, Google, Sentry and PostHog. Both pages are prerendered, so redeploy after changing these values. When you change the wording, update `LEGAL_UPDATED` in `src/components/legal-page.tsx`. These pages are a starting point, not legal advice.

## Apple Shortcut

`public/eventual.shortcut` logs a split using all group members' weights dated today. On import, Shortcuts asks for an API key and the app URL. Three ways in:

- **Action Button, Siri or Home Screen (no input):** asks only for the amount. If the clipboard holds a bank SMS, the parsed amount is pre-filled for confirmation. The payer defaults to you; the group is asked once and remembered on device in iCloud `Shortcuts/Eventual/last-group.txt`.
- **Share Sheet or Messages automation (text input):** parses the amount, currency and merchant from a bank SMS and logs without asking. A notification confirms what was logged, or why it wasn't. Set it up under Shortcuts → Automation → Message, filtered to your bank's sender.
- **Watch:** the same one-prompt flow, without the clipboard and group cache (file and clipboard actions don't exist on watchOS).

It calls:

```bash
$CURL "$BASE/api/shortcut/groups"                      # { "Group name": "GROUP_ID" }
$CURL "$BASE/api/shortcut/groups/GROUP_ID/members"     # { "Me (Name)": "USER_ID", ... }
$CURL -X POST -d '{"amount":1200.5,"currency":"INR","description":"Swiggy"}' "$BASE/api/shortcut/groups/GROUP_ID/expenses"
```

The group and member responses are dictionaries: Choose from List displays their keys but returns the selected value (the ID). Use that output directly, without another dictionary lookup. `paidByUserId` is optional and defaults to you; the members endpoint is for custom shortcuts that log for someone else. The expense response and errors have a `message` field. After changing `scripts/build-shortcut.ts`, rebuild and re-sign the file on macOS with `bun run shortcut:build [default-url]`. Existing users must download the updated file and replace their installed shortcut to receive fixes.

### Apple Intelligence variant

`public/eventual-ai.shortcut` is a separate shortcut for an iPhone with Apple Intelligence enabled (not Apple Watch). Import it with its own API key and Eventual URL. The original `eventual.shortcut` remains independent and does not require Apple Intelligence.

**New bank alerts:** In Shortcuts → Automation, create a **Message** trigger filtered by your bank’s sender (and optionally **Message Contains** for debit alerts). Add **Run Shortcut**, choose the AI shortcut, and set its **input** to the received message’s body/content from the automation. Simply selecting the shortcut does **not** pass the message. Test with a real or sample alert and review the resulting expense before enabling **Run Immediately**; leave it interactive if you prefer to approve each run. The automation only receives messages after you set it up—it does not scan Messages history.

**Old messages or manual entry:** Copy a bank SMS in Messages, then run the AI shortcut. If the clipboard resembles an amount-bearing alert, its text is pre-filled into “What did you spend?” for confirmation. You can also type or dictate a phrase such as “goa dinner 1200”. The shortcut does not have direct access to search or read your Messages inbox.

**What happens:** The shortcut fetches your available group names from Eventual and asks Apple Intelligence to extract `{ amount, currency, description, group }` from the supplied text. It instructs the model to reject OTP, incoming-credit, refund, balance-only, and failed-transaction messages by returning `amount: null`; this is a guard, not a guarantee. A group name is accepted only if it exactly matches a group returned by the API; otherwise the shortcut uses the last group shared with the standard shortcut (`Shortcuts/Eventual/last-group.txt`), selects the sole group, or asks you. It posts **only the extracted amount, currency and description** to `/api/shortcut/groups/{groupId}/expenses` using your key. The server assigns you as payer, uses today’s date, splits evenly across all group members, and returns a confirmation message shown as a notification. The raw SMS is not posted to Eventual. Model errors and ambiguous messages still warrant checking the expense in the app before relying on unattended logging.

Build it with `bun run shortcut:build-ai [default-url]`; both generators share `scripts/shortcut-lib.ts`. After changing either generator, rebuild and re-import the signed shortcut. Replace any older installed copy of either shortcut: earlier downloads left If, Set Variable and Match Text inputs blank, so conditions and parsing had nothing to work on. Every action now names its input explicitly. The AI shortcut uses the on-device model (`WFLLMModel: "Apple Intelligence on Device"`). The signed files build locally and pass a structural plist check, but import, Message automation handoff and model responses still need testing on an iPhone.

## Verification

```bash
bun run check
bunx tsc --noEmit
bun run test
bun run build
bunx playwright install chromium # once per machine
bun run test:e2e
```

`test:e2e` migrates a fresh temporary file-backed SQLite database, starts the app
on `127.0.0.1:4173`, runs Chromium tests, and deletes the database afterward.
It overrides local Turso and email-provider credentials, and refuses to run
Playwright directly without the disposable-database runner. The browser suite
tests signup, invitations, group and expense actions, cross-group balances,
settlements, authorization, API keys, and automation against the real HTTP app.
No email is sent. Invitation acceptance still requires a verified account, so
the tests assert unverified users are rejected and then mark the test user
verified **only in that disposable database**. CI runs the same command and
uploads Playwright traces/screenshots on failure.
Provider-backed email delivery and Google OAuth are intentionally outside this
offline CI suite; their verification/reset behavior has separate unit tests.
