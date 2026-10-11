import {
	bioSchema,
	type updateProfileSchema,
	upiVpaSchema,
	wiseTagSchema,
} from "@eventual/schemas/common";
import { phoneSchema } from "@eventual/schemas/people";
import { isEventualApiError } from "@eventual/sdk";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { Stack } from "expo-router";
import { Camera } from "lucide-react-native";
import { type ReactNode, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Linking,
	Pressable,
	Switch,
	Text,
	View,
} from "react-native";
import type { z } from "zod";
import {
	Body,
	Card,
	Display,
	Field,
	FormMessage,
	Heading,
	Screen,
} from "../../../components/brand";
import { MemberAvatar } from "../../../components/member-avatar";
import { useOptionPicker } from "../../../components/select-field";
import { toAvatarDataUrl } from "../../../lib/avatar-image";
import { idempotencyKey } from "../../../lib/mutations";
import { type SessionUser, useApi, useSession } from "../../../lib/session";
import { fonts, useTheme } from "../../../theme";

type Values = {
	name: string;
	bio: string;
	upiVpa: string;
	wiseTag: string;
	phone: string;
	isPhonePublic: boolean;
	isEmailPublic: boolean;
	emailReminders: boolean;
};
type TextKey = "name" | "bio" | "upiVpa" | "wiseTag" | "phone";

function savedValues(user: SessionUser | null): Values {
	return {
		name: user?.name ?? "",
		bio: user?.bio ?? "",
		upiVpa: user?.upiVpa ?? "",
		wiseTag: user?.wiseTag ?? "",
		phone: user?.phone ?? "",
		isPhonePublic: user?.isPhonePublic ?? true,
		isEmailPublic: user?.isEmailPublic ?? true,
		emailReminders: user?.emailReminders ?? true,
	};
}

/** Blank is allowed (it clears the field); a typed value must parse. */
function optionalIssue(schema: z.ZodType<string, string>, value: string) {
	if (!value.trim()) return undefined;
	const result = schema.safeParse(value);
	return result.success
		? undefined
		: (result.error.issues[0]?.message ?? "Invalid");
}

function validate(values: Values): Partial<Record<TextKey, string>> {
	return {
		name: values.name.trim() ? undefined : "Enter your name",
		bio: optionalIssue(bioSchema, values.bio),
		upiVpa: optionalIssue(upiVpaSchema, values.upiVpa),
		wiseTag: optionalIssue(wiseTagSchema, values.wiseTag),
		phone: optionalIssue(phoneSchema, values.phone),
	};
}

const errorText = (cause: unknown, fallback: string) =>
	isEventualApiError(cause)
		? cause.message
		: cause instanceof Error
			? cause.message
			: fallback;

