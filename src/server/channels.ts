import type { TransactionalEmailProps } from "#/emails/transactional";

/** Identity types are independent of delivery vendors; UPI is not a messaging channel. */
export type IdentityChannel = "phone" | "whatsapp" | "upi" | "push";
export type DeliveryChannel = "email" | "whatsapp" | "push";
export type NotificationPayload = {
	idempotencyKey: string;
	email: TransactionalEmailProps;
};
export interface ChannelAdapter {
	channel: DeliveryChannel;
	send(
		address: string,
		kind: string,
		payload: NotificationPayload,
	): Promise<string>;
}

export const emailChannel: ChannelAdapter = {
	channel: "email",
	async send(address, _kind, payload) {
		const { sendEmail } = await import("./email");
		return sendEmail(address, payload.email, payload.idempotencyKey);
	},
};
