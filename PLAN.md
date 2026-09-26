# How Eventual will extend

Last updated: 2026-09-13

This plan covers intake methods and integrations. It exists because the next
round of features — non-account members, WhatsApp, UPI, reminders, recurring
expenses, a mobile app — all arrive through new entry points, and the way entry
points are currently added does not scale. The feature wishlist is the forcing
function; the architecture is the deliverable.

Read `README.md` for how the app behaves today and `DESIGN.md` for how it looks.

## The problem

Four intake surfaces exist, and all four funnel into one service layer. That
part is right. What is wrong is that each one re-derives routing, validation,
auth, error mapping and telemetry by hand.

| Surface  | Entry point                        | How it dispatches                                  |
| -------- | ---------------------------------- | -------------------------------------------------- |
| Web      | `src/server/fn/app.ts`             | `mutateFn`, a 15-arm discriminated union + 5 reads  |
| REST     | `src/server/http.ts` `dispatchApi` | ~140 lines of hand-written `if (parts[0] === …)`    |
| MCP      | `src/routes/mcp.ts`                | 4 tools registered one at a time                    |
| Shortcut | `src/server/services/shortcut.ts`  | a 5th response shape, wrapped by `dispatchShortcut` |

Telemetry is already split two ways: `product_mutation_completed` is emitted
only from the web path, `mcp_tool_called` only from MCP. The Shortcut and REST
paths emit nothing. Adding WhatsApp, inbound email, UPI callbacks and a mobile
client means four more dispatchers and four more chances for the four to drift.

Underneath, `src/server/services/app.ts` is a 995-line module while the
per-aggregate files beside it (`groups.ts`, `expenses.ts`, `members.ts`,
`invitations.ts`, `settlements.ts`) are 6-to-9-line re-export stubs. The seams
are marked but not cut. Domain tests cover `lib/money.ts` and
`lib/settlements.ts` and nothing else.

## Decisions

Settled, so they do not get relitigated mid-build.

| Question                       | Decision                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Mobile app                     | Deferred. Design the API contract for it now so the app is a thin build later, not a rewrite.                  |
| UPI                            | `upi://` deep links with manual confirmation. No PSP, no merchant account, no KYC. A port is defined for later. |
| WhatsApp                       | Build the channel port now, choose the vendor later. No Meta relationship yet.                                 |
| Families                       | Not an entity. A family is a member whose default split weight is its headcount.                               |
| Non-account members            | Real `user` rows created eagerly, resolved by a global upsert on email.                                        |
| Future-dated expenses          | No change. They count against balances immediately, as they do today.                                         |
| Cross-group balances           | Display-only netting per currency. Settlement stays per-group. No FX conversion anywhere.                      |

## The spine: one operation registry

Declare every operation once; project it onto every channel. This is the single
change that makes the rest of the list cheap.

```ts
defineOperation({
  name: "expense.create",
  method: "POST",
  path: "/v1/groups/:groupId/expenses",
  input: createExpenseSchema,
  output: expenseSchema,          // new — needed for OpenAPI and typed clients
  scope: "expenses:write",
  idempotent: true,
  mcp: { tool: "createExpense", description: "…" },
  handler: services.createExpense,
});
```

Every projection is then thin:

- **REST** — a route table built from `method` and `path`, with path params
  merged into the input object. This deletes the `dispatchApi` if-chain.
- **Server functions** — `mutateFn`'s discriminated union is *derived* from the
  registry rather than restated alongside it.
- **MCP** — auto-register everything carrying an `mcp` key. The
  `z.coerce.date()` workaround at `src/routes/mcp.ts:24` becomes a general
  wire-schema rule instead of a per-tool patch.
- **Presets** — the Apple Shortcut endpoints generalise into named aliases that
  bind an operation with pre-filled arguments and a flattened response. The same
  mechanism serves WhatsApp quick-add, Siri and a mobile share sheet.
