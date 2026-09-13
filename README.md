# Eventual

Eventual is a TanStack Start expense-sharing app for multi-currency groups. It uses Better Auth organizations, Drizzle ORM, libSQL/Turso, typed server functions, a JSON REST API, and an authenticated MCP endpoint.

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

Vercel runs `bun run db:migrate && bun run build` on every deployment, as configured in `vercel.json`. A failed migration stops the deployment. Migrations use the database credentials configured for that deployment environment, including Preview deployments.

Vercel project variables are not automatically available in your local shell. Do not run the seed command against production.

## Behaviour

- Money is stored as integer minor units with its original ISO currency code. INR and USD use 100 minor units per major unit; JPY uses 1 and KWD uses 1,000. No exchange conversion or cross-currency netting happens in the backend.
- Supported currencies and precision live in `src/lib/currencies.ts`: INR, USD, EUR, GBP, AED, AUD, CAD, CHF, CNY, HKD, JPY, KRW, KWD, MYR, NPR, NZD, SAR, SGD, THB and VND. Every currency has an explicit display symbol, including ₹, US$, CA$, £ and €.
- Even splits distribute remainder minor units by ascending user ID.
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

Account emails use Resend and React Email: a combined welcome/email-verification message on signup, password-reset links, and password-reset security confirmations. Group invitations, balance reminders, and expense/settlement notifications do not send email.

Set these server-only values in `.env.local` (or your deployment environment):

```dotenv
RESEND_API_KEY=re_your_key
EMAIL_FROM="Eventual <accounts@your-verified-domain.com>"
# Optional:
EMAIL_REPLY_TO=support@your-verified-domain.com
```

Verify the sending domain in Resend and set `BETTER_AUTH_URL` to your public HTTPS origin. Restart the app after changing these values. No database migration is needed. Without both Resend settings, automatic signup emails are disabled; delivery attempts cannot send email. Verification remains optional for signing in, matching the existing account behavior.

- Sign in → **Forgot your password?** opens `/forgot-password`. Reset links expire after one hour, can be used once, and lead to `/reset-password`. A successful reset revokes existing sessions.
- **Account / API keys** shows email-verification status and a resend action. Verification links expire after one hour and return to `/verify-email`.
- Password-reset requests return the same generic response for unknown accounts and delivery failures. Better Auth also treats verification delivery as a background notification, so a successful request is not proof of delivery. Failures are logged without email content or tokens; check Resend delivery logs and retry after fixing configuration. There is no automatic retry queue.
- Reset and verification requests use Better Auth's per-IP rate limits (three per minute in production). Resend idempotency keys deduplicate retries of the same token within its 24-hour window; token values are hashed before being used as keys.
- `bun run email:dev` previews templates on port 3002. HTML and plain-text versions are rendered at send time.

## REST API

Authentication accepts a Better Auth session cookie or a user API key in the `x-api-key` header (or `Authorization: Bearer ev_…`). Legacy `ss_…` bearer keys remain accepted. Create and revoke keys at `/app/settings`.

The cookie examples assume `cookies.txt` was produced by signing in through `/api/auth/sign-in/email`.

```bash
BASE=http://localhost:3000
CURL="curl -b cookies.txt -H Content-Type:application/json"
# Or, with a user API key:
# CURL="curl -H x-api-key:$EVENTUAL_API_KEY -H Content-Type:application/json"
```

Each endpoint has an example below. Replace IDs as appropriate.

