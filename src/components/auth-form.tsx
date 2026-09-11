import { useForm } from "@tanstack/react-form";
import { Link, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import { Wordmark } from "#/components/app-shell";
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
	FieldGroup,
	FieldLabel,
} from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { Spinner } from "#/components/ui/spinner";
import { authClient } from "#/lib/auth-client";

// Login never renders the name field, so it must not be validated against it.
const credentialsSchema = z.object({
	email: z.email("Enter a valid email address"),
	password: z.string().min(8, "Password must be at least 8 characters"),
});
const signupSchema = credentialsSchema.extend({
	name: z.string().trim().min(2, "Name must be at least 2 characters"),
});

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
	const search = useSearch({ strict: false }) as { redirect?: string };
	const [error, setError] = useState("");
	const form = useForm({
		defaultValues: { name: "", email: "", password: "" },
		onSubmit: async ({ value }) => {
			setError("");
			const parsed =
				mode === "signup"
					? signupSchema.safeParse(value)
					: credentialsSchema.safeParse(value);
			if (!parsed.success) {
				setError(parsed.error.issues[0]?.message ?? "Check your details");
				return;
			}
			const { email, password } = parsed.data;
			const result =
				mode === "signup"
					? await authClient.signUp.email({
							name: value.name.trim(),
							email,
							password,
						})
					: await authClient.signIn.email({ email, password });
			if (result.error) {
				setError(result.error.message ?? "Authentication failed");
				return;
			}
			const target =
				search.redirect?.startsWith("/") && !search.redirect.startsWith("//")
					? search.redirect
					: "/app";
			window.location.assign(target);
		},
	});

	return (
		<main className="page-wrap grid min-h-screen place-items-center py-12">
			<div className="w-full max-w-md">
				<div className="mb-6 flex justify-center">
					<Wordmark />
				</div>
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
								form.handleSubmit();
							}}
						>
							<FieldGroup>
								{mode === "signup" && (
									<form.Field name="name">
										{(field) => (
											<Field>
												<FieldLabel htmlFor="name">Name</FieldLabel>
												<Input
													id="name"
													value={field.state.value}
													onChange={(event) =>
														field.handleChange(event.target.value)
													}
													autoComplete="name"
													placeholder="Mac"
												/>
											</Field>
										)}
									</form.Field>
								)}
								<form.Field name="email">
									{(field) => (
										<Field>
											<FieldLabel htmlFor="email">Email</FieldLabel>
											<Input
												id="email"
												type="email"
												value={field.state.value}
												onChange={(event) =>
													field.handleChange(event.target.value)
												}
												autoComplete="email"
												placeholder="you@example.com"
											/>
										</Field>
									)}
								</form.Field>
								<form.Field name="password">
									{(field) => (
										<Field>
											<FieldLabel htmlFor="password">Password</FieldLabel>
											<Input
												id="password"
												type="password"
												value={field.state.value}
												onChange={(event) =>
													field.handleChange(event.target.value)
												}
												autoComplete={
													mode === "signup"
														? "new-password"
														: "current-password"
												}
											/>
											{mode === "signup" ? (
												<FieldDescription>
													At least 8 characters.
												</FieldDescription>
											) : null}
										</Field>
									)}
								</form.Field>
								{error ? (
									<Alert variant="destructive">
										<AlertTitle>Authentication failed</AlertTitle>
										<AlertDescription>{error}</AlertDescription>
									</Alert>
								) : null}
							</FieldGroup>
						</form>
					</CardContent>
					<CardFooter className="flex flex-col gap-3">
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
						<p className="text-sm text-muted-foreground">
							{mode === "signup" ? "Already registered?" : "New here?"}{" "}
							<Link
								to={mode === "signup" ? "/login" : "/signup"}
								search={search.redirect ? { redirect: search.redirect } : {}}
							>
								{mode === "signup" ? "Log in" : "Create an account"}
							</Link>
						</p>
					</CardFooter>
				</Card>
			</div>
		</main>
	);
}
