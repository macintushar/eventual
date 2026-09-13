import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Wordmark } from "#/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { authClient } from "#/lib/auth-client";

export function PasswordRecovery({
	mode,
	token,
	invalid,
}: {
	mode: "request" | "reset";
	token?: string;
	invalid?: boolean;
}) {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirmation, setConfirmation] = useState("");
	const [pending, setPending] = useState(false);
	const [done, setDone] = useState(false);
	const [error, setError] = useState("");
	const unusable = mode === "reset" && (!token || invalid);
	return (
		<main className="page-wrap grid min-h-[100dvh] place-items-center py-12">
			<div className="w-full max-w-md">
				<div className="mb-6 flex justify-center">
					<Wordmark />
				</div>
				<Card className="island-shell">
					<CardHeader>
						<CardTitle>
							{mode === "request"
								? "Forgot your password?"
								: "Choose a new password"}
						</CardTitle>
						<CardDescription>
							{mode === "request"
								? "We'll email you a link to reset it."
								: "Use at least 8 characters."}
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-5">
						{unusable ? (
							<Alert variant="destructive">
								<AlertTitle>This reset link is invalid or expired.</AlertTitle>
								<AlertDescription>
									<Link to="/forgot-password">Request a new link</Link>
								</AlertDescription>
							</Alert>
						) : done ? (
							<Alert>
								<AlertTitle>
									{mode === "request" ? "Check your inbox" : "Password updated"}
								</AlertTitle>
								<AlertDescription>
									{mode === "request"
										? "If an account exists for that address, you'll receive a reset link. Check your spam folder too."
										: "You can now sign in with your new password."}
								</AlertDescription>
							</Alert>
						) : (
							<form
								onSubmit={async (event) => {
									event.preventDefault();
									setError("");
									if (mode === "reset" && password !== confirmation) {
										setError("Passwords don't match");
										return;
									}
									setPending(true);
									try {
										const result =
											mode === "request"
												? await authClient.requestPasswordReset({
														email: email.trim(),
														redirectTo: "/reset-password",
													})
												: await authClient.resetPassword({
														newPassword: password,
														token,
													});
										if (result.error) {
											setError(
												mode === "request"
													? "We couldn't process the request. Please try again later."
													: "This link may have expired or already been used. Request a new reset link.",
											);
											return;
										}
										setDone(true);
										setPassword("");
										setConfirmation("");
										if (mode === "reset")
											window.history.replaceState(null, "", "/reset-password");
									} catch {
										setError(
											"We couldn't process the request. Please try again later.",
										);
									} finally {
										setPending(false);
									}
								}}
							>
								<FieldGroup>
									{mode === "request" ? (
										<Field>
											<FieldLabel htmlFor="recovery-email">Email</FieldLabel>
											<Input
												id="recovery-email"
												type="email"
												autoComplete="email"
												required
												value={email}
												onChange={(event) => setEmail(event.target.value)}
											/>
										</Field>
									) : (
										<>
											<Field>
												<FieldLabel htmlFor="new-password">
													New password
												</FieldLabel>
												<Input
													id="new-password"
													type="password"
													autoComplete="new-password"
													required
													minLength={8}
													maxLength={128}
													value={password}
													onChange={(event) => setPassword(event.target.value)}
												/>
											</Field>
											<Field>
												<FieldLabel htmlFor="confirm-password">
													Confirm password
												</FieldLabel>
												<Input
													id="confirm-password"
													type="password"
													autoComplete="new-password"
													required
													minLength={8}
													maxLength={128}
													value={confirmation}
													onChange={(event) =>
														setConfirmation(event.target.value)
													}
												/>
											</Field>
										</>
									)}
									{error ? (
										<Alert variant="destructive">
											<AlertTitle>Could not continue</AlertTitle>
											<AlertDescription>
												{error}
												{mode === "reset" ? (
													<>
														{" "}
														<Link to="/forgot-password">
															Request a new link
														</Link>
													</>
												) : null}
											</AlertDescription>
										</Alert>
									) : null}
									<Button disabled={pending}>
										{pending
											? "Please wait…"
											: mode === "request"
												? "Send reset link"
												: "Update password"}
									</Button>
								</FieldGroup>
							</form>
						)}
						<Link to="/login" className="text-sm underline">
							Back to sign in
						</Link>
					</CardContent>
				</Card>
			</div>
		</main>
	);
}
