import { BadgeCheck, CircleAlert } from "lucide-react";
import { useState } from "react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
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
		<div className="flex flex-col gap-2">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="min-w-0">
					<p className="text-sm font-medium">Email</p>
					<p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
						<span className="truncate">{email}</span>
						{verified ? (
							<Badge variant="outline" className="text-positive">
								<BadgeCheck />
								Verified
							</Badge>
						) : (
							<Badge variant="outline">
								<CircleAlert />
								Unverified
							</Badge>
						)}
					</p>
				</div>
				{!verified ? (
					<Button
						type="button"
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
						{pending ? <Spinner data-icon="inline-start" /> : null}
						{pending ? "Sending…" : "Send verification email"}
					</Button>
				) : null}
			</div>
			{!verified && !message ? (
				<p className="text-sm text-muted-foreground">
					Confirm that this address belongs to you. Links expire after one hour.
				</p>
			) : null}
			{message ? (
				<p
					role={failed ? "alert" : "status"}
					className={failed ? "text-sm text-destructive" : "text-sm"}
				>
					{message}
				</p>
			) : null}
		</div>
	);
}
