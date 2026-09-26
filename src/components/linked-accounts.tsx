import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "#/components/confirm-dialog";
import { GoogleIcon } from "#/components/google-icon";
import { SettingsRow, SettingsSection } from "#/components/settings-section";
import { Button } from "#/components/ui/button";
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
		if (!googleAccount || !otherAccountExists) return false;
		setWorking(true);
		try {
			const { error } = await authClient.unlinkAccount({
				providerId: googleAccount.providerId,
				accountId: googleAccount.accountId,
			});
			if (error) {
				toast.error(
					error.code === "SESSION_NOT_FRESH"
						? "Sign in again before disconnecting Google."
						: error.message || "Could not disconnect Google",
				);
				return false;
			} else {
				setAccounts((current) =>
					current.filter((account) => account.id !== googleAccount.id),
				);
				toast.success("Google disconnected");
				return true;
			}
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not disconnect Google",
			);
			return false;
		} finally {
			setWorking(false);
		}
	};

	return (
		<SettingsSection
			title="Sign-in methods"
			description="Connect another way to sign in, or disconnect one you no longer use."
		>
			<SettingsRow
				title={
					<>
						<GoogleIcon className="size-4 shrink-0" />
						Google
					</>
				}
				description={
					<>
						{loading
							? "Checking connection…"
							: googleAccount
								? "Connected to this account."
								: "Not connected."}
						{googleAccount && !otherAccountExists ? (
							<span className="mt-1 block">
								Set a password before disconnecting Google. You can do this from{" "}
								<Link to="/forgot-password" className="underline">
									Forgot your password?
								</Link>
							</span>
						) : null}
					</>
				}
			>
				{googleAccount ? (
					<ConfirmDialog
						trigger={
							<Button
								type="button"
								variant="outline"
								disabled={loading || working || !otherAccountExists}
							>
								Disconnect
							</Button>
						}
						title="Disconnect Google?"
						description="You won't be able to sign in with Google until you connect it again."
						confirmLabel="Disconnect Google"
						onConfirm={disconnectGoogle}
						pending={working}
					/>
				) : (
					<Button
						type="button"
						variant="outline"
						disabled={loading || working}
						onClick={connectGoogle}
					>
						{working ? <Spinner data-icon="inline-start" /> : null}
						Connect
					</Button>
				)}
			</SettingsRow>
		</SettingsSection>
	);
}
