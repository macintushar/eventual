import { NativeTabs } from "expo-router/unstable-native-tabs";
import { fonts, useTheme } from "../../theme";

/*
 * The system tab bar (Liquid Glass on iOS 26) with the web dock's icons:
 * Lucide's Blocks, Logs and UserRound, rendered to template images in
 * assets/tabs so the system tints them. Icon-only, like the web dock, so
 * each tab names itself for VoiceOver instead.
 */
export default function AppLayout() {
	const t = useTheme();
	return (
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
					src={require("../../../assets/tabs/user-round.png")}
					renderingMode="template"
				/>
				<NativeTabs.Trigger.Label hidden>Account</NativeTabs.Trigger.Label>
			</NativeTabs.Trigger>
		</NativeTabs>
	);
}
