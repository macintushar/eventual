import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { probeSummaries, serverLabel } from "../lib/server";
import { useSession } from "../lib/session";
import { fonts, useTheme } from "../theme";
import { Body } from "./brand";

/** Which server you're signing in to, with a way to change it. */
export function ServerRow() {
	const t = useTheme();
	const router = useRouter();
	const { origin, site, siteError } = useSession();
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={`Server: ${serverLabel(origin)}. Change server`}
			onPress={() => router.push("/server")}
			style={({ pressed }) => ({
				flexDirection: "row",
				alignItems: "center",
				gap: 12,
				paddingHorizontal: 18,
				paddingVertical: 14,
				borderRadius: 18,
				borderWidth: 1,
				borderColor: t.border,
				backgroundColor: pressed ? t.muted : "transparent",
			})}
		>
			<View style={{ flex: 1, gap: 2 }}>
				<Body tone="muted" size={13}>
					Server
				</Body>
				<Body weight="semibold" size={15}>
					{serverLabel(origin)}
				</Body>
				{siteError ? (
					<Body tone="negative" size={13}>
						{probeSummaries[siteError]}
					</Body>
				) : !site ? (
					<Body tone="muted" size={13}>
						Checking…
					</Body>
				) : null}
			</View>
			<Body
				size={15}
				style={{ fontFamily: fonts.semibold, textDecorationLine: "underline" }}
			>
				Change
			</Body>
		</Pressable>
	);
}