- **OpenAPI** — generate `/api/openapi.json` from the registry. This is what
  makes the deferred mobile app a thin build: a generated TypeScript client
  rather than a hand-maintained one.
- **Telemetry** — one wrapper, one `surface` property, every channel covered.

Two supporting pieces that nothing currently has:

**Idempotency.** An `Idempotency-Key` header resolved against an
`idempotency_key` table (key, userId, operation, requestHash, responseJson).
Registered once in the spine so every channel inherits it. Required by a mobile
offline queue, WhatsApp retries and any payment callback.

**Notifier port.** `send(userId, kind, payload)` with a Resend adapter today —
React Email and `src/emails/transactional.tsx` are already built — and WhatsApp
and push as later adapters. A `channel_identity` table (userId, channel,
address, verifiedAt) holds phone numbers, WhatsApp IDs and UPI VPAs.

**Job runner.** A `job` table (dueAt, kind, payload, attempts, lockedAt) driven
by Vercel Cron against an authenticated `/api/jobs/run`. Database-backed so it
survives a hosting change and gets retries and idempotency for free. Email
reminders, recurring expenses and WhatsApp reminders all need it; none can ship
without it.

## Members

`expense_share.user_id` keeps its foreign key to `user.id`. There is no
participant or party table.

### Weights

Add `member.weight` (integer, default 1). An even split becomes weighted: three
members at weight 2 each receive 2/6. `computeShares` in
`src/server/domain/split.ts` already does largest-remainder weight maths for the
`shares` method, so `even` routes through the same `distribute()` call with
weight as its input. With every weight at 1 the output is identical to today's
even split, so the change is behaviour-preserving. Shares stay materialised,
which means changing a weight later never rewrites history.

### Guests

Adding a member resolves against `user` by email first, always. The row that
already exists is the row that gets used, so one person added independently by
three groups stays one user with one consolidated history.

1. **Name only.** Create a `user` row with a synthetic address
   (`guest.<uuid>@guests.eventual.invalid`; `.invalid` is reserved by RFC 2606
   and undeliverable), plus a `member` row. Splittable immediately. Cannot sign
   in, because no `account` row exists.
2. **Email belonging to an existing account.** No user creation. The current
   `createInvitation` path applies; they accept and the member row appears.
3. **Email with no account yet.** Create the guest user *and* an invitation.

Case 3 carries the one genuinely tricky piece. When that person later signs up,
`signUpEmail` collides with the unique index on `user.email`. Without a claim
hook they receive an error and their entire expense history is stranded on a row
they can never reach. A Better Auth `databaseHooks.user.create.before` hook must
detect an unclaimed guest at that address and upgrade it in place.

A **merge** operation is required regardless: a name-only guest created in
January, with the real person signing up in March as a separate user, has no
email to collide on. Merge rewrites `expense_share.user_id`,
`expense.paid_by_user_id`, `settlement.from_user_id`, `settlement.to_user_id`
and `activity.actor_user_id`, then drops the guest row.

`assertCanExit` (`src/server/services/app.ts:202`) needs a guest-aware variant,
since a guest cannot settle their own balance.

## Wishlist

Already shipped: adding spend, splitting with all or some, equal/exact/shares/
percent splits, multiple currencies.

