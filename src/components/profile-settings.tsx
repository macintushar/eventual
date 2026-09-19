import { useRouter } from "@tanstack/react-router";
import { ArrowUpRight, Camera, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import { BrandLogo } from "#/components/brand-logo";
import { EmailVerification } from "#/components/email-verification";
import { MemberAvatar } from "#/components/member-avatar";
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
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
	FieldSeparator,
} from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
	InputGroupText,
} from "#/components/ui/input-group";
import { Spinner } from "#/components/ui/spinner";
import { Switch } from "#/components/ui/switch";
import { clearSession } from "#/lib/session";
import { updateProfileFn } from "#/server/fn/profile";
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

type ProfilePatch = Parameters<typeof updateProfileFn>[0]["data"];

/**
 * Saves one card's fields, then drops the cached session so the `/app` guard
 * re-reads the user — otherwise the header and account menu keep the old name.
 */
function useSaveProfile() {
	const router = useRouter();
	const [saving, setSaving] = useState(false);

	const save = async (data: ProfilePatch, success: string) => {
		setSaving(true);
		try {
			await updateProfileFn({ data });
			clearSession();
			await router.invalidate();
			toast.success(success);
			return true;
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not save your profile",
			);
			return false;
		} finally {
			setSaving(false);
		}
	};

	return { saving, save };
}

/** The first issue's message, or an empty string when the value parses. */
function issue(
	schema: typeof upiVpaSchema | typeof wiseTagSchema,
	value: string,
) {
	if (!value.trim()) return "";
	const result = schema.safeParse(value);
	return result.success ? "" : (result.error.issues[0]?.message ?? "Invalid");
}

const normalUpi = (value: string) => value.trim().toLowerCase();
const normalWise = (value: string) => value.trim().replace(/^@/, "");

/**
 * One form for everything about you: the fields on the left, the picture on
 * the right. On a phone the picture moves above the fields.
 */
