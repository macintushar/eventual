import { render, toPlainText } from "react-email";
import { Resend } from "resend";
import TransactionalEmail, {
	emailCopy,
	type TransactionalEmailProps,
} from "#/emails/transactional";
import { env } from "#/env";

export async function sendEmail(
	to: string,
	props: TransactionalEmailProps,
	idempotencyKey: string,
) {
	if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
		throw new Error("Email delivery is not configured");
	}
	const html = await render(<TransactionalEmail {...props} />);
	const resend = new Resend(env.RESEND_API_KEY);
	const { data, error } = await resend.emails.send(
		{
			from: env.EMAIL_FROM,
			to: [to],
			subject: emailCopy(props).subject,
			html,
			text: toPlainText(html),
			...(env.EMAIL_REPLY_TO ? { replyTo: env.EMAIL_REPLY_TO } : {}),
		},
		{ idempotencyKey },
	);
	if (error || !data) {
		console.error("Email provider rejected delivery", {
			kind: props.kind,
			code: error?.name,
		});
		throw new Error("Email could not be sent. Please try again later.");
	}
	return data.id;
}
