# Build prompt: EvenTual (Splitwise-style expense splitting)

You are building **EvenTual** in the current repository. The repo is a fresh
TanStack Start scaffold with nothing app-specific built yet. Build the complete feature set
described below: data model, service layer, REST API, MCP-ready wiring, and a functional UI.

Read this whole document before writing code. Where it specifies exact behaviour (split math,
lock rule, balance math), implement it exactly — do not substitute your own interpretation.

---

## 0. Existing stack — use it, don't replace it

Already installed and configured (`package.json`, `vite.config.ts`, `tsconfig.json`):

- **TanStack Start** + **TanStack Router** file-based routing (`src/routes/`, `tsr generate`)
- **better-auth 1.5** — currently email/password only, no DB adapter, no plugins (`src/lib/auth.ts`)
- **Drizzle ORM 0.45** + drizzle-kit (`drizzle.config.ts`, currently `dialect: 'sqlite'` + better-sqlite3)
- **shadcn/ui** (`components.json`; button, input, label, select, textarea, switch, slider already added)
- **Tailwind v4**, **Zod v4**, **TanStack Form**, **TanStack Table**, **lucide-react**, **@faker-js/faker**
- **@modelcontextprotocol/sdk** with a working MCP endpoint at `src/routes/mcp.ts`
- **@t3-oss/env-core** env validation (`src/env.ts`)
- Path alias: `#/*` → `./src/*`. Package manager: **bun**.
- Biome for lint/format — run `bun run check` before you finish and fix what it reports.

Local skills you should consult (in `.agents/skills/`): `turso-cloud`, `turso-db`, `drizzle`,
`better-auth-best-practices`, `organization-best-practices`, `email-and-password-best-practices`,
`shadcn`. Prefer these over recalled API details.

**Delete when done:** `src/mcp-todos.ts`, the `todos` table in `src/db/schema.ts`, the `addTodo`
MCP tool, and the placeholder content in `src/routes/index.tsx`.

---

## 1. Database: migrate to Turso

Replace better-sqlite3 with Turso/libSQL.

- `bun add @libsql/client` and `bun remove better-sqlite3 @types/better-sqlite3` (also drop it
  from `pnpm.onlyBuiltDependencies`).
- `src/db/index.ts` → `drizzle` from `drizzle-orm/libsql`, constructed with
  `{ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN }`.
- `drizzle.config.ts` → `dialect: 'turso'`, `dbCredentials: { url, authToken }`.
- `src/env.ts` → add server vars: `TURSO_DATABASE_URL` (required), `TURSO_AUTH_TOKEN` (optional —
  omitted for local files), `BETTER_AUTH_SECRET` (required), `BETTER_AUTH_URL` (optional, defaults
  to `http://localhost:3000`). Note `src/env.ts` currently reads `import.meta.env`; make sure
  server-only vars resolve correctly under Nitro (use `process.env` for the server side).
- Works both ways with no code change: `TURSO_DATABASE_URL=file:local.db` for local dev,
  `libsql://<db>-<org>.turso.io` + token for Turso Cloud.
- Write `.env.example` with all four vars documented. Add `local.db*` to `.gitignore`.
- Do **not** try to provision a Turso Cloud database or invent credentials. Set up local
  `file:local.db` so `bun run dev` works immediately, and document the Turso Cloud swap in
  the README (`turso db create eventual`, `turso db show --url`, `turso db tokens create`).

Migrations: `bun run db:generate` then `bun run db:migrate`. Commit the generated SQL in `drizzle/`.

---

## 2. Auth & groups

A **group is a better-auth Organization**. Use the `organization` plugin — do not hand-roll
membership tables.

```ts
// src/lib/auth.ts
betterAuth({
  database: drizzleAdapter(db, { provider: 'sqlite', schema }),
  emailAndPassword: { enabled: true, requireEmailVerification: false },
  plugins: [organization({ ... }), tanstackStartCookies()],
})
```

- Generate the better-auth tables into `src/db/schema.ts` with `bunx @better-auth/cli generate`
  **after** the org plugin is configured, so `organization` / `member` / `invitation` are included.
  Keep them in the same schema file (or a `src/db/schema/auth.ts` re-exported from an index) so the
  drizzle adapter and your app tables share one schema object.
