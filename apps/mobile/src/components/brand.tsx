import {
	Host,
	HStack,
	RNHostView,
	Button as SwiftUIButton,
	Text as SwiftUIText,
} from "@expo/ui/swift-ui";
import {
	buttonBorderShape,
	buttonStyle,
	controlSize,
	disabled as disabledModifier,
	font,
	foregroundStyle,
	frame,
	tint,
} from "@expo/ui/swift-ui/modifiers";
import {
	forwardRef,
	type PropsWithChildren,
	type ReactNode,
	useState,
} from "react";
import {
	ActivityIndicator,
	Keyboard,
	Platform,
	Pressable,
	ScrollView,
	type StyleProp,
	Text,
	TextInput,
	type TextInputProps,
	type TextProps,
	type TextStyle,
	View,
	type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { G, Path, Rect } from "react-native-svg";
import { fonts, shadow, type Theme, useTheme } from "../theme";

/** The coin mark: a filled disc with two arcs, as on the web. */
export function LogoMark({ size = 24 }: { size?: number }) {
	const t = useTheme();
	return (
		<Svg width={size} height={size} viewBox="0 0 64 64" accessible={false}>
			<Rect width={64} height={64} rx={32} fill={t.ink} />
			<G fill="none" stroke={t.canvas} strokeWidth={5} strokeLinecap="round">
				<Path d="M31 12A20 20 0 0 0 31 52" />
				<Path d="M38 17A15 15 0 0 1 38 47" />
			</G>
		</Svg>
	);
}

export function Wordmark() {
	const t = useTheme();
	return (
		<View
			accessible
			accessibilityRole="header"
			accessibilityLabel="Eventual"
			style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
		>
			<LogoMark size={26} />
			<Text
				style={{
					fontFamily: fonts.display,
					fontSize: 24,
					letterSpacing: -0.8,
					color: t.ink,
				}}
			>
				Eventual
			</Text>
		</View>
	);
}

/**
 * A scrolling page on the canvas. `masthead` puts the wordmark (and any
 * trailing actions) above the content, as on the web.
 */
export function Screen({
	children,
	masthead = false,
	actions,
	edges = ["top", "left", "right"],
	contentStyle,
}: PropsWithChildren<{
	masthead?: boolean;
	actions?: ReactNode;
	edges?: ("top" | "bottom" | "left" | "right")[];
	contentStyle?: StyleProp<ViewStyle>;
}>) {
	const t = useTheme();
	return (
		<SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: t.canvas }}>
			<ScrollView
				// "always": SwiftUI glass buttons aren't React Native touchables, so
				// "handled" would spend their first tap just closing the keyboard.
				keyboardShouldPersistTaps="always"
				keyboardDismissMode="interactive"
				contentInsetAdjustmentBehavior="automatic"
				automaticallyAdjustKeyboardInsets
				contentContainerStyle={[
					{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40, gap: 24 },
					contentStyle,
				]}
			>
				{masthead ? (
					<View
						style={{
							flexDirection: "row",
							alignItems: "center",
							justifyContent: "space-between",
							minHeight: 48,
						}}
					>
						<Wordmark />
						<View style={{ flexDirection: "row", gap: 8 }}>{actions}</View>
					</View>
				) : null}
				{children}
			</ScrollView>
		</SafeAreaView>
	);
}

/** A paper card (`island-shell` on the web). */
export function Card({
	children,
	style,
	elevated = false,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle>; elevated?: boolean }>) {
	const t = useTheme();
	return (
		<View
			style={[
				{
					backgroundColor: t.paper,
					borderColor: t.border,
					borderWidth: 1,
					borderRadius: 24,
					padding: 22,
					gap: 18,
				},
				shadow(t, elevated ? "md" : "sm"),
				style,
			]}
		>
			{children}
		</View>
	);
}

