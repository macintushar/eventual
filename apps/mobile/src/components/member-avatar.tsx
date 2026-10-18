import { Image, Text, useColorScheme, View } from "react-native";
import { fonts } from "../theme";

/**
 * The web's six avatar tints (`member-avatar.tsx`), resolved to colours:
 * the brand accents mixed into the paper at the same strengths.
 */
const tints = {
	light: [
		{ background: "#CFE6F7", ink: "#06243A" },
		{ background: "#E4E3E3", ink: "#000000" },
		{ background: "#C7E2F4", ink: "#000000" },
		{ background: "#D9D9EB", ink: "#000000" },
		{ background: "#F2EAE3", ink: "#000000" },
		{ background: "#F1ECC3", ink: "#000000" },
	],
	dark: [
		{ background: "#1B3A52", ink: "#E6F3FC" },
		{ background: "#38373A", ink: "#F3F3F1" },
		{ background: "#1F3B4F", ink: "#F3F3F1" },
		{ background: "#2A2B44", ink: "#F3F3F1" },
		{ background: "#3A332D", ink: "#F3F3F1" },
		{ background: "#3D3920", ink: "#F3F3F1" },
	],
};

function initials(name: string) {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "?";
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Same hash as the web, so a person keeps their colour across both apps. */
function tintIndex(seed: string) {
	let hash = 0;
	for (let index = 0; index < seed.length; index++)
		hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
	return hash % 6;
}

export function MemberAvatar({
	name,
	seed,
	image,
	size = 36,
}: {
	name: string;
	seed?: string;
	image?: string | null;
	size?: number;
}) {
	const tint = (useColorScheme() === "dark" ? tints.dark : tints.light)[
		tintIndex(seed ?? name)
	];
	return (
		<View
			accessible={false}
			importantForAccessibility="no-hide-descendants"
			style={{
				width: size,
				height: size,
				borderRadius: size / 2,
				backgroundColor: tint.background,
				alignItems: "center",
				justifyContent: "center",
				overflow: "hidden",
			}}
		>
			<Text
				style={{
					fontFamily: fonts.bold,
					fontSize: size * 0.34,
					color: tint.ink,
				}}
			>
				{initials(name)}
			</Text>
			{image ? (
				<Image
					source={{ uri: image }}
					style={{ position: "absolute", width: size, height: size }}
				/>
			) : null}
		</View>
	);
}
