import { useForm } from "@tanstack/react-form";
import { ArrowUpRight, Camera, ImageUp, Trash2 } from "lucide-react";
import { type ComponentProps, forwardRef, useRef, useState } from "react";
import { toast } from "sonner";
import type { ZodType } from "zod";

import { BrandLogo } from "#/components/brand-logo";
import { EmailVerification } from "#/components/email-verification";
import { MemberAvatar } from "#/components/member-avatar";
import { SettingsRow, SettingsSection } from "#/components/settings-section";
import { Button } from "#/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
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
import { Textarea } from "#/components/ui/textarea";
import { useUpdateProfile } from "#/lib/app-mutation";
import { toAvatarDataUrl } from "#/lib/avatar-image";
import { fieldError } from "#/lib/form-error";
import { cn } from "#/lib/utils";
import { bioSchema, upiVpaSchema, wiseTagSchema } from "#/server/schemas";
import { phoneSchema } from "#/server/schemas/people";

type ProfileUser = {
	name: string;
	email: string;
	emailVerified: boolean;
	image?: string | null;
	upiVpa?: string | null;
	wiseTag?: string | null;
	emailReminders?: boolean | null;
	bio?: string | null;
	phone?: string | null;
	isEmailPublic?: boolean | null;
	isPhonePublic?: boolean | null;
};

