import assert from "node:assert/strict";
import { test } from "node:test";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { render, toPlainText } from "react-email";
import TransactionalEmail, {
	type EmailKind,
	type TransactionalEmailProps,
} from "#/emails/transactional";
import { authEmailOptions, emailKey, LINK_TTL_SECONDS } from "#/lib/auth-email";

async function fixture(failedKind?: EmailKind) {
	const messages: {
		to: string;
		props: TransactionalEmailProps;
		key: string;
	}[] = [];
	const database: Record<string, Record<string, unknown>[]> = {
		user: [],
		account: [],
		session: [],
		verification: [],
	};
	const auth = betterAuth({
		baseURL: "http://localhost:3000",
		secret: "test-email-secret-at-least-thirty-two-characters",
		database: memoryAdapter(database),
		...authEmailOptions(
			async (to, props, key) => {
				if (props.kind === failedKind)
					throw new Error("Simulated provider failure");
				messages.push({ to, props, key });
				return "fake-email-id";
			},
			"http://localhost:3000",
			true,
		),
	});
	const post = (path: string, body: object) =>
		auth.handler(
			new Request(`http://localhost:3000/api/auth/${path}`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Origin: "http://localhost:3000",
				},
				body: JSON.stringify(body),
			}),
		);
	const signup = await post("sign-up/email", {
		email: "person@example.com",
		name: "Person",
		password: "Original123!",
		callbackURL: "/verify-email",
	});
	assert.equal(signup.status, 200);
	return { auth, messages, database, post };
}

async function requestVerification(f: Awaited<ReturnType<typeof fixture>>) {
	return f.post("send-verification-email", {
		email: "person@example.com",
		callbackURL: "/verify-email",
	});
}

test("auth sends verification, verifies account, resets password once, and revokes sessions", async () => {
	const f = await fixture();
	assert.equal(f.messages.length, 0);
	assert.equal((await requestVerification(f)).status, 200);
	assert.equal(f.messages.length, 1);
	assert.equal(f.messages[0].props.kind, "verification");
	assert.equal(f.messages[0].to, "person@example.com");
	const verifyUrl = new URL(f.messages[0].props.url);
	assert.equal(verifyUrl.searchParams.get("callbackURL"), "/verify-email");
	assert.ok(
		!f.messages[0].key.includes(verifyUrl.searchParams.get("token") as string),
	);
	const verified = await f.auth.handler(new Request(verifyUrl));
	assert.equal(verified.status, 302);
	assert.equal(f.database.user[0].emailVerified, true);
	assert.ok(f.database.session.length > 0);
	const reset = await f.post("request-password-reset", {
		email: "person@example.com",
		redirectTo: "/reset-password",
	});
	assert.equal(reset.status, 200);
	const message = f.messages.find(
		(entry) => entry.props.kind === "reset-password",
	);
	assert.ok(message);
	const callback = await f.auth.handler(new Request(message.props.url));
	const location = new URL(callback.headers.get("location") as string);
	assert.equal(location.pathname, "/reset-password");
	const token = location.searchParams.get("token");
	assert.ok(token);
	assert.equal(
		(await f.post("reset-password", { token, newPassword: "Updated123!" }))
			.status,
		200,
	);
	assert.equal(f.database.session.length, 0);
	assert.equal(f.messages.at(-1)?.props.kind, "password-changed");
	assert.equal(
		(await f.post("reset-password", { token, newPassword: "Another123!" }))
			.status,
		400,
	);
	assert.equal(
		(
			await f.post("sign-in/email", {
				email: "person@example.com",
				password: "Original123!",
			})
		).status,
		401,
	);
	assert.equal(
		(
			await f.post("sign-in/email", {
				email: "person@example.com",
				password: "Updated123!",
			})
		).status,
		200,
	);
});

test("unverified email is revealed only after the correct password", async () => {
	const f = await fixture();
	const wrong = await f.post("sign-in/email", {
		email: "person@example.com",
		password: "Incorrect123!",
	});
	assert.equal(wrong.status, 401);
	assert.notEqual((await wrong.json()).code, "EMAIL_NOT_VERIFIED");
	const correct = await f.post("sign-in/email", {
		email: "person@example.com",
		password: "Original123!",
	});
	assert.equal(correct.status, 403);
	assert.equal((await correct.json()).code, "EMAIL_NOT_VERIFIED");
	assert.equal(f.messages.length, 0);
});

