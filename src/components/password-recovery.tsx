import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { PublicPage, publicSignedOutActions } from "#/components/public-header";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { authClient } from "#/lib/auth-client";
import { fieldError } from "#/lib/form-error";

export function PasswordRecovery({
	mode,
	token,
	invalid,
}: {
	mode: "request" | "reset";
	token?: string;
	invalid?: boolean;
}) {
	const [done, setDone] = useState(false);
	const [error, setError] = useState("");
	const form = useForm({
		defaultValues: { email: "", password: "", confirmation: "" },
		validators: {
			onSubmit: ({ value }) => {
				if (mode === "reset" && value.password !== value.confirmation)
					return "Passwords don't match";
				return undefined;
			},
		},
		onSubmit: async ({ value }) => {
			setError("");
			try {
				const result =
					mode === "request"
						? await authClient.requestPasswordReset({
								email: value.email.trim(),
								redirectTo: "/reset-password",
							})
						: await authClient.resetPassword({
								newPassword: value.password,
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
				if (mode === "reset")
					window.history.replaceState(null, "", "/reset-password");
			} catch {
				setError("We couldn't process the request. Please try again later.");
			}
		},
	});
	const unusable = mode === "reset" && (!token || invalid);
	return (
		<PublicPage
			actions={publicSignedOutActions}
			mainClassName="items-center justify-center py-12"
		>
			<div className="w-full max-w-md">
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
								onSubmit={(event) => {
									event.preventDefault();
									event.stopPropagation();
									void form.handleSubmit();
								}}
							>
								<FieldGroup>
									{mode === "request" ? (
										<form.Field
											name="email"
											validators={{
												onBlur: z.email("Enter a valid email address"),
												onSubmit: z.email("Enter a valid email address"),
											}}
										>
											{(field) => {
												const message = field.state.meta.isTouched
													? fieldError(field.state.meta.errors)
													: undefined;
												return (
													<Field data-invalid={message ? true : undefined}>
														<FieldLabel htmlFor={field.name}>Email</FieldLabel>
														<Input
															id={field.name}
															name={field.name}
															type="email"
															autoComplete="email"
															value={field.state.value}
															onBlur={field.handleBlur}
															onChange={(event) =>
																field.handleChange(event.target.value)
															}
															aria-invalid={message ? true : undefined}
														/>
														{message ? (
															<FieldError>{message}</FieldError>
														) : null}
													</Field>
												);
											}}
										</form.Field>
									) : (
										<>
											<form.Field
												name="password"
												validators={{
													onBlur: z
														.string()
														.min(8, "Use at least 8 characters")
														.max(128, "Use at most 128 characters"),
													onSubmit: z
														.string()
														.min(8, "Use at least 8 characters")
														.max(128, "Use at most 128 characters"),
												}}
											>
												{(field) => {
													const message = field.state.meta.isTouched
														? fieldError(field.state.meta.errors)
														: undefined;
													return (
														<Field data-invalid={message ? true : undefined}>
															<FieldLabel htmlFor={field.name}>
																New password
															</FieldLabel>
															<Input
																id={field.name}
																name={field.name}
																type="password"
																autoComplete="new-password"
																maxLength={128}
																value={field.state.value}
																onBlur={field.handleBlur}
																onChange={(event) =>
																	field.handleChange(event.target.value)
																}
																aria-invalid={message ? true : undefined}
															/>
															{message ? (
																<FieldError>{message}</FieldError>
															) : null}
														</Field>
													);
												}}
											</form.Field>
											<form.Field
												name="confirmation"
												validators={{
													onChangeListenTo: ["password"],
													onChange: ({ value, fieldApi }) => {
														const password =
															fieldApi.form.getFieldValue("password");
														if (!value || value === password) return undefined;
														return "Passwords don't match";
													},
												}}
											>
												{(field) => {
													const message = field.state.meta.isTouched
														? fieldError(field.state.meta.errors)
														: undefined;
													return (
														<Field data-invalid={message ? true : undefined}>
															<FieldLabel htmlFor={field.name}>
																Confirm password
															</FieldLabel>
															<Input
																id={field.name}
																name={field.name}
																type="password"
																autoComplete="new-password"
																maxLength={128}
																value={field.state.value}
																onBlur={field.handleBlur}
																onChange={(event) =>
																	field.handleChange(event.target.value)
																}
																aria-invalid={message ? true : undefined}
															/>
															{message ? (
																<FieldError>{message}</FieldError>
															) : null}
														</Field>
													);
												}}
											</form.Field>
										</>
									)}
									<form.Subscribe selector={(state) => state.errorMap.onSubmit}>
										{(formError) =>
											error || formError ? (
												<Alert variant="destructive">
													<AlertTitle>Could not continue</AlertTitle>
													<AlertDescription>
														{error ||
															(typeof formError === "string"
																? formError
																: "Check the form and try again.")}
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
											) : null
										}
									</form.Subscribe>
									<form.Subscribe selector={(state) => state.isSubmitting}>
										{(pending) => (
											<Button disabled={pending}>
												{pending
													? "Please wait…"
													: mode === "request"
														? "Send reset link"
														: "Update password"}
											</Button>
										)}
									</form.Subscribe>
								</FieldGroup>
							</form>
						)}
						<Link to="/login" className="text-sm underline">
							Back to sign in
						</Link>
					</CardContent>
				</Card>
			</div>
		</PublicPage>
	);
}
