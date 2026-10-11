import { useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { Alert, Pressable, View } from "react-native";
import {
	Body,
	Card,
	Display,
	GlassButton,
	Screen,
} from "../../../components/brand";
import { MemberAvatar } from "../../../components/member-avatar";
import { Segmented } from "../../../components/segmented";
import { useAppearancePreference } from "../../../lib/appearance";
import { serverLabel } from "../../../lib/server";
import { useSession } from "../../../lib/session";
import { fonts, useTheme } from "../../../theme";

export default function Account() {
	const t = useTheme();
	const { user, origin, signOut } = useSession();
	const [appearance, setAppearance] = useAppearancePreference();
	const router = useRouter();

	function confirmSignOut() {
		Alert.alert(
			"Sign out?",
			`You’ll need to sign in again to see your groups on ${serverLabel(origin)}.`,
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Sign out",
					style: "destructive",
					onPress: () => void signOut(),
				},
			],
		);
	}

	return (
		<Screen masthead contentStyle={{ paddingBottom: 120 }}>
			<View style={{ gap: 8 }}>
				<Display>Account</Display>
				<Body tone="muted">Signed in as {user?.email ?? "you"}.</Body>
			</View>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel="Profile"
				accessibilityHint="Edit your name, photo and payment details"
				onPress={() => router.push("/account/profile")}
				style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
			>
				<Card elevated style={{ flexDirection: "row", alignItems: "center" }}>
					<MemberAvatar
						name={user?.name ?? "?"}
						seed={user?.email}
						image={user?.image}
						size={56}
					/>
					<View style={{ flex: 1, gap: 2 }}>
						<Body
							numberOfLines={1}
							style={{
								fontFamily: fonts.display,
								fontSize: 22,
								letterSpacing: -0.5,
							}}
						>
							{user?.name ?? "Your account"}
						</Body>
						<Body tone="muted" size={15}>
							Edit profile
						</Body>
					</View>
					<ChevronRight size={20} color={t.mutedInk} />
				</Card>
			</Pressable>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel="Email and sign-in methods"
				onPress={() => router.push("/account/email")}
				style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
			>
				<Card style={{ flexDirection: "row", alignItems: "center" }}>
					<View style={{ flex: 1, gap: 4 }}>
						<Body weight="semibold">Email and sign-in methods</Body>
						<Body tone="muted" size={14}>
							Verification, connected accounts and reminders
						</Body>
					</View>
					<ChevronRight size={20} color={t.mutedInk} />
				</Card>
			</Pressable>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel="Notification settings"
				accessibilityHint="Expenses, payments and recurring updates"
				onPress={() => router.push("/account/notifications")}
				style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
			>
				<Card style={{ flexDirection: "row", alignItems: "center" }}>
					<View style={{ flex: 1, gap: 4 }}>
						<Body weight="semibold">Notifications</Body>
						<Body tone="muted" size={14}>
							Expenses, payments, recurring and muted groups
						</Body>
					</View>
					<ChevronRight size={20} color={t.mutedInk} />
				</Card>
			</Pressable>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel="API keys"
				onPress={() => router.push("/account/api-keys")}
				style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
			>
				<Card style={{ flexDirection: "row", alignItems: "center" }}>
					<View style={{ flex: 1, gap: 4 }}>
						<Body weight="semibold">API keys</Body>
						<Body tone="muted" size={14}>
							Manage access for scripts and integrations
						</Body>
					</View>
					<ChevronRight size={20} color={t.mutedInk} />
				</Card>
			</Pressable>
			<Card style={{ gap: 14 }}>
				<Body tone="muted" size={14}>
					Appearance
				</Body>
				<Segmented
					value={appearance}
					onChange={setAppearance}
					options={[
						{ value: "system", label: "System" },
						{ value: "light", label: "Light" },
						{ value: "dark", label: "Dark" },
					]}
				/>
			</Card>
			<Card style={{ gap: 4 }}>
				<Body tone="muted" size={14}>
					Server
				</Body>
				<Body weight="semibold">{serverLabel(origin)}</Body>
			</Card>
			<GlassButton destructive label="Sign out" onPress={confirmSignOut} />
		</Screen>
	);
}
