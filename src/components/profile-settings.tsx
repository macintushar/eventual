import { useForm } from "@tanstack/react-form";
import { ArrowUpRight, Camera } from "lucide-react";
import { toast } from "sonner";

import { BrandLogo } from "#/components/brand-logo";
import { EmailVerification } from "#/components/email-verification";
import { MemberAvatar } from "#/components/member-avatar";
import { SettingsRow, SettingsSection } from "#/components/settings-section";
import { Button } from "#/components/ui/button";
import { Field, FieldError } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
	InputGroupText,
} from "#/components/ui/input-group";
import { Spinner } from "#/components/ui/spinner";
import { Switch } from "#/components/ui/switch";
import { useUpdateProfile } from "#/lib/app-mutation";
import { fieldError } from "#/lib/form-error";
import { upiVpaSchema, wiseTagSchema } from "#/server/schemas";

type ProfileUser = {
	name: string;
	email: string;
	emailVerified: boolean;
	image?: string | null;
	upiVpa?: string | null;
	wiseTag?: string | null;
	emailReminders?: boolean | null;
};

/** Blank is allowed; a typed value has to match the handle's shape. */
function optionalIssue(
	schema: typeof upiVpaSchema | typeof wiseTagSchema,
	value: string,
) {
	if (!value.trim()) return undefined;
	const result = schema.safeParse(value);
	return result.success
		? undefined
		: (result.error.issues[0]?.message ?? "Invalid");
}

/**
 * One form for everything about you, split into sections by what the setting
 * is for — who you are, how people pay you, what we email you — with a single
 * save underneath them.
 */