```bash
$CURL "$BASE/api/groups"
$CURL -X POST -d '{"name":"Goa weekend"}' "$BASE/api/groups"
$CURL "$BASE/api/groups/GROUP_ID"
$CURL -X PATCH -d '{"name":"Goa 2027"}' "$BASE/api/groups/GROUP_ID"
$CURL -X DELETE "$BASE/api/groups/GROUP_ID"

$CURL "$BASE/api/groups/GROUP_ID/members"
$CURL -X PATCH -d '{"role":"admin"}' "$BASE/api/groups/GROUP_ID/members/USER_ID"
$CURL -X DELETE "$BASE/api/groups/GROUP_ID/members/USER_ID"
$CURL -X POST "$BASE/api/groups/GROUP_ID/leave"

$CURL "$BASE/api/groups/GROUP_ID/invitations"
$CURL -X POST -d '{"email":"friend@example.com","role":"member"}' "$BASE/api/groups/GROUP_ID/invitations"
$CURL -X DELETE "$BASE/api/invitations/INVITATION_ID"
$CURL "$BASE/api/invitations/INVITATION_ID"
$CURL -X POST "$BASE/api/invitations/INVITATION_ID/accept"
$CURL "$BASE/api/me/invitations"

$CURL "$BASE/api/groups/GROUP_ID/expenses?limit=20&paidBy=USER_ID&participant=USER_ID&from=2026-01-01&to=2026-12-31"
$CURL -X POST -d '{"description":"Dinner","amountMinor":120000,"currency":"INR","paidByUserId":"USER_ID","splitMethod":"even","date":"2026-09-05","participants":[{"userId":"USER_ID","input":null}]}' "$BASE/api/groups/GROUP_ID/expenses"
$CURL -X POST -d '{"amountMinor":10000,"splitMethod":"percent","participants":[{"userId":"A","input":5000},{"userId":"B","input":5000}]}' "$BASE/api/groups/GROUP_ID/expenses/preview"
$CURL "$BASE/api/expenses/EXPENSE_ID"
$CURL -X PATCH -d '{"description":"Updated dinner","amountMinor":120000,"currency":"INR","paidByUserId":"USER_ID","splitMethod":"even","date":"2026-09-05","participants":[{"userId":"USER_ID","input":null}]}' "$BASE/api/expenses/EXPENSE_ID"
$CURL -X DELETE "$BASE/api/expenses/EXPENSE_ID"
$CURL -X POST "$BASE/api/expenses/EXPENSE_ID/shares/USER_ID/paid"
$CURL -X DELETE "$BASE/api/expenses/EXPENSE_ID/shares/USER_ID/paid"

$CURL "$BASE/api/groups/GROUP_ID/balances"
$CURL "$BASE/api/groups/GROUP_ID/settlements"
$CURL -X POST -d '{"toUserId":"USER_ID","currency":"INR","amountMinor":50000,"note":"UPI"}' "$BASE/api/groups/GROUP_ID/settlements"
$CURL -X DELETE "$BASE/api/settlements/SETTLEMENT_ID"
$CURL "$BASE/api/groups/GROUP_ID/activity?limit=30"
```

Errors use one envelope:

```json
{"error":{"code":"EXPENSE_LOCKED","message":"A paid share must be unmarked before this expense can be changed","details":{"lockedBy":[]}}}
```

Status mapping: `UNAUTHENTICATED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `VALIDATION` 422, `EXPENSE_LOCKED` and `CONFLICT` 409, `INTERNAL` 500.

## MCP

`POST /mcp` exposes `listGroups`, `listExpenses`, `createExpense`, and `getBalances`. It uses the same Better Auth cookie or API key and service layer as REST and server functions. Each HTTP request gets an isolated stateless MCP transport. Setup instructions for each client (Claude Code, the Claude app, Cursor, OpenCode, Hermes, OpenClaw) are at `/docs`.

## Observability

Set the Sentry and PostHog variables shown in `.env.example`. The browser variables enable page views and client errors; the server variables enable MCP/product metrics and server errors. Sentry source-map upload additionally requires `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` at build time.

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

## Apple Shortcut

`public/eventual.shortcut` asks for a group, then who paid, then an amount, and logs an even split between all group members dated today. On import, Shortcuts asks for an API key and the app URL. It calls:

```bash
$CURL "$BASE/api/shortcut/groups"                      # { "Group name": "GROUP_ID" }
$CURL "$BASE/api/shortcut/groups/GROUP_ID/members"     # { "Me (Name)": "USER_ID", ... }
$CURL -X POST -d '{"paidByUserId":"USER_ID","amount":1200.5}' "$BASE/api/shortcut/groups/GROUP_ID/expenses"
```

The group and member responses are dictionaries: Choose from List displays their keys but returns the selected value (the ID). Use that output directly, without another dictionary lookup. The expense response and errors have a `message` field. After changing `scripts/build-shortcut.ts`, rebuild and re-sign the file on macOS with `bun run shortcut:build [default-url]`. Existing users must download the updated file and replace their installed shortcut to receive fixes.

## Verification

```bash
bun run check
bunx tsc --noEmit
node --import tsx --test src/lib/money.test.ts src/server/services/settlements.test.ts
bun run build
```