- Mirror the client: `src/lib/auth-client.ts` adds `organizationClient()`.
- Roles: better-auth defaults (`owner`, `admin`, `member`). The org creator is `owner`.
- Session must carry `activeOrganizationId`; set it when a user opens a group.
- No email provider is configured. `sendInvitationEmail` must be a no-op that `console.log`s the
  invite URL — **never** add a real email dependency.

---

## 3. Application schema (`src/db/schema.ts`)

All IDs are `text` primary keys (nanoid or `crypto.randomUUID()`), matching better-auth's style.
All timestamps are `integer({ mode: 'timestamp' })`.

**`expense`**
| column | type | notes |
|---|---|---|
| `id` | text pk | |
| `organizationId` | text | FK → `organization.id`, cascade delete, indexed |
| `description` | text | required, 1–200 chars |
| `notes` | text | nullable |
| `amountMinor` | integer | **total in minor units (paise)**, must be > 0 |
| `currency` | text | default `'INR'` |
| `paidByUserId` | text | FK → `user.id`. The single person who fronted the money. |
| `splitMethod` | text | `'even' \| 'exact' \| 'shares' \| 'percent'` |
| `date` | integer timestamp | when the expense happened (user-editable) |
| `createdByUserId` | text | FK → `user.id` |
| `createdAt` / `updatedAt` | integer timestamp | |

**`expenseShare`** — one row per participant. Unique on `(expenseId, userId)`.
| column | type | notes |
|---|---|---|
| `id` | text pk | |
| `expenseId` | text | FK → `expense.id`, **cascade delete**, indexed |
| `userId` | text | FK → `user.id`, indexed |
| `amountMinor` | integer | computed owed amount; `SUM` over an expense **must equal** `expense.amountMinor` |
| `splitInput` | integer | raw input for the method: `exact` → minor units; `shares` → weight; `percent` → **basis points** (5000 = 50%); `even` → null |
| `paidAt` | integer timestamp | nullable; non-null means this person settled their portion |
| `paidMarkedByUserId` | text | nullable; who flipped the flag |

**`settlement`** — a record of money actually moving between two members.
`id`, `organizationId`, `fromUserId`, `toUserId`, `amountMinor` (> 0), `currency`, `note` (nullable),
`createdByUserId`, `createdAt`. `fromUserId !== toUserId` enforced in the service.

**`settlementAllocation`** — links a settlement to the shares it cleared.
`id`, `settlementId` (FK cascade), `expenseShareId` (FK cascade), `amountMinor`.

**`activity`** — append-only group feed.
`id`, `organizationId` (indexed), `actorUserId`, `type` (text enum), `targetType`, `targetId`,
`metadata` (text, JSON-encoded), `createdAt` (indexed desc).
Types: `group.created`, `group.renamed`, `group.deleted`, `member.invited`, `member.invite_revoked`,
`member.joined`, `member.removed`, `member.left`, `member.role_changed`, `expense.created`,
`expense.updated`, `expense.deleted`, `share.marked_paid`, `share.marked_unpaid`,
`settlement.created`, `settlement.deleted`.

Define Drizzle `relations()` for all of the above.

---

## 4. Split engine — `src/server/domain/split.ts`

**Pure, dependency-free, integer-only.** No floats in stored results, ever. This is the part most
likely to be subtly wrong; be rigorous.

```ts
type Participant = { userId: string; input: number | null }
function computeShares(
  totalMinor: number,
  method: SplitMethod,
  participants: Participant[],
): { userId: string; amountMinor: number; splitInput: number | null }[]
```

Participants are always processed in a **deterministic order: ascending `userId`**. Remainder
distribution depends on that order, so it must be stable across recomputes.

- **`even`** — `base = Math.floor(total / n)`, `r = total - base * n`. The first `r` participants in
  sorted order get `base + 1`.
- **`exact`** — `input` is the owed amount in minor units. Reject unless `Σ input === total`; the
  error must report the delta (e.g. `"₹2.50 left to assign"`).
- **`shares`** — `input` is a positive integer weight, `W = Σ input`, `W > 0`.
  `raw_i = total * w_i / W`; give each `floor(raw_i)`, then distribute the `total - Σ floor`
  leftover units one at a time by **largest fractional remainder**, ties broken by sorted order.