test("expired reset links are rejected and unknown accounts receive the same generic response", async () => {
	const f = await fixture();
	const existing = await f.post("request-password-reset", {
		email: "person@example.com",
		redirectTo: "/reset-password",
	});
	const count = f.messages.length;
	const unknown = await f.post("request-password-reset", {
		email: "missing@example.com",
		redirectTo: "/reset-password",
	});
	assert.equal(existing.status, unknown.status);
	assert.deepEqual(await existing.json(), await unknown.json());
	assert.equal(f.messages.length, count);
	const record = f.database.verification.find((row) =>
		String(row.identifier).startsWith("reset-password:"),
	);
	assert.ok(record);
	record.expiresAt = new Date(Date.now() - 1000);
	const token = String(record.identifier).replace("reset-password:", "");
	assert.equal(
		(await f.post("reset-password", { token, newPassword: "Updated123!" }))
			.status,
		400,
	);
});

test("verification delivery failure does not strand signup or expose account existence", async () => {
	const f = await fixture("verification");
	assert.equal(f.database.user.length, 1);
	assert.equal(f.messages.length, 0);
	assert.equal(
		(
			await f.post("send-verification-email", {
				email: "person@example.com",
				callbackURL: "/verify-email",
			})
		).status,
		200,
	);
	assert.equal(f.messages.length, 0);
});

test("confirmation failure does not prevent password reset or session revocation", async () => {
	const f = await fixture("password-changed");
	await f.post("request-password-reset", {
		email: "person@example.com",
		redirectTo: "/reset-password",
	});
	const record = f.database.verification.find((row) =>
		String(row.identifier).startsWith("reset-password:"),
	);
	assert.ok(record);
	const token = String(record.identifier).replace("reset-password:", "");
	assert.equal(
		(await f.post("reset-password", { token, newPassword: "Updated123!" }))
			.status,
		200,
	);
	assert.equal(f.database.session.length, 0);
});

test("link emails carry the deadline of the token they were sent with", async () => {
	const f = await fixture();
	await requestVerification(f);
	await f.post("request-password-reset", {
		email: "person@example.com",
		redirectTo: "/reset-password",
	});
	const ttl = LINK_TTL_SECONDS * 1000;
	for (const kind of ["verification", "reset-password"] as const) {
		const message = f.messages.find((entry) => entry.props.kind === kind);
		assert.ok(message);
		const expiresAt = message.props.expiresAt;
		assert.ok(expiresAt instanceof Date);
		// Within the window the token itself was issued for, not a fresh hour.
		const remaining = expiresAt.getTime() - Date.now();
		assert.ok(remaining > ttl - 60_000 && remaining <= ttl);
		const html = await render(<TransactionalEmail {...message.props} />);
		assert.ok(toPlainText(html).includes("UTC"));
	}
	// A notice with no link has no deadline to state.
	const notice = await render(
		<TransactionalEmail
			kind="password-changed"
			url="https://example.com/forgot-password"
		/>,
	);
	assert.ok(!toPlainText(notice).includes("expires"));
});

test("all auth templates render HTML and plain text with escaped names and correct links", async () => {
	for (const kind of [
		"verification",
		"reset-password",
		"password-changed",
	] as const) {
		const url = "https://example.com/action?token=sample&callbackURL=%2Fapp";
		const html = await render(
			<TransactionalEmail
				kind={kind}
				name={'<script>alert("x")</script>'}
				url={url}
				expiresAt={new Date("2026-09-13T10:34:00Z")}
			/>,
		);
		if (kind !== "password-changed") {
			assert.ok(html.includes("13 September 2026 at 10:34 UTC"));
		}
		assert.ok(html.includes("&lt;script&gt;"));
		assert.ok(!html.includes("<script>"));
		assert.ok(toPlainText(html).includes(url));
		assert.ok(html.length < 102_000);
	}
	assert.equal(emailKey("reset", "secret"), emailKey("reset", "secret"));
	assert.ok(!emailKey("reset", "secret").includes("secret"));
});

test("invitation email renders the group, inviter, role, deadline, and link", async () => {
	const url = "https://example.com/invite/invitation-id";
	const html = await render(
		<TransactionalEmail
			kind="invitation"
			url={url}
			groupName="Weekend away"
			inviterName={'<script>alert("x")</script>'}
			inviteeRole="member"
			expiresAt={new Date("2026-09-20T10:34:00Z")}
		/>,
	);
	const text = toPlainText(html);
	assert.ok(text.includes("JOIN WEEKEND AWAY"));
	assert.ok(text.includes("as member"));
	assert.ok(text.includes("20 September 2026 at 10:34 UTC"));
	assert.ok(text.includes(url));
	assert.ok(html.includes("&lt;script&gt;"));
	assert.ok(!html.includes("<script>"));
	assert.ok(html.length < 102_000);
});
