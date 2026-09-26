import { BadgeCheck, CircleAlert } from "lucide-react";
import { useState } from "react";
import { SettingsRow } from "#/components/settings-section";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import { authClient } from "#/lib/auth-client";
import { cn } from "#/lib/utils";

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
		<SettingsRow
			title="Email"
			description={
				<>
					<span className="flex flex-wrap items-center gap-2">
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
					</span>
					{!verified && !message ? (
						<span className="mt-1 block">
							Confirm that this address belongs to you. Links expire after one
							hour.
						</span>
					) : null}
					{message ? (
						<span
							role={failed ? "alert" : "status"}
							className={cn(
								"mt-1 block",
								failed ? "text-destructive" : "text-foreground",
							)}
						>
							{message}
						</span>
					) : null}
				</>
			}
		>
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
		</SettingsRow>
	);
}