export function ProfileSettings({ user }: { user: ProfileUser }) {
	const save = useUpdateProfile();
	const savedUpi = user.upiVpa ?? "";
	const savedWise = user.wiseTag ?? "";
	const form = useForm({
		defaultValues: {
			name: user.name,
			upi: savedUpi,
			wise: savedWise,
			emailReminders: user.emailReminders ?? true,
		},
		onSubmit: async ({ value, formApi }) => {
			try {
				const saved = await save.mutateAsync({
					name: value.name.trim(),
					upiVpa: value.upi,
					wiseTag: value.wise,
					emailReminders: value.emailReminders,
				});
				formApi.reset({
					name: saved.name,
					upi: saved.upiVpa ?? "",
					wise: saved.wiseTag ?? "",
					emailReminders: saved.emailReminders ?? true,
				});
				toast.success("Profile saved");
			} catch (error) {
				toast.error(
					error instanceof Error
						? error.message
						: "Could not save your profile",
				);
			}
		},
	});

	const removePhoto = () => {
		void save
			.mutateAsync({ image: null })
			.then(() => toast.success("Photo removed"))
			.catch((error: unknown) => {
				toast.error(
					error instanceof Error
						? error.message
						: "Could not remove your photo",
				);
			});
	};

	return (
		<form
			className="flex flex-col gap-8 sm:gap-10"
			noValidate
			onSubmit={(event) => {
				event.preventDefault();
				event.stopPropagation();
				void form.handleSubmit();
			}}
		>
			<SettingsSection
				title="Profile"
				description="How you appear on expenses and in every group you're in."
			>
				<SettingsRow
					title="Photo"
					description="Shown beside your name on expenses and balances."
				>
					<MemberAvatar
						name={user.name}
						seed={user.email}
						image={user.image}
						className="size-12 text-sm"
					/>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => toast("Photo uploads are coming soon")}
					>
						<Camera data-icon="inline-start" />
						{user.image ? "Change" : "Upload"}
					</Button>
					{user.image ? (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="text-destructive"
							disabled={save.isPending}
							onClick={removePhoto}
						>
							Remove
						</Button>
					) : null}
				</SettingsRow>

				<form.Field
					name="name"
					validators={{
						onBlur: ({ value }) =>
							value.trim() ? undefined : "Enter your name",
						onSubmit: ({ value }) =>
							value.trim() ? undefined : "Enter your name",
					}}
				>
					{(field) => {
						const message = field.state.meta.isTouched
							? fieldError(field.state.meta.errors)
							: undefined;
						return (
							<SettingsRow
								title="Name"
								htmlFor={field.name}
								description="Your full name or what friends call you."
							>
								<Field
									data-invalid={message ? true : undefined}
									className="gap-1.5 sm:w-72"
								>
									<Input
										id={field.name}
										name={field.name}
										autoComplete="name"
										maxLength={100}
										value={field.state.value}
										aria-invalid={message ? true : undefined}
										onBlur={field.handleBlur}
										onChange={(event) => field.handleChange(event.target.value)}
									/>
									{message ? <FieldError>{message}</FieldError> : null}
								</Field>
							</SettingsRow>
						);
					}}
				</form.Field>

				<EmailVerification email={user.email} verified={user.emailVerified} />
			</SettingsSection>

			<SettingsSection
				title="Payment details"
				description="Shown to people in your groups so they can pay you back. Leave a field blank to remove it."
			>
				<form.Field
					name="upi"
					validators={{
						onBlur: ({ value }) => optionalIssue(upiVpaSchema, value),
						onSubmit: ({ value }) => optionalIssue(upiVpaSchema, value),
					}}
				>
					{(field) => {
						const message = field.state.meta.isTouched
							? fieldError(field.state.meta.errors)
							: undefined;
						return (
							<SettingsRow
								htmlFor={field.name}
								title={
									<>
										<BrandLogo brand="upi" className="h-3.5 w-7" />
										UPI ID
									</>
								}
								description={
									<>
										For GPay, PhonePe, Paytm or your bank's app.{" "}
										<LearnMore href="https://www.npci.org.in/what-we-do/upi">
											About UPI
										</LearnMore>
									</>
								}
							>
								<Field
									data-invalid={message ? true : undefined}
									className="gap-1.5 sm:w-72"
								>
									<Input
										id={field.name}
										name={field.name}
										inputMode="email"
										autoCapitalize="none"
										autoCorrect="off"
										spellCheck={false}
										placeholder="name@bank"
										value={field.state.value}
										aria-invalid={message ? true : undefined}
										onBlur={field.handleBlur}
										onChange={(event) => field.handleChange(event.target.value)}
									/>
									{message ? <FieldError>{message}</FieldError> : null}
								</Field>
							</SettingsRow>
						);
					}}
				</form.Field>

				<form.Field
					name="wise"
					validators={{
						onBlur: ({ value }) => optionalIssue(wiseTagSchema, value),
						onSubmit: ({ value }) => optionalIssue(wiseTagSchema, value),
					}}
				>
					{(field) => {
						const message = field.state.meta.isTouched
							? fieldError(field.state.meta.errors)
							: undefined;
						return (
							<SettingsRow
								htmlFor={field.name}
								title={
									<>
										<BrandLogo brand="wise" />
										Wisetag
									</>
								}
								description={
									<>
										Find it under your profile in the Wise app.{" "}
										<LearnMore href="https://wise.com">About Wise</LearnMore>
									</>
								}
							>
								<Field
									data-invalid={message ? true : undefined}
									className="gap-1.5 sm:w-72"
								>
									<InputGroup>
										<InputGroupAddon>
											<InputGroupText>@</InputGroupText>
										</InputGroupAddon>
										<InputGroupInput
											id={field.name}
											name={field.name}
											autoCapitalize="none"
											autoCorrect="off"
											spellCheck={false}
											placeholder="yourname"
											value={field.state.value}
											aria-invalid={message ? true : undefined}
											onBlur={field.handleBlur}
											onChange={(event) =>
												field.handleChange(event.target.value.replace(/^@/, ""))
											}
										/>
									</InputGroup>
									{message ? <FieldError>{message}</FieldError> : null}
								</Field>
							</SettingsRow>
						);
					}}
				</form.Field>
			</SettingsSection>

			<SettingsSection title="Notifications">
				<form.Field name="emailReminders">
					{(field) => (
						<SettingsRow
							title="Email reminders"
							htmlFor={field.name}
							description="Let group members send you scheduled reminders about what you owe."
						>
							<Switch
								id={field.name}
								checked={field.state.value}
								onCheckedChange={(checked) => field.handleChange(checked)}
							/>
						</SettingsRow>
					)}
				</form.Field>
			</SettingsSection>

			{/*
			 * One save for the three sections above. It only appears once
			 * something has changed, and pins itself above the dock so the button
			 * is never a scroll away from the field you just edited.
			 */}
			<form.Subscribe
				selector={(state) => ({
					isSubmitting: state.isSubmitting,
					isDirty: state.isDirty,
					canSubmit: state.canSubmit,
				})}
			>
				{({ isSubmitting, isDirty, canSubmit }) =>
					isDirty ? (
						<div className="island-shell sticky bottom-[calc(var(--dock-h)+var(--safe-bottom)+0.75rem)] z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl py-3 ps-5 pe-3">
							<p className="text-sm text-muted-foreground">
								You have unsaved changes.
							</p>
							<div className="flex items-center gap-2">
								<Button
									type="button"
									variant="ghost"
									disabled={isSubmitting}
									onClick={() => form.reset()}
								>
									Discard
								</Button>
								<Button
									type="submit"
									disabled={isSubmitting || save.isPending || !canSubmit}
								>
									{isSubmitting ? <Spinner data-icon="inline-start" /> : null}
									{isSubmitting ? "Saving…" : "Save changes"}
								</Button>
							</div>
						</div>
					) : null
				}
			</form.Subscribe>
		</form>
	);
}

function LearnMore({ href, children }: { href: string; children: string }) {
	return (
		<a
			href={href}
			target="_blank"
			rel="noreferrer"
			className="inline-flex items-center gap-0.5 font-medium text-foreground underline"
		>
			{children}
			<ArrowUpRight className="size-3.5" aria-hidden="true" />
		</a>
	);
}
