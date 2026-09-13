import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { authClient } from "#/lib/auth-client";

export function EmailVerification({
	email,
	verified,
}: {
	email: string;
	verified: boolean;
}) {
	const [pending, setPending] = useState(false);
	const [message, setMessage] = useState("");
	const [failed, setFailed] = useState(false);
	return (
		<Alert>
			<AlertTitle>
				{verified ? "Email verified" : "Verify your email"}
			</AlertTitle>
			<AlertDescription>
				<p>
					{verified
						? "Your email address is confirmed."
						: `Confirm that ${email} belongs to you. Verification links expire after one hour.`}
				</p>
				{!verified ? (
					<Button
						className="mt-2"
						variant="outline"
						disabled={pending}
						onClick={async () => {
							setPending(true);
							setMessage("");
							setFailed(false);
							try {
								const result = await authClient.sendVerificationEmail({
									email,
									callbackURL: "/verify-email",
								});
								if (result.error)
									throw new Error("Verification could not be sent");
								setMessage(
									"Check your inbox and spam folder for a verification link. If it doesn't arrive, try again later.",
								);
							} catch {
								setFailed(true);
								setMessage(
									"Couldn't send the verification email. Please try again later.",
								);
							} finally {
								setPending(false);
							}
						}}
					>
						{pending ? "Sending…" : "Send verification email"}
					</Button>
				) : null}
				{message ? (
					<p role={failed ? "alert" : "status"} className="mt-2">
						{message}
					</p>
				) : null}
			</AlertDescription>
		</Alert>
	);
}
