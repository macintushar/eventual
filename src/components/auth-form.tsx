import { useForm } from "@tanstack/react-form";
import { Link, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { GoogleIcon } from "#/components/google-icon";
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
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { Spinner } from "#/components/ui/spinner";
import { authClient } from "#/lib/auth-client";
import { safeAuthRedirect } from "#/lib/auth-redirect";
import { fieldError } from "#/lib/form-error";

const nameSchema = z
	.string()
	.trim()
	.min(2, "Name must be at least 2 characters");
const emailSchema = z.email("Enter a valid email address");
const passwordSchema = z
	.string()
	.min(8, "Password must be at least 8 characters");

function issue(schema: z.ZodType, value: unknown) {
	const parsed = schema.safeParse(value);
	return parsed.success ? undefined : parsed.error.issues[0]?.message;
}

const nameError = (value: string) => issue(nameSchema, value);
const emailError = (value: string) => issue(emailSchema, value);
const passwordError = (value: string) => issue(passwordSchema, value);

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
	const search = useSearch({ strict: false }) as { redirect?: string };
	const [error, setError] = useState("");
	const [googlePending, setGooglePending] = useState(false);
	const [claimEmail, setClaimEmail] = useState("");
	const target = safeAuthRedirect(search.redirect);
	const signInWithGoogle = async () => {
		setError("");
		setGooglePending(true);
		try {
			const result = await authClient.signIn.social({
				provider: "google",
				callbackURL: target,
			});
			if (result.error) {
				setError(result.error.message ?? "Could not continue with Google");
				setGooglePending(false);
			}
		} catch (error) {
			setError(
				error instanceof Error
					? error.message
					: "Could not continue with Google",
			);
			setGooglePending(false);
		}
	};
	const form = useForm({
		defaultValues: { name: "", email: "", password: "" },
		onSubmit: async ({ value }) => {
			setError("");
			setClaimEmail("");
			const { email, password } = value;
			const result =
				mode === "signup"
					? await authClient.signUp.email({
							name: value.name.trim(),
							email,
							password,
							callbackURL: "/verify-email",
						})
					: await authClient.signIn.email({ email, password });
			if (result.error) {
				if (result.error.code === "EMAIL_NOT_VERIFIED") {
					window.location.assign("/check-email");
					return;
				}
				setError(result.error.message ?? "Authentication failed");
				if (
					mode === "signup" &&
					(result.error.code === "GUEST_CLAIM_REQUIRED" ||
						result.error.message?.toLowerCase().includes("guest claim"))
				)
					setClaimEmail(email);
				return;
			}
			if (mode === "signup" && !result.data?.token) {
				// Better Auth returns a generic response for existing addresses. Only
				// a successful password check can open the pending-verification page.
				const signIn = await authClient.signIn.email({ email, password });
				if (signIn.error?.code === "EMAIL_NOT_VERIFIED") {
					window.location.assign("/check-email");
					return;
				}
				if (signIn.error) {
					setError("Could not sign in with those credentials.");
					return;
				}
			}
			window.location.assign(target);
		},
	});

	return (
		<PublicPage
			actions={
				mode === "signup"
					? [{ to: "/login", label: "Log in", variant: "default" }]
					: [{ to: "/signup", label: "Start a group", variant: "default" }]
			}
			mainClassName="items-center justify-center py-12"
		>
			<div className="w-full max-w-md">
				<Card className="island-shell rise-in">
					<CardHeader>
						<CardTitle className="display-title text-2xl">
							{mode === "signup" ? "Start splitting" : "Welcome back"}
						</CardTitle>
						<CardDescription>
							{mode === "signup"
								? "Create an account in under a minute."
								: "Sign in to see your groups and balances."}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<form
							id="auth-form"
							onSubmit={(event) => {
								event.preventDefault();
								event.stopPropagation();
								void form.handleSubmit();
							}}
						>
							<FieldGroup>
								{mode === "signup" && (
									<form.Field
										name="name"
										validators={{
											onBlur: ({ value }) => nameError(value),
											onSubmit: ({ value }) => nameError(value),
										}}
									>
										{(field) => {
											const message = field.state.meta.isTouched
												? fieldError(field.state.meta.errors)
												: undefined;
											return (
												<Field data-invalid={message ? true : undefined}>
													<FieldLabel htmlFor={field.name}>Name</FieldLabel>
													<Input
														id={field.name}
														name={field.name}
														value={field.state.value}
														onBlur={field.handleBlur}
														onChange={(event) =>
															field.handleChange(event.target.value)
														}
														autoComplete="name"
														placeholder="Mac"
														aria-invalid={message ? true : undefined}
													/>
													{message ? <FieldError>{message}</FieldError> : null}
												</Field>
											);
										}}
									</form.Field>
								)}
								<form.Field
									name="email"
									validators={{
										onBlur: ({ value }) => emailError(value),
										onSubmit: ({ value }) => emailError(value),
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
													value={field.state.value}
													onBlur={field.handleBlur}
													onChange={(event) =>
														field.handleChange(event.target.value)
													}
													autoComplete="email"
													placeholder="you@example.com"
													aria-invalid={message ? true : undefined}
												/>
												{message ? <FieldError>{message}</FieldError> : null}
											</Field>
										);
									}}
								</form.Field>
								<form.Field
									name="password"
									validators={{
										onBlur: ({ value }) => passwordError(value),
										onSubmit: ({ value }) => passwordError(value),
									}}
								>
									{(field) => {
										const message = field.state.meta.isTouched
											? fieldError(field.state.meta.errors)
											: undefined;
										return (
											<Field data-invalid={message ? true : undefined}>
												<FieldLabel htmlFor={field.name}>Password</FieldLabel>
												<Input
													id={field.name}
													name={field.name}
													type="password"
													value={field.state.value}
													onBlur={field.handleBlur}
													onChange={(event) =>
														field.handleChange(event.target.value)
													}
													autoComplete={
														mode === "signup"
															? "new-password"
															: "current-password"
													}
													aria-invalid={message ? true : undefined}
												/>
												{message ? (
													<FieldError>{message}</FieldError>
												) : mode === "signup" ? (
													<FieldDescription>
														At least 8 characters.
													</FieldDescription>
												) : null}
											</Field>
										);
									}}
								</form.Field>
								{error ? (
									<Alert variant="destructive">
										<AlertTitle>Authentication failed</AlertTitle>
										<AlertDescription>{error}</AlertDescription>
										{claimEmail ? (
											<Link
												to="/claim-guest"
												search={{ email: claimEmail }}
												className="mt-2 inline-block font-medium underline"
											>
												Claim this account
											</Link>
										) : null}
									</Alert>
								) : null}
							</FieldGroup>
						</form>
					</CardContent>
					<CardFooter className="flex flex-col gap-3">
						{mode === "login" ? (
							<Link to="/forgot-password" className="text-sm underline">
								Forgot your password?
							</Link>
						) : null}
						<form.Subscribe selector={(state) => state.isSubmitting}>
							{(pending) => (
								<Button
									form="auth-form"
									size="lg"
									className="w-full"
									disabled={pending}
								>
									{pending ? <Spinner data-icon="inline-start" /> : null}
									{pending
										? "Please wait…"
										: mode === "signup"
											? "Create account"
											: "Log in"}
								</Button>
							)}
						</form.Subscribe>
						<div className="flex w-full items-center gap-3 text-sm text-muted-foreground">
							<span className="h-px flex-1 bg-border" />
							<span className="shrink-0">Or continue with</span>
							<span className="h-px flex-1 bg-border" />
						</div>
						<Button
							type="button"
							variant="outline"
							size="lg"
							className="w-full"
							disabled={googlePending}
							onClick={signInWithGoogle}
						>
							{googlePending ? (
								<Spinner data-icon="inline-start" />
							) : (
								<GoogleIcon className="size-5" />
							)}
							{googlePending ? "Connecting…" : "Continue with Google"}
						</Button>
						<p className="text-sm text-muted-foreground">
							{mode === "signup" ? "Already registered?" : "New here?"}{" "}
							<Link
								to={mode === "signup" ? "/login" : "/signup"}
								search={search.redirect ? { redirect: search.redirect } : {}}
							>
								{mode === "signup" ? "Log in" : "Create an account"}
							</Link>
						</p>
						{mode === "signup" ? (
							<p className="text-xs text-muted-foreground">
								By creating an account, you agree to the{" "}
								<Link to="/terms">Terms</Link> and{" "}
								<Link to="/privacy">Privacy policy</Link>.
							</p>
						) : null}
					</CardFooter>
				</Card>
			</div>
		</PublicPage>
	);
}
