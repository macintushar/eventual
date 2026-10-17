import { Stack, useLocalSearchParams } from "expo-router";
import { ResplitScreen } from "../../../../../components/group/resplit";

export default function ResplitRoute() {
	const { groupId } = useLocalSearchParams<{ groupId: string }>();
	return (
		<>
			<Stack.Screen
				options={{ title: "Re-split expenses", headerShown: true }}
			/>
			<ResplitScreen key={groupId} groupId={groupId} />
		</>
	);
}