- **`percent`** — `input` is basis points; reject unless `Σ input === 10000`. Same largest-remainder
  distribution as `shares`.

Post-condition, asserted on every path: `Σ amountMinor === totalMinor`. Throw if violated.
Every participant must be a current member of the org. `paidByUserId` may or may not be a
participant. A participant may owe 0 (e.g. 0 shares) — that's legal.

---

## 5. Lock rule (the core business rule)

> An expense is **locked** the moment **any** of its shares has `paidAt !== null`.

- Locked ⇒ `PATCH /expenses/:id` and `DELETE /expenses/:id` fail with **409 `EXPENSE_LOCKED`**.
  The error payload lists which members locked it (`{ userId, name, paidAt }[]`), so the UI can say
  "Priya marked their share paid — ask them to unmark it to edit."
- The lock covers **everything**: amount, currency, split method, participants, payer, description,
  notes, date. No partial editability.
- Marking/unmarking paid is always allowed on a locked expense (others still need to settle).
- Unlocking = every member who marked paid unmarks. Once the last `paidAt` is cleared the expense
  is editable again.
- Deleting a settlement that auto-marked shares un-marks exactly the shares it allocated to
  (see §6), which can unlock an expense — that's intended.

Who can mark a share paid: **the share's owner**, or the expense's `paidByUserId` (they received
the money). Nobody else — 403.

Who can edit/delete an expense: **any member of the group**, subject to the lock. (Explicit product
decision: matches Splitwise, no creator-only restriction.)

---

## 6. Balances & settlements — `src/server/domain/balances.ts`

Two mechanisms exist (per-share paid flags *and* settlement records). They must **never**
double-count. The rule:

**Balances are computed from *unpaid* shares plus settlement records.**

For member `i` in a group, in minor units:

```
balance_i =
  + Σ over expenses e where e.paidByUserId === i:
      Σ e.shares[j].amountMinor   for j !== i AND shares[j].paidAt === null
  − Σ over expenses e where e.paidByUserId !== i:
      e.shares[i].amountMinor     if shares[i].paidAt === null
  + Σ settlements where fromUserId === i (amountMinor)
  − Σ settlements where toUserId   === i (amountMinor)
```

`balance_i > 0` ⇒ others owe them. `Σ balance_i` over the group must be `0`; assert this.

