import assert from "node:assert/strict";
import { test } from "node:test";
import {
	apiKeyMode,
	can,
	canEditRecurring,
	canImpersonate,
	fullAccessKeyPermissions,
	keyPresets,
	managementKeyPermissions,
	roleCan,
	transactionalKeyPermissions,
	validateKeyPermissions,
	whoCan,
} from "#/lib/permissions";
import { operations } from "#/server/operations";

test("roles grant structural actions by rank", () => {
	assert.ok(can("owner", "group", "delete"));
	assert.ok(!can("admin", "group", "delete"));
	assert.ok(can("admin", "member", "create"));
	assert.ok(!can("admin", "member", "role"));
	assert.ok(!can("member", "member", "create"));
	assert.ok(!can("member", "invitation", "read"));
	assert.ok(can("member", "expense", "delete"));
	assert.ok(can("member", "settlement", "create"));
});

test("unknown roles fail closed", () => {
	assert.ok(!roleCan("superuser", { expense: ["read"] }));
	assert.ok(!roleCan("", { balance: ["read"] }));
});

test("whoCan phrases the roles that hold a permission", () => {
	assert.equal(whoCan({ expense: ["create"] }), "Everyone");
	assert.equal(whoCan({ group: ["delete"] }), "Only the owner");
	assert.equal(whoCan({ member: ["create"] }), "Only owners and admins");
});

test("recurring expenses are editable by their creator or group managers", () => {
	assert.ok(canEditRecurring("member", true));
	assert.ok(!canEditRecurring("member", false));
	assert.ok(canEditRecurring("admin", false));
});

test("transactional keys can't delete or restructure", () => {
	for (const actions of Object.values(transactionalKeyPermissions))
		assert.ok(!(actions as string[]).includes("delete"));
	assert.equal(
		"invitation" in transactionalKeyPermissions,
		false,
		"transactional keys can't invite",
	);
	assert.deepEqual(transactionalKeyPermissions.member, ["read"]);
});

test("stored permissions resolve back to their preset", () => {
	assert.equal(apiKeyMode(null), "legacy");
	assert.equal(apiKeyMode(transactionalKeyPermissions), "transactional");
	assert.equal(
		apiKeyMode({
			...managementKeyPermissions,
			group: [...managementKeyPermissions.group].reverse(),
		}),
		"management",
	);
	assert.equal(apiKeyMode({ expense: ["read"] }), "custom");
});

test("custom scopes reject unknown resources, actions and empty sets", () => {
	assert.ok(validateKeyPermissions({ expense: ["read", "create"] }));
	assert.ok(!validateKeyPermissions({}));
	assert.ok(!validateKeyPermissions({ expense: [] }));
	assert.ok(!validateKeyPermissions({ expense: ["explode"] }));
	assert.ok(!validateKeyPermissions({ apiKey: ["read"] } as never));
});

test("every operation scope is a known resource:action", () => {
	for (const operation of operations) {
		if (operation.scope === "public") continue;
		const [resource, action] = operation.scope.split(":");
		assert.ok(
			validateKeyPermissions({ [resource]: [action] }),
			`${operation.name} has unknown scope ${operation.scope}`,
		);
	}
});

test("the management preset can reach every scoped operation", () => {
	for (const operation of operations) {
		if (operation.scope === "public") continue;
		const [resource, action] = operation.scope.split(":");
		const granted =
			keyPresets.management[resource as keyof typeof keyPresets.management];
		assert.ok(
			(granted as string[] | undefined)?.includes(action),
			`management key can't call ${operation.name}`,
		);
	}
});

test("full account access is opt-in only: no role or custom key carries it", () => {
	assert.equal(apiKeyMode(fullAccessKeyPermissions), "full");
	assert.ok(canImpersonate(fullAccessKeyPermissions));
	assert.ok(!canImpersonate(managementKeyPermissions));
	assert.ok(!canImpersonate(null));
	for (const role of ["owner", "admin", "member"])
		assert.ok(!roleCan(role, { account: ["impersonate"] }));
	assert.ok(!validateKeyPermissions({ account: ["impersonate"] }));
	assert.ok(
		!validateKeyPermissions({
			expense: ["read"],
			account: ["impersonate"],
		}),
	);
});
