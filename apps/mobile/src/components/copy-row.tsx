import * as Clipboard from "expo-clipboard";
import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { fonts, useTheme } from "../theme";
import { Body } from "./brand";

/** A value you can tap to copy: a URL, with a quiet "Copy" that confirms. */
export function CopyRow({ label, value }: { label: string; value: string }) {
	const t = useTheme();
	const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(
		() => () => {
			if (timer.current) clearTimeout(timer.current);
		},
		[],
	);

	async function copy() {
		let copied = false;
		try {
			copied = await Clipboard.setStringAsync(value);
		} catch {
			copied = false;
		}
		setState(copied ? "copied" : "failed");
		if (timer.current) clearTimeout(timer.current);
		timer.current = setTimeout(() => setState("idle"), 1800);
	}

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={`Copy ${label}`}
			accessibilityHint={value}
			onPress={() => void copy()}
			style={({ pressed }) => ({
				flexDirection: "row",
				alignItems: "center",
				gap: 12,
				paddingHorizontal: 14,
				paddingVertical: 12,
				borderRadius: 16,
				borderWidth: 1,
				borderColor: t.border,
				backgroundColor: pressed ? t.muted : t.canvas,
			})}
		>
			<View style={{ flex: 1, gap: 2 }}>
				<Body tone="muted" size={13}>
					{label}
				</Body>
				<Body size={15} selectable={false} numberOfLines={2}>
					{value}
				</Body>
			</View>
			<Body
				size={15}
				tone={state === "failed" ? "negative" : "default"}
				style={{ fontFamily: fonts.semibold }}
				accessibilityLiveRegion="polite"
			>
				{state === "copied"
					? "Copied"
					: state === "failed"
						? "Couldn’t copy"
						: "Copy"}
			</Body>
		</Pressable>
	);
}
