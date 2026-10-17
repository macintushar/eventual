import { describe, expect, test } from "bun:test";
import { integrationLinks } from "./integrations.ts";

describe("integration links", () => {
	test("derives server-specific URLs from the origin", () => {
		const links = integrationLinks("https://split.example.com", null);
		expect(links.mcp).toBe("https://split.example.com/mcp");
		expect(links.api).toBe("https://split.example.com/api");
		expect(links.shortcut).toBe("https://split.example.com/eventual.shortcut");
		expect(links.status).toBeNull();
		expect(links.support).toBeNull();
	});

	test("prefers the server's stated origin and drops a trailing slash", () => {
		const links = integrationLinks("https://typed.example.com", {
			origin: "https://public.example.com/",
		});
		expect(links.base).toBe("https://public.example.com");
		expect(links.help).toBe("https://public.example.com/help");
	});

	test("only offers operator links that are well-formed", () => {
		const good = integrationLinks("https://a.test", {
			statusPageUrl: "https://status.a.test",
			supportEmail: "help@a.test",
		});
		expect(good.status).toBe("https://status.a.test");
		expect(good.support).toBe("mailto:help@a.test");
		const bad = integrationLinks("https://a.test", {
			statusPageUrl: "javascript:alert(1)",
			supportEmail: "not an email",
		});
		expect(bad.status).toBeNull();
		expect(bad.support).toBeNull();
	});
});
