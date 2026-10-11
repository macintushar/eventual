import { NativeTabs } from "expo-router/unstable-native-tabs";
import { fonts, useTheme } from "../../theme";

export default function AppLayout() {
	const t = useTheme();
	return (
		<NativeTabs
			tintColor={t.ink}
			labelStyle={{ fontFamily: fonts.semibold, fontSize: 11 }}
		>
			<NativeTabs.Trigger name="(home)">
				<NativeTabs.Trigger.Icon
					sf={{ default: "square.grid.2x2", selected: "square.grid.2x2.fill" }}
					md="grid_view"
				/>
				<NativeTabs.Trigger.Label>Groups</NativeTabs.Trigger.Label>
			</NativeTabs.Trigger>
			<NativeTabs.Trigger name="activity">
				<NativeTabs.Trigger.Icon sf="list.bullet" md="receipt_long" />
				<NativeTabs.Trigger.Label>Activity</NativeTabs.Trigger.Label>
			</NativeTabs.Trigger>
			<NativeTabs.Trigger name="account">
				<NativeTabs.Trigger.Icon
					sf={{
						default: "person.crop.circle",
						selected: "person.crop.circle.fill",
					}}
					md="account_circle"
				/>
				<NativeTabs.Trigger.Label>Account</NativeTabs.Trigger.Label>
			</NativeTabs.Trigger>
		</NativeTabs>
	);
}
