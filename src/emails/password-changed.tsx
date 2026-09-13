import TransactionalEmail from "./transactional";

export default function PasswordChangedEmail({
	name,
	url,
}: {
	name?: string;
	url: string;
}) {
	return <TransactionalEmail kind="password-changed" name={name} url={url} />;
}

PasswordChangedEmail.PreviewProps = {
	name: "Mac",
	url: "https://example.com/forgot-password",
};