export default function Profile() {
	const t = useTheme();
	const api = useApi();
	const queryClient = useQueryClient();
	const { user, refreshSession } = useSession();
	const picker = useOptionPicker();

	const saved = savedValues(user);
	// Only edited fields live here, so the rest follow the session as it loads.
	const [draft, setDraft] = useState<Partial<Values>>({});
	const [touched, setTouched] = useState<Partial<Record<TextKey, boolean>>>({});
	const [submitted, setSubmitted] = useState(false);
	const [error, setError] = useState("");

	const values = { ...saved, ...draft };
	const changed = (Object.keys(draft) as (keyof Values)[]).filter(
		(key) => draft[key] !== saved[key],
	);
	const dirty = changed.length > 0;
	const issues = validate(values);
	const issue = (key: TextKey) =>
		touched[key] || submitted ? issues[key] : undefined;

	const set = <K extends keyof Values>(key: K, value: Values[K]) =>
		setDraft((current) => ({ ...current, [key]: value }));
	const blur = (key: TextKey) => () =>
		setTouched((current) => ({ ...current, [key]: true }));

	/** Names, photos and payment details show on the dashboard and in groups. */
	async function afterSave() {
		await Promise.all([
			refreshSession(),
			queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
			queryClient.invalidateQueries({ queryKey: ["group"] }),
		]);
	}

	const save = useMutation({
		mutationFn: (patch: z.input<typeof updateProfileSchema>) =>
			api.call("profile.update", patch, { idempotencyKey: idempotencyKey() }),
		onMutate: () => setError(""),
	});

	async function saveForm() {
		setSubmitted(true);
		if (Object.values(issues).some(Boolean)) return;
		// A patch of just what changed; blanks clear on the server.
		const patch: z.input<typeof updateProfileSchema> = {};
		for (const key of changed) {
			const value = values[key];
			Object.assign(patch, {
				[key]:
					key === "name" && typeof value === "string" ? value.trim() : value,
			});
		}
		try {
			await save.mutateAsync(patch);
			await afterSave();
			setDraft({});
			setTouched({});
			setSubmitted(false);
		} catch (cause) {
			setError(errorText(cause, "Couldn’t save your profile."));
		}
	}

	/** Photo changes save on their own, as on the web. */
	const photo = useMutation({
		mutationFn: async (image: () => Promise<string | null>) =>
			api.call(
				"profile.update",
				{ image: await image() },
				{ idempotencyKey: idempotencyKey() },
			),
		onMutate: () => setError(""),
		onSuccess: afterSave,
		onError: (cause) =>
			Alert.alert(
				"Couldn’t update your photo",
				errorText(cause, "Try again in a moment."),
			),
	});

	async function pickPhoto(source: "library" | "camera") {
		const options: ImagePicker.ImagePickerOptions = {
			mediaTypes: ["images"],
			allowsEditing: true,
			aspect: [1, 1],
			quality: 1,
		};
		let result: ImagePicker.ImagePickerResult;
		if (source === "camera") {
			// Only the camera needs a prompt; the library picker runs out of process.
			const permission = await ImagePicker.requestCameraPermissionsAsync();
			if (!permission.granted) {
				Alert.alert(
					"Camera access is off",
					"Turn it on in Settings to take a photo.",
					[
						{ text: "Cancel", style: "cancel" },
						{
							text: "Open Settings",
							onPress: () => void Linking.openSettings(),
						},
					],
				);
				return;
			}
			try {
				result = await ImagePicker.launchCameraAsync(options);
			} catch {
				// The simulator, or a device without a camera.
				Alert.alert("Camera unavailable", "Choose a photo from your library.");
				return;
			}
		} else {
			result = await ImagePicker.launchImageLibraryAsync(options);
		}
		const asset = result.assets?.[0];
		if (result.canceled || !asset) return;
		photo.mutate(() => toAvatarDataUrl(asset));
	}

	function choosePhoto() {
		picker.pick({
			title: "Profile photo",
			options: [
				{ value: "library", label: "Choose from library" },
				{ value: "camera", label: "Take photo" },
				...(user?.image
					? [{ value: "remove", label: "Remove photo", destructive: true }]
					: []),
			],
			onPick: (value) => {
				if (value === "remove") photo.mutate(async () => null);
				else void pickPhoto(value as "library" | "camera");
			},
		});
	}

	const busy = save.isPending;
	return (
		<>
			<Stack.Screen
				options={{
					// In the header so Save stays put above the keyboard; only when dirty.
					headerRight: dirty
						? () => (
								<Pressable
									accessibilityRole="button"
									accessibilityLabel="Save"
									accessibilityState={{ busy, disabled: busy }}
									disabled={busy}
									onPress={() => void saveForm()}
									hitSlop={6}
									style={{
										minWidth: 56,
										height: 36,
										paddingHorizontal: 12,
										alignItems: "center",
										justifyContent: "center",
									}}
								>
									{busy ? (
										<ActivityIndicator color={t.ink} />
									) : (
										<Text
											style={{
												fontFamily: fonts.semibold,
												fontSize: 17,
												color: t.ink,
											}}
										>
											Save
										</Text>
									)}
								</Pressable>
							)
						: undefined,
				}}
			/>
			<Screen edges={["left", "right"]} contentStyle={{ paddingBottom: 120 }}>
				<Display size={32}>Profile</Display>

				<Card>
					<Pressable
						accessibilityRole="button"
						accessibilityLabel={
							user?.image ? "Change or remove your photo" : "Add a photo"
						}
						accessibilityState={{ busy: photo.isPending }}
						disabled={photo.isPending}
						onPress={choosePhoto}
						style={({ pressed }) => ({
							alignSelf: "center",
							opacity: pressed ? 0.7 : 1,
						})}
					>
						<MemberAvatar
							name={values.name || "?"}
							seed={user?.email}
							image={user?.image}
							size={88}
						/>
						<View
							style={{
								position: "absolute",
								right: -2,
								bottom: -2,
								width: 30,
								height: 30,
								borderRadius: 15,
								borderWidth: 2,
								borderColor: t.paper,
								backgroundColor: t.action,
								alignItems: "center",
								justifyContent: "center",
							}}
						>
							{photo.isPending ? (
								<ActivityIndicator size="small" color={t.actionInk} />
							) : (
								<Camera size={15} color={t.actionInk} />
							)}
						</View>
					</Pressable>
					<Field
						label="Name"
						value={values.name}
						onChangeText={(text) => set("name", text)}
						onBlur={blur("name")}
						error={issue("name")}
						autoComplete="name"
						textContentType="name"
						maxLength={100}
					/>
					<Hint error={issue("name")} />
					<Field
						label="Bio"
						value={values.bio}
						onChangeText={(text) => set("bio", text)}
						onBlur={blur("bio")}
						error={issue("bio")}
						placeholder="Chasing the group’s last rupee."
						multiline
						maxLength={280}
						style={{ minHeight: 96, paddingTop: 14, textAlignVertical: "top" }}
					/>
					<Hint error={issue("bio")}>Anyone in your groups can see it.</Hint>
				</Card>

				<Card>
					<View style={{ gap: 4 }}>
						<Heading>Payment details</Heading>
						<Body tone="muted" size={15}>
							So people can pay you back. Leave blank to remove.
						</Body>
					</View>
					<Field
						label="UPI ID"
						value={values.upiVpa}
						onChangeText={(text) => set("upiVpa", text)}
						onBlur={blur("upiVpa")}
						error={issue("upiVpa")}
						placeholder="name@bank"
						keyboardType="email-address"
						autoCapitalize="none"
						autoCorrect={false}
					/>
					<Hint error={issue("upiVpa")} />
					<Field
						label="Wisetag"
						value={values.wiseTag}
						// Stored without the @, so typing one isn't a change.
						onChangeText={(text) => set("wiseTag", text.replace(/^@/, ""))}
						onBlur={blur("wiseTag")}
						error={issue("wiseTag")}
						placeholder="yourname"
						autoCapitalize="none"
						autoCorrect={false}
					/>
					<Hint error={issue("wiseTag")} />
				</Card>

				<Card>
					<Heading>Contact</Heading>
					<Field
						label="Phone number"
						value={values.phone}
						onChangeText={(text) => set("phone", text)}
						onBlur={blur("phone")}
						error={issue("phone")}
						placeholder="+91 98765 43210"
						keyboardType="phone-pad"
						autoComplete="tel"
						textContentType="telephoneNumber"
					/>
					<Hint error={issue("phone")}>Include your country code.</Hint>
					<SwitchRow
						label="Show my phone number"
						value={values.isPhonePublic}
						onChange={(value) => set("isPhonePublic", value)}
					/>
					<SwitchRow
						label="Show my email"
						description="Group admins can still see it."
						value={values.isEmailPublic}
						onChange={(value) => set("isEmailPublic", value)}
					/>
				</Card>

				<Card>
					<SwitchRow
						label="Email reminders"
						description="Let group members remind you about what you owe."
						value={values.emailReminders}
						onChange={(value) => set("emailReminders", value)}
					/>
				</Card>

				{error ? <FormMessage>{error}</FormMessage> : null}
			</Screen>
			{picker.sheet}
		</>
	);
}

/** The line under a field: its error, or else a short hint. */
function Hint({ error, children }: { error?: string; children?: ReactNode }) {
	if (!error && !children) return null;
	return (
		<View style={{ marginTop: -10 }} accessibilityLiveRegion="polite">
			<Body tone={error ? "negative" : "muted"} size={14}>
				{error ?? children}
			</Body>
		</View>
	);
}

function SwitchRow({
	label,
	description,
	value,
	onChange,
}: {
	label: string;
	description?: string;
	value: boolean;
	onChange: (value: boolean) => void;
}) {
	return (
		<View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
			<View style={{ flex: 1, gap: 2 }}>
				<Body weight="medium" size={15}>
					{label}
				</Body>
				{description ? (
					<Body tone="muted" size={14}>
						{description}
					</Body>
				) : null}
			</View>
			<Switch
				accessibilityLabel={label}
				value={value}
				onValueChange={onChange}
			/>
		</View>
	);
}
