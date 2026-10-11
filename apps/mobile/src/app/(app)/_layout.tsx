import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useRef, useState } from "react";
import { type ImageSourcePropType, Platform } from "react-native";
import {
	ActionSheet,
	type ActionSheetHandle,
} from "../../components/action-sheet";
import { TabAvatar } from "../../components/tab-avatar";
import { useSession } from "../../lib/session";
import { fonts, useTheme } from "../../theme";

/*
 * The system tab bar (Liquid Glass on iOS 26) with the web dock's icons:
 * Lucide's Blocks, Logs and Plus are template images the system tints;
 * Account uses an original-colour circular photo/initials bitmap. Labels
 * are hidden visually, but every trigger names itself for VoiceOver.
 */
export default function AppLayout() {
	const t = useTheme();
	const { user } = useSession();
	const actions = useRef<ActionSheetHandle>(null);
	const [avatar, setAvatar] = useState<ImageSourcePropType>();
	// UIKit owns the detached Liquid Glass circle and its gap. BottomAccessory
	// sits above the bar (or inline only when minimized), not beside it.
	const separateActions =
		Platform.OS === "ios" &&
		Number.parseInt(String(Platform.Version), 10) >= 26;
	return (
		<>
			<NativeTabs
				tintColor={t.ink}
				labelStyle={{ fontFamily: fonts.semibold, fontSize: 11 }}
			>
				<NativeTabs.Trigger name="(home)" accessibilityLabel="Groups">
					<NativeTabs.Trigger.Icon
						src={require("../../../assets/tabs/blocks.png")}
						renderingMode="template"
					/>
					<NativeTabs.Trigger.Label hidden>Groups</NativeTabs.Trigger.Label>
				</NativeTabs.Trigger>
				<NativeTabs.Trigger name="activity" accessibilityLabel="Activity">
					<NativeTabs.Trigger.Icon
						src={require("../../../assets/tabs/logs.png")}
						renderingMode="template"
					/>
					<NativeTabs.Trigger.Label hidden>Activity</NativeTabs.Trigger.Label>
				</NativeTabs.Trigger>
				<NativeTabs.Trigger name="account" accessibilityLabel="Account">
					<NativeTabs.Trigger.Icon
						src={
							(Platform.OS === "ios" && avatar) ||
							require("../../../assets/tabs/user-round.png")
						}
						renderingMode={
							Platform.OS === "ios" && avatar ? "original" : "template"
						}
					/>
					<NativeTabs.Trigger.Label hidden>Account</NativeTabs.Trigger.Label>
				</NativeTabs.Trigger>
				<NativeTabs.Trigger
					name="actions"
					role={separateActions ? "search" : undefined}
					// SDK 57 emits tabPress even when native selection is disabled.
					// The previous tab and its nested stack remain untouched. Earlier
					// iOS/Android retain a standard trailing + in the system tab bar.
					disabled
					accessibilityLabel="New expense, new group and shortcuts"
					listeners={{ tabPress: () => actions.current?.present() }}
				>
					<NativeTabs.Trigger.Icon
						src={require("../../../assets/tabs/plus.png")}
						renderingMode="template"
					/>
					<NativeTabs.Trigger.Label hidden>
						New and shortcuts
					</NativeTabs.Trigger.Label>
				</NativeTabs.Trigger>
			</NativeTabs>
			{/* Android's system navigation bar tints every bitmap; original-colour
			    icons are iOS-only in SDK 57. Keep Lucide rather than a solid disc. */}
			{Platform.OS === "ios" ? (
				<TabAvatar
					key={`${user?.id}:${user?.name}:${user?.image}:${t.ink}`}
					name={user?.name ?? "?"}
					image={user?.image}
					onSource={setAvatar}
				/>
			) : null}
			<ActionSheet ref={actions} />
		</>
	);
}