/** Blank is allowed; a typed value has to match the field's own shape. */
function optionalIssue(schema: ZodType<string, string>, value: string) {
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
			bio: user.bio ?? "",
			phone: user.phone ?? "",
			isEmailPublic: user.isEmailPublic ?? true,
			isPhonePublic: user.isPhonePublic ?? true,
			emailReminders: user.emailReminders ?? true,
		},
		onSubmit: async ({ value, formApi }) => {
			try {
				const saved = await save.mutateAsync({
					name: value.name.trim(),
					upiVpa: value.upi,
					wiseTag: value.wise,
					bio: value.bio,
					phone: value.phone,
					isEmailPublic: value.isEmailPublic,
					isPhonePublic: value.isPhonePublic,
					emailReminders: value.emailReminders,
				});
				formApi.reset({
					name: saved.name,
					upi: saved.upiVpa ?? "",
					wise: saved.wiseTag ?? "",
					bio: saved.bio ?? "",
					phone: saved.phone ?? "",
					isEmailPublic: saved.isEmailPublic,
					isPhonePublic: saved.isPhonePublic,
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

	const photoInput = useRef<HTMLInputElement>(null);
	const [photoPending, setPhotoPending] = useState(false);

	/** Photo changes save on their own; they don't wait for the form's save. */
	const savePhoto = async (
		image: () => Promise<string | null>,
		done: string,
		failed: string,
	) => {
		setPhotoPending(true);
		try {
			await save.mutateAsync({ image: await image() });
			toast.success(done);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : failed);
		} finally {
			setPhotoPending(false);
		}
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
				title="About you"
				description="How you appear on expenses and in every group you're in."
			>
				<SettingsRow
					title="Photo"
					description="Shown beside your name on expenses and balances."
				>
					<input
						ref={photoInput}
						type="file"
						accept="image/*"
						className="sr-only"
						tabIndex={-1}
						aria-hidden="true"
						onChange={(event) => {
							const file = event.currentTarget.files?.[0];
							// Cleared so picking the same file again still fires.
							event.currentTarget.value = "";
							if (!file) return;
							void savePhoto(
								() => toAvatarDataUrl(file),
								"Photo updated",
								"Could not update your photo",
							);
						}}
					/>
					{/* The avatar is the control. With no photo yet it opens the
					    picker; with one, a short menu offers replace or remove. */}
					{user.image ? (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<PhotoButton
									user={user}
									pending={photoPending}
									label="Change or remove your photo"
								/>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuItem onSelect={() => photoInput.current?.click()}>
									<ImageUp />
									Upload new photo
								</DropdownMenuItem>
								<DropdownMenuItem
									variant="destructive"
									onSelect={() =>
										void savePhoto(
											async () => null,
											"Photo removed",
											"Could not remove your photo",
										)
									}
								>
									<Trash2 />
									Remove photo
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					) : (
						<PhotoButton
							user={user}
							pending={photoPending}
							label="Upload a photo"
							onClick={() => photoInput.current?.click()}
						/>
					)}
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

				<form.Field
					name="bio"
					validators={{
						onBlur: ({ value }) => optionalIssue(bioSchema, value),
						onSubmit: ({ value }) => optionalIssue(bioSchema, value),
					}}
				>
					{(field) => {
						const message = field.state.meta.isTouched
							? fieldError(field.state.meta.errors)
							: undefined;
						return (
							<SettingsRow
								htmlFor={field.name}
								title="Bio"
								description="A line about you on your profile in this app. Anyone in one of your groups can read it, so keep it public."
							>
								<Field
									data-invalid={message ? true : undefined}
									className="gap-1.5 sm:w-72"
								>
									<Textarea
										id={field.name}
										name={field.name}
										rows={3}
										maxLength={280}
										placeholder="Chasing the group's last rupee."
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

			<SettingsSection
				title="Contact"
				description="How people in your groups reach you. Your UPI and Wisetag stay on your profile either way — that is how they pay you back."
			>
				<form.Field
					name="phone"
					validators={{
						onBlur: ({ value }) => optionalIssue(phoneSchema, value),
						onSubmit: ({ value }) => optionalIssue(phoneSchema, value),
					}}
				>
					{(field) => {
						const message = field.state.meta.isTouched
							? fieldError(field.state.meta.errors)
							: undefined;
						return (
							<SettingsRow
								htmlFor={field.name}
								title="Phone number"
								description="Include your country code, e.g. +919876543210. Leave blank to remove it."
							>
								<Field
									data-invalid={message ? true : undefined}
									className="gap-1.5 sm:w-72"
								>
									<Input
										id={field.name}
										name={field.name}
										type="tel"
										inputMode="tel"
										autoComplete="tel"
										placeholder="+91 98765 43210"
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

				<form.Field name="isPhonePublic">
					{(field) => (
						<SettingsRow
							title="Show my phone number"
							htmlFor={field.name}
							description="Turn off to keep your number off your profile. It stays saved either way, so you can switch back without typing it again."
						>
							<Switch
								id={field.name}
								checked={field.state.value}
								onCheckedChange={(checked) => field.handleChange(checked)}
							/>
						</SettingsRow>
					)}
				</form.Field>

				<form.Field name="isEmailPublic">
					{(field) => (
						<SettingsRow
							title="Show my email"
							htmlFor={field.name}
							description="Turn off to keep your email off your profile. It stays saved, and group admins can still see it."
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

/** Avatar-as-button with a camera badge; forwards props so it can be a menu trigger. */
const PhotoButton = forwardRef<
	HTMLButtonElement,
	ComponentProps<"button"> & {
		user: ProfileUser;
		pending: boolean;
		label: string;
	}
>(function PhotoButton({ user, pending, label, className, ...props }, ref) {
	return (
		<button
			ref={ref}
			type="button"
			aria-label={label}
			disabled={pending}
			className={cn(
				"press group relative rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-70",
				className,
			)}
			{...props}
		>
			<MemberAvatar
				name={user.name}
				seed={user.email}
				image={user.image}
				className="size-14 text-sm"
			/>
			<span className="absolute -end-0.5 -bottom-0.5 flex size-6 items-center justify-center rounded-full border-2 border-(--paper) bg-foreground text-background transition-transform group-hover:scale-110">
				{pending ? (
					<Spinner className="size-3" />
				) : (
					<Camera className="size-3" aria-hidden="true" />
				)}
			</span>
		</button>
	);
});