A share where `paidBy === shareOwner` never contributes (you don't owe yourself).

**Creating a settlement (`from` → `to`) auto-allocates, FIFO:**

1. Find all unpaid shares where `share.userId === from` and `expense.paidByUserId === to`, ordered
   by `expense.date` ascending, then `expense.createdAt`.
2. Walk them in order. While remaining settlement amount ≥ the share's `amountMinor`, mark the
   share paid (`paidAt = now`, `paidMarkedByUserId = actor`), write a `settlementAllocation` row,
   and subtract. **Do not partially settle a share** — stop at the first share larger than the
   remaining amount.
3. Any leftover is unallocated. That's fine — the raw settlement amount still moves the balance,
   so the leftover naturally becomes a credit.

Deleting a settlement deletes its allocations and sets those shares back to `paidAt = null`.

**Simplified debts:** also expose a `simplify` step turning the balance vector into a minimal set of
`{ from, to, amountMinor }` transfers — greedy max-creditor/max-debtor pairing until all balances
are 0. Show these on the Balances tab as one-click "Settle up" buttons that prefill the settlement
form.

Currency: `'INR'` group-wide, formatted with `Intl.NumberFormat('en-IN', { style: 'currency',
currency: 'INR' })`. Store minor units everywhere; convert only at the UI edge. Build
`src/lib/money.ts` with `toMinor`/`fromMinor`/`formatMinor` and use it consistently — no ad-hoc
`* 100` anywhere.

---

## 7. Architecture: one service layer, three consumers

MCP server support is coming later, so **all business logic lives in a framework-agnostic service
layer** that knows nothing about HTTP, Request/Response, or React.

```
src/server/
  domain/       split.ts, balances.ts        ← pure functions, no DB
  services/     groups.ts, members.ts, invitations.ts,
                expenses.ts, settlements.ts, activity.ts
  schemas/      zod input/output schemas, shared by every consumer
  errors.ts     AppError + typed codes
  context.ts    buildContext(request) -> { session, user, db }
```

Every service function has the shape:

```ts
export async function updateExpense(
  ctx: Ctx,                 // { db, user, session }
  input: UpdateExpenseInput // Zod-parsed
): Promise<ExpenseDTO>
```

It performs its own authorization (membership + role checks) and throws `AppError`. It must be
callable from a script with no HTTP request in scope.

Three consumers sit on top:

1. **REST handlers** — `src/routes/api/**`, using TanStack Start file-route `server.handlers`
   (see `src/routes/mcp.ts` for the pattern). Thin: parse → build ctx → call service → JSON.
   One shared `handle()` wrapper maps `AppError` to status codes and the error envelope.
2. **Server functions** — `src/server/fn/*.ts` via `createServerFn`, for the UI. Also thin wrappers
   over the same services. The UI calls these (typed, no fetch boilerplate), not the REST routes.
3. **MCP tools** — extend `src/routes/mcp.ts`. Register at least `listGroups`, `listExpenses`,
   `createExpense`, `getBalances` as tools that build a ctx from the request session and call the
   same services. Reuse the Zod schemas from `src/server/schemas/` as the MCP `inputSchema`.
   Keep this minimal — it's a proof that the layering works, not the main deliverable.

If a service is ever imported into a `.tsx` client component, the layering is wrong.

---

## 8. REST API surface

JSON in/out. Auth via the better-auth session cookie. Error envelope:

```json
{ "error": { "code": "EXPENSE_LOCKED", "message": "…", "details": { } } }
```

Codes → status: `UNAUTHENTICATED` 401 · `FORBIDDEN` 403 · `NOT_FOUND` 404 · `VALIDATION` 422 ·
`EXPENSE_LOCKED` 409 · `CONFLICT` 409 · `INTERNAL` 500.

```
GET    /api/groups                                  list my groups + my net balance in each
POST   /api/groups                                  { name, slug? } → creator becomes owner
GET    /api/groups/:groupId                         group + members + my role
PATCH  /api/groups/:groupId                         rename            (admin|owner)
DELETE /api/groups/:groupId                         delete            (owner)

GET    /api/groups/:groupId/members
PATCH  /api/groups/:groupId/members/:userId         { role }          (owner)
DELETE /api/groups/:groupId/members/:userId         remove            (admin|owner)
POST   /api/groups/:groupId/leave                   leave

GET    /api/groups/:groupId/invitations             pending           (admin|owner)
POST   /api/groups/:groupId/invitations             { email?, role } → { invitationId, inviteUrl }
DELETE /api/invitations/:invitationId               revoke            (admin|owner)
GET    /api/invitations/:invitationId               public-ish preview: group name, inviter
POST   /api/invitations/:invitationId/accept        join
GET    /api/me/invitations                          invites pending for my email

GET    /api/groups/:groupId/expenses                ?cursor&limit&paidBy&participant&from&to
POST   /api/groups/:groupId/expenses
POST   /api/groups/:groupId/expenses/preview        compute split, persist nothing
GET    /api/expenses/:expenseId                     includes shares + locked flag + lockedBy
PATCH  /api/expenses/:expenseId                     409 if locked
DELETE /api/expenses/:expenseId                     409 if locked
POST   /api/expenses/:expenseId/shares/:userId/paid mark paid
DELETE /api/expenses/:expenseId/shares/:userId/paid unmark

GET    /api/groups/:groupId/balances                per-member net + simplified transfers
GET    /api/groups/:groupId/settlements
POST   /api/groups/:groupId/settlements             { toUserId, amountMinor, note? }
DELETE /api/settlements/:settlementId               reverses allocations

GET    /api/groups/:groupId/activity                ?cursor&limit, newest first
```

Guards to implement (each returns a clear message):
- Removing a member / leaving with a non-zero balance or any unpaid share → 409 `CONFLICT`.
- The last `owner` cannot leave or be demoted.
- Deleting a group cascades expenses, shares, settlements, activity, invitations.
- Every expense participant and the payer must be current members.
- Every write appends an `activity` row in the **same transaction** as the mutation.

Write a `README.md` section documenting these endpoints with one `curl` example each.

---

## 9. UI

shadcn + Tailwind. Functional and clean over fancy — but no unstyled HTML. Add shadcn components
as needed with `bunx shadcn@latest add …` (card, dialog, dropdown-menu, table, tabs, avatar, badge,
sonner, form, alert, tooltip, separator, skeleton, popover, calendar…). Dark mode via Tailwind is
a bonus, not a requirement.

Routes:

| Route | Contents |
|---|---|
| `/` | Landing; redirect to `/app` when signed in |
| `/login`, `/signup` | TanStack Form + Zod, better-auth client, inline field errors |
| `/app` | Dashboard: group cards with my net balance, overall total, pending invites, "New group" |
| `/app/groups/new` | Name → create → redirect into the group |
| `/app/groups/$groupId` | Tabs: **Expenses** · **Balances** · **Members** · **Activity** · **Settings** |
| `/app/groups/$groupId/expenses/new` | Expense form |
| `/app/groups/$groupId/expenses/$expenseId` | Detail + inline edit + per-share paid toggles |
| `/invite/$invitationId` | Accept screen; bounce through login/signup preserving the invite |

Protect `/app/*` with a router `beforeLoad` session check that redirects to `/login?redirect=…`.
Use TanStack Router loaders for data and invalidate after mutations. Toast on success/failure
(sonner). Optimistic UI is not required.

**The split editor** is the centerpiece — one component, four tabs (Even / Exact / Shares /
Percent), used by both create and edit:

- Member checkboxes choose participants; payer is a separate `Select` defaulting to the current user.
- Live per-person preview computed by calling the same `computeShares` from `src/server/domain/split.ts`
  (it's pure — import it directly into the client; do **not** reimplement the math in the UI).
- A running "₹X left to assign" / "must total 100%" indicator that turns red when invalid.
- Submit disabled while invalid, with the reason shown.
- Percent input in whole/decimal percent, converted to basis points at the boundary.

**Locked state**: on a locked expense, disable every field, show a prominent banner —
"Locked · Priya marked their share paid on 3 Sep" — and hide Edit/Delete. Each member's row shows
a paid checkbox they can toggle (their own row, or any row if they're the payer).

**Balances tab**: per-member net (green = owed to them, red = they owe), the simplified transfer
list with "Settle up" buttons that open a prefilled settlement dialog, and a settlement history list
with delete.

**Members tab**: member list with role badges, role dropdown (owner only), remove (admin+),
"Invite" button → dialog that creates an invitation and shows a **copy-to-clipboard invite link**
(this is the entire invite mechanism — no emails). Pending invitations with revoke.

**Activity tab**: reverse-chronological feed rendering each activity type as a readable sentence
("Tushar changed Dinner from ₹1,200 to ₹1,450"), with relative timestamps and load-more.

**Settings tab**: rename group, leave group, delete group (typed confirmation), each gated on role.

---

## 10. Deliverables & verification

1. All of the above, working end to end.
2. `drizzle/` migrations committed.
3. `.env.example`, and a `README.md` covering setup, local vs Turso Cloud, the API reference, and a
   short "how splitting, locking, and balances work" section.
4. A seed script `bun run db:seed` (`src/db/seed.ts`, faker is installed) creating ~3 users with
   known passwords, 2 groups, and a dozen expenses across all four split methods — including one
   locked expense and one settlement — so the app is immediately explorable. Print the login
   credentials.
5. `bun run check` clean (Biome) and `bunx tsc --noEmit` clean.
6. Manually verify with `bun run dev`: sign up two users in separate browser profiles, create a
   group, invite via link, accept, log one expense of each split type, confirm shares sum exactly to
   the total, mark a share paid, confirm the expense locks and edit returns 409, unmark, edit
   successfully, record a settlement, confirm balances zero out.
7. Do **not** commit or push. Leave the work in the working tree and report what you built, what
   you verified, and anything you deliberately left out.

## Non-goals for this pass

No email sending, no OAuth providers, no receipt/image uploads, no multi-currency or FX, no
recurring expenses, no comments, no push/realtime, no mobile app, no test suite (explicitly
descoped — but keep `src/server/domain/*` pure so tests can be added later), no deployment config.
