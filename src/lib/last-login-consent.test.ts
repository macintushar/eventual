import assert from "node:assert/strict";
import { test } from "node:test";
import {
	consentCookie,
	LAST_LOGIN_CONSENT_COOKIE,
	lastLoginConsentFromRequest,
} from "#/lib/last-login-consent";

const headers = (cookie?: string) =>
	new Headers(cookie ? { cookie } : undefined);

test("consent defaults to refused when nothing was chosen", () => {
	assert.equal(lastLoginConsentFromRequest(headers()), false);
	assert.equal(lastLoginConsentFromRequest(undefined), false);
});

test("only an explicit grant permits the marker cookie", () => {
	assert.equal(
		lastLoginConsentFromRequest(
			headers(`${LAST_LOGIN_CONSENT_COOKIE}=granted`),
		),
		true,
	);
	assert.equal(
		lastLoginConsentFromRequest(headers(`${LAST_LOGIN_CONSENT_COOKIE}=denied`)),
		false,
	);
	// Anything unrecognised is not a grant.
	assert.equal(
		lastLoginConsentFromRequest(headers(`${LAST_LOGIN_CONSENT_COOKIE}=yes`)),
		false,
	);
});

test("consent is read out of a full cookie header, not just an exact match", () => {
	assert.equal(
		lastLoginConsentFromRequest(
			headers(
				`better-auth.session_token=abc; ${LAST_LOGIN_CONSENT_COOKIE}=granted; theme=dark`,
			),
		),
		true,
	);
	assert.equal(
		lastLoginConsentFromRequest(
			headers(`better-auth.session_token=abc; theme=dark`),
		),
		false,
	);
});

test("the consent cookie is a long-lived first-party choice", () => {
	const cookie = consentCookie(true);
	assert.match(cookie, new RegExp(`^${LAST_LOGIN_CONSENT_COOKIE}=granted;`));
	assert.match(cookie, /Path=\//);
	assert.match(cookie, /Max-Age=31536000;/);
	// Must stay readable by the browser, which is what mirrors the choice into
	// the toggle on the next visit.
	assert.doesNotMatch(cookie, /httponly/i);
	assert.match(
		consentCookie(false),
		new RegExp(`^${LAST_LOGIN_CONSENT_COOKIE}=denied;`),
	);
});
