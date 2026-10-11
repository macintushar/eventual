import TransactionalEmail from "./transactional";

export default function PasswordResetEmail({
	name,
	url,
	expiresAt,
}: {
	name?: string;
	url: string;
	expiresAt?: Date;
}) {
	return (
		<TransactionalEmail
			kind="reset-password"
			name={name}
			url={url}
			expiresAt={expiresAt}
		/>
	);
}

PasswordResetEmail.PreviewProps = {
	name: "Mac",
	url: "https://example.com/reset-password?token=preview",
	expiresAt: new Date("2026-09-13T10:34:00Z"),
};
