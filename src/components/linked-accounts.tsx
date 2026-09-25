import { useEffect, useState } from "react";
import { toast } from "sonner";

import { GoogleIcon } from "#/components/google-icon";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Spinner } from "#/components/ui/spinner";
import { authClient } from "#/lib/auth-client";

type AuthAccount = { id: string; providerId: string; accountId: string };

export function LinkedAccounts() {
	const [accounts, setAccounts] = useState<AuthAccount[]>([]);
	const [loading, setLoading] = useState(true);
	const [working, setWorking] = useState(false);
	const googleAccount = accounts.find(
		(account) => account.providerId === "google",
	);
	const otherAccountExists = accounts.some(
		(account) => account.providerId !== "google",
	);

	useEffect(() => {
		let active = true;
		void authClient
			.listAccounts()
			.then(({ data, error }) => {
				if (!active) return;
				if (error) {
					toast.error(error.message || "Could not load sign-in methods");
					return;
				}
				setAccounts(data ?? []);
			})
			.catch((error: unknown) => {
				if (active)
					toast.error(
						error instanceof Error
							? error.message
							: "Could not load sign-in methods",
					);
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
		};
	}, []);

	const connectGoogle = async () => {
		setWorking(true);
		try {
			const { error } = await authClient.linkSocial({
				provider: "google",
				callbackURL: "/app/settings/profile",
			});
			if (error) {
				toast.error(error.message || "Could not connect Google");
				setWorking(false);
			}
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not connect Google",
			);
			setWorking(false);
		}
	};

	const disconnectGoogle = async () => {
		if (!googleAccount || !otherAccountExists) return;
		if (!window.confirm("Disconnect Google from your account?")) return;
		setWorking(true);
		try {
			const { error } = await authClient.unlinkAccount({
				providerId: googleAccount.providerId,
				accountId: googleAccount.accountId,
			});
			if (error) {
				toast.error(error.message || "Could not disconnect Google");
			} else {
				setAccounts((current) =>
					current.filter((account) => account.id !== googleAccount.id),
				);
				toast.success("Google disconnected");
			}
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not disconnect Google",
			);
		} finally {
			setWorking(false);
		}
	};

	return (
		<Card className="island-shell">
			<CardHeader>
				<CardTitle>Sign-in methods</CardTitle>
				<CardDescription>
					Connect another way to sign in, or disconnect one you no longer use.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="flex flex-wrap items-center justify-between gap-4">
					<div className="flex min-w-0 items-center gap-3">
						<GoogleIcon className="size-5 shrink-0" />
						<div>
							<p className="font-medium">Google</p>
							<p className="text-sm text-muted-foreground">
								{loading
									? "Checking connection…"
									: googleAccount
										? "Connected to this account"
										: "Not connected"}
							</p>
						</div>
					</div>
					{googleAccount ? (
						<Button
							type="button"
							variant="outline"
							disabled={loading || working || !otherAccountExists}
							onClick={disconnectGoogle}
						>
							{working ? <Spinner data-icon="inline-start" /> : null}
							Disconnect
						</Button>
					) : (
						<Button
							type="button"
							variant="outline"
							disabled={loading || working}
							onClick={connectGoogle}
						>
							{working ? (
								<Spinner data-icon="inline-start" />
							) : (
								<GoogleIcon className="size-4" />
							)}
							Connect Google
						</Button>
					)}
				</div>
				{googleAccount && !otherAccountExists ? (
					<p className="mt-3 text-sm text-muted-foreground">
						Add another sign-in method before disconnecting Google.
					</p>
				) : null}
			</CardContent>
		</Card>
	);
}
