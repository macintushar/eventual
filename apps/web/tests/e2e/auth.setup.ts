import { expect, test } from "@playwright/test";

test("sign in through the real authentication endpoint", async ({
	request,
}) => {
	const response = await request.post("/api/auth/sign-in/email", {
		data: {
			email: "A@pagination.invalid",
			password: "pagination-test-password",
		},
	});
	expect(response.ok(), await response.text()).toBeTruthy();
	const session = await request.get("/api/v1/session");
	expect((await session.json()).user.id).toBe("A");
	await request.storageState({ path: "test-results/auth.json" });
});
