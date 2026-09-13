import TransactionalEmail from "./transactional";

export default function PasswordResetEmail({
	name,
	url,
}: {
	name?: string;
	url: string;
}) {
	return <TransactionalEmail kind="reset-password" name={name} url={url} />;
}

PasswordResetEmail.PreviewProps = {
	name: "Mac",
	url: "https://example.com/reset-password?token=preview",
};