export function ProfileSettings({ user }: { user: ProfileUser }) {
	const { saving, save } = useSaveProfile();
	const savedUpi = user.upiVpa ?? "";
	const savedWise = user.wiseTag ?? "";
	const [name, setName] = useState(user.name);
	const [upi, setUpi] = useState(savedUpi);
	const [wise, setWise] = useState(savedWise);
	const [emailReminders, setEmailReminders] = useState(
		user.emailReminders ?? true,
	);
	// Errors show once a field is left or submitted, not while it's typed.
	const [touched, setTouched] = useState({
		name: false,
		upi: false,
		wise: false,
	});

	const nameError = name.trim() ? "" : "Enter your name";
	const upiError = issue(upiVpaSchema, upi);
	const wiseError = issue(wiseTagSchema, wise);
	const showNameError = touched.name && nameError;
	const showUpiError = touched.upi && upiError;
	const showWiseError = touched.wise && wiseError;
	const dirty =
		name.trim() !== user.name ||
		normalUpi(upi) !== savedUpi ||
		normalWise(wise) !== savedWise ||
		emailReminders !== (user.emailReminders ?? true);

	const onSubmit = async (event: FormEvent) => {
		event.preventDefault();
		setTouched({ name: true, upi: true, wise: true });
		if (nameError || upiError || wiseError || !dirty) return;
		const ok = await save(
			{ name: name.trim(), upiVpa: upi, wiseTag: wise, emailReminders },
			"Profile saved",
		);
		if (ok) {
			setName(name.trim());
			setUpi(normalUpi(upi));
			setWise(normalWise(wise));
			setTouched({ name: false, upi: false, wise: false });
		}
	};

	return (
		<Card className="island-shell">
			<CardHeader>
				<CardTitle>Profile</CardTitle>
				<CardDescription>
					How you appear on expenses and in every group you're in.
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-8 sm:grid-cols-[minmax(0,1fr)_auto]">
				<ProfilePicture
					user={user}
					saving={saving}
					onRemove={() => save({ image: null }, "Photo removed")}
				/>

				<form
					className="flex min-w-0 flex-col gap-6 sm:order-first"
					onSubmit={onSubmit}
					noValidate
				>
					<FieldGroup className="gap-5">
						<Field data-invalid={showNameError ? true : undefined}>
							<FieldLabel htmlFor="profile-name">Name</FieldLabel>
							<Input
								id="profile-name"
								autoComplete="name"
								maxLength={100}
								value={name}
								aria-invalid={showNameError ? true : undefined}
								onChange={(event) => setName(event.target.value)}
								onBlur={() => setTouched((old) => ({ ...old, name: true }))}
							/>
							{showNameError ? <FieldError>{nameError}</FieldError> : null}
						</Field>

						<EmailVerification
							email={user.email}
							verified={user.emailVerified}
						/>

						<FieldSeparator />

						<Field orientation="horizontal">
							<div className="flex-1">
								<FieldLabel htmlFor="profile-email-reminders">
									Email reminders
								</FieldLabel>
								<FieldDescription>
									Allow group members to send you scheduled balance reminders.
								</FieldDescription>
							</div>
							<Switch
								id="profile-email-reminders"
								checked={emailReminders}
								onCheckedChange={setEmailReminders}
							/>
						</Field>

						<FieldSeparator />

						<Field data-invalid={showUpiError ? true : undefined}>
							<FieldLabel
								htmlFor="profile-upi"
								asChild
								className="hover:underline"
							>
								<a
									href="https://www.npci.org.in/what-we-do/upi"
									target="_blank"
									rel="noreferrer"
								>
									<BrandLogo brand="upi" className="h-3.5 w-7" />
									UPI ID
									<ArrowUpRight className="size-3.5 text-muted-foreground" />
								</a>
							</FieldLabel>
							<InputGroup>
								<InputGroupInput
									id="profile-upi"
									inputMode="email"
									autoCapitalize="none"
									autoCorrect="off"
									spellCheck={false}
									placeholder="name@bank"
									value={upi}
									aria-invalid={showUpiError ? true : undefined}
									onChange={(event) => setUpi(event.target.value)}
									onBlur={() => setTouched((old) => ({ ...old, upi: true }))}
								/>
							</InputGroup>
							{showUpiError ? (
								<FieldError>{upiError}</FieldError>
							) : (
								<FieldDescription>
									So people can pay you back from GPay, PhonePe, Paytm or your
									bank's app.
								</FieldDescription>
							)}
						</Field>

						<Field data-invalid={showWiseError ? true : undefined}>
							<FieldLabel
								htmlFor="profile-wise"
								asChild
								className="hover:underline"
							>
								<a href="https://wise.com" target="_blank" rel="noreferrer">
									<BrandLogo brand="wise" />
									Wisetag
									<ArrowUpRight className="size-3.5 text-muted-foreground" />
								</a>
							</FieldLabel>
							<InputGroup>
								<InputGroupAddon>
									<InputGroupText>@</InputGroupText>
								</InputGroupAddon>
								<InputGroupInput
									id="profile-wise"
									autoCapitalize="none"
									autoCorrect="off"
									spellCheck={false}
									placeholder="yourname"
									value={wise}
									aria-invalid={showWiseError ? true : undefined}
									onChange={(event) =>
										setWise(event.target.value.replace(/^@/, ""))
									}
									onBlur={() => setTouched((old) => ({ ...old, wise: true }))}
								/>
							</InputGroup>
							{showWiseError ? (
								<FieldError>{wiseError}</FieldError>
							) : (
								<FieldDescription>
									Find it under your profile in the Wise app. Leave either blank
									to remove it.
								</FieldDescription>
							)}
						</Field>
					</FieldGroup>

					<Button
						type="submit"
						className="self-start"
						disabled={saving || !dirty}
					>
						{saving ? <Spinner data-icon="inline-start" /> : null}
						{saving ? "Saving…" : "Save changes"}
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}

/**
 * The picture with its actions laid over it. A cursor reveals them on hover
 * and a keyboard on focus; a touch screen has no hover, so there they stay
 * up over a lighter scrim.
 */
function ProfilePicture({
	user,
	saving,
	onRemove,
}: {
	user: ProfileUser;
	saving: boolean;
	onRemove: () => void;
}) {
	return (
		<div className="group/picture relative size-28 shrink-0 self-start justify-self-center rounded-full sm:size-32 sm:justify-self-end">
			<MemberAvatar
				name={user.name}
				seed={user.email}
				image={user.image}
				className="size-full text-2xl sm:size-full"
			/>
			<div className="absolute inset-0 flex items-center justify-center gap-1.5 rounded-full bg-black/50 opacity-0 transition-opacity duration-150 group-focus-within/picture:opacity-100 group-hover/picture:opacity-100 [@media(hover:none)]:bg-black/25 [@media(hover:none)]:opacity-100">
				<Button
					type="button"
					size="icon-sm"
					variant="secondary"
					aria-label={user.image ? "Change photo" : "Upload photo"}
					onClick={() => toast("Photo uploads are coming soon")}
				>
					<Camera />
				</Button>
				{user.image ? (
					<Button
						type="button"
						size="icon-sm"
						variant="secondary"
						className="text-destructive"
						aria-label="Remove photo"
						disabled={saving}
						onClick={onRemove}
					>
						<Trash2 />
					</Button>
				) : null}
			</div>
		</div>
	);
}
