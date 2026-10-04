# RCA: "Trip to TVM" invitees could not see the group

- **Date of incident:** 2026-09-27
- **Status:** Mitigated manually; follow-up fixes open
- **Affected:** 2 invitees (Charita, Ashok) in group "Trip to TVM" (`db866eab-6d09-4d0b-b784-7e5a386f33aa`), owner Siva
- **Production deployment during incident:** `86d646e`, live since 2026-09-26 20:04 UTC

All times are UTC (IST = UTC+5:30). Credentials, session tokens and client IP addresses are deliberately left out of this document. Session and OAuth-state rows were read only for timestamps and the callback path.

## Summary

Two invitees said they had accepted invitations but could not see the group. **Neither invitation was ever accepted in the app.** "Accepted" meant they followed the email and created an account.

- **Charita:** An email signup started from the invite link does not return the user to the invite once email verification is required. Charita created an account, verified her email and landed on her profile page. The invitation stayed pending.
- **Ashok:** The invitation and a guest placeholder (a stand-in person with no account) were both tied to `balakrishnan.ashok@gmail.com`. Ashok registered as `ashok.balakrishn@gmail.com`. The app cannot link the two, and an ordinary invitee has no way to do it.

At 16:38:55 an out-of-band database change marked both invitations accepted and added both members. That fix was incomplete (see [Remediation](#remediation)). Later the owner removed Ashok and tried to add him back, which failed with "Invalid request" because of the phone number field (see [Follow-up incident](#follow-up-incident-re-adding-ashok-fails-with-invalid-request)).

## Evidence reviewed

- **Code:** the invite, signup, email verification, guest creation, guest claim and group access code. It is identical between production (`86d646e`) and the reviewed HEAD.
- **Production database (read-only):**
  - Tables: `invitation`, `member`, `user`, `account`, `session`, `verification`, `activity`, `activity_recipient`, `expense_share`, `rate_limit`, `idempotency_key`.
  - `session` was read for timestamps and user agent only. For `verification`, secret values were excluded.
- **Resend:** delivery records for 2026-09-27.
- **Vercel runtime logs:** only about the last 40 minutes are retained, so nothing from 09:48–15:30 could be retrieved.
- **Gap:** rejected API calls (for example a 403 from accept) are not sent to Sentry. There is no request-level record of whether either invitee pressed "Accept".

## Timeline

| Time (UTC) | Event | Source |
|---|---|---|
| 09-26 20:04 | Deployment `86d646e` goes live. It includes `abe830f`, which changes `requireEmailVerification` from `false` to required whenever Resend is configured. | Vercel, git |
| 09-27 09:48:05 | Siva invites `balakrishnan.ashok@gmail.com` (invitation `91f864bc`). The email is delivered at 09:48:06. | invitation, activity, Resend |
| 09:52:21 | Siva uses "Add person" with the same email. This creates guest `a98fa239` holding that real address and adds it to the group (member `ee23826c`). The existing invitation is reused, so no second email goes out. | user, member, activity |
| 11:01:14 | Siva invites Charita through the Invite dialog (`00199691`). Delivered at 11:01:15. | invitation, activity, Resend |
| 11:08:06 | Ashok signs up as **`ashok.balakrishn@gmail.com`**. The verification email is delivered. The follow-up sign-in fails as unverified and sends him to `/check-email`. | user, account, Resend, rate_limit |
| 11:09:32 | Ashok verifies and is signed in automatically. At 11:10:34 he is on the profile page. | session, rate_limit |
| 11:09:50 | Siva adds guest Gomathi (no email). | user, member |
| 12:49:10 | Charita starts Google sign-in with callback `/invite/00199691…`, then abandons it. | OAuth state row |
| 12:55:13 | Charita signs up with email from the same client. The verification email is delivered, and the follow-up sign-in sends her to `/check-email`. | user, Resend, rate_limit |
| 12:56:11 | Charita verifies and is signed in. At 12:56:27 she is on the profile page. | session, rate_limit |
| 14:31:16 | Siva adds "Hotel room" (₹3,455), split between Siva, Gomathi and **Ashok's guest record** at ₹1,151.67 each. Charita is not a member, so she is not included. | expense, expense_share |
| 15:08:35 | Charita's client calls `/verify-email` again, probably by reopening the verification link (hypothesis). | rate_limit |
| **16:38:55** | **Out-of-band change:** Charita's membership is inserted, member `ee23826c` and the expense share are moved to Ashok's registered account, and both invitations are set to `accepted`. No activity rows are written. | member, invitation |
| 17:21:53 | Siva deletes the "Hotel room" expense. | activity |
| 17:22:02 | Siva removes Ashok (`member.removed`). | activity |
| 17:22:19 | Siva invites `balakrishnan.ashok@` again, the old address. | invitation, activity |
| 17:26:10 | Siva revokes that invitation. | invitation, activity |
| ~17:27 | Siva uses "Add person" with `Ashok.Balakrishn@gmail.com` and gets "Invalid request". Nothing is written. | user report, no DB rows |
| 17:34:49 | Siva adds Ashok again with the email only. This succeeds and creates a pending invitation for `ashok.balakrishn@gmail.com`. The UI says only "Person added". | invitation, activity |
| 17:35:06 | Siva revokes that invitation 17 seconds later, then asks why a registered user can't be added as a member. | invitation, activity, user report |

## Confirmed facts vs. hypotheses

### Confirmed

- **Charita arrived from the invite.** Her abandoned Google attempt kept `callbackURL=/invite/00199691…`.
- **Email signup drops the invite redirect.** It always sends the verification link to `/verify-email` (`src/components/auth-form.tsx:90`), whatever `redirect` the signup page was given.
- **The verification page leads away from the invite.** `/verify-email` only links to `/app/settings/profile` (`src/routes/verify-email.tsx`). Pending invitations appear only on the `/app` dashboard.
- **Neither invitee accepted before 16:38:55.** Neither has a `member.joined` activity, and `acceptInvitation` always writes one in the same transaction.
- **Ashok's account could never see or accept `91f864bc`.** Accept requires the invited email to match the signed-in email exactly, and `listMyInvitations` filters by email.
- **The `balakrishnan.ashok@gmail.com` inbox exists.** Resend reports the invitation to it as delivered.
- **The 16:38:55 change did not go through the app.**
  - No code path changes `member.user_id` without also rewriting activity.
  - Accept always writes activity.
  - The old guest's activity rows were left untouched.
  - No local Claude session contains a production write.
- **Nobody has ever used the guest-claim flow in production.**
- **The re-add failed on the phone number.** "Invalid request" is the generic response for any input validation failure (`src/server/http.ts:28`). The email `Ashok.Balakrishn@gmail.com` passes validation: it is lowercased and matches Ashok's verified account. A phone number without a country code fails. No invitation or member row was created.

### Hypotheses

- **Who owns the other inbox:** `balakrishnan.ashok@` may belong to Ashok, or it may be a mistyped address that reached a third party.
- **A mismatched Accept attempt:** Ashok may have opened the invite link while signed in and seen "Sign in with the invited email address".
- **An earlier blocked signup:** Ashok may have first tried to sign up with `balakrishnan.ashok@` and been told to claim the guest record. The rate-limit counts argue slightly against this, but his requests came through iCloud Private Relay, which rotates addresses.
- **The phone value:** the failing phone was most likely a local number without `+91`. The input was not logged. Even a valid `+91…` number would have failed with a different error (see below).

## Root cause

1. **Charita: the invite destination is lost when email verification is required.**
   - Before `abe830f`, signup returned a session and `AuthForm` redirected straight to the invite page.
   - Since verification became mandatory in production (2026-09-26 20:04), signup goes to `/check-email`, then the verification link, then `/verify-email`, then the profile page.
   - The redirect is dropped at signup and never carried forward. No later page mentions a pending invitation, and nothing accepts it automatically.
   - This is a regression introduced by that deployment.
2. **Ashok: identity mismatch with no way to recover.**
   - The invitation and guest record were tied to an address the owner typed and nobody verified. Accepting requires an exact email match.
   - No in-app path lets an invitee connect a verified account under a different address to that invitation or guest.
   - `mergeGuest` requires the target user to be an admin of every affected group, so an ordinary invitee can never use it.
   - With the matching address, Ashok would have hit issue 1 or been routed into the claim flow instead.

## Contributing UX and data-model issues

- **Invite and Add person are separate actions.** Using both with the same email creates a guest that holds a real, unverified address. Whoever owns that inbox can claim the guest (`src/lib/guest-claim.ts`) and get a full membership with the group's history. The owner gets no warning.
- **Signing up with a guest's email** returns a "claim link" error instead of continuing the invite. After a successful claim, the user is sent to `/login` with no redirect.
- **The invite page gives no guidance on a mismatch.** When signed in with another address, the user only sees an error toast on Accept.
- **The owner cannot see the problem.** There is no "invited, account created, not joined" or "guest has a registered lookalike" state.
- **Validation errors are hidden.** The API returns field details, but the UI shows only "Invalid request". The Add person form does not explain that a phone number cannot be set for someone who already has an account.
- **"Add person" hid that it only sent an invitation.** For a registered user, it creates an invitation instead of a membership but reported "Person added". The owner took the pending invitation for a failure and revoked it. Fixed in the Add person dialog.
- **Member contact details cannot be edited.** There is no UI or API to change a member's email or phone. Admins cannot correct a guest's contact details, and registered users have no phone setting.
- **Personal activity can leak through leftover rows.** Personal activity is read from `activity_recipient` without checking membership. That is intended, so former members keep their history. But leftover guest rows expose group data.
- **Observability gaps:**
  - Vercel log retention covers minutes.
  - Rejected 4xx calls are invisible.
  - There is no invite funnel tracking.
  - The manual production fix left no audit trail.

## Follow-up incident: re-adding Ashok fails with "Invalid request"

At about 17:27 (10:57 PM IST), Siva removed Ashok and tried "Add person" with `Ashok.Balakrishn@gmail.com`. The request failed with "Invalid request". Siva also asked how to change a member's email and phone number.

**Cause:**
- The phone field failed validation. The number most likely had no country code.
- The server's validation response carries the field message ("Include the country code, e.g. +919876543210"), but the UI shows only the generic "Invalid request".
- A valid phone would also have been rejected. `addMember` refuses to attach a phone to a registered account ("Only the account holder can attach a phone to a registered account").

**Reply sent to the owner:**

> If you leave the phone number empty, you should be able to add.
> You can't change the member email / number now. Will add that for guest accounts.

**Expected flow after the reply:**
1. Siva adds Ashok with the email only.
2. That creates a pending invitation for `ashok.balakrishn@gmail.com`.
3. Ashok accepts it from **Pending invitations** on his home screen. This works because the email now matches his account.
4. The deleted "Hotel room" expense has to be re-created by Siva, and Charita included if she should share it.

### Second follow-up: the successful add looked like a failure

At 17:34:49 Siva added Ashok with the email only. The request succeeded. Because Ashok already has an account, `addMember` created an invitation and no membership: registered users join only by accepting. The UI still showed the same "Person added" message used for guests, and Ashok did not appear in the member list. Siva revoked the invitation 17 seconds later and asked: "If Ashok.Balakrishn@gmail.com is registered why am I not able to add as member?"

**Reply to the owner:** adding someone who already has an account sends them an invitation, and they appear once they accept. Add Ashok again with the email only, don't revoke it, and ask Ashok to accept it from his home screen.

**Fix:** when `member.add` returns an invitation and no membership, the Add person dialog now says: "*Name* already has an account, so we sent an invitation. They'll appear as a member once they accept." (`src/routes/app/groups/$groupId/index.tsx`).

## Other users affected?

As far as the data shows, **no one else is currently affected**:
- Production has 6 invitations in total: 2 accepted for this incident, 1 accepted normally on 2026-09-10/11, and 3 cancelled (all three in this group).
- None are pending.
- There are no registered users without a group.
- The only guest holding a real email is Ashok's leftover `a98fa239`.

**Exposure:** every invite sent to someone without an account since 2026-09-26 20:04 hits the Charita failure.

**Related risk:** two registered accounts created before that deployment are still unverified. They will be routed to `/check-email` at their next password sign-in and cannot accept invitations until they verify.

## Remediation

The 16:38:55 change fixed membership but left inconsistent data. Siva has since deleted the expense and removed Ashok, which removes some of those problems.

### Remaining issues

- **Privacy:** guest `a98fa239` (`balakrishnan.ashok@`) still exists and can still be claimed. Its `activity_recipient` rows still include "Hotel room / Trip to TVM" with a −₹1,151.67 delta. Whoever owns that inbox could claim it and see this in their personal feed. The address also cannot be used for a normal signup.
- **Audit trail:** neither invitee has a `member.joined` activity. Invitation `91f864bc` is marked `accepted` even though its address does not match the account that held the membership.

### Plan

1. Confirm who made the 16:38:55 change and record the exact SQL used.
2. Create a Turso branch (a copy) of `eventual` as a restore point.
3. In one reviewed transaction:
   - Check that guest `a98fa239` has no remaining references in `member`, `expense_share`, `settlement`, `channel_identity`, `job` or `expense_template`.
   - Delete its `activity_recipient` rows, any `guest-claim:` verification rows, and the guest user.
   - Insert a `member.joined` activity for Charita marked as incident remediation.
4. Verify:
   - Charita sees the group.
   - Once Ashok accepts the new invitation, he sees the group.
   - Group balances sum to zero.
5. Ask Ashok whether he owns `balakrishnan.ashok@`. If not, the invitation email (group name and inviter) went to a third party. Both invitations to that address are now accepted or cancelled, so the links no longer work.

## Prevention

1. **Keep the destination through verification.**
   - Pass `safeAuthRedirect(redirect)` into signup as `callbackURL`, or use `/verify-email?next=…`, and carry `next` through `/check-email`.
   - Make `/verify-email` continue to `next`, falling back to `/app` rather than the profile page.
2. **Show pending invitations everywhere after sign-in.** Use a global banner or interstitial whenever `listMyInvitations` returns anything, not only a card on the dashboard.
3. **Stop holding real emails on guest records.**
   - When "Add person" includes an email, create the guest with a placeholder address and store the real address on the invitation (a new `guest_user_id` link).
   - On accept, merge that guest into the accepting verified user automatically. The admin's invitation is the consent, so the invitee does not need admin rights.
4. **Handle address mismatches.**
   - On the invite page, when signed in as another address, explain what happened and offer "sign in as the invited address" or "ask the owner to re-invite you".
   - Let admins change or resend an invitation's email, and link a guest to an existing member.
5. **Let admins edit guest contact details (committed to the owner).** Add an action to change a guest's email and phone. Registered members keep control of their own contact details.
6. **Show real validation messages.**
   - Display the first field error from `VALIDATION` responses instead of "Invalid request".
   - On Add person, say that a phone cannot be set for someone who already has an account, or disable the field once the email matches a registered user.
7. **Say when "Add person" sends an invitation instead (done).** The success message now tells the owner that a registered person was invited and joins once they accept. A further step would be showing that invitation inline in the member list as "Invited — waiting to accept".
8. **Warn at creation time.** Merge the Invite and Add person flows, or warn when an email already has a pending invitation or belongs to a guest.
9. **Controlled production fixes.** Run any data correction as a reviewed script that writes activity or audit rows, never as a hand edit in production.

## Detection

- **Daily data check.** Flag any of:
  - a pending invitation older than 1 hour where a verified user has that email but no membership;
  - a guest holding a real email where a registered co-member has a similar name;
  - a `member` row with no matching `member.joined` activity.
- **Invite funnel in PostHog:** invite sent → invite viewed → signup → verified → accepted. Alert when "verified, not accepted" stays open for more than an hour.
- **Log rejected accepts.** Record `invitation.accept` and `member.add` rejections with a reason code (email mismatch, unverified, validation field) to Sentry or PostHog. Do not include email addresses or phone numbers.
- **Vercel log drain,** so request logs for an incident window can still be read afterwards.

## Tests

- **AuthForm (unit):** signup sends the sanitized redirect as `callbackURL`, and the unverified follow-up sign-in keeps `next`.
- **`/verify-email`:** continues to a safe `next` and refuses anything off-site.
- **Invite regression (integration):** invite → signup with the invited email while verification is required → verify → user lands on the invite → accept → becomes a member.
- **Invite and Add person with the same email:**
  - Today: produces one invitation.
  - After the redesign: no claimable guest holds the real email, and accept merges the guest's shares.
- **Mismatched address:** accept returns a typed `EMAIL_MISMATCH` and the page shows guidance.
- **`member.add` with a registered email and no phone:** creates an invitation.
  - With a phone number that has no country code, the UI shows the field message.
  - With a valid phone number, the UI shows "Only the account holder can attach a phone…".
  - On success, the dialog shows the "already has an account, so we sent an invitation" message, not "Person added". Adding a guest still shows "Person added".
- **Guest contact edit:** an admin of every group the guest belongs to can change the guest's email and phone. Registered users cannot be edited. A new email cannot collide with an existing user.
- **Remediation script:** afterwards, no `activity_recipient`, `expense_share` or `member` rows point at the deleted guest, and balances are unchanged.
