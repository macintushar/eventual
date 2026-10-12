import { describe, expect, test } from "bun:test";
import {
	canOpenInvite,
	inviteHref,
	PENDING_INVITE_TTL_MS,
	parseInviteLink,
	parseStoredInvite,
	settlePendingInvite,
	stagePendingInvite,
} from "./pending-invite.ts";

const HOSTED = "https://eventual.macintushar.xyz";
const OTHER = "https://split.example.com";

describe("invite link parsing", () => {
	test("reads a universal link with its origin", () => {
		expect(parseInviteLink(`${HOSTED}/invite/abc_123-x`)).toEqual({
			invitationId: "abc_123-x",
			origin: HOSTED,
		});
	});

	test("reads the custom-scheme form, with and without a server", () => {
		expect(parseInviteLink("eventual://invite/abc")).toEqual({
			invitationId: "abc",
			origin: null,
		});
		expect(
			parseInviteLink(
				`eventual://invite/abc?origin=${encodeURIComponent(OTHER)}`,
			),
		).toEqual({ invitationId: "abc", origin: OTHER });
	});

	test("rejects other links and malformed or unsafe origins", () => {
		expect(parseInviteLink("eventual://reset-password?token=t")).toBeNull();
		expect(parseInviteLink("eventual://group/abc")).toBeNull();
		expect(parseInviteLink(`${HOSTED}/invite/abc/extra`)).toBeNull();
		expect(parseInviteLink("https://example.com/other/abc")).toBeNull();
		expect(parseInviteLink("ftp://example.com/invite/abc")).toBeNull();
		expect(
			parseInviteLink("eventual://invite/abc?origin=http%3A%2F%2Fevil.test"),
		).toBeNull();
		expect(parseInviteLink("eventual://invite/abc?origin=%E0%A4%A")).toBeNull();
		expect(parseInviteLink("http://evil.test/invite/abc")).toBeNull();
	});

	test("allows plain http for local development servers only", () => {
		expect(parseInviteLink("http://localhost:3000/invite/abc")).toEqual({
			invitationId: "abc",
			origin: "http://localhost:3000",
		});
	});

	test("ignores query strings and fragments on universal links", () => {
		expect(
			parseInviteLink(`${HOSTED}/invite/abc?utm=1#top`)?.invitationId,
		).toBe("abc");
	});
});

describe("binding to the server", () => {
	const link = { invitationId: "abc", origin: null };

	test("an origin-less link binds to the current server", () => {
		expect(stagePendingInvite(link, { origin: HOSTED }, 10)).toEqual({
			invitationId: "abc",
			origin: HOSTED,
			savedAt: 10,
		});
	});

	test("a link naming the current server is held, another server is dropped", () => {
		expect(
			stagePendingInvite({ ...link, origin: HOSTED }, { origin: HOSTED }, 1),
		).not.toBeNull();
		expect(
			stagePendingInvite({ ...link, origin: OTHER }, { origin: HOSTED }, 1),
		).toBeNull();
	});

	test("origins compare case- and slash-insensitively", () => {
		expect(
			stagePendingInvite(
				{ ...link, origin: "https://Eventual.macintushar.xyz/" },
				{ origin: HOSTED },
				1,
			),
		).not.toBeNull();
	});
});

describe("settling a held invite", () => {
	const pending = { invitationId: "abc", origin: HOSTED, savedAt: 1_000 };
	const at = (extra) => ({
		origin: HOSTED,
		signedIn: false,
		now: 2_000,
		...extra,
	});

	test("waits while signed out, opens once signed in", () => {
		expect(settlePendingInvite(pending, at({}))).toBe("hold");
		expect(settlePendingInvite(pending, at({ signedIn: true }))).toBe("open");
	});

	test("is discarded on a server switch, even if then signed in", () => {
		expect(settlePendingInvite(pending, at({ origin: OTHER }))).toBe("drop");
		expect(
			settlePendingInvite(pending, at({ origin: OTHER, signedIn: true })),
		).toBe("drop");
	});

	test("is discarded when stale or from the future", () => {
		expect(
			settlePendingInvite(
				pending,
				at({ now: 1_000 + PENDING_INVITE_TTL_MS + 1, signedIn: true }),
			),
		).toBe("drop");
		expect(
			settlePendingInvite(
				pending,
				at({ now: 1_000 - 120_000, signedIn: true }),
			),
		).toBe("drop");
	});
});

describe("opening and storage", () => {
	test("does not open over the auth screens", () => {
		for (const path of ["/sign-in", "/sign-up", "/check-email", "/server"])
			expect(canOpenInvite(path)).toBe(false);
		expect(canOpenInvite("/")).toBe(true);
		expect(canOpenInvite("/account")).toBe(true);
		expect(inviteHref("abc")).toBe("/invite/abc");
	});

	test("reads back only well-formed stored values", () => {
		const value = { invitationId: "abc", origin: HOSTED, savedAt: 5 };
		expect(parseStoredInvite(JSON.stringify(value))).toEqual(value);
		expect(parseStoredInvite(null)).toBeNull();
		expect(parseStoredInvite("not json")).toBeNull();
		expect(
			parseStoredInvite(JSON.stringify({ ...value, invitationId: "../x" })),
		).toBeNull();
		expect(parseStoredInvite(JSON.stringify({ origin: HOSTED }))).toBeNull();
	});
});
