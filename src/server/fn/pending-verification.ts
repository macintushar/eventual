import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { auth } from "#/lib/auth";
import {
	pendingVerificationUser,
	verificationSendStatus,
} from "#/server/pending-verification";

export const getPendingVerificationFn = createServerFn({
	method: "GET",
}).handler(async () => {
	const user = await pendingVerificationUser(getRequest());
	return user ? { email: user.email } : null;
});

export const sendPendingVerificationFn = createServerFn({
	method: "POST",
}).handler(async () => {
	const request = getRequest();
	const user = await pendingVerificationUser(request);
	if (!user) throw new Error("Verification expired. Sign in again.");

	const recent = await verificationSendStatus(user.id);
	if (recent) return { sent: false, retryAt: recent.expiresAt.toISOString() };

	await auth.api.sendVerificationEmail({
		body: { email: user.email, callbackURL: "/verify-email" },
		headers: request.headers,
	});
	const delivery = await verificationSendStatus(user.id);
	if (!delivery || delivery.value !== "sent")
		throw new Error("Could not send the verification email. Try again.");
	return { sent: true, retryAt: delivery.expiresAt.toISOString() };
});