/** Quiet label with a strip of blue tape in front (`island-kicker`). */
export function Kicker({ children }: { children: string }) {
	const t = useTheme();
	return (
		<View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
			<View
				style={{
					width: 20,
					height: 8,
					borderRadius: 2,
					backgroundColor: t.tape,
					opacity: 0.75,
					transform: [{ rotate: "-4deg" }],
				}}
			/>
			<Text
				style={{ fontFamily: fonts.medium, fontSize: 14, color: t.mutedInk }}
			>
				{children}
			</Text>
		</View>
	);
}

export function Display({
	children,
	size = 34,
}: {
	children: string;
	size?: number;
}) {
	const t = useTheme();
	return (
		<Text
			accessibilityRole="header"
			style={{
				fontFamily: fonts.display,
				fontSize: size,
				lineHeight: size * 1.02,
				letterSpacing: size * -0.035,
				color: t.ink,
			}}
		>
			{children}
		</Text>
	);
}

type Tone = "default" | "muted" | "positive" | "negative";
function toneColor(t: Theme, tone: Tone) {
	return tone === "muted"
		? t.mutedInk
		: tone === "positive"
			? t.positive
			: tone === "negative"
				? t.negative
				: t.ink;
}

export function Body({
	children,
	tone = "default",
	size = 16,
	weight = "body",
	style,
	center,
	numberOfLines,
	...rest
}: Omit<TextProps, "style" | "children"> & {
	children: ReactNode;
	tone?: Tone;
	size?: number;
	weight?: keyof typeof fonts;
	style?: StyleProp<TextStyle>;
	center?: boolean;
	numberOfLines?: number;
}) {
	const t = useTheme();
	return (
		<Text
			{...rest}
			numberOfLines={numberOfLines}
			style={[
				{
					fontFamily: fonts[weight],
					fontSize: size,
					lineHeight: size * 1.45,
					color: toneColor(t, tone),
					textAlign: center ? "center" : undefined,
				},
				style,
			]}
		>
			{children}
		</Text>
	);
}

export function Heading({ children }: { children: string }) {
	const t = useTheme();
	return (
		<Text
			accessibilityRole="header"
			style={{ fontFamily: fonts.semibold, fontSize: 20, color: t.ink }}
		>
			{children}
		</Text>
	);
}

/** Label + input, styled like the web's fields. */
export const Field = forwardRef<
	TextInput,
	TextInputProps & { label: string; error?: string }
>(function Field({ label, error, style, onFocus, onBlur, ...props }, ref) {
	const t = useTheme();
	const [focused, setFocused] = useState(false);
	return (
		<View style={{ gap: 8 }}>
			<Text style={{ fontFamily: fonts.medium, fontSize: 15, color: t.ink }}>
				{label}
			</Text>
			<TextInput
				ref={ref}
				accessibilityLabel={label}
				placeholderTextColor={t.mutedInk}
				selectionColor={t.ring}
				onFocus={(event) => {
					setFocused(true);
					onFocus?.(event);
				}}
				onBlur={(event) => {
					setFocused(false);
					onBlur?.(event);
				}}
				style={[
					{
						minHeight: 52,
						borderRadius: 14,
						borderWidth: focused ? 2 : 1,
						borderColor: error ? t.negative : focused ? t.ring : t.input,
						paddingHorizontal: focused ? 15 : 16,
						backgroundColor: t.paper,
						color: t.ink,
						fontFamily: fonts.body,
						fontSize: 17,
					},
					style,
				]}
				{...props}
			/>
		</View>
	);
});

/** Error or notice line under a form, announced politely. */
export function FormMessage({
	children,
	tone = "negative",
}: {
	children: string;
	tone?: Tone;
}) {
	return (
		<View accessibilityLiveRegion="polite">
			<Body tone={tone} size={15}>
				{children}
			</Body>
		</View>
	);
}

/**
 * A pill button. On iOS it's a SwiftUI button with Liquid Glass (iOS 26;
 * bordered on older versions); `prominent` is the ink-filled main action.
 * Android draws the same pill in React Native.
 */
