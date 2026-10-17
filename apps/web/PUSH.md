# Hosted native push

Self-hosted instances leave all APNs/FCM variables unset. `/api/v1/site` then
reports `push: { available: false, via: "none" }`; no push jobs are enqueued.
A complete configuration for either provider advertises `via: "direct"`.
Registration is rejected for platforms whose provider is not configured.
The capability object can later add `via: "relay"`; no relay is implemented.

Apply the generated migration before enabling credentials. Configure the optional
variables documented in `.env.example`. `APNS_PRIVATE_KEY` accepts a PEM `.p8`
key (literal or escaped newlines); `FCM_SERVICE_ACCOUNT` is the service-account
JSON, including `client_email` and `private_key`. Never share hosted credentials
with self-hosted operators. No Expo push service or additional dependency is used.

The app registers native APNs/FCM tokens after permission grant and retires the
returned device ID before sign-out. Responses never expose tokens. A token moving
to another account gets a fresh ID, fencing old deliveries and sign-out handles.
All registry and preference endpoints require a session, not an API key.
PATCH preferences updates only supplied category flags; `mutedGroupIds`, when
supplied, replaces the mute list and must contain only the user's groups.

Activities enqueue recipient jobs in the same database transaction as the feed.
Recipients match the feed's affected people (including removed expense
participants), minus the actor and anyone who disabled the category or muted
the group. Delivery checks current membership, preferences, and device ownership
again. Recurring generation uses its own category and actor-free copy.
Payload data contains only `origin`, `userId`, `groupId`, optional `expenseId`,
and `type`; the app must check origin/account and refetch with authorization.
Per-group threading/collapse is scoped to server and account. Android uses the
`eventual-activity` notification channel, which the native app must create.

The existing authenticated `/api/jobs/run` runner handles push jobs and per-device delivery
jobs. Schedule it frequently (e.g. every minute) for timely push: the existing
daily schedule alone delays push until its next run.
The queue retries failures up to five attempts with 1/2/4/8 minute backoff,
honoring a later provider `Retry-After`. Each device retries independently,
so success on one device is not repeated when another fails. Ambiguous network
responses are at-least-once, not exactly-once. Invalid/unregistered tokens are
removed conditionally so a concurrent refresh cannot be erased by a stale send.
Expired APNs/FCM authorization is refreshed on retry. Exhausted jobs remain
available for operational inspection; tokens and provider bodies are not stored
in delivery errors. Use `createPushSender`'s injected transport and `executePush`'s
injected sender in tests; never test with live credentials.