| Item                              | Work                                                                                                     | Phase |
| --------------------------------- | -------------------------------------------------------------------------------------------------------- | ----- |
| Members by name, email or phone   | Guest users, email upsert, claim hook, merge                                                              | M1    |
| Signed-up members get access      | Existing invitation flow plus the claim hook                                                              | M1    |
| Family as a split weight          | `member.weight`, weighted even split                                                                      | M1    |
| Archive / duplicate group         | `organization.archivedAt`; duplicate copies members and weights, not expenses                             | M2    |
| Email reminders                   | Notifier, job runner, per-user notification preferences                                                   | M2    |
| Add member, resplit past spends   | Bulk resplit operation. **Blocked by the paid-share lock** (`unlockedExpense`) — needs per-expense conflict reporting | M2 |
| UPI                               | `upi://` intent links per simplified transfer, manual confirm records the settlement                      | M2    |
| Auto-categorise by description    | `expense.category` plus a `category_rule` table. Deterministic patterns first — explainable and free       | M3    |
| Search                            | `LIKE` over a normalised column at this scale. SQLite FTS5 only if it gets slow                            | M3    |
| Categorised expense report        | Depends on categories. CSV, then PDF, as a read operation with filters                                     | M3    |
| Recurring expense                 | `expense_template` with a recurrence rule, materialised by the job runner                                  | M3    |
| Cross-group balances              | Aggregate per currency and counterparty. Read-only, no schema change                                       | M3    |
| WhatsApp                          | Channel port now, vendor later                                                                            | M3    |
| Mobile                            | OpenAPI client, token auth, idempotency and a push-ready notifier make it a thin build                     | later |

## Milestones

**M0 — cut the seams.** Split `services/app.ts` into the per-aggregate files
whose stubs already exist; the move is mechanical. Expand domain tests around
`computeShares` and `computeBalances`. Introduce `/api/v1`.

This is insurance. M1 rewrites the split engine's entry path and M2 rewrites
every route, and at present two test files stand between those refactors and a
silent money bug.

**M1 — people.** Guest users, email upsert, claim hook, merge, `member.weight`,
weighted even split.

**M2 — the spine.** Operation registry, OpenAPI, idempotency, notifier and job
runner. Then the cheap wins riding on them: archive and duplicate, email
reminders, UPI deep links, resplit.

**M3 — channels and the long tail.** Channel port, categories and rules, search,
reports, recurring expenses, cross-group balances.

**M4 — mobile**, if and when it is picked up.

There is a real argument for running M2 before M1: doing the registry first
avoids writing every operation's schema twice. The counter-argument is that M1
is what the user group actually asked for. Either order works; the cost of
choosing wrong is one schema pass, not a rewrite.

## Schema changes

Collected for migration planning.

| Table              | Change                                                       | Phase |
| ------------------ | ------------------------------------------------------------ | ----- |
| `member`           | add `weight` integer, default 1                              | M1    |
| `user`             | add guest marker and `claimedAt`                             | M1    |
| `channel_identity` | new: userId, channel, address, verifiedAt                    | M2    |
| `idempotency_key`  | new: key, userId, operation, requestHash, responseJson       | M2    |
| `job`              | new: dueAt, kind, payload, attempts, lockedAt                | M2    |
| `organization`     | add `archivedAt`                                             | M2    |
| `expense`          | add `category`                                               | M3    |
| `category_rule`    | new: pattern, category, scope                                | M3    |
| `expense_template` | new: recurrence rule, nextRunAt, expense payload             | M3    |

## Risks

**The paid-share lock blocks resplitting.** `unlockedExpense` refuses any change
to an expense with a paid share. Adding a member and resplitting past spends
will hit this constantly in real groups. The bulk resplit operation has to report
which expenses it skipped and why, rather than failing whole or silently
partial.

**Guest rows are unauthenticated identities.** They must never acquire an
`account` row by accident. Password reset against a guest's synthetic or real
address is the path to watch.

**Balance reads load whole group histories.** `computeBalances` needs every
expense and share for a group. Cross-group balances multiply that by group
count. The fix, when it is needed, is a materialised per-member balance row
updated inside the existing expense and settlement transactions — not more query
tuning.

**No API versioning today.** Third parties and a mobile client both need a
stable contract. `/v1` lands with the registry, because the registry owns paths.

## Already landed

`listGroups` (`src/server/services/app.ts:79`) previously called `getBalances`
once per group inside a `Promise.all`, costing four queries per group and then
discarding the simplified transfer list it had just computed. It now batches
three `inArray` reads across every group the caller belongs to and buckets them
in memory, leaving `computeBalances` as the single implementation of the money
maths. Measured against the seed database: 4N+1 queries down to a constant 4,
with byte-identical output for every user.