export function GlassButton({
	label,
	onPress,
	prominent = false,
	disabled = false,
	busy = false,
	destructive = false,
	icon,
}: {
	label: string;
	onPress: () => void;
	prominent?: boolean;
	disabled?: boolean;
	busy?: boolean;
	destructive?: boolean;
	/** A small React Native element shown before the label (e.g. a logo). */
	icon?: ReactNode;
}) {
	const t = useTheme();
	const labelColor = prominent ? t.actionInk : destructive ? t.negative : t.ink;
	if (Platform.OS === "ios")
		return (
			<Host
				matchContents={{ vertical: true }}
				style={{
					alignSelf: "stretch",
					// Clear glass has no edge on white paper; a hairline keeps the
					// secondary pill visible without filling it.
					...(prominent
						? null
						: { borderRadius: 999, borderWidth: 1, borderColor: t.border }),
				}}
			>
				<SwiftUIButton
					onPress={() => {
						Keyboard.dismiss();
						onPress();
					}}
					modifiers={[
						buttonStyle(prominent ? "glassProminent" : "glass"),
						buttonBorderShape("capsule"),
						controlSize("extraLarge"),
						...(prominent ? [tint(t.action)] : []),
						disabledModifier(disabled || busy),
					]}
				>
					<HStack spacing={10} modifiers={[frame({ maxWidth: 10_000 })]}>
						{icon ? (
							<RNHostView matchContents>
								<View>{icon}</View>
							</RNHostView>
						) : null}
						<SwiftUIText
							modifiers={[
								font({ family: fonts.semibold, size: 17 }),
								foregroundStyle(labelColor),
							]}
						>
							{label}
						</SwiftUIText>
					</HStack>
				</SwiftUIButton>
			</Host>
		);
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={label}
			accessibilityState={{ disabled: disabled || busy, busy }}
			disabled={disabled || busy}
			onPress={onPress}
			android_ripple={{ color: prominent ? t.actionInk : t.border }}
			style={({ pressed }) => ({
				minHeight: 52,
				borderRadius: 999,
				flexDirection: "row",
				alignItems: "center",
				justifyContent: "center",
				gap: 10,
				paddingHorizontal: 20,
				backgroundColor: prominent ? t.action : t.paper,
				borderWidth: prominent ? 0 : 1,
				borderColor: t.input,
				opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
			})}
		>
			{busy ? <ActivityIndicator color={labelColor} /> : icon}
			<Text
				style={{ fontFamily: fonts.semibold, fontSize: 16, color: labelColor }}
			>
				{label}
			</Text>
		</Pressable>
	);
}

/** Inline text action, e.g. "Forgot your password?". */
export function TextLink({
	children,
	onPress,
	center,
}: {
	children: string;
	onPress: () => void;
	center?: boolean;
}) {
	const t = useTheme();
	return (
		<Pressable
			accessibilityRole="link"
			onPress={onPress}
			hitSlop={8}
			style={{
				alignSelf: center ? "center" : "flex-start",
				paddingVertical: 4,
			}}
		>
			{({ pressed }) => (
				<Text
					style={{
						fontFamily: fonts.medium,
						fontSize: 16,
						color: t.ink,
						opacity: pressed ? 0.6 : 1,
						textDecorationLine: "underline",
						textDecorationColor: t.tape,
					}}
				>
					{children}
				</Text>
			)}
		</Pressable>
	);
}

/** "—— Or continue with ——" */
export function Divider({ label }: { label?: string }) {
	const t = useTheme();
	const line = (
		<View style={{ flex: 1, height: 1, backgroundColor: t.border }} />
	);
	return (
		<View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
			{line}
			{label ? (
				<Body tone="muted" size={14}>
					{label}
				</Body>
			) : null}
			{label ? line : null}
		</View>
	);
}

export function GoogleMark({ size = 18 }: { size?: number }) {
	return (
		<Svg width={size} height={size} viewBox="0 0 48 48" accessible={false}>
			<Path
				fill="#FFC107"
				d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
			/>
			<Path
				fill="#FF3D00"
				d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
			/>
			<Path
				fill="#4CAF50"
				d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
			/>
			<Path
				fill="#1976D2"
				d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
			/>
		</Svg>
	);
}
