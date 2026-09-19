import { useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { PublicPage } from "#/components/public-header";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";

async function post(path: string, body: object) {
	const response = await fetch(`/api/auth${path}`, {
		method: "POST",
		credentials: "include",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	const result = (await response.json()) as {
		error?: { message?: string };
		message?: string;
	};
	if (!response.ok)
		throw new Error(
			result.error?.message ?? result.message ?? "Request failed",
		);
	return result;
}

export function GuestClaim() {
	const search = useSearch({ strict: false }) as { email?: string };
	const [email, setEmail] = useState(search.email ?? "");
	const [name, setName] = useState("");
	const [password, setPassword] = useState("");
	const [token, setToken] = useState("");
	const [pending, setPending] = useState(false);
	const [sent, setSent] = useState(false);
	const [error, setError] = useState("");

	useEffect(() => {
		const fragment = new URLSearchParams(window.location.hash.slice(1));
		setToken(fragment.get("token") ?? "");
	}, []);

	const submit = async () => {
		setPending(true);
		setError("");
		try {
			if (token) {
				await post("/guest-claim/confirm", {
					token,
					password,
					...(name.trim() ? { name: name.trim() } : {}),
				});
				window.location.assign("/login");
			} else {
				await post("/guest-claim/request", { email });
				setSent(true);
			}
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : "Could not claim account",
			);
		} finally {
			setPending(false);
		}
	};

	return (
		<PublicPage actions={[]} mainClassName="items-center justify-center py-12">
			<Card className="island-shell w-full max-w-md">
				<CardHeader>
					<CardTitle className="display-title text-2xl">
						{token ? "Keep your expense history" : "Claim your guest account"}
					</CardTitle>
					<CardDescription>
						{token
							? "Choose a password. Your groups, expenses, and balances stay attached to this account."
							: "We’ll email a private verification link to the address your group used."}
					</CardDescription>
				</CardHeader>
				<CardContent>
					{sent ? (
						<Alert>
							<AlertTitle>Check your inbox</AlertTitle>
							<AlertDescription>
								If a claimable guest account exists, the link is on its way.
							</AlertDescription>
						</Alert>
					) : (
						<FieldGroup>
							{token ? (
								<>
									<Field>
										<FieldLabel htmlFor="claim-name">Name</FieldLabel>
										<Input
											id="claim-name"
											value={name}
											onChange={(event) => setName(event.target.value)}
											autoComplete="name"
											placeholder="Keep the existing name"
										/>
									</Field>
									<Field>
										<FieldLabel htmlFor="claim-password">
											New password
										</FieldLabel>
										<Input
											id="claim-password"
											type="password"
											value={password}
											onChange={(event) => setPassword(event.target.value)}
											autoComplete="new-password"
											minLength={8}
										/>
									</Field>
								</>
							) : (
								<Field>
									<FieldLabel htmlFor="claim-email">Email</FieldLabel>
									<Input
										id="claim-email"
										type="email"
										value={email}
										onChange={(event) => setEmail(event.target.value)}
										autoComplete="email"
									/>
								</Field>
							)}
							{error ? (
								<Alert variant="destructive">
									<AlertTitle>Couldn’t claim account</AlertTitle>
									<AlertDescription>{error}</AlertDescription>
								</Alert>
							) : null}
						</FieldGroup>
					)}
				</CardContent>
				{!sent ? (
					<CardFooter>
						<Button
							className="w-full"
							disabled={pending || (token ? password.length < 8 : !email)}
							onClick={submit}
						>
							{pending
								? "Working…"
								: token
									? "Claim account"
									: "Email claim link"}
						</Button>
					</CardFooter>
				) : null}
			</Card>
		</PublicPage>
	);
}
