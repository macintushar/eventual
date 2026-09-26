import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";

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
	FieldError,
	FieldGroup,
	FieldLabel,
} from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { fieldError } from "#/lib/form-error";

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
	const [token, setToken] = useState("");
	const [sent, setSent] = useState(false);
	const claim = useMutation({
		mutationFn: async (value: {
			email: string;
			name: string;
			password: string;
		}) => {
			if (token) {
				await post("/guest-claim/confirm", {
					token,
					password: value.password,
					...(value.name.trim() ? { name: value.name.trim() } : {}),
				});
				return "confirmed" as const;
			}
			await post("/guest-claim/request", { email: value.email });
			return "sent" as const;
		},
		onSuccess: (result) => {
			if (result === "confirmed") window.location.assign("/login");
			else setSent(true);
		},
	});
	const form = useForm({
		defaultValues: {
			email: search.email ?? "",
			name: "",
			password: "",
		},
		onSubmit: async ({ value }) => {
			try {
				await claim.mutateAsync(value);
			} catch {
				// The mutation error is rendered below; keep handleSubmit settled.
			}
		},
	});

	useEffect(() => {
		const fragment = new URLSearchParams(window.location.hash.slice(1));
		setToken(fragment.get("token") ?? "");
	}, []);

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
						<form
							id="guest-claim"
							onSubmit={(event) => {
								event.preventDefault();
								event.stopPropagation();
								void form.handleSubmit();
							}}
						>
							<FieldGroup>
								{token ? (
									<>
										<form.Field name="name">
											{(field) => (
												<Field>
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
														placeholder="Keep the existing name"
													/>
												</Field>
											)}
										</form.Field>
										<form.Field
											name="password"
											validators={{
												onBlur: z.string().min(8, "Use at least 8 characters"),
												onSubmit: z
													.string()
													.min(8, "Use at least 8 characters"),
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
															value={field.state.value}
															onBlur={field.handleBlur}
															onChange={(event) =>
																field.handleChange(event.target.value)
															}
															autoComplete="new-password"
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
								) : (
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
														value={field.state.value}
														onBlur={field.handleBlur}
														onChange={(event) =>
															field.handleChange(event.target.value)
														}
														autoComplete="email"
														aria-invalid={message ? true : undefined}
													/>
													{message ? <FieldError>{message}</FieldError> : null}
												</Field>
											);
										}}
									</form.Field>
								)}
								{claim.isError ? (
									<Alert variant="destructive">
										<AlertTitle>Couldn’t claim account</AlertTitle>
										<AlertDescription>
											{claim.error instanceof Error
												? claim.error.message
												: "Could not claim account"}
										</AlertDescription>
									</Alert>
								) : null}
							</FieldGroup>
						</form>
					)}
				</CardContent>
				{!sent ? (
					<CardFooter>
						<form.Subscribe
							selector={(state) => ({
								canSubmit: state.canSubmit,
								isSubmitting: state.isSubmitting,
							})}
						>
							{({ canSubmit, isSubmitting }) => (
								<Button
									className="w-full"
									form="guest-claim"
									disabled={!canSubmit || isSubmitting || claim.isPending}
								>
									{isSubmitting || claim.isPending
										? "Working…"
										: token
											? "Claim account"
											: "Email claim link"}
								</Button>
							)}
						</form.Subscribe>
					</CardFooter>
				) : null}
			</Card>
		</PublicPage>
	);
}
