import { Alert, View } from "react-native";
import {
	Body,
	Card,
	Display,
	GlassButton,
	Screen,
} from "../../../components/brand";
import { Segmented } from "../../../components/segmented";
import { useAppearancePreference } from "../../../lib/appearance";
import { serverLabel } from "../../../lib/server";
import { useSession } from "../../../lib/session";
import { fonts, useTheme } from "../../../theme";

export default function Account() {
	const t = useTheme();
	const { user, origin, signOut } = useSession();
	const [appearance, setAppearance] = useAppearancePreference();
	const initials = (user?.name ?? "?")
		.split(/\s+/)
		.map((part) => part[0])
		.slice(0, 2)
		.join("")
		.toUpperCase();

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
			<Card elevated style={{ flexDirection: "row", alignItems: "center" }}>
				<View
					style={{
						width: 56,
						height: 56,
						borderRadius: 28,
						backgroundColor: t.muted,
						alignItems: "center",
						justifyContent: "center",
					}}
				>
					<Body style={{ fontFamily: fonts.semibold, fontSize: 20 }}>
						{initials}
					</Body>
				</View>
				<View style={{ flex: 1, gap: 2 }}>
					<Body
						style={{
							fontFamily: fonts.display,
							fontSize: 22,
							letterSpacing: -0.5,
						}}
					>
						{user?.name ?? "Your account"}
					</Body>
					<Body tone="muted" size={15}>
						{user?.email}
					</Body>
				</View>
			</Card>
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
