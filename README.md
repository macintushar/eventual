# EvenTual

EvenTual is a TanStack Start expense-sharing app for INR groups. It uses Better Auth organizations, Drizzle ORM, libSQL/Turso, typed server functions, a JSON REST API, and an authenticated MCP endpoint.

## Local setup

```bash
bun install
cp .env.example .env.local
bun run db:generate
bun run db:migrate
bun run db:seed
bun run dev
```

The seed prints three login accounts. Their shared password is `eventual123`.

```text
tushar@eventual.test
priya@eventual.test
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

## Behaviour

- Money is stored as integer paise and formatted as INR only at the UI edge.
- Even splits distribute remainder paise by ascending user ID.
- Shares and percentages use largest-remainder allocation with user-ID tie breaking.
- Exact inputs must equal the expense total; percentages must equal 10,000 basis points.
- Any paid share locks every editable field and deletion. Clearing the final paid flag unlocks it.
- Balances use unpaid expense shares plus settlement records. Settlement allocations mark complete matching shares paid FIFO and never partially settle a share.
- A settlement moves the balance by its *unallocated* remainder only. The allocated part already moved the balance by marking those shares paid, so counting the raw amount as well would double-count it. Over-paying therefore leaves the payer a credit for the leftover.
- Positive balance means others owe that member. The simplified debt list greedily pairs largest debtors and creditors.

## REST API

Authentication accepts a Better Auth session cookie or a user API key in the `x-api-key` header. Create and revoke keys at `/app/settings`.

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
$CURL -X POST -d '{"toUserId":"USER_ID","amountMinor":50000,"note":"UPI"}' "$BASE/api/groups/GROUP_ID/settlements"
$CURL -X DELETE "$BASE/api/settlements/SETTLEMENT_ID"
$CURL "$BASE/api/groups/GROUP_ID/activity?limit=30"
```

Errors use one envelope:

```json
{"error":{"code":"EXPENSE_LOCKED","message":"A paid share must be unmarked before this expense can be changed","details":{"lockedBy":[]}}}
```

Status mapping: `UNAUTHENTICATED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `VALIDATION` 422, `EXPENSE_LOCKED` and `CONFLICT` 409, `INTERNAL` 500.

## MCP

`POST /mcp` exposes `listGroups`, `listExpenses`, `createExpense`, and `getBalances`. It uses the same Better Auth cookie or `x-api-key` header and service layer as REST and server functions. Each HTTP request gets an isolated stateless MCP transport.

## Verification

```bash
bun run check
bunx tsc --noEmit
bun run build
```
